import { saveAudit, getAuditHistory, getSettings } from '../utils/storage';
import type { AuditReport, PerformanceMetrics, Message } from '../utils/types';

const currentAudits: Map<number, AuditReport> = new Map();

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

async function handleMetricsCollected(
  tabId: number,
  metrics: PerformanceMetrics
): Promise<void> {
  const auditReport: AuditReport = {
    url: metrics.url,
    timestamp: Date.now(),
    score: metrics.score,
    metrics,
    audits: [],
    suggestions: [],
  };

  currentAudits.set(tabId, auditReport);
  updateBadge(tabId, metrics.score);

  try {
    await saveAudit(metrics.url, auditReport);
  } catch (err) {
    console.error('[PerfLens] Failed to save audit:', err);
  }
}

async function requestMetricsCollection(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_METRICS' } as Message);
  } catch {
    // content script not ready yet
  }
}

chrome.webNavigation.onCompleted.addListener(async (details) => {
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
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  currentAudits.delete(tabId);
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
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId !== undefined) {
          const audit = currentAudits.get(activeTabId);
          sendResponse({ audit: audit || null, tabId: activeTabId });
        } else {
          sendResponse({ audit: null });
        }
      });
      return true;
    }

    case 'RE_AUDIT': {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId !== undefined) {
          clearBadge(activeTabId);
          currentAudits.delete(activeTabId);
          requestMetricsCollection(activeTabId).then(() => {
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: false });
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
