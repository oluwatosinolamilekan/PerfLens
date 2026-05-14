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

export interface RegressionCategoryChange {
  category: string;
  before: number;
  after: number;
  delta: number;
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
  categoryChanges: RegressionCategoryChange[];
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

function formatValue(delta: RegressionMetricDelta): string {
  if (delta.after === null || delta.after === undefined) return 'n/a';
  if (delta.unit === 'bytes') return formatBytes(delta.after);
  if (delta.unit === 'ratio') return delta.after.toFixed(3);
  if (delta.unit === 'count') return String(Math.round(delta.after));
  if (delta.unit === 'score') return `${Math.round(delta.after)}/100`;
  return `${Math.round(delta.after)} ms`;
}

function formatDelta(delta: RegressionMetricDelta): string {
  if (delta.delta === null || delta.delta === undefined) return 'n/a';
  const sign = delta.delta > 0 ? '+' : '';
  if (delta.unit === 'bytes') return `${sign}${formatBytes(Math.abs(delta.delta))}`;
  if (delta.unit === 'ratio') return `${sign}${delta.delta.toFixed(3)}`;
  if (delta.unit === 'count') return `${sign}${Math.round(delta.delta)}`;
  if (delta.unit === 'score') return `${sign}${Math.round(delta.delta)} pts`;
  return `${sign}${Math.round(delta.delta)} ms`;
}

function orderedHistory(history: AuditReport[]): AuditReport[] {
  return [...history].sort((a, b) => b.timestamp - a.timestamp);
}

function metricDelta(
  label: string,
  before: number | null | undefined,
  after: number | null | undefined,
  unit: RegressionMetricDelta['unit'],
  higherIsWorse = true,
  threshold = 0
): RegressionMetricDelta {
  const normalizedBefore = typeof before === 'number' && Number.isFinite(before) ? before : null;
  const normalizedAfter = typeof after === 'number' && Number.isFinite(after) ? after : null;
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
  return [
    category.toLowerCase(),
    issue.severity,
    issue.description.trim().toLowerCase(),
    issue.resource?.trim().toLowerCase() ?? '',
  ].join('|');
}

function flattenIssues(report: AuditReport): RegressionIssueChange[] {
  return report.audits.flatMap((audit) =>
    audit.issues.map((issue) => ({
      category: audit.category,
      severity: issue.severity,
      description: issue.description,
      suggestion: issue.suggestion,
      resource: issue.resource,
    }))
  );
}

function diffIssues(previous: AuditReport, latest: AuditReport): {
  newIssues: RegressionIssueChange[];
  resolvedIssues: RegressionIssueChange[];
} {
  const previousMap = new Map<string, RegressionIssueChange>();
  const latestMap = new Map<string, RegressionIssueChange>();

  for (const audit of previous.audits) {
    for (const issue of audit.issues) {
      previousMap.set(issueKey(audit.category, issue), {
        category: audit.category,
        severity: issue.severity,
        description: issue.description,
        suggestion: issue.suggestion,
        resource: issue.resource,
      });
    }
  }

  for (const audit of latest.audits) {
    for (const issue of audit.issues) {
      latestMap.set(issueKey(audit.category, issue), {
        category: audit.category,
        severity: issue.severity,
        description: issue.description,
        suggestion: issue.suggestion,
        resource: issue.resource,
      });
    }
  }

  return {
    newIssues: [...latestMap.entries()]
      .filter(([key]) => !previousMap.has(key))
      .map(([, issue]) => issue),
    resolvedIssues: [...previousMap.entries()]
      .filter(([key]) => !latestMap.has(key))
      .map(([, issue]) => issue),
  };
}

function categoryChanges(previous: AuditReport, latest: AuditReport): RegressionCategoryChange[] {
  const categories = new Set([
    ...previous.audits.map((audit) => audit.category),
    ...latest.audits.map((audit) => audit.category),
  ]);

  return [...categories]
    .map((category) => {
      const before = previous.audits.find((audit) => audit.category === category)?.issues.length ?? 0;
      const after = latest.audits.find((audit) => audit.category === category)?.issues.length ?? 0;
      return { category, before, after, delta: after - before };
    })
    .filter((change) => change.delta !== 0)
    .sort((a, b) => b.delta - a.delta);
}

function resourceKey(resource: ResourceInfo): string {
  try {
    const url = new URL(resource.name);
    return `${url.origin}${url.pathname}`;
  } catch {
    return resource.name.split('?')[0];
  }
}

function hostFromResource(name: string): string | null {
  try {
    return new URL(name).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function hostFromPage(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function newLargeResources(previous: AuditReport, latest: AuditReport): RegressionResourceChange[] {
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

function newThirdParties(previous: AuditReport, latest: AuditReport): string[] {
  const pageHost = hostFromPage(latest.url);
  const previousHosts = new Set(
    previous.metrics.resources.resources
      .map((resource) => hostFromResource(resource.name))
      .filter((host): host is string => Boolean(host))
  );

  return [
    ...new Set(
      latest.metrics.resources.resources
        .map((resource) => hostFromResource(resource.name))
        .filter((host): host is string => Boolean(host))
        .filter((host) => host !== pageHost && !previousHosts.has(host))
    ),
  ].slice(0, 6);
}

function topWorsenedMetrics(deltas: RegressionMetricDelta[]): RegressionMetricDelta[] {
  return deltas
    .filter((delta) => delta.worsened)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, 4);
}

function buildLikelyCauses(
  latest: AuditReport,
  metricDeltas: RegressionMetricDelta[],
  changes: RegressionCategoryChange[],
  newIssues: RegressionIssueChange[],
  largeResources: RegressionResourceChange[],
  thirdParties: string[]
): string[] {
  const causes: string[] = [];
  const worsenedMetrics = topWorsenedMetrics(metricDeltas);
  const worsenedCategories = changes.filter((change) => change.delta > 0).slice(0, 3);
  const highIssues = newIssues.filter((issue) => issue.severity === 'high').slice(0, 3);

  if (worsenedMetrics.length > 0) {
    causes.push(
      `The sharpest metric movement is ${worsenedMetrics
        .map((delta) => `${delta.label} ${formatDelta(delta)}`)
        .join(', ')}.`
    );
  }

  if (worsenedCategories.length > 0) {
    causes.push(
      `Issue pressure increased in ${worsenedCategories
        .map((change) => `${change.category} (${change.before} -> ${change.after})`)
        .join(', ')}.`
    );
  }

  if (highIssues.length > 0) {
    causes.push(`New high-severity issue: ${highIssues[0].category} - ${highIssues[0].description}`);
  }

  if (largeResources.length > 0) {
    causes.push(
      `New large resource added: ${largeResources[0].type} ${formatBytes(largeResources[0].size)} (${largeResources[0].name}).`
    );
  }

  if (thirdParties.length > 0) {
    causes.push(`New third-party host detected: ${thirdParties.join(', ')}.`);
  }

  if (latest.rootCauseStory?.summary && causes.length < 3) {
    causes.push(latest.rootCauseStory.summary);
  }

  return causes.slice(0, 5);
}

function buildSuggestedFixes(
  metricDeltas: RegressionMetricDelta[],
  newIssues: RegressionIssueChange[],
  largeResources: RegressionResourceChange[],
  thirdParties: string[]
): string[] {
  const fixes: string[] = [];
  const worsened = topWorsenedMetrics(metricDeltas);
  const primaryIssue = newIssues.find((issue) => issue.severity === 'high') ?? newIssues[0];

  if (primaryIssue) {
    fixes.push(primaryIssue.suggestion);
  }
  if (largeResources.length > 0) {
    fixes.push('Inspect the new largest resources first and remove, compress, lazy-load, or split anything not needed for first render.');
  }
  if (thirdParties.length > 0) {
    fixes.push('Delay newly added third-party scripts until consent, interaction, or after the critical rendering path.');
  }
  if (worsened.some((delta) => delta.label === 'LCP')) {
    fixes.push('Check whether the LCP element changed, became larger, or is now waiting behind render-blocking CSS or JavaScript.');
  }
  if (worsened.some((delta) => delta.label === 'CLS')) {
    fixes.push('Look for newly unstable images, ads, embeds, fonts, or late-injected layout blocks.');
  }
  if (worsened.some((delta) => delta.label === 'INP')) {
    fixes.push('Profile main-thread work around the slow interaction and split or defer non-critical JavaScript.');
  }

  return [...new Set(fixes)].slice(0, 5);
}

function buildSummary(status: RegressionExplanation['status'], scoreDelta: RegressionMetricDelta, causes: string[]): string {
  if (status === 'insufficient-data') {
    return 'Run at least two audits for this URL so PerfLens can compare the current result against the previous baseline.';
  }

  if (status === 'regressed') {
    const primaryCause = causes[0] ? ` Likely trigger: ${causes[0]}` : '';
    return `Score dropped ${Math.abs(Math.round(scoreDelta.delta ?? 0))} points since the previous audit.${primaryCause}`;
  }

  if (status === 'improved') {
    return `Score improved ${Math.round(scoreDelta.delta ?? 0)} points since the previous audit. Keep the latest result as the new working baseline.`;
  }

  return 'Score is stable against the previous audit. No clear regression signal is present yet.';
}

function buildPrompt(
  latest: AuditReport | null,
  previous: AuditReport | null,
  explanation: Omit<RegressionExplanation, 'prompt'>
): string {
  if (!latest || !previous) {
    return 'Help me explain a performance regression once I have at least two PerfLens audits for this URL.';
  }

  return [
    'Help me investigate this PerfLens performance regression.',
    '',
    `URL: ${latest.url}`,
    `Previous audit: ${new Date(previous.timestamp).toLocaleString()} score ${previous.score}/100`,
    `Latest audit: ${new Date(latest.timestamp).toLocaleString()} score ${latest.score}/100`,
    `Regression summary: ${explanation.summary}`,
    '',
    'Metric changes',
    explanation.metricDeltas.map((delta) => `- ${delta.label}: ${formatValue(delta)} (${formatDelta(delta)})`).join('\n'),
    '',
    'Likely causes',
    explanation.likelyCauses.length ? explanation.likelyCauses.map((cause) => `- ${cause}`).join('\n') : '- No dominant cause detected.',
    '',
    'New issues',
    explanation.newIssues.length
      ? explanation.newIssues.slice(0, 6).map((issue) => `- [${issue.severity}] ${issue.category}: ${issue.description}`).join('\n')
      : '- No new audit issues detected.',
    '',
    'Suggested first fixes',
    explanation.suggestedFixes.length ? explanation.suggestedFixes.map((fix) => `- ${fix}`).join('\n') : '- Re-run the audit after inspecting recent page/resource changes.',
    '',
    'Please identify the most likely code/resource change, propose the smallest fix, and list before/after verification steps.',
  ].join('\n');
}

export function formatRegressionValue(delta: RegressionMetricDelta): string {
  return formatValue(delta);
}

export function formatRegressionDelta(delta: RegressionMetricDelta): string {
  return formatDelta(delta);
}

export function explainRegression(history: AuditReport[]): RegressionExplanation {
  const [latest, previous] = orderedHistory(history);

  if (!latest || !previous) {
    const scoreDelta = metricDelta('Score', null, latest?.score ?? null, 'score', false);
    const explanation: Omit<RegressionExplanation, 'prompt'> = {
      status: 'insufficient-data',
      summary: buildSummary('insufficient-data', scoreDelta, []),
      scoreDelta,
      metricDeltas: [],
      categoryChanges: [],
      newIssues: [],
      resolvedIssues: [],
      newLargeResources: [],
      newThirdParties: [],
      likelyCauses: [],
      suggestedFixes: [],
    };

    return {
      ...explanation,
      prompt: buildPrompt(latest ?? null, previous ?? null, explanation),
    };
  }

  const vitals: Array<[keyof WebVitals, string, number, RegressionMetricDelta['unit'], number]> = [
    ['lcp', 'LCP', 150, 'ms', 150],
    ['fcp', 'FCP', 150, 'ms', 150],
    ['inp', 'INP', 50, 'ms', 50],
    ['cls', 'CLS', 0.03, 'ratio', 0.03],
    ['ttfb', 'TTFB', 100, 'ms', 100],
  ];
  const metricDeltas = [
    ...vitals.map((vital) =>
      metricDelta(
        vital[1],
        previous.metrics.vitals[vital[0]],
        latest.metrics.vitals[vital[0]],
        vital[3],
        true,
        vital[4]
      )
    ),
    metricDelta('Total size', previous.metrics.resources.totalSize, latest.metrics.resources.totalSize, 'bytes', true, 100_000),
    metricDelta('Requests', previous.metrics.resources.total, latest.metrics.resources.total, 'count', true, 5),
    metricDelta(
      'Blocking resources',
      previous.metrics.resources.blocking.length,
      latest.metrics.resources.blocking.length,
      'count',
      true,
      0
    ),
  ];
  const scoreDelta = metricDelta('Score', previous.score, latest.score, 'score', false, 3);
  const issueDiff = diffIssues(previous, latest);
  const categories = categoryChanges(previous, latest);
  const largeResources = newLargeResources(previous, latest);
  const thirdParties = newThirdParties(previous, latest);
  const causes = buildLikelyCauses(latest, metricDeltas, categories, issueDiff.newIssues, largeResources, thirdParties);
  const suggestedFixes = buildSuggestedFixes(metricDeltas, issueDiff.newIssues, largeResources, thirdParties);
  const status: RegressionExplanation['status'] =
    scoreDelta.delta !== null && scoreDelta.delta < -3
      ? 'regressed'
      : scoreDelta.delta !== null && scoreDelta.delta > 3
        ? 'improved'
        : 'stable';
  const explanation: Omit<RegressionExplanation, 'prompt'> = {
    status,
    summary: buildSummary(status, scoreDelta, causes),
    scoreDelta,
    metricDeltas,
    categoryChanges: categories,
    newIssues: issueDiff.newIssues,
    resolvedIssues: issueDiff.resolvedIssues,
    newLargeResources: largeResources,
    newThirdParties: thirdParties,
    likelyCauses: causes,
    suggestedFixes,
  };

  return {
    ...explanation,
    prompt: buildPrompt(latest, previous, explanation),
  };
}
