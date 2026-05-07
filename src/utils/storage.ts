import type { AuditReport, Settings, DEFAULT_SETTINGS } from './types';
import { DEFAULT_SETTINGS as defaults } from './types';

const HISTORY_KEY = 'perflens_history';
const SETTINGS_KEY = 'perflens_settings';
const MAX_HISTORY_PER_URL = 50;
const MAX_TOTAL_HISTORY = 500;

export type HistoryExportScope =
  | { type: 'all' }
  | { type: 'url'; value: string }
  | { type: 'site'; value: string };

function getStorage(): typeof chrome.storage.local {
  return chrome.storage.local;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function getHistoryUrlHostname(url: string): string | null {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}

function filterHistory(
  history: Record<string, AuditReport[]>,
  scope: HistoryExportScope
): Record<string, AuditReport[]> {
  if (scope.type === 'all') {
    return history;
  }

  if (scope.type === 'url') {
    return history[scope.value] ? { [scope.value]: history[scope.value] } : {};
  }

  const requestedSite = normalizeHostname(scope.value);

  return Object.fromEntries(
    Object.entries(history).filter(([url]) => getHistoryUrlHostname(url) === requestedSite)
  );
}

export async function saveAudit(url: string, audit: AuditReport): Promise<void> {
  const storage = getStorage();
  const result = await storage.get(HISTORY_KEY);
  const history: Record<string, AuditReport[]> = result[HISTORY_KEY] || {};

  if (!history[url]) {
    history[url] = [];
  }

  history[url].unshift(audit);

  if (history[url].length > MAX_HISTORY_PER_URL) {
    history[url] = history[url].slice(0, MAX_HISTORY_PER_URL);
  }

  let totalEntries = 0;
  for (const key of Object.keys(history)) {
    totalEntries += history[key].length;
  }

  if (totalEntries > MAX_TOTAL_HISTORY) {
    const allEntries: { url: string; index: number; timestamp: number }[] = [];
    for (const [u, audits] of Object.entries(history)) {
      audits.forEach((a, i) => allEntries.push({ url: u, index: i, timestamp: a.timestamp }));
    }
    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    const toRemove = totalEntries - MAX_TOTAL_HISTORY;
    for (let i = 0; i < toRemove; i++) {
      const entry = allEntries[i];
      history[entry.url] = history[entry.url].filter((_, idx) => idx !== entry.index);
      if (history[entry.url].length === 0) {
        delete history[entry.url];
      }
    }
  }

  await storage.set({ [HISTORY_KEY]: history });
}

export async function getAuditHistory(url: string): Promise<AuditReport[]> {
  const storage = getStorage();
  const result = await storage.get(HISTORY_KEY);
  const history: Record<string, AuditReport[]> = result[HISTORY_KEY] || {};
  return history[url] || [];
}

export async function getAllHistory(): Promise<Record<string, AuditReport[]>> {
  const storage = getStorage();
  const result = await storage.get(HISTORY_KEY);
  return result[HISTORY_KEY] || {};
}

export async function clearHistory(): Promise<void> {
  const storage = getStorage();
  await storage.remove(HISTORY_KEY);
}

export async function getSettings(): Promise<Settings> {
  const storage = getStorage();
  const result = await storage.get(SETTINGS_KEY);
  return {
    ...defaults,
    ...(result[SETTINGS_KEY] || {}),
    autoAudit: false,
    showBadge: false,
    auditFrequency: 'manual',
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const storage = getStorage();
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await storage.set({ [SETTINGS_KEY]: updated });
}

export async function exportHistory(scope: HistoryExportScope = { type: 'all' }): Promise<string> {
  const history = await getAllHistory();
  return JSON.stringify(filterHistory(history, scope), null, 2);
}
