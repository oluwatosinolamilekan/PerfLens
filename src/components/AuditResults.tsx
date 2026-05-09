import React, { useState } from 'react';
import type { AuditResult, AIAgent, AIFixContext } from '../utils/types';
import { FixItActions } from './FixItActions';

interface AuditResultsProps extends AIFixContext {
  audits: AuditResult[];
  showFixActions?: boolean;
  defaultAgent?: AIAgent;
  defaultCustomAgentName?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Images: '🖼',
  Scripts: '⚡',
  Styles: '🎨',
  Caching: '💾',
  Compression: '📦',
  Accessibility: '♿',
};

function getSeverityStyle(severity: 'high' | 'medium' | 'low'): {
  bg: string;
  text: string;
  border: string;
} {
  switch (severity) {
    case 'high':
      return { bg: 'rgba(255,82,82,0.1)', text: '#ff5252', border: 'rgba(255,82,82,0.25)' };
    case 'medium':
      return { bg: 'rgba(255,171,0,0.1)', text: '#ffab00', border: 'rgba(255,171,0,0.25)' };
    case 'low':
      return { bg: 'rgba(77,171,247,0.1)', text: '#4dabf7', border: 'rgba(77,171,247,0.25)' };
  }
}

function getScoreStyle(score: number): { color: string; bg: string } {
  if (score >= 90) return { color: '#00c853', bg: 'rgba(0,200,83,0.12)' };
  if (score >= 50) return { color: '#ffab00', bg: 'rgba(255,171,0,0.12)' };
  return { color: '#ff5252', bg: 'rgba(255,82,82,0.12)' };
}

function truncateUrl(url: string, maxLen = 60): string {
  if (!url || url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > maxLen - 20) {
      return u.host + '/...' + path.slice(-30);
    }
    return u.host + path;
  } catch {
    return url.slice(0, maxLen) + '...';
  }
}

const AuditCategory: React.FC<{
  audit: AuditResult;
  showFixActions?: boolean;
  defaultAgent?: AIAgent;
  defaultCustomAgentName?: string;
  fixContext?: AIFixContext;
}> = ({
  audit,
  showFixActions = false,
  defaultAgent = 'cursor',
  defaultCustomAgentName = '',
  fixContext,
}) => {
  const [expanded, setExpanded] = useState(false);
  const icon = CATEGORY_ICONS[audit.category] || '📋';
  const scoreStyle = getScoreStyle(audit.score);

  return (
    <div className="border border-perf-border rounded-lg overflow-hidden animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-perf-highlight/50 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 text-left">
          <span className="text-sm font-medium text-perf-text">{audit.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {audit.issues.length > 0 && (
            <span className="text-[10px] font-medium text-perf-muted">
              {audit.issues.length} issue{audit.issues.length !== 1 ? 's' : ''}
            </span>
          )}
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md min-w-[36px] text-center"
            style={{ backgroundColor: scoreStyle.bg, color: scoreStyle.color }}
          >
            {audit.score}
          </span>
          <svg
            className={`w-4 h-4 text-perf-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-perf-border px-3 py-2 space-y-2 bg-perf-bg/50">
          {audit.passed && (
            <div className="flex items-center gap-2 text-sm text-perf-good py-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              All checks passed
            </div>
          )}

          {audit.issues.map((issue, idx) => {
            const style = getSeverityStyle(issue.severity);
            return (
              <div
                key={idx}
                className="rounded-md p-2.5 text-xs space-y-1.5"
                style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                    style={{ backgroundColor: style.border, color: style.text }}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-perf-text leading-relaxed">{issue.description}</span>
                </div>
                {issue.resource && (
                  <div
                    className="font-mono text-[10px] px-2 py-1 rounded truncate"
                    style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: '#8b8fa3' }}
                    title={issue.resource}
                  >
                    {truncateUrl(issue.resource)}
                  </div>
                )}
                <div className="flex items-start gap-1.5 text-perf-accent">
                  <svg className="w-3 h-3 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="leading-relaxed">{issue.suggestion}</span>
                </div>
                {showFixActions && (
                  <FixItActions
                    compact
                    defaultAgent={defaultAgent}
                    defaultCustomAgentName={defaultCustomAgentName}
                    category={audit.category}
                    issueTitle={audit.title}
                    issueDescription={issue.description}
                    suggestion={issue.suggestion}
                    resource={issue.resource}
                    {...fixContext}
                  />
                )}
              </div>
            );
          })}

          {audit.suggestions.length > 0 && audit.issues.length > 0 && (
            <div className="pt-1 border-t border-perf-border/50">
              <p className="text-[10px] font-semibold text-perf-muted uppercase mb-1.5">Recommendations</p>
              <ul className="space-y-1">
                {audit.suggestions.map((s, idx) => (
                  <li key={idx} className="text-xs text-perf-muted flex items-start gap-1.5">
                    <span className="text-perf-accent mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AuditResults: React.FC<AuditResultsProps> = ({
  audits,
  showFixActions = false,
  defaultAgent = 'cursor',
  defaultCustomAgentName = '',
  pageUrl,
  projectName,
  score,
  framework,
  runtime,
  vitals,
  resources,
  rootCauseStory,
}) => {
  const totalIssues = audits.reduce((sum, a) => sum + a.issues.length, 0);
  const passedCount = audits.filter((a) => a.passed).length;
  const fixContext: AIFixContext = {
    pageUrl,
    projectName,
    score,
    framework,
    runtime,
    vitals,
    resources,
    rootCauseStory,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-perf-good font-medium">{passedCount} passed</span>
          <span className="text-perf-border">|</span>
          <span className={totalIssues > 0 ? 'text-perf-poor font-medium' : 'text-perf-muted'}>
            {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {audits.map((audit) => (
          <AuditCategory
            key={audit.id}
            audit={audit}
            showFixActions={showFixActions}
            defaultAgent={defaultAgent}
            defaultCustomAgentName={defaultCustomAgentName}
            fixContext={fixContext}
          />
        ))}
      </div>
    </div>
  );
};
