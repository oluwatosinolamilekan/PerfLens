import {
  collectNavigationTiming,
  collectWebVitals,
  collectResourceMetrics,
  collectMemoryInfo,
  calculatePerformanceScore,
} from '../utils/metrics-collector';
import { detectFramework, detectRuntime } from '../utils/framework-detector';
import { runFullAudit } from '../utils/auditor';
import type { PerformanceMetrics, Message, Settings, RootCauseStory } from '../utils/types';

let hasCollected = false;
let floatingBadge: HTMLElement | null = null;

function getRuntime(): typeof chrome.runtime | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.runtime ?? null;
}

function getStorage(): typeof chrome.storage.local | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.local ?? null;
}

async function sendRuntimeMessage<T = unknown>(message: Message): Promise<T | undefined> {
  const runtime = getRuntime();
  if (!runtime?.sendMessage) return undefined;
  return runtime.sendMessage(message) as Promise<T>;
}

async function collectAllMetrics(): Promise<PerformanceMetrics> {
  const navigation = collectNavigationTiming();
  const vitals = await collectWebVitals();
  const resources = collectResourceMetrics();
  const memory = collectMemoryInfo();
  const framework = detectFramework();
  const runtime = detectRuntime();
  const score = calculatePerformanceScore(vitals, navigation);

  return {
    navigation,
    vitals,
    resources,
    memory,
    framework,
    runtime,
    score,
    timestamp: Date.now(),
    url: window.location.href,
  };
}

async function performCollection(): Promise<void> {
  try {
    const metrics = await collectAllMetrics();
    const { audits, suggestions, rootCauseStory } = runFullAudit(metrics.resources);

    const payload: PerformanceMetrics & {
      audits: ReturnType<typeof runFullAudit>['audits'];
      suggestions: ReturnType<typeof runFullAudit>['suggestions'];
      rootCauseStory: RootCauseStory;
    } = {
      ...metrics,
      audits,
      suggestions,
      rootCauseStory,
    };

    await sendRuntimeMessage({ type: 'METRICS_COLLECTED', payload } as Message);

    hasCollected = true;
    updateFloatingBadge(metrics.score);
  } catch (err) {
    console.error('[PerfLens] Metrics collection error:', err);
    throw err;
  }
}

function formatCollectionError(err: unknown): string {
  return err instanceof Error ? err.message : String(err || 'Unknown metrics collection error');
}

function createFloatingBadge(): HTMLElement {
  const badge = document.createElement('div');
  badge.id = 'perflens-floating-badge';
  badge.setAttribute('data-perflens', 'true');

  const shadow = badge.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .perflens-badge {
      position: fixed;
      bottom: 16px;
      right: 16px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      user-select: none;
      opacity: 0;
      transform: scale(0.8);
      animation: perflens-pop 0.3s ease forwards 0.5s;
    }
    .perflens-badge:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    @keyframes perflens-pop {
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;

  const container = document.createElement('div');
  container.className = 'perflens-badge';
  container.textContent = '...';
  container.title = 'PerfLens - Performance Score';

  container.addEventListener('click', () => {
    sendRuntimeMessage({ type: 'RE_AUDIT' } as Message).catch(() => {
      // extension context invalidated
    });
  });

  shadow.appendChild(style);
  shadow.appendChild(container);
  document.body.appendChild(badge);

  return badge;
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#00c853';
  if (score >= 50) return '#ffab00';
  if (score >= 25) return '#ff6d00';
  return '#ff5252';
}

function updateFloatingBadge(score: number): void {
  if (!floatingBadge) return;
  const shadow = floatingBadge.shadowRoot;
  if (!shadow) return;
  const container = shadow.querySelector('.perflens-badge') as HTMLElement;
  if (!container) return;

  container.textContent = String(score);
  container.style.backgroundColor = getScoreColor(score);
}

function removeFloatingBadge(): void {
  if (floatingBadge) {
    floatingBadge.remove();
    floatingBadge = null;
  }
}

async function initBadge(): Promise<void> {
  try {
    const response = await sendRuntimeMessage<{ audit?: unknown }>(
      { type: 'GET_CURRENT_AUDIT' } as Message
    );
    if (response?.audit) {
      return;
    }
  } catch {
    // extension context invalid
  }

  try {
    const storage = getStorage();
    if (!storage) return;
    const result = await storage.get('perflens_settings');
    const settings: Settings = result.perflens_settings;
    if (settings?.showBadge) {
      if (!floatingBadge) {
        floatingBadge = createFloatingBadge();
      }
    }
  } catch {
    // storage access error
  }
}

let clsObserver: PerformanceObserver | null = null;
let clsValue = 0;

function observeCLS(): void {
  try {
    clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value ?? 0;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // layout-shift not supported
  }
}

const runtime = getRuntime();

runtime?.onMessage?.addListener(
  (message: Message, _sender, sendResponse) => {
    switch (message.type) {
      case 'COLLECT_METRICS': {
        performCollection()
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((err) => {
            sendResponse({ success: false, error: formatCollectionError(err) });
          });
        return true;
      }
      case 'RE_AUDIT': {
        hasCollected = false;
        performCollection()
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((err) => {
            sendResponse({ success: false, error: formatCollectionError(err) });
          });
        return true;
      }
      case 'SETTINGS_UPDATED': {
        const settings = message.payload as Settings;
        if (settings.showBadge && !floatingBadge) {
          floatingBadge = createFloatingBadge();
        } else if (!settings.showBadge && floatingBadge) {
          removeFloatingBadge();
        }
        sendResponse({ success: true });
        break;
      }
    }
  }
);

function init(): void {
  observeCLS();
}

init();
