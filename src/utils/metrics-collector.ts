import type {
  NavigationTiming,
  WebVitals,
  ResourceMetrics,
  ResourceInfo,
  MemoryInfo,
} from './types';

export function collectNavigationTiming(): NavigationTiming {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

  if (!entry) {
    return {
      dns: 0,
      tcp: 0,
      ttfb: 0,
      domLoad: 0,
      fullLoad: 0,
      redirect: 0,
      domInteractive: 0,
      domContentLoaded: 0,
    };
  }

  return {
    dns: entry.domainLookupEnd - entry.domainLookupStart,
    tcp: entry.connectEnd - entry.connectStart,
    ttfb: entry.responseStart - entry.requestStart,
    domLoad: entry.domContentLoadedEventEnd - entry.fetchStart,
    fullLoad: entry.loadEventEnd - entry.fetchStart,
    redirect: entry.redirectEnd - entry.redirectStart,
    domInteractive: entry.domInteractive - entry.fetchStart,
    domContentLoaded: entry.domContentLoadedEventEnd - entry.fetchStart,
  };
}

export function collectWebVitals(): Promise<WebVitals> {
  return new Promise((resolve) => {
    const vitals: WebVitals = {
      lcp: null,
      fid: null,
      cls: null,
      inp: null,
      fcp: null,
      ttfb: null,
    };

    const [navEntry] = performance.getEntriesByType(
      'navigation'
    ) as PerformanceNavigationTiming[];
    if (navEntry) {
      vitals.ttfb = navEntry.responseStart - navEntry.requestStart;
    }

    const paintEntries = performance.getEntriesByType('paint');
    for (const entry of paintEntries) {
      if (entry.name === 'first-contentful-paint') {
        vitals.fcp = entry.startTime;
      }
    }

    let lcpDone = false;
    let clsDone = false;
    let fidDone = false;
    let inpDone = false;

    const checkComplete = () => {
      if (lcpDone && clsDone && fidDone && inpDone) {
        resolve(vitals);
      }
    };

    const timeout = setTimeout(() => {
      lcpDone = clsDone = fidDone = inpDone = true;
      resolve(vitals);
    }, 5000);

    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value ?? 0;
          }
        }
        vitals.cls = clsValue;
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => {
        clsObserver.disconnect();
        clsDone = true;
        checkComplete();
      }, 3000);
    } catch {
      clsDone = true;
    }

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          vitals.lcp = last.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => {
        lcpObserver.disconnect();
        lcpDone = true;
        checkComplete();
      }, 3000);
    } catch {
      lcpDone = true;
    }

    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as (PerformanceEntry & { processingStart?: number })[];
        if (entries.length > 0) {
          const first = entries[0];
          vitals.fid = (first.processingStart ?? first.startTime) - first.startTime;
          fidObserver.disconnect();
          fidDone = true;
          checkComplete();
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      setTimeout(() => {
        fidObserver.disconnect();
        fidDone = true;
        checkComplete();
      }, 4000);
    } catch {
      fidDone = true;
    }

    try {
      let worstInp = 0;
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { duration: number })[]) {
          if (entry.duration > worstInp) {
            worstInp = entry.duration;
            vitals.inp = worstInp;
          }
        }
      });
      inpObserver.observe({ type: 'event', buffered: true });
      setTimeout(() => {
        inpObserver.disconnect();
        inpDone = true;
        checkComplete();
      }, 4000);
    } catch {
      inpDone = true;
    }

    checkComplete();

    void timeout;
  });
}

function categorizeResource(entry: PerformanceResourceTiming): string {
  const url = entry.name.toLowerCase();
  const type = entry.initiatorType;

  if (type === 'script' || url.endsWith('.js') || url.endsWith('.mjs')) return 'script';
  if (type === 'css' || url.endsWith('.css')) return 'stylesheet';
  if (type === 'img' || /\.(png|jpg|jpeg|gif|webp|svg|avif|ico)/.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)/.test(url)) return 'font';
  if (type === 'fetch' || type === 'xmlhttprequest') return 'fetch';
  if (url.endsWith('.json')) return 'data';
  if (/\.(mp4|webm|ogg|mp3|wav)/.test(url)) return 'media';
  return 'other';
}

export function collectResourceMetrics(): ResourceMetrics {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const resources: ResourceInfo[] = [];
  const byType: Record<string, { count: number; size: number }> = {};
  let totalSize = 0;
  const blocking: ResourceInfo[] = [];

  for (const entry of entries) {
    const type = categorizeResource(entry);
    const size = entry.transferSize || entry.encodedBodySize || 0;
    const cached = entry.transferSize === 0 && entry.decodedBodySize > 0;
    const compressed = entry.encodedBodySize > 0 && entry.decodedBodySize > entry.encodedBodySize;

    const resource: ResourceInfo = {
      name: entry.name,
      type,
      size,
      duration: entry.duration,
      protocol: entry.nextHopProtocol,
      cached,
      compressed,
      initiatorType: entry.initiatorType,
    };

    resources.push(resource);
    totalSize += size;

    if (!byType[type]) {
      byType[type] = { count: 0, size: 0 };
    }
    byType[type].count++;
    byType[type].size += size;

    const entryWithBlocking = entry as PerformanceResourceTiming & { renderBlockingStatus?: string };
    const isRenderBlocking =
      (type === 'stylesheet' && entryWithBlocking.renderBlockingStatus === 'blocking') ||
      (type === 'script' &&
        entryWithBlocking.renderBlockingStatus === 'blocking' &&
        !entry.name.includes('async') &&
        !entry.name.includes('defer'));

    if (isRenderBlocking) {
      blocking.push(resource);
    }
  }

  const sorted = [...resources].sort((a, b) => b.size - a.size);
  const largest = sorted.slice(0, 10);

  return {
    total: resources.length,
    totalSize,
    byType,
    largest,
    blocking,
    resources,
  };
}

export function collectMemoryInfo(): MemoryInfo | null {
  const perfWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perfWithMemory.memory) return null;

  return {
    usedJSHeapSize: perfWithMemory.memory.usedJSHeapSize,
    totalJSHeapSize: perfWithMemory.memory.totalJSHeapSize,
    jsHeapSizeLimit: perfWithMemory.memory.jsHeapSizeLimit,
  };
}

function scoreLCP(ms: number): number {
  if (ms <= 2500) return 100;
  if (ms <= 4000) return 100 - ((ms - 2500) / 1500) * 50;
  return Math.max(0, 50 - ((ms - 4000) / 4000) * 50);
}

function scoreFID(ms: number): number {
  if (ms <= 100) return 100;
  if (ms <= 300) return 100 - ((ms - 100) / 200) * 50;
  return Math.max(0, 50 - ((ms - 300) / 300) * 50);
}

function scoreCLS(value: number): number {
  if (value <= 0.1) return 100;
  if (value <= 0.25) return 100 - ((value - 0.1) / 0.15) * 50;
  return Math.max(0, 50 - ((value - 0.25) / 0.25) * 50);
}

function scoreTTFB(ms: number): number {
  if (ms <= 800) return 100;
  if (ms <= 1800) return 100 - ((ms - 800) / 1000) * 50;
  return Math.max(0, 50 - ((ms - 1800) / 1800) * 50);
}

function scoreFCP(ms: number): number {
  if (ms <= 1800) return 100;
  if (ms <= 3000) return 100 - ((ms - 1800) / 1200) * 50;
  return Math.max(0, 50 - ((ms - 3000) / 3000) * 50);
}

function scoreINP(ms: number): number {
  if (ms <= 200) return 100;
  if (ms <= 500) return 100 - ((ms - 200) / 300) * 50;
  return Math.max(0, 50 - ((ms - 500) / 500) * 50);
}

export function calculatePerformanceScore(
  vitals: WebVitals,
  navigation: NavigationTiming
): number {
  const weights = {
    lcp: 0.25,
    fid: 0.1,
    cls: 0.25,
    inp: 0.1,
    fcp: 0.15,
    ttfb: 0.15,
  };

  let totalWeight = 0;
  let weightedScore = 0;

  if (vitals.lcp !== null) {
    weightedScore += scoreLCP(vitals.lcp) * weights.lcp;
    totalWeight += weights.lcp;
  }

  if (vitals.fid !== null) {
    weightedScore += scoreFID(vitals.fid) * weights.fid;
    totalWeight += weights.fid;
  }

  if (vitals.cls !== null) {
    weightedScore += scoreCLS(vitals.cls) * weights.cls;
    totalWeight += weights.cls;
  }

  if (vitals.inp !== null) {
    weightedScore += scoreINP(vitals.inp) * weights.inp;
    totalWeight += weights.inp;
  }

  if (vitals.fcp !== null) {
    weightedScore += scoreFCP(vitals.fcp) * weights.fcp;
    totalWeight += weights.fcp;
  }

  const ttfb = vitals.ttfb ?? navigation.ttfb;
  if (ttfb > 0) {
    weightedScore += scoreTTFB(ttfb) * weights.ttfb;
    totalWeight += weights.ttfb;
  }

  if (totalWeight === 0) return 0;

  return Math.round(weightedScore / totalWeight);
}
