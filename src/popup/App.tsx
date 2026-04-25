import React, { useEffect, useState, useCallback } from 'react';
import { ScoreGauge } from '../components/ScoreGauge';
import { MetricsGrid } from '../components/MetricsGrid';
import { AuditResults } from '../components/AuditResults';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { HistoryChart } from '../components/HistoryChart';
import { ResourceBreakdown } from '../components/ResourceBreakdown';
import { getFrameworkLogo } from '../assets/framework-logos';
import type { AuditReport, PerformanceMetrics, AuditResult, Suggestion, Message } from '../utils/types';

type Tab = 'overview' | 'audits' | 'resources' | 'history';

interface AuditData {
  metrics: PerformanceMetrics;
  audits: AuditResult[];
  suggestions: Suggestion[];
  score: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-center py-4">
        <div className="w-[140px] h-[140px] rounded-full skeleton" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[72px] skeleton rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[44px] skeleton rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [reauditing, setReauditing] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [history, setHistory] = useState<AuditReport[]>([]);

  const fetchAuditData = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CURRENT_AUDIT',
      } as Message);

      if (response?.audit) {
        const audit = response.audit as AuditReport;
        const metricsPayload = audit.metrics as PerformanceMetrics & {
          audits?: AuditResult[];
          suggestions?: Suggestion[];
        };
        setAuditData({
          metrics: metricsPayload,
          audits: metricsPayload.audits ?? audit.audits ?? [],
          suggestions: metricsPayload.suggestions ?? audit.suggestions ?? [],
          score: audit.score,
        });
      }

      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab?.url) {
        setCurrentUrl(activeTab.url);

        const historyResponse = await chrome.runtime.sendMessage({
          type: 'GET_AUDIT',
          payload: { url: activeTab.url },
        } as Message);

        if (historyResponse?.history) {
          setHistory(historyResponse.history);
        }
      }
    } catch (err) {
      console.error('[PerfLens] Failed to fetch audit data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditData();

    const handleMessage = (message: Message) => {
      if (message.type === 'METRICS_COLLECTED') {
        fetchAuditData();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [fetchAuditData]);

  const handleReaudit = async () => {
    setReauditing(true);
    try {
      await chrome.runtime.sendMessage({ type: 'RE_AUDIT' } as Message);
      await new Promise((r) => setTimeout(r, 3000));
      await fetchAuditData();
    } catch (err) {
      console.error('[PerfLens] Re-audit failed:', err);
    } finally {
      setReauditing(false);
    }
  };

  const displayUrl = (() => {
    try {
      const u = new URL(currentUrl);
      const host = u.hostname.replace('www.', '');
      const path = u.pathname === '/' ? '' : u.pathname;
      const display = host + path;
      return display.length > 40 ? display.slice(0, 37) + '...' : display;
    } catch {
      return currentUrl || 'Unknown page';
    }
  })();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'audits', label: 'Audits' },
    { id: 'resources', label: 'Resources' },
    { id: 'history', label: 'History' },
  ];

  const framework = auditData?.metrics.framework;
  const frameworkLabel = framework?.primary?.name ?? framework?.name ?? 'Unknown';
  const frameworkDetected = framework?.detected?.length
    ? framework.detected
    : [{ name: frameworkLabel, confidence: framework?.confidence ?? 'low', signal: 'fallback' as const }];
  const runtimeMode = auditData?.metrics.runtime?.mode ?? 'unknown';
  const buildStatus = auditData?.metrics.runtime?.buildStatus ?? (runtimeMode === 'production' ? 'prod' : 'unknown');
  const runtimeLabel = runtimeMode.charAt(0).toUpperCase() + runtimeMode.slice(1);
  const modeChipClass =
    runtimeMode === 'local'
      ? 'text-blue-300 bg-blue-500/15 border-blue-500/30'
      : runtimeMode === 'development'
        ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
        : runtimeMode === 'staging'
          ? 'text-violet-300 bg-violet-500/15 border-violet-500/30'
          : runtimeMode === 'production'
            ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
            : 'text-perf-muted bg-perf-highlight border-perf-border';

  const buildStatusClass =
    buildStatus === 'prod'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
      : buildStatus === 'dev'
        ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
        : 'text-perf-muted bg-perf-highlight border-perf-border';

  const buildStatusLabel = buildStatus === 'prod' ? 'Prod build' : buildStatus === 'dev' ? 'Dev build' : 'Build unknown';
  const buildStatusMessage =
    buildStatus === 'prod'
      ? 'Running against a production-like build.'
      : 'For accurate performance results, run and audit the production build.';

  return (
    <div className="w-[400px] min-h-[500px] max-h-[600px] overflow-y-auto bg-perf-bg text-perf-text">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-perf-bg/95 backdrop-blur-sm border-b border-perf-border">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-perf-accent to-perf-good flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight">PerfLens</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleReaudit}
                disabled={reauditing || loading}
                className="flex items-center gap-1 text-[10px] font-medium text-perf-accent hover:text-perf-accent/80 disabled:opacity-40 transition-all px-2 py-1 rounded-md hover:bg-perf-accent/10"
              >
                <svg
                  className={`w-3 h-3 ${reauditing ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {reauditing ? 'Auditing...' : 'Re-audit'}
              </button>
              <button
                onClick={() => chrome.runtime.openOptionsPage()}
                className="p-1 text-perf-muted hover:text-perf-text transition-colors rounded-md hover:bg-perf-highlight"
                title="Settings"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-[10px] text-perf-muted mt-1 truncate font-mono" title={currentUrl}>
            {displayUrl}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-perf-border bg-perf-highlight text-perf-text inline-flex items-center gap-1">
              <img src={getFrameworkLogo(frameworkLabel)} alt={`${frameworkLabel} logo`} className="w-3 h-3 rounded-sm" />
              Framework: {frameworkLabel}
            </span>
            {frameworkDetected.slice(1, 4).map((candidate) => (
              <span
                key={`${candidate.name}-${candidate.signal}`}
                className="text-[9px] px-1.5 py-0.5 rounded-full border border-perf-border bg-perf-highlight/70 text-perf-muted inline-flex items-center gap-1"
                title={`Confidence: ${candidate.confidence}`}
              >
                <img src={getFrameworkLogo(candidate.name)} alt={`${candidate.name} logo`} className="w-3 h-3 rounded-sm" />
                {candidate.name}
              </span>
            ))}
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${modeChipClass}`}>
              Mode: {runtimeLabel}
            </span>
          </div>
          <div className={`mt-2 rounded-md border px-2 py-1.5 ${buildStatusClass}`}>
            <p className="text-[10px] font-semibold">{buildStatusLabel}</p>
            <p className="text-[9px] mt-0.5">{buildStatusMessage}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`tab-button ${tab === t.id ? 'tab-button-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {loading ? (
          <LoadingSkeleton />
        ) : !auditData ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-sm font-medium text-perf-text">No audit data yet</p>
            <p className="text-xs text-perf-muted mt-1.5 max-w-[260px] mx-auto">
              Navigate to a website and PerfLens will automatically audit its performance.
            </p>
            <button
              onClick={handleReaudit}
              disabled={reauditing}
              className="mt-4 text-xs font-medium text-perf-accent hover:text-perf-accent/80 px-4 py-2 rounded-lg bg-perf-accent/10 hover:bg-perf-accent/15 transition-all disabled:opacity-40"
            >
              {reauditing ? 'Auditing...' : 'Run Audit Now'}
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="flex justify-center py-2">
                  <ScoreGauge score={auditData.score} size={140} />
                </div>
                <MetricsGrid vitals={auditData.metrics.vitals} />
                {auditData.suggestions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider mb-2 px-1">
                      Top Suggestions
                    </p>
                    <SuggestionsPanel suggestions={auditData.suggestions} limit={3} />
                  </div>
                )}
              </div>
            )}

            {tab === 'audits' && (
              <div className="space-y-4">
                <AuditResults audits={auditData.audits} />
                {auditData.suggestions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider mb-2 px-1">
                      All Suggestions
                    </p>
                    <SuggestionsPanel suggestions={auditData.suggestions} />
                  </div>
                )}
              </div>
            )}

            {tab === 'resources' && (
              <ResourceBreakdown resources={auditData.metrics.resources} />
            )}

            {tab === 'history' && <HistoryChart history={history} />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-perf-border px-4 py-2 mt-2">
        <p className="text-[9px] text-perf-muted/50 text-center">
          PerfLens v1.0.0 — Performance data collected from browser APIs
        </p>
      </div>
    </div>
  );
};
