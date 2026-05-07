import React, { useEffect, useState, useCallback } from 'react';
import { ScoreGauge } from '../components/ScoreGauge';
import { MetricsGrid } from '../components/MetricsGrid';
import { AuditResults } from '../components/AuditResults';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { HistoryChart } from '../components/HistoryChart';
import { ResourceBreakdown } from '../components/ResourceBreakdown';
import { PerfLensLogo } from '../components/PerfLensLogo';
import { getFrameworkLogo } from '../assets/framework-logos';
import { getSettings } from '../utils/storage';
import type { AuditReport, PerformanceMetrics, AuditResult, Suggestion, Message, Settings, RootCauseStory } from '../utils/types';
import { DEFAULT_SETTINGS } from '../utils/types';

type Tab = 'overview' | 'audits' | 'resources' | 'history';
const PROJECT_NAME = 'perflens';
const PLATFORM_AUDIT_API = 'http://localhost:8787/api/audit';
type LighthouseCategoryId = 'performance' | 'accessibility' | 'best-practices' | 'seo';

interface AuditData {
  metrics: PerformanceMetrics;
  audits: AuditResult[];
  suggestions: Suggestion[];
  rootCauseStory?: RootCauseStory;
  score: number;
}

type LaunchReadinessStatus = 'ready' | 'nearly-ready' | 'needs-work';

interface PlatformAuditReport {
  aggregate: Record<'performance' | 'seo' | 'accessibility' | 'security' | 'carbon' | 'overall', number>;
  launchReadiness?: {
    score: number;
    status: LaunchReadinessStatus;
    blockers: string[];
    recommendations: string[];
  };
  differentiators?: Array<{
    title: string;
    detail: string;
  }>;
  evidencePack?: {
    artifactPath: string;
    summary: string;
    proofPoints: string[];
  };
  reports: Record<'desktop' | 'mobile', {
    artifacts: {
      screenshotPath: string;
      videoPath: string | null;
    };
  }>;
  topIssues: Array<{
    id: string;
    category: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
  }>;
}

function getLaunchStatusLabel(status: LaunchReadinessStatus): string {
  if (status === 'ready') return 'Launch ready';
  if (status === 'nearly-ready') return 'Nearly ready';
  return 'Needs work';
}

function getLaunchStatusClass(status: LaunchReadinessStatus): string {
  if (status === 'ready') return 'text-perf-good border-perf-good/30 bg-perf-good/10';
  if (status === 'nearly-ready') return 'text-perf-moderate border-perf-moderate/30 bg-perf-moderate/10';
  return 'text-perf-poor border-perf-poor/30 bg-perf-poor/10';
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

function getScoreTone(score: number): string {
  if (score >= 90) return 'text-perf-good border-perf-good/30 bg-perf-good/10';
  if (score >= 50) return 'text-perf-moderate border-perf-moderate/30 bg-perf-moderate/10';
  return 'text-perf-poor border-perf-poor/30 bg-perf-poor/10';
}

function getLighthouseCategories(auditData: AuditData) {
  const findAuditScore = (id: string, category: string) =>
    auditData.audits.find((audit) => audit.id === id || audit.category === category)?.score ?? null;

  return [
    {
      id: 'performance' as LighthouseCategoryId,
      label: 'Performance',
      score: auditData.score,
      description: 'Checks loading speed, Core Web Vitals, render blocking work, and resource weight.',
    },
    {
      id: 'accessibility' as LighthouseCategoryId,
      label: 'Accessibility',
      score: findAuditScore('accessibility', 'Accessibility'),
      description: 'Looks for missing labels, alt text, headings, language, viewport, and keyboard-friendly basics.',
    },
    {
      id: 'best-practices' as LighthouseCategoryId,
      label: 'Best Practices',
      score: findAuditScore('best-practices', 'Best Practices'),
      description: 'Reviews HTTPS, mixed-content risk, safer external links, deprecated HTML, and security hints.',
    },
    {
      id: 'seo' as LighthouseCategoryId,
      label: 'SEO',
      score: findAuditScore('seo', 'SEO'),
      description: 'Checks title, meta description, h1 structure, canonical URL, robots, and descriptive links.',
    },
  ];
}

const LighthouseCategories: React.FC<{ auditData: AuditData; onOpenAudits: () => void }> = ({
  auditData,
  onOpenAudits,
}) => {
  const categories = getLighthouseCategories(auditData);

  return (
    <div className="rounded-lg border border-perf-border bg-perf-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider">
            Lighthouse-style report
          </p>
          <p className="mt-1 text-[11px] text-perf-muted leading-relaxed">
            PerfLens groups the live audit into the same areas people expect from Lighthouse, with quick context for what each score means.
          </p>
        </div>
        <button
          onClick={onOpenAudits}
          className="shrink-0 rounded-md border border-perf-accent/30 bg-perf-accent/10 px-2 py-1 text-[10px] font-semibold text-perf-accent hover:bg-perf-accent/15 transition-colors"
        >
          View checks
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {categories.map((category) => {
          const score = category.score ?? 0;
          return (
            <button
              key={category.id}
              onClick={onOpenAudits}
              className={`text-left rounded-lg border p-2.5 transition-colors hover:border-perf-accent/40 ${getScoreTone(score)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-perf-text">{category.label}</span>
                <span className="text-sm font-bold tabular-nums">{category.score ?? '--'}</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-perf-muted">
                {category.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [reauditing, setReauditing] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditReport[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [platformAudit, setPlatformAudit] = useState<PlatformAuditReport | null>(null);
  const [platformReportPath, setPlatformReportPath] = useState<string | null>(null);
  const [platformAuditing, setPlatformAuditing] = useState(false);
  const [platformError, setPlatformError] = useState<string | null>(null);

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
          rootCauseStory?: RootCauseStory;
        };
        setAuditData({
          metrics: metricsPayload,
          audits: metricsPayload.audits ?? audit.audits ?? [],
          suggestions: metricsPayload.suggestions ?? audit.suggestions ?? [],
          rootCauseStory: metricsPayload.rootCauseStory ?? audit.rootCauseStory,
          score: audit.score,
        });
        setAuditError(null);
      } else if (response?.error) {
        setAuditError(response.error);
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
      setAuditError(err instanceof Error ? err.message : 'Failed to fetch audit data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditData();
    getSettings().then(setSettings).catch(() => {
      // keep defaults when settings cannot be loaded
    });

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
    setAuditError(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RE_AUDIT' } as Message);
      if (response?.success === false) {
        throw new Error(response.error || 'Audit failed.');
      }
      await new Promise((r) => setTimeout(r, 3000));
      await fetchAuditData();
    } catch (err) {
      console.error('[PerfLens] Re-audit failed:', err);
      setAuditError(err instanceof Error ? err.message : 'Re-audit failed.');
    } finally {
      setReauditing(false);
    }
  };

  const handlePlatformAudit = async () => {
    const targetUrl = currentUrl;
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      setPlatformError('Open an http or https page first.');
      return;
    }

    setPlatformAuditing(true);
    setPlatformError(null);
    setPlatformAudit(null);
    setPlatformReportPath(null);

    try {
      const response = await fetch(PLATFORM_AUDIT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Platform audit failed');
      }
      setPlatformAudit(payload.report);
      setPlatformReportPath(payload.reportPath);
    } catch (err) {
      setPlatformError(
        err instanceof Error
          ? err.message
          : 'Start the local audit API with npm run audit:api, then try again.'
      );
    } finally {
      setPlatformAuditing(false);
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
    { id: 'resources', label: 'Network' },
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
              <PerfLensLogo className="h-6 w-6 rounded-md" />
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
                onClick={handlePlatformAudit}
                disabled={platformAuditing || loading}
                className="flex items-center gap-1 text-[10px] font-medium text-emerald-300 hover:text-emerald-200 disabled:opacity-40 transition-all px-2 py-1 rounded-md hover:bg-emerald-500/10"
                title="Run desktop and mobile platform audit"
              >
                <svg
                  className={`w-3 h-3 ${platformAuditing ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4V7m4 14H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
                </svg>
                {platformAuditing ? 'Running...' : 'Platform'}
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
        {(platformAudit || platformError || platformAuditing) && (
          <div className="mb-3 rounded-lg border border-perf-border bg-perf-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider">
                Platform Audit
              </p>
              {platformAudit && (
                <span className="text-xs font-bold text-perf-text">
                  {platformAudit.aggregate.overall}/100
                </span>
              )}
            </div>
            {platformAuditing && (
              <p className="mt-2 text-xs text-perf-muted">
                Capturing desktop and mobile screenshots, videos, and audit scores...
              </p>
            )}
            {platformError && (
              <p className="mt-2 text-xs text-perf-poor">
                {platformError}
              </p>
            )}
            {platformAudit && (
              <div className="mt-2 space-y-2">
                {platformAudit.launchReadiness && (
                  <div className={`rounded-md border px-2.5 py-2 ${getLaunchStatusClass(platformAudit.launchReadiness.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider">
                        First Launch Gate
                      </p>
                      <span className="text-xs font-bold">
                        {platformAudit.launchReadiness.score}/100
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium">
                      {getLaunchStatusLabel(platformAudit.launchReadiness.status)}
                    </p>
                    {platformAudit.launchReadiness.blockers.length > 0 && (
                      <p className="mt-1 text-[11px] leading-relaxed">
                        {platformAudit.launchReadiness.blockers[0]}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1 text-center">
                  {(['performance', 'seo', 'accessibility', 'security', 'carbon'] as const).map((category) => (
                    <div key={category} className="rounded-md bg-perf-highlight px-1 py-1.5">
                      <p className="text-[9px] text-perf-muted capitalize">{category === 'accessibility' ? 'A11y' : category}</p>
                      <p className="text-xs font-semibold text-perf-text">{platformAudit.aggregate[category]}</p>
                    </div>
                  ))}
                </div>
                {platformAudit.topIssues.length > 0 && (
                  <p className="text-[11px] text-perf-muted leading-relaxed">
                    Top issue: {platformAudit.topIssues[0].description}
                  </p>
                )}
                {platformAudit.differentiators && platformAudit.differentiators.length > 0 && (
                  <div className="rounded-md border border-perf-border bg-perf-bg/60 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider">
                      Better-than-Lighthouse Signals
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {platformAudit.differentiators.slice(0, 3).map((item) => (
                        <li key={item.title} className="text-[11px] text-perf-muted leading-relaxed">
                          <span className="font-semibold text-perf-text">{item.title}:</span> {item.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {platformAudit.evidencePack && (
                  <div className="rounded-md border border-perf-accent/25 bg-perf-accent/5 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-perf-accent uppercase tracking-wider">
                      Launch Evidence Pack
                    </p>
                    <p className="mt-1 text-[11px] text-perf-muted leading-relaxed">
                      {platformAudit.evidencePack.summary}
                    </p>
                    <p className="mt-1 text-[9px] text-perf-muted/70 font-mono truncate" title={platformAudit.evidencePack.artifactPath}>
                      {platformAudit.evidencePack.artifactPath}
                    </p>
                  </div>
                )}
                {platformReportPath && (
                  <p className="text-[9px] text-perf-muted/70 font-mono truncate" title={platformReportPath}>
                    {platformReportPath}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <LoadingSkeleton />
        ) : !auditData ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-sm font-medium text-perf-text">
              {auditError ? 'Audit could not run' : 'No audit data yet'}
            </p>
            {auditError ? (
              <div className="mt-2 mx-auto max-w-[300px] rounded-lg border border-perf-poor/25 bg-perf-poor/10 px-3 py-2 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-poor">
                  Error
                </p>
                <p className="mt-1 text-xs text-perf-text leading-relaxed break-words">
                  {auditError}
                </p>
              </div>
            ) : (
              <p className="text-xs text-perf-muted mt-1.5 max-w-[260px] mx-auto">
                Open a website and run an audit when you want PerfLens to analyze the current tab.
              </p>
            )}
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
                <LighthouseCategories auditData={auditData} onOpenAudits={() => setTab('audits')} />
                <MetricsGrid vitals={auditData.metrics.vitals} />
                {auditData.rootCauseStory && (
                  <div className="rounded-lg border border-perf-border bg-perf-surface p-3">
                    <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider mb-1.5">
                      Root Cause Story
                    </p>
                    <p className="text-xs text-perf-text leading-relaxed">{auditData.rootCauseStory.summary}</p>
                    <ul className="mt-2 space-y-1">
                      {auditData.rootCauseStory.bullets.slice(0, 3).map((bullet, index) => (
                        <li key={index} className="text-[11px] text-perf-muted flex items-start gap-1.5">
                          <span className="text-perf-accent mt-0.5">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                <AuditResults
                  audits={auditData.audits}
                  showFixActions={runtimeMode === 'local'}
                  defaultAgent={settings.aiFixAgent}
                  defaultCustomAgentName={settings.customAIAgent}
                  pageUrl={currentUrl}
                  projectName={PROJECT_NAME}
                />
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
              <ResourceBreakdown
                resources={auditData.metrics.resources}
                showFixActions={runtimeMode === 'local'}
                defaultAgent={settings.aiFixAgent}
                defaultCustomAgentName={settings.customAIAgent}
                pageUrl={currentUrl}
                projectName={PROJECT_NAME}
              />
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
