import React, { useMemo, useState } from 'react';
import { explainRegression, formatRegressionDelta, formatRegressionValue } from '../utils/regression-explainer';
import type { AuditReport } from '../utils/types';

interface RegressionExplainerProps {
  history: AuditReport[];
  compact?: boolean;
}

function statusClass(status: ReturnType<typeof explainRegression>['status']): string {
  if (status === 'regressed') return 'border-perf-poor/30 bg-perf-poor/10 text-perf-poor';
  if (status === 'improved') return 'border-perf-good/30 bg-perf-good/10 text-perf-good';
  if (status === 'stable') return 'border-blue-400/30 bg-blue-400/10 text-blue-300';
  return 'border-perf-border bg-perf-highlight text-perf-muted';
}

function statusLabel(status: ReturnType<typeof explainRegression>['status']): string {
  if (status === 'regressed') return 'Regression detected';
  if (status === 'improved') return 'Improved';
  if (status === 'stable') return 'Stable';
  return 'Needs 2 audits';
}

function shortResourceName(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.split('/').filter(Boolean).slice(-2).join('/');
    return `${url.hostname}/${path || ''}`;
  } catch {
    return value;
  }
}

export const RegressionExplainer: React.FC<RegressionExplainerProps> = ({ history, compact = false }) => {
  const explanation = useMemo(() => explainRegression(history), [history]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const importantMetrics = explanation.metricDeltas
    .filter((delta) => delta.delta !== null)
    .sort((a, b) => Number(b.worsened) - Number(a.worsened) || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, compact ? 4 : 6);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(explanation.prompt);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1800);
    } catch {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 1800);
    }
  };

  return (
    <section className={`rounded-lg border border-perf-border bg-perf-surface ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">
              AI Regression Explainer
            </p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(explanation.status)}`}>
              {statusLabel(explanation.status)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-perf-text">
            {explanation.summary}
          </p>
        </div>
        <button
          onClick={handleCopyPrompt}
          disabled={explanation.status === 'insufficient-data'}
          className="shrink-0 rounded-md border border-perf-accent/30 bg-perf-accent/10 px-3 py-1.5 text-xs font-semibold text-perf-accent hover:bg-perf-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy AI Prompt'}
        </button>
      </div>

      {importantMetrics.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
          <div className={`rounded-md border px-2.5 py-2 ${statusClass(explanation.status)}`}>
            <p className="text-[9px] font-semibold uppercase tracking-wider opacity-80">Score</p>
            <p className="mt-1 text-sm font-bold tabular-nums">{formatRegressionValue(explanation.scoreDelta)}</p>
            <p className="text-[10px] font-semibold tabular-nums">{formatRegressionDelta(explanation.scoreDelta)}</p>
          </div>
          {importantMetrics.slice(0, 3).map((delta) => (
            <div
              key={delta.label}
              className={`rounded-md border px-2.5 py-2 ${
                delta.worsened
                  ? 'border-perf-poor/25 bg-perf-poor/10 text-perf-poor'
                  : 'border-perf-border bg-perf-highlight text-perf-text'
              }`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{delta.label}</p>
              <p className="mt-1 text-sm font-bold tabular-nums">{formatRegressionValue(delta)}</p>
              <p className="text-[10px] font-semibold tabular-nums">{formatRegressionDelta(delta)}</p>
            </div>
          ))}
        </div>
      )}

      {explanation.likelyCauses.length > 0 && (
        <div className="mt-3 rounded-md border border-perf-border bg-perf-bg/45 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">Likely causes</p>
          <div className="mt-2 space-y-1.5">
            {explanation.likelyCauses.map((cause) => (
              <p key={cause} className="text-xs leading-relaxed text-perf-text">{cause}</p>
            ))}
          </div>
        </div>
      )}

      {(explanation.newIssues.length > 0 || explanation.newLargeResources.length > 0 || explanation.newThirdParties.length > 0) && (
        <div className="mt-3 grid gap-2 min-[720px]:grid-cols-3">
          {explanation.newIssues.length > 0 && (
            <div className="rounded-md border border-perf-border bg-perf-bg/45 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">New issues</p>
              <div className="mt-2 space-y-2">
                {explanation.newIssues.slice(0, 3).map((issue) => (
                  <p key={`${issue.category}-${issue.description}`} className="text-xs leading-relaxed text-perf-muted">
                    <span className="font-semibold text-perf-text">{issue.category}</span> {issue.description}
                  </p>
                ))}
              </div>
            </div>
          )}

          {explanation.newLargeResources.length > 0 && (
            <div className="rounded-md border border-perf-border bg-perf-bg/45 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">New large resources</p>
              <div className="mt-2 space-y-2">
                {explanation.newLargeResources.slice(0, 3).map((resource) => (
                  <p key={resource.name} className="text-xs leading-relaxed text-perf-muted">
                    <span className="font-semibold text-perf-text">{resource.type}</span> {shortResourceName(resource.name)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {explanation.newThirdParties.length > 0 && (
            <div className="rounded-md border border-perf-border bg-perf-bg/45 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">New third parties</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {explanation.newThirdParties.map((host) => (
                  <span key={host} className="rounded border border-perf-border bg-perf-highlight px-1.5 py-0.5 text-[10px] text-perf-muted">
                    {host}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {explanation.suggestedFixes.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">Suggested next fixes</p>
          <div className="mt-2 space-y-1.5">
            {explanation.suggestedFixes.map((fix) => (
              <p key={fix} className="rounded-md border border-perf-border bg-perf-highlight px-2.5 py-2 text-xs leading-relaxed text-perf-text">
                {fix}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
