import React, { useState } from 'react';
import type { ResourceMetrics } from '../utils/types';

interface ResourceBreakdownProps {
  resources: ResourceMetrics;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const TYPE_COLORS: Record<string, string> = {
  script: '#f7df1e',
  stylesheet: '#264de4',
  image: '#00c853',
  font: '#ff6d00',
  fetch: '#4dabf7',
  data: '#9c27b0',
  media: '#e91e63',
  other: '#8b8fa3',
};

const TYPE_LABELS: Record<string, string> = {
  script: 'JavaScript',
  stylesheet: 'CSS',
  image: 'Images',
  font: 'Fonts',
  fetch: 'API/Fetch',
  data: 'Data',
  media: 'Media',
  other: 'Other',
};

function truncateUrl(url: string, maxLen = 55): string {
  if (!url || url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    const fileName = u.pathname.split('/').pop() || u.pathname;
    if (fileName.length < maxLen - 20) return u.host + '/.../' + fileName;
    return u.host + '/...' + u.pathname.slice(-25);
  } catch {
    return url.slice(0, maxLen) + '...';
  }
}

export const ResourceBreakdown: React.FC<ResourceBreakdownProps> = ({ resources }) => {
  const [showAll, setShowAll] = useState(false);

  const types = Object.entries(resources.byType)
    .map(([type, data]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      color: TYPE_COLORS[type] || '#8b8fa3',
      ...data,
    }))
    .sort((a, b) => b.size - a.size);

  const maxSize = types.length > 0 ? types[0].size : 1;

  const displayedLargest = showAll
    ? resources.largest
    : resources.largest.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Total transfer size */}
      <div className="bg-perf-surface border border-perf-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-perf-muted uppercase tracking-wider">
            Total Transfer Size
          </span>
          <span className="text-sm font-bold text-perf-text">
            {formatBytes(resources.totalSize)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-perf-muted">
          <span>{resources.total} resources</span>
          <span>•</span>
          <span>{resources.blocking.length} render-blocking</span>
        </div>
      </div>

      {/* Treemap grid */}
      <div>
        <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider mb-2 px-1">
          Size by Type
        </p>
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: types
              .map((t) => `${Math.max(1, Math.round((t.size / resources.totalSize) * 12))}fr`)
              .join(' '),
            minHeight: '80px',
          }}
        >
          {types.map((t) => (
            <div
              key={t.type}
              className="rounded-md flex flex-col items-center justify-center p-2 min-w-[50px] transition-all duration-200 hover:brightness-110 cursor-default"
              style={{ backgroundColor: `${t.color}20`, border: `1px solid ${t.color}35` }}
              title={`${t.label}: ${formatBytes(t.size)} (${t.count} files)`}
            >
              <span className="text-xs font-bold" style={{ color: t.color }}>
                {formatBytes(t.size)}
              </span>
              <span className="text-[9px] text-perf-muted mt-0.5">{t.label}</span>
              <span className="text-[9px] text-perf-muted/60">{t.count} files</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bar chart breakdown */}
      <div>
        <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider mb-2 px-1">
          Breakdown
        </p>
        <div className="space-y-1.5">
          {types.map((t) => {
            const pct = resources.totalSize > 0
              ? Math.round((t.size / resources.totalSize) * 100)
              : 0;
            return (
              <div key={t.type} className="flex items-center gap-2">
                <span className="text-xs w-16 text-right text-perf-muted truncate">
                  {t.label}
                </span>
                <div className="flex-1 h-5 bg-perf-bg rounded overflow-hidden relative">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${(t.size / maxSize) * 100}%`,
                      backgroundColor: `${t.color}40`,
                      minWidth: '2px',
                    }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-perf-text">
                    {formatBytes(t.size)}
                  </span>
                </div>
                <span className="text-[10px] text-perf-muted w-10 text-right">
                  {pct}%
                </span>
                <span className="text-[10px] text-perf-muted/60 w-8 text-right">
                  {t.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Largest resources */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[10px] font-semibold text-perf-muted uppercase tracking-wider">
            Largest Resources
          </p>
          {resources.largest.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[10px] text-perf-accent hover:text-perf-accent/80 transition-colors"
            >
              {showAll ? 'Show less' : `Show all ${resources.largest.length}`}
            </button>
          )}
        </div>
        <div className="space-y-1">
          {displayedLargest.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-perf-surface border border-perf-border rounded-md hover:border-perf-border/80 transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[r.type] || '#8b8fa3' }}
              />
              <span className="flex-1 text-[10px] font-mono text-perf-muted truncate" title={r.name}>
                {truncateUrl(r.name)}
              </span>
              <span className="text-[10px] font-semibold text-perf-text shrink-0">
                {formatBytes(r.size)}
              </span>
              <span className="text-[9px] text-perf-muted/60 shrink-0 w-12 text-right">
                {Math.round(r.duration)}ms
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Blocking resources */}
      {resources.blocking.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-perf-poor uppercase tracking-wider mb-2 px-1">
            ⚠ Render-Blocking Resources ({resources.blocking.length})
          </p>
          <div className="space-y-1">
            {resources.blocking.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-perf-poor/5 border border-perf-poor/20 rounded-md"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[r.type] || '#8b8fa3' }}
                />
                <span className="flex-1 text-[10px] font-mono text-perf-muted truncate" title={r.name}>
                  {truncateUrl(r.name)}
                </span>
                <span className="text-[10px] font-semibold text-perf-poor shrink-0">
                  {formatBytes(r.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
