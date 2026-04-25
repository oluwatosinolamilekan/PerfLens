import type { FrameworkInfo, RuntimeInfo } from './types';

const FRAMEWORK_KEYWORDS: Array<{ name: string; test: () => boolean }> = [
  {
    name: 'Next.js',
    test: () =>
      Boolean(
        document.querySelector('script#__NEXT_DATA__') ||
          (window as Window & { __NEXT_DATA__?: unknown }).__NEXT_DATA__ ||
          document.querySelector('[data-nextjs-router]')
      ),
  },
  {
    name: 'Nuxt',
    test: () =>
      Boolean(
        document.querySelector('#__nuxt') ||
          document.querySelector('[data-n-head]') ||
          (window as Window & { __NUXT__?: unknown }).__NUXT__
      ),
  },
  {
    name: 'React',
    test: () =>
      Boolean(
        document.querySelector('[data-reactroot], [data-reactid]') ||
          (window as Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
      ),
  },
  {
    name: 'Vue',
    test: () =>
      Boolean(
        document.querySelector('[data-v-app]') ||
          (window as Window & { __VUE__?: unknown }).__VUE__ ||
          (window as Window & { __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__VUE_DEVTOOLS_GLOBAL_HOOK__
      ),
  },
  {
    name: 'Angular',
    test: () =>
      Boolean(
        document.querySelector('[ng-version], [ng-app], [data-ng-app]') ||
          (window as Window & { ng?: unknown }).ng
      ),
  },
  {
    name: 'Svelte',
    test: () => Boolean(document.querySelector('[data-svelte-h], [data-sveltekit]')),
  },
];

function detectFromScripts(): FrameworkInfo | null {
  const scriptSources = Array.from(document.scripts)
    .map((script) => (script.src || '').toLowerCase())
    .filter(Boolean);

  if (scriptSources.some((src) => src.includes('_next/') || src.includes('next/static'))) {
    return { name: 'Next.js', confidence: 'medium' };
  }

  if (scriptSources.some((src) => src.includes('/_nuxt/') || src.includes('nuxt'))) {
    return { name: 'Nuxt', confidence: 'medium' };
  }

  if (scriptSources.some((src) => src.includes('react'))) {
    return { name: 'React', confidence: 'low' };
  }

  if (scriptSources.some((src) => src.includes('vue'))) {
    return { name: 'Vue', confidence: 'low' };
  }

  if (scriptSources.some((src) => src.includes('angular'))) {
    return { name: 'Angular', confidence: 'low' };
  }

  return null;
}

export function detectFramework(): FrameworkInfo {
  for (const candidate of FRAMEWORK_KEYWORDS) {
    if (candidate.test()) {
      return { name: candidate.name, confidence: 'high' };
    }
  }

  const scriptDetection = detectFromScripts();
  if (scriptDetection) {
    return scriptDetection;
  }

  return { name: 'Unknown', confidence: 'low' };
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

  return {
    mode,
    isLocal,
    isDev,
    host,
    port,
  };
}
