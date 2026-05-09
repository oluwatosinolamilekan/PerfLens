import React, { useMemo, useState } from 'react';
import { buildSingleIssuePrompt } from '../utils/ai-fix';
import type { AIAgent, AIFixContext } from '../utils/types';

interface FixItActionsProps extends AIFixContext {
  issueTitle: string;
  issueDescription: string;
  suggestion: string;
  resource?: string;
  category: string;
  compact?: boolean;
  defaultAgent?: AIAgent;
  defaultCustomAgentName?: string;
  promptOverride?: string;
  actionLabel?: string;
}

const AGENT_OPTIONS: Array<{ value: AIAgent; label: string }> = [
  { value: 'cursor', label: 'Cursor' },
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'custom', label: 'Custom agent' },
];

const AGENT_DOWNLOAD_URLS: Record<Exclude<AIAgent, 'custom'>, string> = {
  cursor: 'https://cursor.com/download',
  claude: 'https://claude.ai/download',
  codex: 'https://openai.com/codex',
  windsurf: 'https://windsurf.com/editor',
  copilot: 'https://code.visualstudio.com/docs/copilot/overview',
  chatgpt: 'https://chatgpt.com',
};

function getAgentOpenUrl(agent: AIAgent, prompt: string): string {
  const encodedPrompt = encodeURIComponent(prompt);
  switch (agent) {
    case 'cursor':
      return `https://cursor.com/link/prompt?text=${encodedPrompt}`;
    case 'claude':
      return `claude://code/new?q=${encodedPrompt}`;
    case 'codex':
      return `codex://new?prompt=${encodedPrompt}`;
    case 'windsurf':
      return `windsurf://new?prompt=${encodedPrompt}`;
    case 'copilot':
      return `vscode://GitHub.Copilot-Chat/chat?message=${encodedPrompt}`;
    case 'chatgpt':
      return `https://chatgpt.com/?q=${encodedPrompt}`;
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
  score,
  framework,
  runtime,
  vitals,
  resources,
  rootCauseStory,
  promptOverride,
  actionLabel = 'Fix it with AI',
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(defaultAgent);
  const [customAgentName, setCustomAgentName] = useState(defaultCustomAgentName);
  const [status, setStatus] = useState<'idle' | 'copied' | 'opening' | 'paste-ready'>('idle');
  const [showPreview, setShowPreview] = useState(false);

  const prompt = useMemo(
    () =>
      promptOverride ??
      buildSingleIssuePrompt({
        issueTitle,
        issueDescription,
        suggestion,
        resource,
        category,
        pageUrl,
        projectName,
        score,
        framework,
        runtime,
        vitals,
        resources,
        rootCauseStory,
      }),
    [
      promptOverride,
      issueTitle,
      issueDescription,
      suggestion,
      resource,
      category,
      pageUrl,
      projectName,
      score,
      framework,
      runtime,
      vitals,
      resources,
      rootCauseStory,
    ]
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
    if (selectedAgent === 'custom' || selectedAgent === 'chatgpt') {
      await handleCopyPrompt();
      if (selectedAgent === 'chatgpt') {
        window.open(getAgentOpenUrl(selectedAgent, prompt), '_blank', 'noopener,noreferrer');
      }
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
      setStatus('paste-ready');
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
          {actionLabel}
        </p>
        {status === 'opening' && <span className="text-[9px] text-perf-muted font-medium">Opening...</span>}
        {status === 'copied' && <span className="text-[9px] text-perf-good font-medium">Prompt copied</span>}
        {status === 'paste-ready' && <span className="text-[9px] text-perf-good font-medium">Copied, paste if needed</span>}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-perf-border text-perf-muted">
          Repo: {projectName}
        </span>
        {framework?.primary?.name && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-perf-border text-perf-muted">
            {framework.primary.name}
          </span>
        )}
        {runtime?.mode && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-perf-border text-perf-muted">
            {runtime.mode}/{runtime.buildStatus}
          </span>
        )}
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
          {selectedAgent === 'custom' ? `Use ${selectedLabel}` : `Open ${selectedLabel}`}
        </button>
        <button
          onClick={handleCopyPrompt}
          className="h-7 px-2.5 text-[10px] rounded bg-perf-accent/20 text-perf-accent hover:bg-perf-accent/30 transition-colors"
        >
          Copy prompt
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="h-7 px-2.5 text-[10px] rounded border border-perf-border text-perf-muted hover:border-perf-accent/50 hover:text-perf-text transition-colors"
        >
          {showPreview ? 'Hide preview' : 'Preview'}
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

      {showPreview && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-perf-border bg-perf-bg p-2 text-[10px] leading-relaxed text-perf-muted">
          {prompt}
        </pre>
      )}

      <p className="mt-1.5 text-[9px] text-perf-muted">
        Copies the full fix context first, then opens the selected agent when available.
      </p>
    </div>
  );
};
