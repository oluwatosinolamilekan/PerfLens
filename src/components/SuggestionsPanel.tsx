import React, { useState } from 'react';
import type { Suggestion } from '../utils/types';

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  limit?: number;
}

const IMPACT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: 'rgba(255,82,82,0.1)', text: '#ff5252', border: 'rgba(255,82,82,0.25)' },
  medium: { bg: 'rgba(255,171,0,0.1)', text: '#ffab00', border: 'rgba(255,171,0,0.25)' },
  low: { bg: 'rgba(77,171,247,0.1)', text: '#4dabf7', border: 'rgba(77,171,247,0.25)' },
};

const CATEGORY_ICONS: Record<string, string> = {
  Images: '🖼',
  Scripts: '⚡',
  Styles: '🎨',
  Caching: '💾',
  Compression: '📦',
  Accessibility: '♿',
};

function truncateUrl(url: string, maxLen = 50): string {
  if (!url || url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    return u.host + '/...' + u.pathname.slice(-20);
  } catch {
    return url.slice(0, maxLen) + '...';
  }
}

const SuggestionItem: React.FC<{ suggestion: Suggestion }> = ({ suggestion }) => {
  const [expanded, setExpanded] = useState(false);
  const impactStyle = IMPACT_STYLES[suggestion.impact];
  const icon = CATEGORY_ICONS[suggestion.category] || '📋';

  return (
    <div
      className="border border-perf-border rounded-lg overflow-hidden animate-fade-in hover:border-perf-border/80 transition-colors"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-perf-highlight/30 transition-colors"
      >
        <span className="text-sm mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-perf-text leading-relaxed pr-2">{suggestion.title}</p>
        </div>
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: impactStyle.bg,
            color: impactStyle.text,
            border: `1px solid ${impactStyle.border}`,
          }}
        >
          {suggestion.impact}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-perf-border px-3 py-2 bg-perf-bg/50 space-y-2">
          <p className="text-xs text-perf-muted leading-relaxed">{suggestion.description}</p>
          {suggestion.resources.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-perf-muted uppercase">
                Affected Resources
              </p>
              {suggestion.resources.map((r, i) => (
                <div
                  key={i}
                  className="font-mono text-[10px] text-perf-muted bg-black/20 px-2 py-1 rounded truncate"
                  title={r}
                >
                  {truncateUrl(r)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  suggestions,
  limit,
}) => {
  const quickWins = suggestions.filter(
    (s) => s.impact === 'low' || (s.impact === 'medium' && s.resources.length <= 1)
  );
  const highImpact = suggestions.filter((s) => s.impact === 'high');

  const displayed = limit ? suggestions.slice(0, limit) : suggestions;

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="text-2xl mb-2">🎉</div>
        <p className="text-sm text-perf-good font-medium">Looking great!</p>
        <p className="text-xs text-perf-muted mt-1">No optimization suggestions found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!limit && quickWins.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold text-perf-good uppercase tracking-wider">
            ⚡ Quick Wins
          </span>
          <span className="text-[10px] text-perf-muted">
            ({quickWins.length} easy fix{quickWins.length !== 1 ? 'es' : ''})
          </span>
        </div>
      )}

      {!limit && highImpact.length > 0 && (
        <div className="bg-perf-poor/5 border border-perf-poor/20 rounded-lg p-2.5 mb-2">
          <p className="text-[10px] font-semibold text-perf-poor uppercase tracking-wider mb-1">
            🔥 High Impact ({highImpact.length})
          </p>
          <p className="text-xs text-perf-muted">
            Fix these first for the biggest performance gains.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {displayed.map((suggestion) => (
          <SuggestionItem key={suggestion.id} suggestion={suggestion} />
        ))}
      </div>

      {limit && suggestions.length > limit && (
        <p className="text-xs text-perf-muted text-center">
          +{suggestions.length - limit} more suggestion{suggestions.length - limit !== 1 ? 's' : ''} in Audits tab
        </p>
      )}
    </div>
  );
};
