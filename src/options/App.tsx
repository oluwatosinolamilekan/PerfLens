import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings, clearHistory, exportHistory } from '../utils/storage';
import type { Settings, Message, AIAgent } from '../utils/types';
import { DEFAULT_SETTINGS } from '../utils/types';
import { ACCESS_MODE_DESCRIPTION, ACCESS_MODE_LABEL, IS_AUTO_VARIANT } from '../utils/variant';

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

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

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
    setClearing(false);
    setShowClearConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportHistory();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `perflens-history-${new Date().toISOString().slice(0, 10)}.json`;
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
          <span className="ml-auto text-[10px] font-semibold text-perf-accent border border-perf-accent/30 bg-perf-accent/10 rounded-full px-2 py-1">
            {ACCESS_MODE_LABEL}
          </span>
          {saved && (
            <span className="text-xs font-medium text-perf-good animate-fade-in flex items-center gap-1">
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
            <div className="rounded-lg border border-perf-border bg-perf-bg/50 px-3 py-2.5">
              <p className="text-xs font-semibold text-perf-text">Access mode: {ACCESS_MODE_LABEL}</p>
              <p className="text-xs text-perf-muted mt-1">{ACCESS_MODE_DESCRIPTION}</p>
            </div>
            {IS_AUTO_VARIANT && (
              <>
                <Toggle
                  checked={settings.autoAudit}
                  onChange={(v) => updateSetting('autoAudit', v)}
                  label="Auto-audit on page load"
                  description="Automatically collect performance metrics when a page finishes loading"
                />
                <div className="border-t border-perf-border" />
                <Toggle
                  checked={settings.showBadge}
                  onChange={(v) => updateSetting('showBadge', v)}
                  label="Show floating score badge"
                  description="Display a small performance score badge on web pages"
                />
                <div className="border-t border-perf-border" />
              </>
            )}
            <Toggle
              checked={settings.collectResources}
              onChange={(v) => updateSetting('collectResources', v)}
              label="Collect resource metrics"
              description="Analyze individual resource sizes and timings (may slightly impact performance)"
            />
          </div>
        </section>

        {/* Audit Frequency */}
        {IS_AUTO_VARIANT && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-perf-muted uppercase tracking-wider mb-4">
            Audit Frequency
          </h2>
          <div className="bg-perf-surface border border-perf-border rounded-xl p-5">
            <div className="space-y-2">
              {[
                { value: 'pageload' as const, label: 'Every page load', desc: 'Audit runs automatically on each navigation' },
                { value: 'manual' as const, label: 'Manual only', desc: 'Only audit when you click the Re-audit button' },
                { value: 'interval' as const, label: 'On interval', desc: 'Periodically re-audit the current page' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    settings.auditFrequency === option.value
                      ? 'bg-perf-accent/10 border border-perf-accent/25'
                      : 'hover:bg-perf-highlight border border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="frequency"
                    checked={settings.auditFrequency === option.value}
                    onChange={() => updateSetting('auditFrequency', option.value)}
                    className="mt-1 accent-[#4dabf7]"
                  />
                  <div>
                    <p className="text-sm font-medium text-perf-text">{option.label}</p>
                    <p className="text-xs text-perf-muted mt-0.5">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {settings.auditFrequency === 'interval' && (
              <div className="mt-4 pl-8">
                <label className="text-xs text-perf-muted">Interval (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.auditInterval / 60000}
                  onChange={(e) =>
                    updateSetting('auditInterval', Math.max(1, parseInt(e.target.value) || 5) * 60000)
                  }
                  className="mt-1 w-24 bg-perf-bg border border-perf-border rounded-md px-3 py-1.5 text-sm text-perf-text focus:outline-none focus:border-perf-accent transition-colors"
                />
              </div>
            )}
          </div>
        </section>
        )}

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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-perf-text">Export History</p>
                <p className="text-xs text-perf-muted mt-0.5">Download all audit history as JSON</p>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-xs font-medium text-perf-accent px-3 py-1.5 rounded-md bg-perf-accent/10 hover:bg-perf-accent/15 transition-all disabled:opacity-40"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
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
