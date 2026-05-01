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
  pageUrl?: string;
  projectName?: string;
}

const AGENT_OPTIONS: Array<{ value: AIAgent; label: string }> = [
  { value: 'cursor', label: 'Cursor' },
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'custom', label: 'Custom agent' },
];

const AGENT_DOWNLOAD_URLS: Record<Exclude<AIAgent, 'custom'>, string> = {
  cursor: 'https://cursor.com/download',
  claude: 'https://claude.ai/download',
  codex: 'https://openai.com/codex',
};

function getPrompt({
  issueTitle,
  issueDescription,
  suggestion,
  resource,
  category,
  pageUrl,
  projectName,
}: Omit<FixItActionsProps, 'compact' | 'defaultAgent'>): string {
  const resourceLine = resource ? `\nResource: ${resource}` : '';
  const pageLine = pageUrl ? `\nPage URL: ${pageUrl}` : '';
  const projectLine = projectName ? `\nProject: ${projectName}` : '';
  return [
    'Help me fix this web performance issue.',
    `${projectLine}${pageLine}`.trim(),
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

function getAgentOpenUrl(agent: AIAgent, prompt: string): string {
  const encodedPrompt = encodeURIComponent(prompt);
  switch (agent) {
    case 'cursor':
      return `https://cursor.com/link/prompt?text=${encodedPrompt}`;
    case 'claude':
      return `claude://code/new?q=${encodedPrompt}`;
    case 'codex':
      return `codex://new?prompt=${encodedPrompt}`;
    case 'custom':
      return 'about:blank';
  }
}

function getAgentRedirectUrl(agent: Exclude<AIAgent, 'custom'>, prompt: string, label: string): string {
  const params = new URLSearchParams({
    appUrl: getAgentOpenUrl(agent, prompt),
    fallbackUrl: AGENT_DOWNLOAD_URLS[agent],
    agentName: label,
  });

  return chrome.runtime.getURL(`agent-redirect.html?${params.toString()}`);
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
  pageUrl,
  projectName = 'perflens',
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(defaultAgent);
  const [customAgentName, setCustomAgentName] = useState(defaultCustomAgentName);
  const [status, setStatus] = useState<'idle' | 'copied' | 'opening'>('idle');

  const prompt = useMemo(
    () => getPrompt({ issueTitle, issueDescription, suggestion, resource, category, pageUrl, projectName }),
    [issueTitle, issueDescription, suggestion, resource, category, pageUrl, projectName]
  );

  const selectedLabel =
    selectedAgent === 'custom' && customAgentName.trim()
      ? customAgentName.trim()
      : AGENT_OPTIONS.find((agent) => agent.value === selectedAgent)?.label ?? 'AI agent';

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 1800);
    } catch (err) {
      console.error('[PerfLens] Failed to copy fix prompt', err);
    }
  };

  const handleOpenInAgent = async () => {
    if (selectedAgent === 'custom') {
      await handleCopyPrompt();
      return;
    }

    setStatus('opening');
    try {
      await navigator.clipboard.writeText(prompt);
      const agentUrl =
        selectedAgent === 'cursor'
          ? getAgentOpenUrl(selectedAgent, prompt)
          : getAgentRedirectUrl(selectedAgent, prompt, selectedLabel);
      const opened = window.open(agentUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setStatus('copied');
        setTimeout(() => setStatus('idle'), 2200);
        return;
      }
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2200);
    } catch (err) {
      console.error('[PerfLens] Failed to open AI agent', err);
      setStatus('idle');
    }
  };

  return (
    <div className={`rounded-md border border-perf-accent/25 bg-perf-accent/5 ${compact ? 'p-2' : 'p-2.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-perf-accent uppercase tracking-wider">
          Fix it with AI
        </p>
        {status === 'opening' && <span className="text-[9px] text-perf-muted font-medium">Opening...</span>}
        {status === 'copied' && <span className="text-[9px] text-perf-good font-medium">Prompt copied, opening app</span>}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-perf-border text-perf-muted">
          Repo: {projectName}
        </span>
        {pageUrl && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-perf-border text-perf-muted truncate max-w-[190px]" title={pageUrl}>
            Page: {pageUrl}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
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
          onClick={handleOpenInAgent}
          disabled={status === 'opening'}
          className="h-7 px-2.5 text-[10px] rounded bg-perf-accent/20 text-perf-accent hover:bg-perf-accent/30 transition-colors disabled:opacity-60"
        >
          {selectedAgent === 'custom' ? `Use ${selectedLabel}` : `Open ${selectedLabel} app`}
        </button>
        <button
          onClick={handleCopyPrompt}
          className="h-7 px-2.5 text-[10px] rounded bg-perf-accent/20 text-perf-accent hover:bg-perf-accent/30 transition-colors"
        >
          Copy prompt
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

      <p className="mt-1.5 text-[9px] text-perf-muted">
        Opens the desktop app when available and copies the prompt for quick paste.
      </p>
    </div>
  );
};
