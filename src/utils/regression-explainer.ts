import type { AuditIssue, AuditReport, ResourceInfo, WebVitals } from './types';

export interface RegressionMetricDelta {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  unit: 'ms' | 'score' | 'bytes' | 'count' | 'ratio';
  worsened: boolean;
}

export interface RegressionIssueChange {
  category: string;
  severity: AuditIssue['severity'];
  description: string;
  suggestion: string;
  resource?: string;
}

export interface RegressionResourceChange {
  name: string;
  type: string;
  size: number;
  duration: number;
}

export interface RegressionExplanation {
  status: 'insufficient-data' | 'improved' | 'stable' | 'regressed';
  summary: string;
  scoreDelta: RegressionMetricDelta;
  metricDeltas: RegressionMetricDelta[];
  newIssues: RegressionIssueChange[];
  resolvedIssues: RegressionIssueChange[];
  newLargeResources: RegressionResourceChange[];
  newThirdParties: string[];
  likelyCauses: string[];
  suggestedFixes: string[];
  prompt: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function normalizeMetric(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function makeDelta(
  label: string,
  before: number | null | undefined,
  after: number | null | undefined,
  unit: RegressionMetricDelta['unit'],
  higherIsWorse: boolean,
  threshold: number
): RegressionMetricDelta {
  const normalizedBefore = normalizeMetric(before);
  const normalizedAfter = normalizeMetric(after);
  const delta = normalizedBefore !== null && normalizedAfter !== null ? normalizedAfter - normalizedBefore : null;

  return {
    label,
    before: normalizedBefore,
    after: normalizedAfter,
    delta,
    unit,
    worsened: delta !== null && (higherIsWorse ? delta > threshold : delta < -threshold),
  };
}

function issueKey(category: string, issue: AuditIssue): string {
  return `${category}|${issue.severity}|${issue.description}|${issue.resource ?? ''}`.toLowerCase();
}

function diffIssues(previous: AuditReport, latest: AuditReport) {
  const previousMap = new Map<string, RegressionIssueChange>();
  const latestMap = new Map<string, RegressionIssueChange>();

  for (const audit of previous.audits) {
    for (const issue of audit.issues) {
      previousMap.set(issueKey(audit.category, issue), { category: audit.category, ...issue });
    }
  }

  for (const audit of latest.audits) {
    for (const issue of audit.issues) {
      latestMap.set(issueKey(audit.category, issue), { category: audit.category, ...issue });
    }
  }

  return {
    newIssues: [...latestMap.entries()].filter(([key]) => !previousMap.has(key)).map(([, issue]) => issue),
    resolvedIssues: [...previousMap.entries()].filter(([key]) => !latestMap.has(key)).map(([, issue]) => issue),
  };
}

function resourceKey(resource: ResourceInfo): string {
  try {
    const url = new URL(resource.name);
    return `${url.origin}${url.pathname}`;
  } catch {
    return resource.name.split('?')[0];
  }
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function findNewLargeResources(previous: AuditReport, latest: AuditReport): RegressionResourceChange[] {
  const previousResources = new Set(previous.metrics.resources.resources.map(resourceKey));

  return latest.metrics.resources.resources
    .filter((resource) => !previousResources.has(resourceKey(resource)) && resource.size >= 50_000)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((resource) => ({
      name: resource.name,
      type: resource.type,
      size: resource.size,
      duration: resource.duration,
    }));
}

function findNewThirdParties(previous: AuditReport, latest: AuditReport): string[] {
  const pageHost = hostFromUrl(latest.url);
  const previousHosts = new Set(
    previous.metrics.resources.resources
      .map((resource) => hostFromUrl(resource.name))
      .filter((host): host is string => Boolean(host))
  );

  return [
    ...new Set(
      latest.metrics.resources.resources
        .map((resource) => hostFromUrl(resource.name))
        .filter((host): host is string => Boolean(host))
        .filter((host) => host !== pageHost && !previousHosts.has(host))
    ),
  ].slice(0, 6);
}

function formatValue(delta: RegressionMetricDelta): string {
  if (delta.after === null) return 'n/a';
  if (delta.unit === 'bytes') return formatBytes(delta.after);
  if (delta.unit === 'ratio') return delta.after.toFixed(3);
  if (delta.unit === 'score') return `${Math.round(delta.after)}/100`;
  if (delta.unit === 'count') return `${Math.round(delta.after)}`;
  return `${Math.round(delta.after)} ms`;
}

function formatDeltaValue(delta: RegressionMetricDelta): string {
  if (delta.delta === null) return 'n/a';
  const sign = delta.delta > 0 ? '+' : '';
  if (delta.unit === 'bytes') return `${sign}${formatBytes(Math.abs(delta.delta))}`;
  if (delta.unit === 'ratio') return `${sign}${delta.delta.toFixed(3)}`;
  if (delta.unit === 'score') return `${sign}${Math.round(delta.delta)} pts`;
  if (delta.unit === 'count') return `${sign}${Math.round(delta.delta)}`;
  return `${sign}${Math.round(delta.delta)} ms`;
}

function strongestMetricSignals(deltas: RegressionMetricDelta[]): RegressionMetricDelta[] {
  return deltas
    .filter((delta) => delta.worsened)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, 4);
}

function buildLikelyCauses(
  latest: AuditReport,
  metricDeltas: RegressionMetricDelta[],
  newIssues: RegressionIssueChange[],
  newLargeResources: RegressionResourceChange[],
  newThirdParties: string[]
): string[] {
  const causes: string[] = [];
  const worsenedMetrics = strongestMetricSignals(metricDeltas);
  const newHighIssue = newIssues.find((issue) => issue.severity === 'high');

  if (worsenedMetrics.length > 0) {
    causes.push(`Largest metric movement: ${worsenedMetrics.map((delta) => `${delta.label} ${formatDeltaValue(delta)}`).join(', ')}.`);
  }
  if (newHighIssue) {
    causes.push(`New high-severity issue: ${newHighIssue.category} - ${newHighIssue.description}`);
  }
  if (newLargeResources.length > 0) {
    const resource = newLargeResources[0];
    causes.push(`New large resource added: ${resource.type} ${formatBytes(resource.size)} (${resource.name}).`);
  }
  if (newThirdParties.length > 0) {
    causes.push(`New third-party host detected: ${newThirdParties.join(', ')}.`);
  }
  if (latest.rootCauseStory?.summary && causes.length < 3) {
    causes.push(latest.rootCauseStory.summary);
  }

  return causes.slice(0, 5);
}

function buildSuggestedFixes(
  metricDeltas: RegressionMetricDelta[],
  newIssues: RegressionIssueChange[],
  newLargeResources: RegressionResourceChange[],
  newThirdParties: string[]
): string[] {
  const fixes: string[] = [];
  const primaryIssue = newIssues.find((issue) => issue.severity === 'high') ?? newIssues[0];
  const worsened = strongestMetricSignals(metricDeltas);

  if (primaryIssue) fixes.push(primaryIssue.suggestion);
  if (newLargeResources.length > 0) fixes.push('Inspect the new largest resources and remove, compress, lazy-load, or split anything not needed for first render.');
  if (newThirdParties.length > 0) fixes.push('Delay newly added third-party scripts until consent, interaction, or after the critical rendering path.');
  if (worsened.some((delta) => delta.label === 'LCP')) fixes.push('Check whether the LCP element changed, grew larger, or is now blocked by CSS or JavaScript.');
  if (worsened.some((delta) => delta.label === 'CLS')) fixes.push('Look for new unstable images, embeds, fonts, or late-injected layout blocks.');
  if (worsened.some((delta) => delta.label === 'INP')) fixes.push('Profile main-thread work around the slow interaction and split or defer non-critical JavaScript.');

  return [...new Set(fixes)].slice(0, 5);
}

function buildPrompt(latest: AuditReport | null, previous: AuditReport | null, explanation: Omit<RegressionExplanation, 'prompt'>): string {
  if (!latest || !previous) return 'Help me explain a performance regression once I have at least two PerfLens audits for this URL.';

  return [
    'Help me investigate this PerfLens performance regression.',
    '',
    `URL: ${latest.url}`,
    `Previous: ${new Date(previous.timestamp).toLocaleString()} score ${previous.score}/100`,
    `Latest: ${new Date(latest.timestamp).toLocaleString()} score ${latest.score}/100`,
    `Summary: ${explanation.summary}`,
    '',
    'Metric changes',
    explanation.metricDeltas.map((delta) => `- ${delta.label}: ${formatValue(delta)} (${formatDeltaValue(delta)})`).join('\n'),
    '',
    'Likely causes',
    explanation.likelyCauses.length ? explanation.likelyCauses.map((cause) => `- ${cause}`).join('\n') : '- No dominant cause detected.',
    '',
    'Suggested first fixes',
    explanation.suggestedFixes.length ? explanation.suggestedFixes.map((fix) => `- ${fix}`).join('\n') : '- Inspect recent page/resource changes, then rerun PerfLens.',
  ].join('\n');
}

export function formatRegressionValue(delta: RegressionMetricDelta): string {
  return formatValue(delta);
}

export function formatRegressionDelta(delta: RegressionMetricDelta): string {
  return formatDeltaValue(delta);
}

export function explainRegression(history: AuditReport[]): RegressionExplanation {
  const [latest, previous] = [...history].sort((a, b) => b.timestamp - a.timestamp);

  if (!latest || !previous) {
    const scoreDelta = makeDelta('Score', null, latest?.score ?? null, 'score', false, 3);
    const explanation: Omit<RegressionExplanation, 'prompt'> = {
      status: 'insufficient-data',
      summary: 'Run at least two audits for this URL so PerfLens can compare the current result against the previous baseline.',
      scoreDelta,
      metricDeltas: [],
      newIssues: [],
      resolvedIssues: [],
      newLargeResources: [],
      newThirdParties: [],
      likelyCauses: [],
      suggestedFixes: [],
    };
    return { ...explanation, prompt: buildPrompt(latest ?? null, previous ?? null, explanation) };
  }

  const vitals: Array<[keyof WebVitals, string, RegressionMetricDelta['unit'], number]> = [
    ['lcp', 'LCP', 'ms', 150],
    ['fcp', 'FCP', 'ms', 150],
    ['inp', 'INP', 'ms', 50],
    ['cls', 'CLS', 'ratio', 0.03],
    ['ttfb', 'TTFB', 'ms', 100],
  ];
  const metricDeltas = [
    ...vitals.map(([key, label, unit, threshold]) => makeDelta(label, previous.metrics.vitals[key], latest.metrics.vitals[key], unit, true, threshold)),
    makeDelta('Total size', previous.metrics.resources.totalSize, latest.metrics.resources.totalSize, 'bytes', true, 100_000),
    makeDelta('Requests', previous.metrics.resources.total, latest.metrics.resources.total, 'count', true, 5),
    makeDelta('Blocking resources', previous.metrics.resources.blocking.length, latest.metrics.resources.blocking.length, 'count', true, 0),
  ];
  const scoreDelta = makeDelta('Score', previous.score, latest.score, 'score', false, 3);
  const issueDiff = diffIssues(previous, latest);
  const newLargeResources = findNewLargeResources(previous, latest);
  const newThirdParties = findNewThirdParties(previous, latest);
  const likelyCauses = buildLikelyCauses(latest, metricDeltas, issueDiff.newIssues, newLargeResources, newThirdParties);
  const suggestedFixes = buildSuggestedFixes(metricDeltas, issueDiff.newIssues, newLargeResources, newThirdParties);
  const status: RegressionExplanation['status'] =
    scoreDelta.delta !== null && scoreDelta.delta < -3
      ? 'regressed'
      : scoreDelta.delta !== null && scoreDelta.delta > 3
        ? 'improved'
        : 'stable';
  const summary =
    status === 'regressed'
      ? `Score dropped ${Math.abs(Math.round(scoreDelta.delta ?? 0))} points since the previous audit.${likelyCauses[0] ? ` Likely trigger: ${likelyCauses[0]}` : ''}`
      : status === 'improved'
        ? `Score improved ${Math.round(scoreDelta.delta ?? 0)} points since the previous audit. Keep this result as the new working baseline.`
        : 'Score is stable against the previous audit. No clear regression signal is present yet.';
  const explanation: Omit<RegressionExplanation, 'prompt'> = {
    status,
    summary,
    scoreDelta,
    metricDeltas,
    newIssues: issueDiff.newIssues,
    resolvedIssues: issueDiff.resolvedIssues,
    newLargeResources,
    newThirdParties,
    likelyCauses,
    suggestedFixes,
  };

  return { ...explanation, prompt: buildPrompt(latest, previous, explanation) };
}
