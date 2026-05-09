import type { AIFixContext, AIPatchBrief, AuditIssue, AuditResult, Suggestion } from './types';

interface BuildSingleIssuePromptInput extends AIFixContext {
  issueTitle: string;
  issueDescription: string;
  suggestion: string;
  resource?: string;
  category: string;
}

interface BuildFixPacketPromptInput extends AIFixContext {
  audits: AuditResult[];
  suggestions?: Suggestion[];
  maxIssues?: number;
}

function formatMs(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} ms` : 'n/a';
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function severityRank(severity: AuditIssue['severity']): number {
  if (severity === 'high') return 0;
  if (severity === 'medium') return 1;
  return 2;
}

function frameworkName(context: AIFixContext): string {
  return context.framework?.primary?.name || context.framework?.name || 'unknown';
}

function normalizedFramework(context: AIFixContext): string {
  return frameworkName(context).toLowerCase();
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function metricEvidence(context: AIFixContext): string[] {
  const lines: string[] = [];

  if (typeof context.score === 'number') {
    lines.push(`Performance score is ${context.score}/100.`);
  }

  if (context.vitals) {
    const vitals = [
      `LCP ${formatMs(context.vitals.lcp)}`,
      `FCP ${formatMs(context.vitals.fcp)}`,
      `INP ${formatMs(context.vitals.inp)}`,
      `CLS ${formatNumber(context.vitals.cls)}`,
      `TTFB ${formatMs(context.vitals.ttfb)}`,
    ];
    lines.push(`Current vitals: ${vitals.join(', ')}.`);
  }

  if (context.resources) {
    lines.push(
      `${context.resources.total} requests total ${formatBytes(context.resources.totalSize)} with ${context.resources.blocking.length} render-blocking candidate${context.resources.blocking.length === 1 ? '' : 's'}.`
    );

    const largest = context.resources.largest[0];
    if (largest) {
      lines.push(`Largest resource is ${largest.type} ${formatBytes(largest.size)} taking ${Math.round(largest.duration)} ms.`);
    }
  }

  if (context.runtime?.mode || context.runtime?.buildStatus) {
    lines.push(`Runtime context is ${context.runtime.mode}/${context.runtime.buildStatus}.`);
  }

  return lines;
}

function likelyFilesForCategory(category: string, context: AIFixContext, resource?: string): string[] {
  const categoryKey = category.toLowerCase();
  const framework = normalizedFramework(context);
  const files: string[] = [];

  if (framework.includes('next')) {
    files.push('app/page.tsx or pages/index.tsx', 'components/**/*.{tsx,jsx}', 'next.config.js');
  } else if (framework.includes('nuxt')) {
    files.push('pages/**/*.vue', 'components/**/*.vue', 'nuxt.config.ts');
  } else if (framework.includes('vue')) {
    files.push('src/components/**/*.vue', 'src/views/**/*.vue', 'vite.config.ts');
  } else if (framework.includes('astro')) {
    files.push('src/pages/**/*.astro', 'src/components/**/*.{astro,tsx,jsx}', 'astro.config.mjs');
  } else if (framework.includes('svelte')) {
    files.push('src/routes/**/*.{svelte,ts}', 'src/lib/**/*.svelte', 'svelte.config.js');
  } else if (framework.includes('react') || framework.includes('preact') || framework.includes('vite')) {
    files.push('src/components/**/*.{tsx,jsx}', 'src/pages/**/*.{tsx,jsx}', 'vite.config.ts');
  } else {
    files.push('main app entry file', 'page template/layout file', 'asset or server config that owns this resource');
  }

  if (categoryKey.includes('image')) {
    files.push('image component or hero section', 'public/images or asset source folder');
  }
  if (categoryKey.includes('script') || categoryKey.includes('network')) {
    files.push('bundle entry point', 'dynamic import boundary', 'third-party script/tag manager setup');
  }
  if (categoryKey.includes('style') || categoryKey.includes('css')) {
    files.push('global stylesheet', 'theme/layout CSS', 'critical CSS/loading strategy');
  }
  if (categoryKey.includes('caching') || categoryKey.includes('compression')) {
    files.push('server headers config', 'hosting config', 'CDN/cache configuration');
  }
  if (categoryKey.includes('accessibility')) {
    files.push('affected component markup', 'shared UI component or design system primitive');
  }
  if (categoryKey.includes('seo')) {
    files.push('metadata/layout file', 'route/page head config');
  }

  if (resource) {
    files.push(`code that references ${resource}`);
  }

  return unique(files).slice(0, 7);
}

function frameworkNotesForCategory(category: string, context: AIFixContext): string[] {
  const categoryKey = category.toLowerCase();
  const framework = normalizedFramework(context);
  const notes: string[] = [];

  if (framework.includes('next')) {
    if (categoryKey.includes('image')) notes.push('For Next.js, prefer next/image with width, height, sizes, priority for the LCP image, and modern formats.');
    if (categoryKey.includes('script')) notes.push('For Next.js, use next/script strategies or route-level dynamic imports before changing app architecture.');
    if (categoryKey.includes('caching') || categoryKey.includes('compression')) notes.push('For Next.js, inspect next.config.js and route/header configuration before server rewrites.');
  } else if (framework.includes('react') || framework.includes('vite')) {
    if (categoryKey.includes('script')) notes.push('For React/Vite, look for lazy route boundaries, dynamic imports, and oversized vendor chunks.');
    if (categoryKey.includes('image')) notes.push('For React/Vite, verify imported assets are resized and served with responsive srcset or CDN transforms.');
  } else if (framework.includes('astro')) {
    notes.push('For Astro, check whether hydration directives and islands can reduce client-side JavaScript.');
  } else if (framework.includes('vue') || framework.includes('nuxt')) {
    notes.push('For Vue/Nuxt, inspect async components, image module usage, payload size, and route-level code splitting.');
  } else if (framework.includes('svelte')) {
    notes.push('For Svelte/SvelteKit, inspect route load boundaries, asset handling, and hydration cost before broad rewrites.');
  }

  if (context.runtime?.buildStatus === 'dev') {
    notes.push('This appears to be a development build, so verify again against a production build before judging final impact.');
  }

  return notes;
}

function recommendedFixesForIssue(category: string, suggestion: string, context: AIFixContext): string[] {
  const categoryKey = category.toLowerCase();
  const fixes = [suggestion];

  if (categoryKey.includes('image')) {
    fixes.push('Resize the asset to the rendered dimensions and serve WebP/AVIF where possible.');
    fixes.push('Preserve layout stability with explicit width/height or equivalent aspect-ratio constraints.');
  }
  if (categoryKey.includes('script')) {
    fixes.push('Split non-critical JavaScript with dynamic imports or defer third-party scripts until needed.');
    fixes.push('Keep the change local to the route/component causing the measured cost.');
  }
  if (categoryKey.includes('style') || categoryKey.includes('css')) {
    fixes.push('Reduce render-blocking CSS by extracting critical styles or deferring non-critical styles.');
  }
  if (categoryKey.includes('caching')) {
    fixes.push('Add long-lived Cache-Control headers for versioned static assets.');
  }
  if (categoryKey.includes('compression')) {
    fixes.push('Enable Brotli or gzip for compressible text assets through server/CDN configuration.');
  }
  if (categoryKey.includes('network')) {
    fixes.push('Optimize the resource owner first, then consider lazy loading, preloading, or server/CDN headers.');
  }

  const frameworkNotes = frameworkNotesForCategory(category, context);
  if (frameworkNotes.length > 0) {
    fixes.push(frameworkNotes[0]);
  }

  return unique(fixes).slice(0, 5);
}

function likelyCauseForIssue(category: string, description: string, context: AIFixContext): string {
  const categoryKey = category.toLowerCase();
  const rootCause = context.rootCauseStory?.summary;

  if (rootCause) {
    return rootCause;
  }
  if (categoryKey.includes('image')) {
    return 'The page is likely shipping an image that is larger, later, or less stable than the rendered experience needs.';
  }
  if (categoryKey.includes('script')) {
    return 'The page is likely paying main-thread or render-blocking cost before the user-visible content is ready.';
  }
  if (categoryKey.includes('style') || categoryKey.includes('css')) {
    return 'The page is likely blocking first render on CSS that can be reduced, split, or loaded later.';
  }
  if (categoryKey.includes('caching') || categoryKey.includes('compression')) {
    return 'The server or CDN is likely missing transfer optimizations that would reduce repeat-load cost.';
  }
  if (categoryKey.includes('accessibility')) {
    return 'The affected markup is missing semantic information that assistive technology needs.';
  }
  if (categoryKey.includes('seo')) {
    return 'The route metadata or page structure is likely underspecified for crawlers and share previews.';
  }

  return `The issue is probably caused by the code path or resource described here: ${description}`;
}

export function buildPatchBrief(input: BuildSingleIssuePromptInput): AIPatchBrief {
  const evidence = [
    `${input.category}: ${input.issueDescription}`,
    input.resource ? `Affected resource: ${input.resource}` : '',
    ...metricEvidence(input),
  ];

  return {
    title: `${input.category} patch brief`,
    problem: input.issueDescription,
    likelyCause: likelyCauseForIssue(input.category, input.issueDescription, input),
    riskLevel: input.category.toLowerCase().includes('accessibility') || input.category.toLowerCase().includes('seo') ? 'low' : input.score && input.score < 50 ? 'high' : 'medium',
    evidence: unique(evidence).slice(0, 7),
    likelyFiles: likelyFilesForCategory(input.category, input, input.resource),
    recommendedFixes: recommendedFixesForIssue(input.category, input.suggestion, input),
    patchRules: [
      'Make the smallest high-impact change that addresses the measured issue.',
      'Preserve existing layout, behavior, and public APIs unless the issue requires otherwise.',
      'Avoid unrelated refactors, dependency churn, and broad rewrites.',
      'Prefer framework-native APIs and established project patterns.',
    ],
    verificationSteps: [
      'Run the app locally and confirm the affected page still renders correctly.',
      'Rerun PerfLens on the same URL and compare before/after score and vitals.',
      input.resource ? `Confirm the affected resource improves or is no longer on the critical path: ${input.resource}` : 'Confirm the flagged issue no longer appears in the audit.',
      'Check for visual regressions, layout shift, and console errors.',
    ],
    frameworkNotes: frameworkNotesForCategory(input.category, input),
  };
}

export function formatPatchBrief(brief: AIPatchBrief): string {
  return [
    'AI Patch Brief',
    '',
    `Problem: ${brief.problem}`,
    `Likely cause: ${brief.likelyCause}`,
    `Risk level: ${brief.riskLevel}`,
    '',
    'Evidence',
    ...brief.evidence.map((item) => `- ${item}`),
    '',
    'Likely files or areas to inspect',
    ...brief.likelyFiles.map((item) => `- ${item}`),
    '',
    'Recommended fix',
    ...brief.recommendedFixes.map((item) => `- ${item}`),
    brief.frameworkNotes.length ? '' : null,
    brief.frameworkNotes.length ? 'Framework notes' : null,
    ...brief.frameworkNotes.map((item) => `- ${item}`),
    '',
    'Patch rules',
    ...brief.patchRules.map((item) => `- ${item}`),
    '',
    'Verification',
    ...brief.verificationSteps.map((item) => `- ${item}`),
  ].filter((line): line is string => line !== null).join('\n');
}

function contextLines(context: AIFixContext): string[] {
  const lines = [
    `Project: ${context.projectName || inferProjectName(context.pageUrl)}`,
    `Page URL: ${context.pageUrl || 'not provided'}`,
    `Performance score: ${typeof context.score === 'number' ? `${context.score}/100` : 'n/a'}`,
    `Framework: ${frameworkName(context)}`,
    `Runtime mode: ${context.runtime?.mode || 'unknown'}`,
    `Build status: ${context.runtime?.buildStatus || 'unknown'}`,
  ];

  if (context.runtime?.buildSignals?.length) {
    lines.push(`Build signals: ${context.runtime.buildSignals.join(' ')}`);
  }

  if (context.vitals) {
    lines.push(
      `Vitals: LCP ${formatMs(context.vitals.lcp)}, FCP ${formatMs(context.vitals.fcp)}, INP ${formatMs(context.vitals.inp)}, CLS ${formatNumber(context.vitals.cls)}, TTFB ${formatMs(context.vitals.ttfb)}`
    );
  }

  if (context.resources) {
    const largest = context.resources.largest
      .slice(0, 3)
      .map((resource) => `${resource.type} ${formatBytes(resource.size)} ${Math.round(resource.duration)}ms ${resource.name}`)
      .join('; ');

    lines.push(
      `Resources: ${context.resources.total} requests, ${formatBytes(context.resources.totalSize)} total, ${context.resources.blocking.length} render-blocking candidate${context.resources.blocking.length === 1 ? '' : 's'}`
    );

    if (largest) {
      lines.push(`Largest resources: ${largest}`);
    }
  }

  if (context.rootCauseStory?.summary) {
    lines.push(`Root cause summary: ${context.rootCauseStory.summary}`);
  }

  return lines;
}

function issueLine(audit: AuditResult, issue: AuditIssue, index: number): string {
  return [
    `${index}. [${issue.severity.toUpperCase()}] ${audit.category}: ${audit.title}`,
    `   Problem: ${issue.description}`,
    `   Suggested direction: ${issue.suggestion}`,
    issue.resource ? `   Resource: ${issue.resource}` : '',
  ].filter(Boolean).join('\n');
}

export function inferProjectName(pageUrl?: string): string {
  if (!pageUrl) return 'local web app';

  try {
    const url = new URL(pageUrl);
    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    return host || 'local web app';
  } catch {
    return 'local web app';
  }
}

export function buildSingleIssuePrompt(input: BuildSingleIssuePromptInput): string {
  const patchBrief = buildPatchBrief(input);
  const resourceLine = input.resource ? `\nResource: ${input.resource}` : '';

  return [
    'Help me implement this AI Patch Brief for my local app.',
    '',
    formatPatchBrief(patchBrief),
    '',
    'Raw PerfLens Context',
    ...contextLines(input).map((line) => `- ${line}`),
    '',
    'Raw Issue',
    `- Category: ${input.category}`,
    `- Title: ${input.issueTitle}`,
    `- Details: ${input.issueDescription}`,
    `- Suggested fix direction: ${input.suggestion}${resourceLine}`,
    '',
    'Please implement or propose the smallest patch that satisfies the brief, then list the exact verification steps.',
  ].join('\n');
}

export function buildFixPacketPrompt(input: BuildFixPacketPromptInput): string {
  const issues = input.audits
    .flatMap((audit) => audit.issues.map((issue) => ({ audit, issue })))
    .sort((a, b) => severityRank(a.issue.severity) - severityRank(b.issue.severity))
    .slice(0, input.maxIssues ?? 3);

  const topSuggestions = (input.suggestions ?? []).slice(0, 3);
  const primaryIssue = issues[0];
  const packetBrief = primaryIssue
    ? buildPatchBrief({
        ...input,
        category: primaryIssue.audit.category,
        issueTitle: primaryIssue.audit.title,
        issueDescription: primaryIssue.issue.description,
        suggestion: primaryIssue.issue.suggestion,
        resource: primaryIssue.issue.resource,
      })
    : null;

  return [
    'Help me implement this AI Patch Brief packet for my local app.',
    '',
    'AI Patch Brief Packet',
    packetBrief
      ? [
          `Primary problem: ${packetBrief.problem}`,
          `Likely cause: ${packetBrief.likelyCause}`,
          `Risk level: ${packetBrief.riskLevel}`,
          '',
          'Likely files or areas to inspect',
          ...packetBrief.likelyFiles.map((item) => `- ${item}`),
          '',
          'Patch rules',
          ...packetBrief.patchRules.map((item) => `- ${item}`),
          '',
          'Verification',
          ...packetBrief.verificationSteps.map((item) => `- ${item}`),
        ].join('\n')
      : 'No active issue is available for a patch brief.',
    '',
    'Context',
    ...contextLines(input).map((line) => `- ${line}`),
    '',
    'Top PerfLens Issues',
    issues.length
      ? issues.map(({ audit, issue }, index) => issueLine(audit, issue, index + 1)).join('\n\n')
      : 'No active audit issues were detected.',
    '',
    'Prioritized Suggestions',
    topSuggestions.length
      ? topSuggestions.map((suggestion, index) => `${index + 1}. [${suggestion.impact} impact / ${suggestion.effort} effort] ${suggestion.title}: ${suggestion.description}`).join('\n')
      : 'No additional prioritized suggestions were provided.',
    '',
    'Please return:',
    '1. A priority-ordered implementation plan.',
    '2. Exact code/config areas to inspect first.',
    '3. The smallest fixes likely to improve the measured score.',
    '4. Risks or tradeoffs to watch for.',
    '5. Verification steps using a before/after PerfLens audit.',
  ].join('\n');
}
