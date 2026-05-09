import React, { useMemo } from 'react';
import { buildFixPacketPrompt } from '../utils/ai-fix';
import type { AIAgent, AIFixContext, AuditResult, Suggestion } from '../utils/types';
import { FixItActions } from './FixItActions';

interface FixItPacketActionsProps extends AIFixContext {
  audits: AuditResult[];
  suggestions?: Suggestion[];
  defaultAgent?: AIAgent;
  defaultCustomAgentName?: string;
  maxIssues?: number;
}

export const FixItPacketActions: React.FC<FixItPacketActionsProps> = ({
  audits,
  suggestions = [],
  defaultAgent = 'cursor',
  defaultCustomAgentName = '',
  maxIssues = 3,
  pageUrl,
  projectName,
  score,
  framework,
  runtime,
  vitals,
  resources,
  rootCauseStory,
}) => {
  const issueCount = audits.reduce((sum, audit) => sum + audit.issues.length, 0);
  const severityRank = { high: 0, medium: 1, low: 2 };
  const primaryIssue = audits
    .flatMap((audit) => audit.issues.map((issue) => ({ audit, issue })))
    .sort((a, b) => severityRank[a.issue.severity] - severityRank[b.issue.severity])[0];
  const context: AIFixContext = {
    pageUrl,
    projectName,
    score,
    framework,
    runtime,
    vitals,
    resources,
    rootCauseStory,
  };
  const prompt = useMemo(
    () => buildFixPacketPrompt({ audits, suggestions, maxIssues, ...context }),
    [audits, suggestions, maxIssues, pageUrl, projectName, score, framework, runtime, vitals, resources, rootCauseStory]
  );

  if (issueCount === 0) {
    return null;
  }

  return (
    <FixItActions
      actionLabel={`Fix top ${Math.min(issueCount, maxIssues)} with AI`}
      category={primaryIssue?.audit.category ?? 'Performance plan'}
      issueTitle={primaryIssue?.audit.title ?? 'Prioritized PerfLens fix packet'}
      issueDescription={primaryIssue?.issue.description ?? 'Multiple prioritized PerfLens issues are ready to send as one implementation plan.'}
      suggestion={primaryIssue?.issue.suggestion ?? 'Start with the highest-severity, lowest-risk fixes and verify with a before/after PerfLens audit.'}
      resource={primaryIssue?.issue.resource}
      defaultAgent={defaultAgent}
      defaultCustomAgentName={defaultCustomAgentName}
      promptOverride={prompt}
      {...context}
    />
  );
};
