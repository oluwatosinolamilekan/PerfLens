import type { AlertPolicy, AuditSnapshot, AuditCategory, AuditScoreSet } from "./types";

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

export function isStatisticallySignificantDrop(
  history: number[],
  current: number,
  policy: Pick<AlertPolicy, "minDelta" | "minSampleSize">
): boolean {
  if (history.length < policy.minSampleSize) return false;
  const baseline = mean(history);
  const sigma = stdDev(history);
  const delta = current - baseline;
  return delta <= -policy.minDelta && Math.abs(delta) > sigma;
}

export function linearTrend(values: number[]): "improving" | "degrading" | "stable" {
  if (values.length < 3) return "stable";
  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.ceil(values.length / 2));
  const delta = mean(second) - mean(first);
  if (delta > 2) return "improving";
  if (delta < -2) return "degrading";
  return "stable";
}

export function predictNextScore(values: number[]): number {
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  const window = values.slice(-5);
  const averageStep =
    window.slice(1).reduce((acc, value, index) => acc + (value - window[index]), 0) /
    Math.max(1, window.length - 1);
  return Math.max(0, Math.min(100, Math.round(window[window.length - 1] + averageStep)));
}

export function compareSnapshots(
  previous: AuditScoreSet,
  current: AuditScoreSet
): Record<AuditCategory | "overall", number> {
  return {
    performance: current.performance - previous.performance,
    seo: current.seo - previous.seo,
    accessibility: current.accessibility - previous.accessibility,
    security: current.security - previous.security,
    carbon: current.carbon - previous.carbon,
    overall: current.overall - previous.overall,
  };
}

export function buildCategoryHistory(
  snapshots: AuditSnapshot[],
  category: AuditCategory | "overall"
): number[] {
  return snapshots
    .slice()
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
    .map((snapshot) => snapshot.scores[category]);
}
