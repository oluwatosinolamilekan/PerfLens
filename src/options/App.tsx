import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, clearHistory, exportHistory, getAllHistory } from '../utils/storage';
import type { HistoryExportScope } from '../utils/storage';
import type { Settings, Message, AIAgent, AuditReport } from '../utils/types';
import { DEFAULT_SETTINGS } from '../utils/types';

type ExportMode = HistoryExportScope['type'];

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function getHostname(url: string): string | null {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

function getFilenamePart(value: string): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 70);
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 mt-0.5 ${
          checked ? 'bg-perf-accent' : 'bg-perf-border'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-perf-text group-hover:text-white transition-colors">
          {label}
        </p>
        <p className="text-xs text-perf-muted mt-0.5">{description}</p>
      </div>
    </label>
  );
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [historyUrls, setHistoryUrls] = useState<string[]>([]);
  const [exportMode, setExportMode] = useState<ExportMode>('all');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  useEffect(() => {
    async function loadOptions() {
      const [s, history, tabs] = await Promise.all([
        getSettings(),
        getAllHistory(),
        chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []),
      ]);
      const urls = Object.entries(history as Record<string, AuditReport[]>)
        .sort(([, a], [, b]) => (b[0]?.timestamp ?? 0) - (a[0]?.timestamp ?? 0))
        .map(([url]) => url);
      const sites = Array.from(new Set(urls.map((url) => getHostname(url)).filter(Boolean))) as string[];
      const activeSite = tabs[0]?.url ? getHostname(tabs[0].url) : null;
      const initialSite = activeSite && sites.includes(activeSite) ? activeSite : sites[0] ?? '';

      setSettings(s);
      setHistoryUrls(urls);
      setSelectedUrl(urls[0] ?? '');
      setSelectedSite(initialSite);
      setLoaded(true);
    }

    loadOptions();
  }, []);

  const historySites = Array.from(
    new Set(historyUrls.map((url) => getHostname(url)).filter(Boolean))
  ) as string[];

  const updateSetting = async <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings({ [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'SETTINGS_UPDATED',
          payload: updated,
        } as Message);
      }
    } catch {
      // tab may not have content script
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    await clearHistory();
    setHistoryUrls([]);
    setSelectedUrl('');
    setSelectedSite('');
    setClearing(false);
    setShowClearConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const scope: HistoryExportScope =
        exportMode === 'url'
          ? { type: 'url', value: selectedUrl }
          : exportMode === 'site'
            ? { type: 'site', value: selectedSite }
            : { type: 'all' };
      const json = await exportHistory(scope);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scopeName =
        scope.type === 'all' ? 'all' : getFilenamePart(scope.value) || scope.type;
      a.download = `perflens-history-${scopeName}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PerfLens] Export failed:', err);
    }
    setExporting(false);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-perf-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-perf-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-perf-bg text-perf-text">
      <div className="max-w-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-perf-accent to-perf-good flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold">PerfLens Settings</h1>
            <p className="text-xs text-perf-muted">Configure performance monitoring preferences</p>
          </div>
          {saved && (
            <span className="ml-auto text-xs font-medium text-perf-good animate-fade-in flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
        </div>

        {/* Monitoring Settings */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-perf-muted uppercase tracking-wider mb-4">
            Monitoring
          </h2>
          <div className="bg-perf-surface border border-perf-border rounded-xl p-5 space-y-5">
            <Toggle
              checked={settings.collectResources}
              onChange={(v) => updateSetting('collectResources', v)}
              label="Collect resource metrics"
              description="Analyze individual resource sizes and timings (may slightly impact performance)"
            />
          </div>
        </section>

        {/* Score Thresholds */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-perf-muted uppercase tracking-wider mb-4">
            Score Thresholds
          </h2>
          <div className="bg-perf-surface border border-perf-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-3 h-3 rounded-full bg-perf-good" />
                <span className="text-sm text-perf-text">Good</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.thresholds.good}
                  onChange={(e) =>
                    updateSetting('thresholds', {
                      ...settings.thresholds,
                      good: parseInt(e.target.value) || 90,
                    })
                  }
                  className="w-16 bg-perf-bg border border-perf-border rounded-md px-2 py-1 text-sm text-perf-text text-center focus:outline-none focus:border-perf-accent transition-colors"
                />
                <span className="text-xs text-perf-muted">- 100</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-3 h-3 rounded-full bg-perf-moderate" />
                <span className="text-sm text-perf-text">Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.thresholds.moderate}
                  onChange={(e) =>
                    updateSetting('thresholds', {
                      ...settings.thresholds,
                      moderate: parseInt(e.target.value) || 50,
                    })
                  }
                  className="w-16 bg-perf-bg border border-perf-border rounded-md px-2 py-1 text-sm text-perf-text text-center focus:outline-none focus:border-perf-accent transition-colors"
                />
                <span className="text-xs text-perf-muted">
                  - {settings.thresholds.good - 1}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-3 h-3 rounded-full bg-perf-poor" />
                <span className="text-sm text-perf-text">Poor</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-perf-muted">0 -</span>
                <span className="text-xs text-perf-muted">
                  {settings.thresholds.moderate - 1}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* AI Fix Assistant */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-perf-muted uppercase tracking-wider mb-4">
            AI Fix Assistant
          </h2>
          <div className="bg-perf-surface border border-perf-border rounded-xl p-5 space-y-4">
            <div>
              <label className="text-xs text-perf-muted">Default agent for "Fix it" actions</label>
              <select
                value={settings.aiFixAgent}
                onChange={(e) => updateSetting('aiFixAgent', e.target.value as AIAgent)}
                className="mt-1 w-44 bg-perf-bg border border-perf-border rounded-md px-3 py-2 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
              >
                <option value="cursor">Cursor</option>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="custom">Custom agent</option>
              </select>
              <p className="text-xs text-perf-muted mt-1">
                Used by audit and network fix prompts in localhost mode.
              </p>
            </div>

            {settings.aiFixAgent === 'custom' && (
              <div>
                <label className="text-xs text-perf-muted">Custom agent name</label>
                <input
                  type="text"
                  value={settings.customAIAgent}
                  onChange={(e) => updateSetting('customAIAgent', e.target.value)}
                  placeholder="e.g. Internal GPT Agent"
                  className="mt-1 w-full bg-perf-bg border border-perf-border rounded-md px-3 py-2 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
                />
              </div>
            )}
          </div>
        </section>

        {/* Data Management */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-perf-muted uppercase tracking-wider mb-4">
            Data
          </h2>
          <div className="bg-perf-surface border border-perf-border rounded-xl p-5 space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-perf-text">Export History</p>
                <p className="text-xs text-perf-muted mt-0.5">
                  Download all history, one site, or one exact URL as JSON
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                <div>
                  <label className="text-xs text-perf-muted">Scope</label>
                  <select
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value as ExportMode)}
                    className="mt-1 w-full bg-perf-bg border border-perf-border rounded-md px-3 py-2 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
                  >
                    <option value="all">All history</option>
                    <option value="site" disabled={historySites.length === 0}>
                      Site
                    </option>
                    <option value="url" disabled={historyUrls.length === 0}>
                      Exact URL
                    </option>
                  </select>
                </div>

                {exportMode === 'site' && (
                  <div>
                    <label className="text-xs text-perf-muted">Site</label>
                    <select
                      value={selectedSite}
                      onChange={(e) => setSelectedSite(e.target.value)}
                      className="mt-1 w-full bg-perf-bg border border-perf-border rounded-md px-3 py-2 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
                    >
                      {historySites.map((site) => (
                        <option key={site} value={site}>
                          {site}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {exportMode === 'url' && (
                  <div>
                    <label className="text-xs text-perf-muted">URL</label>
                    <select
                      value={selectedUrl}
                      onChange={(e) => setSelectedUrl(e.target.value)}
                      className="mt-1 w-full bg-perf-bg border border-perf-border rounded-md px-3 py-2 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
                    >
                      {historyUrls.map((url) => (
                        <option key={url} value={url}>
                          {url}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {exportMode === 'all' && (
                  <p className="text-xs text-perf-muted sm:self-center">
                    {historyUrls.length} saved {historyUrls.length === 1 ? 'URL' : 'URLs'}
                  </p>
                )}

                <button
                  onClick={handleExport}
                  disabled={
                    exporting ||
                    (exportMode === 'site' && !selectedSite) ||
                    (exportMode === 'url' && !selectedUrl)
                  }
                  className="text-xs font-medium text-perf-accent px-3 py-2 rounded-md bg-perf-accent/10 hover:bg-perf-accent/15 transition-all disabled:opacity-40"
                >
                  {exporting ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </div>

            <div className="border-t border-perf-border" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-perf-text">Clear History</p>
                <p className="text-xs text-perf-muted mt-0.5">
                  Remove all stored audit data permanently
                </p>
              </div>
              {showClearConfirm ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearHistory}
                    disabled={clearing}
                    className="text-xs font-medium text-white px-3 py-1.5 rounded-md bg-perf-poor hover:bg-perf-poor/80 transition-all disabled:opacity-40"
                  >
                    {clearing ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="text-xs font-medium text-perf-muted px-3 py-1.5 rounded-md hover:bg-perf-highlight transition-all"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs font-medium text-perf-poor px-3 py-1.5 rounded-md bg-perf-poor/10 hover:bg-perf-poor/15 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-4 border-t border-perf-border">
          <p className="text-xs text-perf-muted/50">
            PerfLens v1.0.0 — Built with performance in mind
          </p>
        </div>
      </div>
    </div>
  );
};
