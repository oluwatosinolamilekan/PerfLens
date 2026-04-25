import React, { useMemo, useState } from 'react';
import type { AIAgent } from '../utils/types';

interface FixItActionsProps {
  issueTitle: string;
  issueDescription: string;
  suggestion: string;
  resource?: string;
  category: string;
  compact?: boolean;
  defaultAgent?: AIAgent;
  defaultCustomAgentName?: string;
}

const AGENT_OPTIONS: Array<{ value: AIAgent; label: string }> = [
  { value: 'cursor', label: 'Cursor' },
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'custom', label: 'Custom agent' },
];

function getPrompt({
  issueTitle,
  issueDescription,
  suggestion,
  resource,
  category,
}: Omit<FixItActionsProps, 'compact' | 'defaultAgent'>): string {
  const resourceLine = resource ? `\nResource: ${resource}` : '';
  return [
    'Help me fix this web performance issue.',
    `Category: ${category}`,
    `Issue: ${issueTitle}`,
    `Details: ${issueDescription}`,
    `Suggested fix direction: ${suggestion}${resourceLine}`,
    '',
    'Please provide:',
    '1) Root cause analysis',
    '2) Exact code/config changes',
    '3) Verification steps',
  ].join('\n');
}

export const FixItActions: React.FC<FixItActionsProps> = ({
  issueTitle,
  issueDescription,
  suggestion,
  resource,
  category,
  compact = false,
  defaultAgent = 'cursor',
  defaultCustomAgentName = '',
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(defaultAgent);
  const [customAgentName, setCustomAgentName] = useState(defaultCustomAgentName);
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(
    () => getPrompt({ issueTitle, issueDescription, suggestion, resource, category }),
    [issueTitle, issueDescription, suggestion, resource, category]
  );

  const selectedLabel =
    selectedAgent === 'custom' && customAgentName.trim()
      ? customAgentName.trim()
      : AGENT_OPTIONS.find((agent) => agent.value === selectedAgent)?.label ?? 'AI agent';

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error('[PerfLens] Failed to copy fix prompt', err);
    }
  };

  return (
    <div className={`rounded-md border border-perf-accent/25 bg-perf-accent/5 ${compact ? 'p-2' : 'p-2.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-perf-accent uppercase tracking-wider">
          Fix it with AI
        </p>
        {copied && <span className="text-[9px] text-perf-good font-medium">Prompt copied</span>}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <select
          value={selectedAgent}
          onChange={(event) => setSelectedAgent(event.target.value as AIAgent)}
          className="h-7 text-[10px] bg-perf-bg border border-perf-border rounded px-2 text-perf-text focus:outline-none focus:border-perf-accent"
        >
          {AGENT_OPTIONS.map((agent) => (
            <option key={agent.value} value={agent.value}>
              {agent.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCopyPrompt}
          className="h-7 px-2.5 text-[10px] rounded bg-perf-accent/20 text-perf-accent hover:bg-perf-accent/30 transition-colors"
        >
          Copy prompt for {selectedLabel}
        </button>
      </div>

      {selectedAgent === 'custom' && (
        <input
          value={customAgentName}
          onChange={(event) => setCustomAgentName(event.target.value)}
          placeholder="Enter custom agent name"
          className="mt-1.5 w-full h-7 text-[10px] bg-perf-bg border border-perf-border rounded px-2 text-perf-text placeholder:text-perf-muted focus:outline-none focus:border-perf-accent"
        />
      )}
    </div>
  );
};
