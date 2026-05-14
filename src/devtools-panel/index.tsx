import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreGauge } from '../components/ScoreGauge';
import { MetricsGrid } from '../components/MetricsGrid';
import { AuditResults } from '../components/AuditResults';
import { FixItPacketActions } from '../components/FixItPacketActions';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { HistoryChart } from '../components/HistoryChart';
import { RegressionExplainer } from '../components/RegressionExplainer';
import { PerfLensLogo } from '../components/PerfLensLogo';
import { RegressionWatchPanel } from '../components/RegressionWatchPanel';
import { getFrameworkLogo } from '../assets/framework-logos';
import { inferProjectName } from '../utils/ai-fix';
import { exportHistory, getSettings } from '../utils/storage';
import { buildExportableAuditReport } from '../utils/regression-report';
import type { HistoryExportScope } from '../utils/storage';
import type { AuditReport, AuditResult, Message, PerformanceMetrics, RootCauseStory, Settings, Suggestion } from '../utils/types';
import { DEFAULT_SETTINGS } from '../utils/types';
import '../styles/globals.css';

type DevtoolsTab = 'overview' | 'network' | 'opportunities' | 'history' | 'export';
type LighthouseCategory = 'performance' | 'accessibility' | 'best-practices' | 'seo';

interface AuditData {
  metrics: PerformanceMetrics;
  audits: AuditResult[];
  suggestions: Suggestion[];
  rootCauseStory?: RootCauseStory;
  score: number;
}

interface HarEntry {
  request?: {
    url?: string;
    method?: string;
  };
  response?: {
    status?: number;
    bodySize?: number;
    content?: {
      size?: number;
      mimeType?: string;
    };
    headers?: Array<{ name: string; value: string }>;
  };
  timings?: {
    wait?: number;
    receive?: number;
  };
  time?: number;
  _resourceType?: string;
}

interface NetworkSummary {
  totalRequests: number;
  totalBytes: number;
  transferBytes: number;
  slowest: HarEntry[];
  largest: HarEntry[];
  thirdPartyCount: number;
  uncachedCount: number;
  renderBlockingCount: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function hostname(url?: string): string {
  try {
    return new URL(url ?? '').hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function filenamePart(value: string): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 70);
}

async function downloadHistoryExport(scope: HistoryExportScope): Promise<void> {
  const json = await exportHistory(scope);
  const blob = new Blob([json], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const scopeName = scope.type === 'all' ? 'all' : filenamePart(scope.value) || scope.type;

  link.href = objectUrl;
  link.download = `perflens-history-${scopeName}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function latestAudit(history: AuditReport[]): AuditReport | null {
  return [...history].sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

function averageScore(history: AuditReport[]): number | null {
  if (history.length === 0) return null;
  return Math.round(history.reduce((sum, audit) => sum + audit.score, 0) / history.length);
}

function scoreDelta(history: AuditReport[]): number | null {
  if (history.length < 2) return null;
  const ordered = [...history].sort((a, b) => a.timestamp - b.timestamp);
  return ordered[ordered.length - 1].score - ordered[0].score;
}

function buildAuditSummary(pageUrl: string, history: AuditReport[]): string {
  const latest = latestAudit(history);
  const avg = averageScore(history);
  const delta = scoreDelta(history);
  const topIssues = latest?.audits
    .flatMap((audit) => audit.issues.map((issue) => `${audit.category}: ${issue.description}`))
    .slice(0, 5) ?? [];

  return [
    'PerfLens Audit Summary',
    `Page: ${pageUrl || 'Not available'}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Audit runs: ${history.length}`,
    latest ? `Latest score: ${latest.score}/100` : 'Latest score: Not available',
    avg !== null ? `Average score: ${avg}/100` : 'Average score: Not available',
    delta !== null ? `Score movement: ${delta >= 0 ? '+' : ''}${delta} points` : 'Score movement: Not enough history',
    '',
    'Current Core Web Vitals',
    latest
      ? [
          `LCP: ${latest.metrics.vitals.lcp?.toFixed(0) ?? 'n/a'} ms`,
          `CLS: ${latest.metrics.vitals.cls?.toFixed(3) ?? 'n/a'}`,
          `INP: ${latest.metrics.vitals.inp?.toFixed(0) ?? 'n/a'} ms`,
          `FCP: ${latest.metrics.vitals.fcp?.toFixed(0) ?? 'n/a'} ms`,
          `TTFB: ${latest.metrics.vitals.ttfb?.toFixed(0) ?? 'n/a'} ms`,
        ].join('\n')
      : 'No audit data available.',
    '',
    'Top Issues',
    topIssues.length ? topIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n') : 'No active issues recorded.',
  ].join('\n');
}

function buildEvidenceBrief(pageUrl: string, history: AuditReport[]): string {
  const latest = latestAudit(history);
  const avg = averageScore(history);
  const delta = scoreDelta(history);
  const recurringCategories = new Map<string, number>();

  for (const audit of history) {
    for (const result of audit.audits) {
      if (result.issues.length > 0) {
        recurringCategories.set(result.category, (recurringCategories.get(result.category) ?? 0) + result.issues.length);
      }
    }
  }

  const topCategories = [...recurringCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => `- ${category}: ${count} recorded issue${count === 1 ? '' : 's'}`);

  const topIssues = latest?.audits
    .flatMap((audit) => audit.issues.map((issue) => `- **${audit.category}**: ${issue.description}\n  - Suggested fix: ${issue.suggestion}`))
    .slice(0, 6) ?? [];

  return [
    '# PerfLens Evidence Brief',
    '',
    `**Page:** ${pageUrl || latest?.url || 'Not available'}`,
    `**Generated:** ${new Date().toLocaleString()}`,
    `**Audit runs:** ${history.length}`,
    latest ? `**Latest audit:** ${new Date(latest.timestamp).toLocaleString()}` : '**Latest audit:** Not available',
    '',
    '## Score Trend',
    '',
    latest ? `- Latest score: **${latest.score}/100**` : '- Latest score: Not available',
    avg !== null ? `- Average score: **${avg}/100**` : '- Average score: Not available',
    delta !== null ? `- Movement from first recorded audit: **${delta >= 0 ? '+' : ''}${delta} points**` : '- Movement from first recorded audit: Not enough history',
    '',
    '## Runtime Context',
    '',
    latest ? `- Runtime mode: ${latest.metrics.runtime.mode}` : '- Runtime mode: Not available',
    latest ? `- Build status: ${latest.metrics.runtime.buildStatus}` : '- Build status: Not available',
    latest ? `- Framework: ${latest.metrics.framework.primary?.name ?? latest.metrics.framework.name}` : '- Framework: Not available',
    '',
    '## Current Core Web Vitals',
    '',
    latest
      ? [
          `- LCP: ${latest.metrics.vitals.lcp?.toFixed(0) ?? 'n/a'} ms`,
          `- CLS: ${latest.metrics.vitals.cls?.toFixed(3) ?? 'n/a'}`,
          `- INP: ${latest.metrics.vitals.inp?.toFixed(0) ?? 'n/a'} ms`,
          `- FCP: ${latest.metrics.vitals.fcp?.toFixed(0) ?? 'n/a'} ms`,
          `- TTFB: ${latest.metrics.vitals.ttfb?.toFixed(0) ?? 'n/a'} ms`,
        ].join('\n')
      : '- No vitals recorded.',
    '',
    '## Resource Snapshot',
    '',
    latest ? `- Requests observed: ${latest.metrics.resources.total}` : '- Requests observed: Not available',
    latest ? `- Total resource size: ${formatBytes(latest.metrics.resources.totalSize)}` : '- Total resource size: Not available',
    '',
    '## Recurring Issue Areas',
    '',
    topCategories.length ? topCategories.join('\n') : '- No recurring issue areas recorded.',
    '',
    '## Current Top Issues',
    '',
    topIssues.length ? topIssues.join('\n') : '- No active issues recorded.',
    '',
    '## Evidence Attachments To Add',
    '',
    '- Screenshot of the audited page and PerfLens report.',
    '- Before/after audit exports showing measurable improvement.',
    '- Product release notes, issue links, commits, or changelog entries connected to the fixes.',
    '- User, customer, team, or stakeholder feedback that confirms the improvement mattered.',
  ].join('\n');
}

function downloadTextFile(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function printText(title: string, text: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Popup blocked. Allow popups for this extension, then try print again.');
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #111827; }
          pre { white-space: pre-wrap; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
        </style>
      </head>
      <body><pre>${text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)}</pre></body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function getHeader(entry: HarEntry, name: string): string {
  const header = entry.response?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
}

function entrySize(entry: HarEntry): number {
  return Math.max(entry.response?.bodySize ?? 0, entry.response?.content?.size ?? 0, 0);
}

function entryKind(entry: HarEntry): string {
  const type = entry._resourceType || entry.response?.content?.mimeType || 'resource';
  if (type.includes('javascript')) return 'script';
  if (type.includes('css')) return 'style';
  if (type.includes('image')) return 'image';
  if (type.includes('font')) return 'font';
  if (type.includes('document')) return 'document';
  return type;
}

function analyzeNetwork(entries: HarEntry[], pageUrl: string): NetworkSummary {
  const firstPartyHost = hostname(pageUrl);
  const totalBytes = entries.reduce((sum, entry) => sum + entrySize(entry), 0);
  const transferBytes = entries.reduce((sum, entry) => sum + Math.max(entry.response?.bodySize ?? 0, 0), 0);
  const thirdPartyCount = entries.filter((entry) => hostname(entry.request?.url) !== firstPartyHost).length;
  const uncachedCount = entries.filter((entry) => {
    const cacheControl = getHeader(entry, 'cache-control').toLowerCase();
    return entrySize(entry) > 0 && (!cacheControl || cacheControl.includes('no-store') || cacheControl.includes('no-cache'));
  }).length;
  const renderBlockingCount = entries.filter((entry) => {
    const kind = entryKind(entry);
    return kind === 'script' || kind === 'style';
  }).length;

  return {
    totalRequests: entries.length,
    totalBytes,
    transferBytes,
    slowest: [...entries].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 8),
    largest: [...entries].sort((a, b) => entrySize(b) - entrySize(a)).slice(0, 8),
    thirdPartyCount,
    uncachedCount,
    renderBlockingCount,
  };
}

function scoreTone(score: number): string {
  if (score >= 90) return 'text-perf-good border-perf-good/30 bg-perf-good/10';
  if (score >= 50) return 'text-perf-moderate border-perf-moderate/30 bg-perf-moderate/10';
  return 'text-perf-poor border-perf-poor/30 bg-perf-poor/10';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Strong';
  if (score >= 50) return 'Needs focus';
  return 'Critical';
}

function modeChipClass(mode: string): string {
  if (mode === 'local') return 'text-blue-300 bg-blue-500/15 border-blue-500/30';
  if (mode === 'development') return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
  if (mode === 'staging') return 'text-violet-300 bg-violet-500/15 border-violet-500/30';
  if (mode === 'production') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  return 'text-perf-muted bg-perf-highlight border-perf-border';
}

function buildStatusClass(status: string): string {
  if (status === 'prod') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  if (status === 'dev') return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
  return 'text-perf-muted bg-perf-highlight border-perf-border';
}

function categoryCards(auditData: AuditData) {
  const findAuditScore = (id: string, category: string) =>
    auditData.audits.find((audit) => audit.id === id || audit.category === category)?.score ?? null;

  return [
    {
      id: 'performance' as LighthouseCategory,
      label: 'Performance',
      score: auditData.score,
      detail: 'Core Web Vitals, loading speed, resource pressure, and render-blocking work.',
    },
    {
      id: 'accessibility' as LighthouseCategory,
      label: 'Accessibility',
      score: findAuditScore('accessibility', 'Accessibility'),
      detail: 'Alt text, labels, headings, language, viewport, and screen-reader basics.',
    },
    {
      id: 'best-practices' as LighthouseCategory,
      label: 'Best Practices',
      score: findAuditScore('best-practices', 'Best Practices'),
      detail: 'HTTPS, mixed content, safer links, legacy markup, and security hints.',
    },
    {
      id: 'seo' as LighthouseCategory,
      label: 'SEO',
      score: findAuditScore('seo', 'SEO'),
      detail: 'Titles, descriptions, h1 structure, canonical URL, robots, and clear link text.',
    },
  ];
}

const StatCard: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div className="min-w-0 rounded-lg border border-perf-border bg-perf-surface p-3">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">{label}</p>
    <p className="devtools-stat-value mt-2 break-words font-bold text-perf-text tabular-nums">{value}</p>
    <p className="mt-1 text-xs leading-relaxed text-perf-muted">{detail}</p>
  </div>
);

const RuntimeSummary: React.FC<{ auditData: AuditData; onOpenOpportunities: () => void }> = ({
  auditData,
  onOpenOpportunities,
}) => {
  const framework = auditData.metrics.framework;
  const frameworkLabel = framework?.primary?.name ?? framework?.name ?? 'Unknown';
  const detected = framework?.detected?.length
    ? framework.detected
    : [{ name: frameworkLabel, confidence: framework?.confidence ?? 'low', signal: 'fallback' as const }];
  const runtime = auditData.metrics.runtime;
  const runtimeMode = runtime?.mode ?? 'unknown';
  const buildStatus = runtime?.buildStatus ?? (runtimeMode === 'production' ? 'prod' : 'unknown');
  const runtimeLabel = runtimeMode.charAt(0).toUpperCase() + runtimeMode.slice(1);
  const buildStatusLabel = buildStatus === 'prod' ? 'Prod build' : buildStatus === 'dev' ? 'Dev build' : 'Build unknown';
  const buildStatusMessage =
    buildStatus === 'prod'
      ? 'Running against a production-like build.'
      : runtimeMode === 'local'
        ? 'Local app detected. PerfLens can generate fix prompts for issues in the Audits tab.'
        : 'For accurate performance results, run and audit the production build.';

  return (
    <div className="rounded-lg border border-perf-border bg-perf-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-perf-border bg-perf-highlight px-2.5 py-1 text-xs text-perf-text">
          <img src={getFrameworkLogo(frameworkLabel)} alt={`${frameworkLabel} logo`} className="h-4 w-4 rounded-sm" />
          Framework: {frameworkLabel}
        </span>
        {detected.slice(1, 4).map((candidate) => (
          <span
            key={`${candidate.name}-${candidate.signal}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-perf-border bg-perf-highlight/70 px-2.5 py-1 text-xs text-perf-muted"
            title={`Confidence: ${candidate.confidence}`}
          >
            <img src={getFrameworkLogo(candidate.name)} alt={`${candidate.name} logo`} className="h-4 w-4 rounded-sm" />
            {candidate.name}
          </span>
        ))}
        <span className={`rounded-full border px-2.5 py-1 text-xs ${modeChipClass(runtimeMode)}`}>
          Mode: {runtimeLabel}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${buildStatusClass(buildStatus)}`}>
          {buildStatusLabel}
        </span>
      </div>

      <div className={`mt-3 rounded-md border px-3 py-2 ${buildStatusClass(buildStatus)}`}>
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold">{buildStatusLabel}</p>
            <p className="mt-1 text-xs leading-relaxed">{buildStatusMessage}</p>
          </div>
          {runtimeMode === 'local' && (
            <button
              onClick={onOpenOpportunities}
              className="shrink-0 rounded-md border border-perf-accent/30 bg-perf-accent/10 px-3 py-1.5 text-xs font-semibold text-perf-accent hover:bg-perf-accent/15"
            >
              View checks
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const NetworkTable: React.FC<{ entries: HarEntry[]; metric: 'time' | 'size' }> = ({ entries, metric }) => (
  <div className="min-w-0 overflow-hidden rounded-lg border border-perf-border">
    <div className="hidden grid-cols-[minmax(0,1fr)_120px_70px_90px] gap-2 border-b border-perf-border bg-perf-highlight px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-perf-muted min-[560px]:grid">
      <span>Request</span>
      <span>Type</span>
      <span>Status</span>
      <span className="text-right">{metric === 'time' ? 'Time' : 'Size'}</span>
    </div>
    {entries.length === 0 ? (
      <p className="px-3 py-6 text-center text-xs text-perf-muted">Open DevTools before reload to capture the full request list.</p>
    ) : (
      entries.map((entry, index) => (
        <div
          key={`${entry.request?.url}-${index}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-perf-border/60 px-3 py-2 text-xs last:border-b-0 min-[560px]:grid-cols-[minmax(0,1fr)_120px_70px_90px] min-[560px]:gap-2"
        >
          <span className="col-span-2 min-w-0 truncate font-mono text-perf-text min-[560px]:col-span-1" title={entry.request?.url}>
            {entry.request?.url ?? 'Unknown request'}
          </span>
          <span className="min-w-0 truncate text-perf-muted">{entryKind(entry)}</span>
          <span className="hidden text-perf-muted min-[560px]:block">{entry.response?.status ?? '--'}</span>
          <span className="text-right font-semibold text-perf-text tabular-nums">
            {metric === 'time' ? `${Math.round(entry.time ?? 0)}ms` : formatBytes(entrySize(entry))}
          </span>
          <span className="text-[10px] text-perf-muted min-[560px]:hidden">Status {entry.response?.status ?? '--'}</span>
        </div>
      ))
    )}
  </div>
);

const App: React.FC = () => {
  const inspectedTabId = chrome.devtools.inspectedWindow.tabId;
  const [tab, setTab] = useState<DevtoolsTab>('overview');
  const [loading, setLoading] = useState(true);
  const [reauditing, setReauditing] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [currentAudit, setCurrentAudit] = useState<AuditReport | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditReport[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pageUrl, setPageUrl] = useState('');
  const pageUrlRef = useRef('');
  const [networkEntries, setNetworkEntries] = useState<HarEntry[]>([]);
  const [exportingHistory, setExportingHistory] = useState<HistoryExportScope['type'] | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const refreshInspectedUrl = useCallback(
    () =>
      new Promise<string>((resolve) => {
        chrome.devtools.inspectedWindow.eval('location.href', (result, exceptionInfo) => {
          if (exceptionInfo || typeof result !== 'string') {
            resolve(pageUrlRef.current);
            return;
          }

          pageUrlRef.current = result;
          setPageUrl(result);
          resolve(result);
        });
      }),
    []
  );

  const refreshHar = useCallback(() => {
    chrome.devtools.network.getHAR((harLog) => {
      setNetworkEntries((harLog?.entries ?? []) as HarEntry[]);
    });
  }, []);

  const fetchAuditData = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CURRENT_AUDIT',
        payload: { tabId: inspectedTabId },
      } as Message);

      if (response?.audit) {
        const audit = response.audit as AuditReport;
        setCurrentAudit(audit);
        setAuditData({
          metrics: audit.metrics,
          audits: audit.audits ?? [],
          suggestions: audit.suggestions ?? [],
          rootCauseStory: audit.rootCauseStory,
          score: audit.score,
        });
        setAuditError(null);
        pageUrlRef.current = audit.url;
        setPageUrl(audit.url);

        const historyResponse = await chrome.runtime.sendMessage({
          type: 'GET_AUDIT',
          payload: { url: audit.url },
        } as Message);
        setHistory(historyResponse?.history ?? []);
      } else if (response?.error) {
        setCurrentAudit(null);
        setAuditError(response.error);
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to read audit data.');
    } finally {
      setLoading(false);
    }
  }, [inspectedTabId]);

  const runAudit = async () => {
    setReauditing(true);
    setAuditError(null);
    try {
      const inspectedUrl = await refreshInspectedUrl();
      const response = await chrome.runtime.sendMessage({
        type: 'RE_AUDIT',
        payload: { tabId: inspectedTabId, url: inspectedUrl },
      } as Message);
      if (response?.success === false) {
        throw new Error(response.error || 'Audit failed.');
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await fetchAuditData();
      refreshHar();
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Audit failed.');
    } finally {
      setReauditing(false);
    }
  };

  useEffect(() => {
    refreshInspectedUrl();
    fetchAuditData();
    refreshHar();
    getSettings().then(setSettings).catch(() => {
      // keep defaults when extension storage is unavailable
    });

    const handleRequestFinished = () => refreshHar();
    const handleNavigated = (url: string) => {
      pageUrlRef.current = url;
      setPageUrl(url);
      setAuditData(null);
      setCurrentAudit(null);
      setHistory([]);
      setAuditError(null);
      setTimeout(() => {
        fetchAuditData();
        refreshHar();
      }, 1800);
    };

    chrome.devtools.network.onRequestFinished.addListener(handleRequestFinished);
    chrome.devtools.network.onNavigated.addListener(handleNavigated);

    return () => {
      chrome.devtools.network.onRequestFinished.removeListener(handleRequestFinished);
      chrome.devtools.network.onNavigated.removeListener(handleNavigated);
    };
  }, [fetchAuditData, refreshHar, refreshInspectedUrl]);

  const networkSummary = useMemo(
    () => analyzeNetwork(networkEntries, auditData?.metrics.url ?? pageUrl),
    [auditData?.metrics.url, networkEntries, pageUrl]
  );
  const categories = auditData ? categoryCards(auditData) : [];
  const topIssue = auditData?.audits.flatMap((audit) => audit.issues.map((issue) => ({ audit, issue })))[0];
  const displayUrl = auditData?.metrics.url ?? pageUrl;
  const displaySite = hostname(displayUrl);
  const runtimeMode = auditData?.metrics.runtime?.mode ?? 'unknown';
  const showFixActions = runtimeMode === 'local';
  const projectName = inferProjectName(displayUrl);

  const handleHistoryExport = async (scope: HistoryExportScope) => {
    setExportingHistory(scope.type);
    setExportStatus(null);
    try {
      await downloadHistoryExport(scope);
      setExportStatus('History JSON downloaded.');
    } catch (err) {
      console.error('[PerfLens] History export failed:', err);
      setAuditError(err instanceof Error ? err.message : 'History export failed.');
    } finally {
      setExportingHistory(null);
    }
  };

  const handleCopyJson = async () => {
    setExportStatus(null);
    try {
      await copyText(await exportHistory({ type: 'url', value: displayUrl }));
      setExportStatus('Current URL history copied as JSON.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Copy failed.');
    }
  };

  const handlePrintSummary = () => {
    setExportStatus(null);
    try {
      printText('PerfLens Audit Summary', buildAuditSummary(displayUrl, history));
      setExportStatus('Summary opened for printing.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Print failed.');
    }
  };

  const handleDownloadBrief = () => {
    setExportStatus(null);
    try {
      const scopeName = filenamePart(displayUrl) || 'current-page';
      downloadTextFile(
        `perflens-evidence-brief-${scopeName}-${new Date().toISOString().slice(0, 10)}.md`,
        buildEvidenceBrief(displayUrl, history),
        'text/markdown'
      );
      setExportStatus('Evidence brief downloaded.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Evidence brief download failed.');
    }
  };

  const handleCopyBrief = async () => {
    setExportStatus(null);
    try {
      await copyText(buildEvidenceBrief(displayUrl, history));
      setExportStatus('Evidence brief copied as Markdown.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Evidence brief copy failed.');
    }
  };

  const handleDownloadAuditReport = () => {
    if (!currentAudit) return;
    setExportStatus(null);
    try {
      const scopeName = filenamePart(currentAudit.url) || 'current-page';
      downloadTextFile(
        `perflens-audit-report-${scopeName}-${new Date().toISOString().slice(0, 10)}.md`,
        buildExportableAuditReport(currentAudit, history),
        'text/markdown'
      );
      setExportStatus('Audit report downloaded.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Audit report download failed.');
    }
  };

  const handleCopyAuditReport = async () => {
    if (!currentAudit) return;
    setExportStatus(null);
    try {
      await copyText(buildExportableAuditReport(currentAudit, history));
      setExportStatus('Audit report copied as Markdown.');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Audit report copy failed.');
    }
  };

  const tabs: { id: DevtoolsTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'opportunities', label: 'Audits' },
    { id: 'network', label: 'Network' },
    { id: 'history', label: 'History' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div className="devtools-panel-shell min-w-0 overflow-x-hidden bg-perf-bg text-perf-text">
      <header className="sticky top-0 z-10 border-b border-perf-border bg-perf-bg/95 backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between min-[640px]:gap-4 min-[520px]:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <PerfLensLogo className="h-9 w-9 rounded-lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight">PerfLens</h1>
                <span className="rounded-full border border-perf-border bg-perf-highlight px-2 py-0.5 text-[10px] font-medium text-perf-muted">
                  DevTools
                </span>
              </div>
              <p className="truncate font-mono text-xs text-perf-muted" title={displayUrl}>
                {displayUrl || 'Inspecting current tab'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 min-[360px]:flex min-[360px]:items-center min-[640px]:shrink-0">
            <button
              onClick={refreshHar}
              className="rounded-md border border-perf-border bg-perf-surface px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40"
            >
              Refresh HAR
            </button>
            <button
              onClick={runAudit}
              disabled={reauditing || loading}
              className="rounded-md border border-perf-accent/30 bg-perf-accent/10 px-3 py-1.5 text-xs font-semibold text-perf-accent hover:bg-perf-accent/15 disabled:opacity-50"
            >
              {reauditing ? 'Auditing...' : 'Re-audit'}
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 min-[520px]:px-5">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`tab-button shrink-0 ${tab === item.id ? 'tab-button-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 min-[520px]:px-5 min-[520px]:py-5">
        {loading ? (
          <div className="devtools-loading-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-28 rounded-lg skeleton" />
            ))}
          </div>
        ) : !auditData ? (
          <div className="rounded-lg border border-perf-border bg-perf-surface p-8 text-center">
            <p className="text-base font-semibold text-perf-text">No audit data for this inspected tab yet</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-perf-muted">
              Run an audit from this panel. For complete request data, keep DevTools open and reload the page once.
            </p>
            {auditError && <p className="mt-3 text-sm text-perf-poor">{auditError}</p>}
            <button
              onClick={runAudit}
              disabled={reauditing}
              className="mt-5 rounded-md bg-perf-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {reauditing ? 'Auditing...' : 'Run Audit Now'}
            </button>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-5">
                <RuntimeSummary auditData={auditData} onOpenOpportunities={() => setTab('opportunities')} />
                <section className="devtools-overview-score-grid">
                  <div className="rounded-lg border border-perf-border bg-perf-surface p-4">
                    <ScoreGauge score={auditData.score} size={170} />
                    <p className="mt-2 text-center text-sm font-semibold text-perf-text">{scoreLabel(auditData.score)}</p>
                  </div>
                  <div className="devtools-category-grid">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setTab('opportunities')}
                        className={`grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-3 rounded-lg border p-3 text-left hover:border-perf-accent/40 ${scoreTone(category.score ?? 0)}`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-current/20 bg-perf-bg/35">
                          <p className="text-xl font-bold leading-none tabular-nums">{category.score ?? '--'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug text-perf-text">{category.label}</p>
                          <p className="mt-1 text-xs leading-relaxed text-perf-muted">{category.detail}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="devtools-stats-grid">
                  <StatCard label="Requests" value={String(networkSummary.totalRequests)} detail="Captured from the same data DevTools Network uses." />
                  <StatCard label="Transfer" value={formatBytes(networkSummary.transferBytes)} detail="Bytes transferred over the network for this page." />
                  <StatCard label="Third-party" value={String(networkSummary.thirdPartyCount)} detail="Requests leaving the first-party hostname." />
                  <StatCard label="Uncached" value={String(networkSummary.uncachedCount)} detail="Assets with weak or missing cache hints." />
                </section>

                <section className="devtools-secondary-grid">
                  <div className="rounded-lg border border-perf-border bg-perf-surface p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">Core Web Vitals</p>
                    <div className="mt-3">
                      <MetricsGrid vitals={auditData.metrics.vitals} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-perf-border bg-perf-surface p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-perf-muted">What to fix first</p>
                    <p className="mt-3 text-sm leading-relaxed text-perf-text">
                      {topIssue
                        ? `${topIssue.audit.category}: ${topIssue.issue.description}`
                        : 'No major bottleneck detected. Keep watching network weight and vitals during changes.'}
                    </p>
                    {topIssue && <p className="mt-2 text-xs leading-relaxed text-perf-accent">{topIssue.issue.suggestion}</p>}
                  </div>
                </section>

                <RegressionWatchPanel history={history} current={currentAudit} />
              </div>
            )}

            {tab === 'network' && (
              <div className="space-y-5">
                <section className="devtools-network-stats-grid">
                  <StatCard label="Requests" value={String(networkSummary.totalRequests)} detail="Total known HAR entries." />
                  <StatCard label="Total size" value={formatBytes(networkSummary.totalBytes)} detail="Largest known body/content size." />
                  <StatCard label="Transfer" value={formatBytes(networkSummary.transferBytes)} detail="Known network body size." />
                  <StatCard label="Third-party" value={String(networkSummary.thirdPartyCount)} detail="External host requests." />
                  <StatCard label="Blocking candidates" value={String(networkSummary.renderBlockingCount)} detail="Scripts and styles worth reviewing." />
                </section>
                <section className="devtools-network-tables-grid">
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-perf-muted">Slowest Requests</p>
                    <NetworkTable entries={networkSummary.slowest} metric="time" />
                  </div>
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-perf-muted">Largest Requests</p>
                    <NetworkTable entries={networkSummary.largest} metric="size" />
                  </div>
                </section>
              </div>
            )}

            {tab === 'opportunities' && (
              <div className="devtools-opportunities-grid">
                <div className="space-y-3">
                  {!showFixActions && (
                    <div className="rounded-lg border border-perf-border bg-perf-surface p-3">
                      <p className="text-xs font-semibold text-perf-text">Fix prompts are enabled for local apps</p>
                      <p className="mt-1 text-xs leading-relaxed text-perf-muted">
                        PerfLens detected {runtimeMode}. Open a localhost/dev build when you want AI-ready prompts attached to each issue.
                      </p>
                    </div>
                  )}
                  {showFixActions && (
                    <div className="rounded-lg border border-perf-accent/25 bg-perf-accent/5 p-3">
                      <p className="text-xs font-semibold text-perf-accent">Local app detected</p>
                      <p className="mt-1 text-xs leading-relaxed text-perf-muted">
                        Each issue includes a fix prompt you can copy or open in your selected AI coding agent.
                      </p>
                    </div>
                  )}
                  {showFixActions && (
                    <FixItPacketActions
                      audits={auditData.audits}
                      suggestions={auditData.suggestions}
                      defaultAgent={settings.aiFixAgent}
                      defaultCustomAgentName={settings.customAIAgent}
                      pageUrl={auditData.metrics.url}
                      projectName={projectName}
                      score={auditData.score}
                      framework={auditData.metrics.framework}
                      runtime={auditData.metrics.runtime}
                      vitals={auditData.metrics.vitals}
                      resources={auditData.metrics.resources}
                      rootCauseStory={auditData.rootCauseStory}
                    />
                  )}
                  <AuditResults
                    audits={auditData.audits}
                    showFixActions={showFixActions}
                    defaultAgent={settings.aiFixAgent}
                    defaultCustomAgentName={settings.customAIAgent}
                    pageUrl={auditData.metrics.url}
                    projectName={projectName}
                    score={auditData.score}
                    framework={auditData.metrics.framework}
                    runtime={auditData.metrics.runtime}
                    vitals={auditData.metrics.vitals}
                    resources={auditData.metrics.resources}
                    rootCauseStory={auditData.rootCauseStory}
                  />
                </div>
                <div>
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-perf-muted">All Suggestions</p>
                  <SuggestionsPanel suggestions={auditData.suggestions} />
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-4">
                <RegressionExplainer history={history} />
                <div className="rounded-lg border border-perf-border bg-perf-surface p-4">
                  <HistoryChart history={history} />
                </div>
              </div>
            )}

            {tab === 'export' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-perf-border bg-perf-surface p-4">
                  <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-perf-text">Export History</p>
                      <p className="mt-1 truncate font-mono text-xs text-perf-muted" title={displayUrl}>
                        {displayUrl || 'No audited URL yet'}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-perf-muted">
                        Export saved audit history, copy raw data, or create a compact evidence brief for sharing.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 min-[720px]:w-[29rem]">
                      <button
                        onClick={() => handleHistoryExport({ type: 'url', value: displayUrl })}
                        disabled={!displayUrl || history.length === 0 || exportingHistory !== null}
                        className="rounded-md border border-perf-accent/30 bg-perf-accent/10 px-3 py-1.5 text-xs font-semibold text-perf-accent hover:bg-perf-accent/15 disabled:opacity-50"
                      >
                        {exportingHistory === 'url' ? 'Exporting...' : 'Export URL'}
                      </button>
                      <button
                        onClick={() => handleHistoryExport({ type: 'site', value: displaySite })}
                        disabled={!displayUrl || displaySite === 'unknown' || history.length === 0 || exportingHistory !== null}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        {exportingHistory === 'site' ? 'Exporting...' : 'Export Site'}
                      </button>
                      <button
                        onClick={handleCopyJson}
                        disabled={!displayUrl || history.length === 0}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        Copy JSON
                      </button>
                      <button
                        onClick={handlePrintSummary}
                        disabled={!displayUrl || history.length === 0}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        Print Summary
                      </button>
                      <button
                        onClick={handleDownloadBrief}
                        disabled={!displayUrl || history.length === 0}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        Download Brief
                      </button>
                      <button
                        onClick={handleCopyBrief}
                        disabled={!displayUrl || history.length === 0}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        Copy Brief
                      </button>
                      <button
                        onClick={handleDownloadAuditReport}
                        disabled={!currentAudit || history.length === 0}
                        className="rounded-md border border-perf-accent/30 bg-perf-accent/10 px-3 py-1.5 text-xs font-semibold text-perf-accent hover:bg-perf-accent/15 disabled:opacity-50"
                      >
                        Audit Report
                      </button>
                      <button
                        onClick={handleCopyAuditReport}
                        disabled={!currentAudit || history.length === 0}
                        className="rounded-md border border-perf-border bg-perf-highlight px-3 py-1.5 text-xs font-semibold text-perf-text hover:border-perf-accent/40 disabled:opacity-50"
                      >
                        Copy Report
                      </button>
                    </div>
                  </div>
                  {exportStatus && (
                    <p className="mt-3 text-xs font-medium text-perf-good">{exportStatus}</p>
                  )}
                </div>
                {currentAudit && <RegressionWatchPanel history={history} current={currentAudit} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
