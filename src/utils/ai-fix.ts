import type { AIFixContext, AuditIssue, AuditResult, Suggestion } from './types';

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
  const resourceLine = input.resource ? `\nResource: ${input.resource}` : '';

  return [
    'Help me fix this web performance issue in my local app.',
    '',
    'Context',
    ...contextLines(input).map((line) => `- ${line}`),
    '',
    'Issue',
    `- Category: ${input.category}`,
    `- Title: ${input.issueTitle}`,
    `- Details: ${input.issueDescription}`,
    `- Suggested fix direction: ${input.suggestion}${resourceLine}`,
    '',
    'Please do the following:',
    '1. Identify the likely root cause from the evidence above.',
    '2. Propose the smallest high-impact code or config change.',
    '3. Name the files/components/config areas to inspect first.',
    '4. Avoid unrelated refactors or broad rewrites.',
    '5. Give verification steps, including rerunning PerfLens and checking the affected metric/resource.',
  ].join('\n');
}

export function buildFixPacketPrompt(input: BuildFixPacketPromptInput): string {
  const issues = input.audits
    .flatMap((audit) => audit.issues.map((issue) => ({ audit, issue })))
    .sort((a, b) => severityRank(a.issue.severity) - severityRank(b.issue.severity))
    .slice(0, input.maxIssues ?? 3);

  const topSuggestions = (input.suggestions ?? []).slice(0, 3);

  return [
    'Help me create and implement a focused performance fix plan for this local app.',
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
