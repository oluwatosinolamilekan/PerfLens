import type { AuditReport } from './types';

export type ComparableMetricKey =
  | 'score'
  | 'lcp'
  | 'cls'
  | 'inp'
  | 'fcp'
  | 'ttfb'
  | 'transfer'
  | 'requests'
  | 'blocking';

export interface MetricDelta {
  key: ComparableMetricKey;
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  unit: 'points' | 'ms' | 'ratio' | 'bytes' | 'count';
  higherIsBetter: boolean;
  severity: 'improved' | 'stable' | 'regressed';
}

export interface RegressionInsight {
  title: string;
  detail: string;
  metric: ComparableMetricKey;
  severity: 'high' | 'medium' | 'low';
}

export interface RegressionAnalysis {
  latest: AuditReport | null;
  previous: AuditReport | null;
  deltas: MetricDelta[];
  regressions: RegressionInsight[];
  improvements: RegressionInsight[];
  status: 'watching' | 'regressed' | 'improved' | 'steady' | 'empty';
  summary: string;
}

const METRICS: Array<{
  key: ComparableMetricKey;
  label: string;
  unit: MetricDelta['unit'];
  higherIsBetter: boolean;
  regressionThreshold: number;
}> = [
  { key: 'score', label: 'Score', unit: 'points', higherIsBetter: true, regressionThreshold: 5 },
  { key: 'lcp', label: 'LCP', unit: 'ms', higherIsBetter: false, regressionThreshold: 250 },
  { key: 'cls', label: 'CLS', unit: 'ratio', higherIsBetter: false, regressionThreshold: 0.05 },
  { key: 'inp', label: 'INP', unit: 'ms', higherIsBetter: false, regressionThreshold: 100 },
  { key: 'fcp', label: 'FCP', unit: 'ms', higherIsBetter: false, regressionThreshold: 250 },
  { key: 'ttfb', label: 'TTFB', unit: 'ms', higherIsBetter: false, regressionThreshold: 150 },
  { key: 'transfer', label: 'Transfer', unit: 'bytes', higherIsBetter: false, regressionThreshold: 100 * 1024 },
  { key: 'requests', label: 'Requests', unit: 'count', higherIsBetter: false, regressionThreshold: 10 },
  { key: 'blocking', label: 'Blocking', unit: 'count', higherIsBetter: false, regressionThreshold: 2 },
];

function metricValue(audit: AuditReport, key: ComparableMetricKey): number | null {
  switch (key) {
    case 'score':
      return audit.score;
    case 'lcp':
      return audit.metrics.vitals.lcp;
    case 'cls':
      return audit.metrics.vitals.cls;
    case 'inp':
      return audit.metrics.vitals.inp;
    case 'fcp':
      return audit.metrics.vitals.fcp;
    case 'ttfb':
      return audit.metrics.vitals.ttfb ?? audit.metrics.navigation.ttfb;
    case 'transfer':
      return audit.metrics.resources.totalSize;
    case 'requests':
      return audit.metrics.resources.total;
    case 'blocking':
      return audit.metrics.resources.blocking.length;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatMetricValue(value: number | null, unit: MetricDelta['unit']): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (unit === 'bytes') return formatBytes(value);
  if (unit === 'ratio') return value.toFixed(3);
  if (unit === 'ms') return `${Math.round(value)}ms`;
  if (unit === 'points') return `${Math.round(value)}`;
  return `${Math.round(value)}`;
}

export function formatMetricDelta(delta: MetricDelta): string {
  if (delta.delta === null) return 'n/a';
  const prefix = delta.delta > 0 ? '+' : '';
  if (delta.unit === 'bytes') return `${prefix}${formatBytes(delta.delta)}`;
  if (delta.unit === 'ratio') return `${prefix}${delta.delta.toFixed(3)}`;
  if (delta.unit === 'ms') return `${prefix}${Math.round(delta.delta)}ms`;
  if (delta.unit === 'points') return `${prefix}${Math.round(delta.delta)}`;
  return `${prefix}${Math.round(delta.delta)}`;
}

export function sortAuditsNewestFirst(history: AuditReport[]): AuditReport[] {
  return [...history].sort((a, b) => b.timestamp - a.timestamp);
}

export function findPreviousAudit(history: AuditReport[], current?: AuditReport | null): AuditReport | null {
  const ordered = sortAuditsNewestFirst(history);
  if (!current) return ordered[1] ?? null;

  return ordered.find((audit) => audit.timestamp < current.timestamp) ?? null;
}

function metricSeverity(delta: number | null, higherIsBetter: boolean, threshold: number): MetricDelta['severity'] {
  if (delta === null || Math.abs(delta) < threshold) return 'stable';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'improved' : 'regressed';
}

export function compareAudits(after: AuditReport | null, before: AuditReport | null): MetricDelta[] {
  if (!after || !before) return [];

  return METRICS.map((metric) => {
    const beforeValue = metricValue(before, metric.key);
    const afterValue = metricValue(after, metric.key);
    const delta = beforeValue === null || afterValue === null ? null : afterValue - beforeValue;

    return {
      key: metric.key,
      label: metric.label,
      before: beforeValue,
      after: afterValue,
      delta,
      unit: metric.unit,
      higherIsBetter: metric.higherIsBetter,
      severity: metricSeverity(delta, metric.higherIsBetter, metric.regressionThreshold),
    };
  });
}

function insightFromDelta(delta: MetricDelta): RegressionInsight {
  const direction = delta.severity === 'regressed' ? 'worsened' : 'improved';
  const detail = `${delta.label} ${direction} by ${formatMetricDelta(delta)} (${formatMetricValue(delta.before, delta.unit)} -> ${formatMetricValue(delta.after, delta.unit)}).`;
  const impact = Math.abs(delta.delta ?? 0);
  const severity =
    delta.key === 'score' && impact >= 10
      ? 'high'
      : delta.key === 'transfer' && impact >= 500 * 1024
        ? 'high'
        : (delta.key === 'lcp' || delta.key === 'inp') && impact >= 500
        ? 'high'
        : delta.severity === 'regressed'
          ? 'medium'
          : 'low';

  return {
    title: `${delta.label} ${direction}`,
    detail,
    metric: delta.key,
    severity,
  };
}

export function analyzeRegression(history: AuditReport[], current?: AuditReport | null): RegressionAnalysis {
  const ordered = sortAuditsNewestFirst(history);
  const latest = current ?? ordered[0] ?? null;
  const previous = findPreviousAudit(history, latest);

  if (!latest) {
    return {
      latest: null,
      previous: null,
      deltas: [],
      regressions: [],
      improvements: [],
      status: 'empty',
      summary: 'Run an audit to start watching performance regressions.',
    };
  }

  if (!previous) {
    return {
      latest,
      previous: null,
      deltas: [],
      regressions: [],
      improvements: [],
      status: 'watching',
      summary: 'One audit captured. Run another audit after changes to compare before and after.',
    };
  }

  const deltas = compareAudits(latest, previous);
  const regressions = deltas.filter((delta) => delta.severity === 'regressed').map(insightFromDelta);
  const improvements = deltas.filter((delta) => delta.severity === 'improved').map(insightFromDelta);
  const status =
    regressions.length > 0
      ? 'regressed'
      : improvements.length > 0
        ? 'improved'
        : 'steady';

  const summary =
    status === 'regressed'
      ? `${regressions.length} regression signal${regressions.length === 1 ? '' : 's'} detected since the previous audit.`
      : status === 'improved'
        ? `${improvements.length} improvement signal${improvements.length === 1 ? '' : 's'} detected since the previous audit.`
        : 'Latest audit is steady against the previous run.';

  return {
    latest,
    previous,
    deltas,
    regressions,
    improvements,
    status,
    summary,
  };
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function topIssues(audit: AuditReport, limit = 8): string[] {
  return audit.audits
    .flatMap((result) =>
      result.issues.map((issue) => `- ${result.category}: ${issue.description}\n  Suggested fix: ${issue.suggestion}`)
    )
    .slice(0, limit);
}

export function buildExportableAuditReport(current: AuditReport, history: AuditReport[]): string {
  const analysis = analyzeRegression(history, current);
  const deltas = analysis.deltas.filter((delta) => delta.delta !== null);
  const issues = topIssues(current);
  const framework = current.metrics.framework.primary?.name ?? current.metrics.framework.name;
  const runtime = current.metrics.runtime;

  return [
    '# PerfLens Audit Report',
    '',
    `Page: ${current.url}`,
    `Generated: ${formatDateTime(Date.now())}`,
    `Latest audit: ${formatDateTime(current.timestamp)}`,
    `Score: ${current.score}/100`,
    `Audit history entries: ${history.length}`,
    '',
    '## Runtime Context',
    '',
    `- Framework: ${framework}`,
    `- Runtime mode: ${runtime.mode}`,
    `- Build status: ${runtime.buildStatus}`,
    runtime.buildSignals.length ? `- Build signals: ${runtime.buildSignals.join(', ')}` : '- Build signals: none recorded',
    '',
    '## Regression Watch',
    '',
    analysis.previous
      ? `Compared with: ${formatDateTime(analysis.previous.timestamp)}`
      : 'Compared with: no previous audit available',
    `Status: ${analysis.summary}`,
    '',
    analysis.regressions.length
      ? analysis.regressions.map((item) => `- Regression: ${item.detail}`).join('\n')
      : '- No regression signals detected.',
    analysis.improvements.length
      ? analysis.improvements.map((item) => `- Improvement: ${item.detail}`).join('\n')
      : '- No improvement signals detected.',
    '',
    '## Before / After Comparison',
    '',
    deltas.length
      ? ['| Metric | Before | After | Change |', '| --- | ---: | ---: | ---: |']
          .concat(
            deltas.map(
              (delta) =>
                `| ${delta.label} | ${formatMetricValue(delta.before, delta.unit)} | ${formatMetricValue(delta.after, delta.unit)} | ${formatMetricDelta(delta)} |`
            )
          )
          .join('\n')
      : 'Run at least two audits for a before/after comparison.',
    '',
    '## Current Core Web Vitals',
    '',
    `- LCP: ${formatMetricValue(current.metrics.vitals.lcp, 'ms')}`,
    `- CLS: ${formatMetricValue(current.metrics.vitals.cls, 'ratio')}`,
    `- INP: ${formatMetricValue(current.metrics.vitals.inp, 'ms')}`,
    `- FCP: ${formatMetricValue(current.metrics.vitals.fcp, 'ms')}`,
    `- TTFB: ${formatMetricValue(current.metrics.vitals.ttfb ?? current.metrics.navigation.ttfb, 'ms')}`,
    '',
    '## Resource Snapshot',
    '',
    `- Requests: ${current.metrics.resources.total}`,
    `- Transfer size: ${formatBytes(current.metrics.resources.totalSize)}`,
    `- Render-blocking candidates: ${current.metrics.resources.blocking.length}`,
    '',
    '## Top Issues',
    '',
    issues.length ? issues.join('\n') : '- No active issues recorded.',
    '',
    '## Suggested Next Verification',
    '',
    '- Apply the highest-impact fix.',
    '- Re-run PerfLens on the same URL.',
    '- Attach this report and the next report to the PR or release notes.',
  ].join('\n');
}
