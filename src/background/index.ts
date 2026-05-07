import { saveAudit, getAuditHistory, getSettings } from '../utils/storage';
import type { AuditReport, PerformanceMetrics, Message, AuditResult, Suggestion, RootCauseStory } from '../utils/types';
import { IS_AUTO_VARIANT } from '../utils/variant';

const currentAudits: Map<number, AuditReport> = new Map();
const auditErrors: Map<number, string> = new Map();

function getScoreColor(score: number): string {
  if (score >= 90) return '#00c853';
  if (score >= 50) return '#ffab00';
  if (score >= 25) return '#ff6d00';
  return '#ff5252';
}

function updateBadge(tabId: number, score: number): void {
  const color = getScoreColor(score);
  chrome.action.setBadgeText({ text: String(score), tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
}

function clearBadge(tabId: number): void {
  chrome.action.setBadgeText({ text: '', tabId });
}

function getAuditBlockedReason(url?: string): string | null {
  if (!url) return 'No active page URL was found.';

  if (/^https?:\/\//i.test(url)) return null;

  if (/^file:\/\//i.test(url)) {
    return 'PerfLens cannot audit file URLs unless file access is enabled for the extension in Chrome.';
  }

  return `PerfLens cannot audit this page type (${url.split(':')[0]}:). Open an http or https page and try again.`;
}

function formatCollectionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');

  if (/Receiving end does not exist/i.test(message)) {
    return 'PerfLens could not reach the page content script. Reload the page, then run the audit again.';
  }

  if (/Cannot access|Extension manifest must request permission|No tab with id/i.test(message)) {
    return message;
  }

  return `Audit failed: ${message}`;
}

function isMissingContentScriptError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return /Receiving end does not exist/i.test(message);
}

async function handleMetricsCollected(
  tabId: number,
  metrics: PerformanceMetrics & {
    audits?: AuditResult[];
    suggestions?: Suggestion[];
    rootCauseStory?: RootCauseStory;
  }
): Promise<void> {
  const auditReport: AuditReport = {
    url: metrics.url,
    timestamp: Date.now(),
    score: metrics.score,
    metrics,
    audits: metrics.audits ?? [],
    suggestions: metrics.suggestions ?? [],
    rootCauseStory: metrics.rootCauseStory,
  };

  currentAudits.set(tabId, auditReport);
  auditErrors.delete(tabId);
  updateBadge(tabId, metrics.score);

  try {
    await saveAudit(metrics.url, auditReport);
  } catch (err) {
    console.error('[PerfLens] Failed to save audit:', err);
  }
}

async function requestMetricsCollection(tabId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const blockedReason = getAuditBlockedReason(tab.url);
    if (blockedReason) {
      auditErrors.set(tabId, blockedReason);
      return { success: false, error: blockedReason };
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_METRICS' } as Message);
    } catch (err) {
      if (!isMissingContentScriptError(err)) {
        throw err;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      response = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_METRICS' } as Message);
    }

    if (response?.success === false) {
      const error = response.error || 'The page rejected the audit request.';
      auditErrors.set(tabId, error);
      return { success: false, error };
    }

    auditErrors.delete(tabId);
    return { success: true };
  } catch (err) {
    const error = formatCollectionError(err);
    auditErrors.set(tabId, error);
    return { success: false, error };
  }
}

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!IS_AUTO_VARIANT) return;
  if (details.frameId !== 0) return;

  const settings = await getSettings();

  if (!settings.autoAudit && settings.auditFrequency !== 'pageload') return;

  clearBadge(details.tabId);

  setTimeout(() => {
    requestMetricsCollection(details.tabId);
  }, 1500);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearBadge(tabId);
    currentAudits.delete(tabId);
    auditErrors.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  currentAudits.delete(tabId);
  auditErrors.delete(tabId);
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'METRICS_COLLECTED': {
      if (tabId !== undefined) {
        const metrics = message.payload as PerformanceMetrics;
        handleMetricsCollected(tabId, metrics).then(() => {
          sendResponse({ success: true });
        });
        return true;
      }
      break;
    }

    case 'GET_CURRENT_AUDIT': {
      const requestedTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      if (requestedTabId !== undefined) {
        const audit = currentAudits.get(requestedTabId);
        const error = auditErrors.get(requestedTabId) || null;
        sendResponse({ audit: audit || null, error, tabId: requestedTabId });
        return true;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId !== undefined) {
          const audit = currentAudits.get(activeTabId);
          const error = auditErrors.get(activeTabId) || null;
          sendResponse({ audit: audit || null, error, tabId: activeTabId });
        } else {
          sendResponse({ audit: null, error: 'No active tab found.' });
        }
      });
      return true;
    }

    case 'RE_AUDIT': {
      const requestedTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      if (requestedTabId !== undefined) {
        clearBadge(requestedTabId);
        currentAudits.delete(requestedTabId);
        auditErrors.delete(requestedTabId);
        requestMetricsCollection(requestedTabId).then((result) => {
          sendResponse(result);
        });
        return true;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId !== undefined) {
          clearBadge(activeTabId);
          currentAudits.delete(activeTabId);
          auditErrors.delete(activeTabId);
          requestMetricsCollection(activeTabId).then((result) => {
            sendResponse(result);
          });
        } else {
          sendResponse({ success: false, error: 'No active tab found.' });
        }
      });
      return true;
    }

    case 'GET_AUDIT': {
      const { url } = message.payload as { url: string };
      getAuditHistory(url).then((history) => {
        sendResponse({ history });
      });
      return true;
    }

    case 'SETTINGS_UPDATED': {
      sendResponse({ success: true });
      break;
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PerfLens] Extension installed');
  chrome.action.setBadgeText({ text: '' });
});
