import React, { useMemo } from 'react';
import type { AuditReport } from '../utils/types';
import {
  analyzeRegression,
  formatMetricDelta,
  formatMetricValue,
  type MetricDelta,
  type RegressionAnalysis,
} from '../utils/regression-report';

interface RegressionWatchPanelProps {
  history: AuditReport[];
  current?: AuditReport | null;
  compact?: boolean;
}

function statusClass(status: RegressionAnalysis['status']): string {
  if (status === 'regressed') return 'border-perf-poor/30 bg-perf-poor/10 text-perf-poor';
  if (status === 'improved') return 'border-perf-good/30 bg-perf-good/10 text-perf-good';
  if (status === 'steady') return 'border-perf-accent/30 bg-perf-accent/10 text-perf-accent';
  return 'border-perf-border bg-perf-highlight text-perf-muted';
}

function statusLabel(status: RegressionAnalysis['status']): string {
  if (status === 'regressed') return 'Regression';
  if (status === 'improved') return 'Improved';
  if (status === 'steady') return 'Steady';
  if (status === 'watching') return 'Watching';
  return 'No data';
}

function deltaTone(delta: MetricDelta): string {
  if (delta.severity === 'regressed') return 'text-perf-poor';
  if (delta.severity === 'improved') return 'text-perf-good';
  return 'text-perf-muted';
}

function visibleDeltas(deltas: MetricDelta[], compact: boolean): MetricDelta[] {
  const important = deltas.filter((delta) => delta.severity !== 'stable');
  const fallback = deltas.filter((delta) => ['score', 'lcp', 'cls', 'inp', 'transfer'].includes(delta.key));
  return (important.length ? important : fallback).slice(0, compact ? 4 : 8);
}

export const RegressionWatchPanel: React.FC<RegressionWatchPanelProps> = ({
  history,
  current,
  compact = false,
}) => {
  const analysis = useMemo(() => analyzeRegression(history, current), [current, history]);
  const deltas = useMemo(() => visibleDeltas(analysis.deltas, compact), [analysis.deltas, compact]);
  const signals = analysis.regressions.length > 0 ? analysis.regressions : analysis.improvements;

  return (
    <div className="rounded-lg border border-perf-border bg-perf-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">
            Performance Regression Watch
          </p>
          <p className="mt-1 text-xs leading-relaxed text-perf-muted">
            {analysis.summary}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(analysis.status)}`}>
          {statusLabel(analysis.status)}
        </span>
      </div>

      {analysis.previous && (
        <p className="mt-2 text-[10px] text-perf-muted">
          Compared with {new Date(analysis.previous.timestamp).toLocaleString()}
        </p>
      )}

      {deltas.length > 0 && (
        <div className={`mt-3 grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 min-[640px]:grid-cols-4'}`}>
          {deltas.map((delta) => (
            <div key={delta.key} className="min-w-0 rounded-md border border-perf-border bg-perf-bg/60 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-semibold text-perf-muted">{delta.label}</p>
                <p className={`text-xs font-bold tabular-nums ${deltaTone(delta)}`}>
                  {formatMetricDelta(delta)}
                </p>
              </div>
              <p className="mt-1 truncate text-[10px] text-perf-muted">
                {formatMetricValue(delta.before, delta.unit)} to {formatMetricValue(delta.after, delta.unit)}
              </p>
            </div>
          ))}
        </div>
      )}

      {!compact && signals.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {signals.slice(0, 3).map((signal) => (
            <div key={`${signal.metric}-${signal.detail}`} className="rounded-md border border-perf-border bg-perf-bg/50 px-2.5 py-2">
              <p className="text-xs font-semibold text-perf-text">{signal.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-perf-muted">{signal.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
