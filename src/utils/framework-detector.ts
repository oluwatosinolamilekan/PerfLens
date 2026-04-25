import type { FrameworkCandidate, FrameworkConfidence, FrameworkInfo, RuntimeInfo } from './types';

interface FrameworkMatcher {
  name: string;
  confidence: FrameworkConfidence;
  test: () => boolean;
}

const FRAMEWORK_MATCHERS: FrameworkMatcher[] = [
  { name: 'Next.js', confidence: 'high', test: () => Boolean(document.querySelector('script#__NEXT_DATA__')) },
  { name: 'Nuxt', confidence: 'high', test: () => Boolean(document.querySelector('#__nuxt') || (window as Window & { __NUXT__?: unknown }).__NUXT__) },
  { name: 'Gatsby', confidence: 'high', test: () => Boolean((window as Window & { ___gatsby?: unknown }).___gatsby || document.querySelector('[id="___gatsby"]')) },
  { name: 'Remix', confidence: 'medium', test: () => Boolean(document.querySelector('script[data-remix-run]')) },
  { name: 'Astro', confidence: 'high', test: () => Boolean(document.querySelector('[data-astro-cid], astro-island')) },
  { name: 'Qwik', confidence: 'high', test: () => Boolean(document.querySelector('[q\\:container], [q\\:base]')) },
  { name: 'Solid', confidence: 'medium', test: () => Boolean((window as Window & { _$HY?: unknown })._$HY) },
  {
    name: 'React',
    confidence: 'high',
    test: () =>
      Boolean(
        document.querySelector('[data-reactroot], [data-reactid]') ||
          (window as Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
      ),
  },
  {
    name: 'Vue',
    confidence: 'high',
    test: () =>
      Boolean(
        document.querySelector('[data-v-app]') ||
          (window as Window & { __VUE__?: unknown }).__VUE__ ||
          (window as Window & { __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__VUE_DEVTOOLS_GLOBAL_HOOK__
      ),
  },
  { name: 'Angular', confidence: 'high', test: () => Boolean(document.querySelector('[ng-version], [ng-app], [data-ng-app]')) },
  { name: 'Svelte', confidence: 'high', test: () => Boolean(document.querySelector('[data-svelte-h], [data-sveltekit], [data-svelte]')) },
  { name: 'Preact', confidence: 'medium', test: () => Boolean((window as Window & { preact?: unknown }).preact) },
  { name: 'Ember', confidence: 'medium', test: () => Boolean((window as Window & { Ember?: unknown }).Ember || document.querySelector('[id="ember-basic-dropdown-wormhole"]')) },
  { name: 'Backbone', confidence: 'medium', test: () => Boolean((window as Window & { Backbone?: unknown }).Backbone) },
  { name: 'jQuery', confidence: 'medium', test: () => Boolean((window as Window & { jQuery?: unknown; $?: unknown }).jQuery) },
];

const FRAMEWORK_SCRIPT_HINTS: Array<{ name: string; patterns: string[] }> = [
  { name: 'Next.js', patterns: ['/_next/', 'next/static'] },
  { name: 'Nuxt', patterns: ['/_nuxt/', 'nuxt'] },
  { name: 'Gatsby', patterns: ['/gatsby-', '/webpack-runtime-', 'gatsby'] },
  { name: 'Remix', patterns: ['remix', '/build/_assets/'] },
  { name: 'Astro', patterns: ['/astro/', 'astro-island'] },
  { name: 'Qwik', patterns: ['qwik', 'q-manifest'] },
  { name: 'Solid', patterns: ['solid-js', 'solidstart'] },
  { name: 'React', patterns: ['react', 'react-dom'] },
  { name: 'Vue', patterns: ['vue', 'vue-router'] },
  { name: 'Angular', patterns: ['angular', 'zone.js'] },
  { name: 'Svelte', patterns: ['svelte', 'sveltekit'] },
  { name: 'Preact', patterns: ['preact'] },
  { name: 'Ember', patterns: ['ember'] },
  { name: 'Backbone', patterns: ['backbone'] },
  { name: 'jQuery', patterns: ['jquery'] },
];

const CONFIDENCE_SCORE: Record<FrameworkConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function addFramework(
  matchMap: Map<string, FrameworkCandidate>,
  name: string,
  confidence: FrameworkConfidence,
  signal: FrameworkCandidate['signal']
): void {
  const existing = matchMap.get(name);
  if (!existing || CONFIDENCE_SCORE[confidence] > CONFIDENCE_SCORE[existing.confidence]) {
    matchMap.set(name, { name, confidence, signal });
  }
}

function detectFromDomAndGlobals(matchMap: Map<string, FrameworkCandidate>): void {
  for (const matcher of FRAMEWORK_MATCHERS) {
    try {
      if (matcher.test()) {
        addFramework(matchMap, matcher.name, matcher.confidence, 'dom-or-global');
      }
    } catch {
      // Cross-origin scripts can occasionally throw when probing globals.
    }
  }
}

function detectFromScripts(matchMap: Map<string, FrameworkCandidate>): void {
  const scriptSources = Array.from(document.scripts)
    .map((script) => (script.src || '').toLowerCase())
    .filter(Boolean);

  for (const hint of FRAMEWORK_SCRIPT_HINTS) {
    if (scriptSources.some((src) => hint.patterns.some((pattern) => src.includes(pattern)))) {
      addFramework(matchMap, hint.name, 'low', 'script-source');
    }
  }
}

function sortCandidates(candidates: FrameworkCandidate[]): FrameworkCandidate[] {
  return [...candidates].sort((a, b) => {
    const byConfidence = CONFIDENCE_SCORE[b.confidence] - CONFIDENCE_SCORE[a.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.name.localeCompare(b.name);
  });
}

export function detectFramework(): FrameworkInfo {
  const matchMap = new Map<string, FrameworkCandidate>();
  detectFromDomAndGlobals(matchMap);
  detectFromScripts(matchMap);

  const detected = sortCandidates(Array.from(matchMap.values()));
  if (detected.length === 0) {
    detected.push({ name: 'Vanilla', confidence: 'medium', signal: 'fallback' });
  }

  const primary = detected[0];
  return {
    name: primary.name,
    confidence: primary.confidence,
    primary,
    detected,
  };
}

function detectBuildStatus(mode: RuntimeInfo['mode'], href: string): RuntimeInfo['buildStatus'] {
  const scriptSources = Array.from(document.scripts)
    .map((script) => (script.src || '').toLowerCase())
    .filter(Boolean);

  const hasHmrSignal =
    scriptSources.some((src) => src.includes('/@vite/') || src.includes('webpack-hot-update') || src.includes('react-refresh')) ||
    href.includes('hot-update') ||
    Boolean(document.querySelector('script[type="module"][src*="/@vite/client"]'));

  const hasProdSignal =
    scriptSources.some((src) => src.includes('.min.js') || src.includes('/_next/static/chunks/') || src.includes('/assets/index-')) ||
    href.includes('?build=production') ||
    href.includes('&build=production');

  if (hasHmrSignal) return 'dev';
  if (mode === 'local' || mode === 'development' || mode === 'staging') return 'dev';
  if (hasProdSignal || mode === 'production') return 'prod';
  return 'unknown';
}

export function detectRuntime(): RuntimeInfo {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || null;
  const href = window.location.href.toLowerCase();

  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local');

  const isPrivateIp =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  const hasDevSignals =
    /\bdev\b/.test(host) ||
    /\bdev\b/.test(href) ||
    /\bstaging\b/.test(host) ||
    /\bstaging\b/.test(href) ||
    ['3000', '3001', '4200', '5173', '8080', '8000'].includes(port ?? '');

  const isLocal = isLocalHost || isPrivateIp || Boolean(port);
  const isStaging = /\bstaging\b/.test(host) || /\bstaging\b/.test(href);
  const isDev = hasDevSignals || isLocal;

  let mode: RuntimeInfo['mode'] = 'production';
  if (isLocal) {
    mode = 'local';
  } else if (isStaging) {
    mode = 'staging';
  } else if (hasDevSignals) {
    mode = 'development';
  } else if (!host) {
    mode = 'unknown';
  }

  const buildStatus = detectBuildStatus(mode, href);
  const buildSignals: string[] = [];

  if (buildStatus === 'dev') {
    buildSignals.push('Detected development runtime signals.');
  } else if (buildStatus === 'prod') {
    buildSignals.push('Detected production-optimized asset patterns.');
  } else {
    buildSignals.push('Build signals are inconclusive.');
  }

  return {
    mode,
    isLocal,
    isDev,
    host,
    port,
    buildStatus,
    buildSignals,
  };
}
