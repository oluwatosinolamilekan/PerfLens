import React, { useState, useMemo } from 'react';
import type { AuditReport } from '../utils/types';

interface HistoryChartProps {
  history: AuditReport[];
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#00c853';
  if (score >= 50) return '#ffab00';
  if (score >= 25) return '#ff6d00';
  return '#ff5252';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getTrend(history: AuditReport[]): { label: string; icon: string; color: string } {
  if (history.length < 2) return { label: 'Not enough data', icon: '—', color: '#8b8fa3' };
  const recent = history.slice(0, 3);
  const avgRecent = recent.reduce((s, h) => s + h.score, 0) / recent.length;
  const older = history.slice(3, 6);
  if (older.length === 0) return { label: 'Stable', icon: '→', color: '#4dabf7' };
  const avgOlder = older.reduce((s, h) => s + h.score, 0) / older.length;

  const diff = avgRecent - avgOlder;
  if (diff > 5) return { label: 'Improving', icon: '↑', color: '#00c853' };
  if (diff < -5) return { label: 'Declining', icon: '↓', color: '#ff5252' };
  return { label: 'Stable', icon: '→', color: '#4dabf7' };
}

const Sparkline: React.FC<{ scores: number[]; width?: number; height?: number }> = ({
  scores,
  width = 120,
  height = 32,
}) => {
  if (scores.length < 2) return null;

  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;
  const step = chartW / (scores.length - 1);

  const points = scores.map((score, i) => ({
    x: padding + i * step,
    y: padding + chartH - (score / 100) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const lastPoint = points[points.length - 1];
  const lastScore = scores[scores.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke={getScoreColor(lastScore)}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={3}
        fill={getScoreColor(lastScore)}
      />
    </svg>
  );
};

export const HistoryChart: React.FC<HistoryChartProps> = ({ history }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    return [...history].reverse().slice(-20);
  }, [history]);

  const sparklineScores = useMemo(() => {
    return [...history]
      .slice(0, 10)
      .reverse()
      .map((h) => h.score);
  }, [history]);

  const trend = useMemo(() => getTrend(history), [history]);

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-2">📊</div>
        <p className="text-sm text-perf-muted">No audit history yet.</p>
        <p className="text-xs text-perf-muted mt-1">Run an audit to start tracking performance.</p>
      </div>
    );
  }

  const chartWidth = 360;
  const chartHeight = 140;
  const padding = { top: 10, right: 10, bottom: 24, left: 32 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;

  const points = chartData.map((entry, i) => ({
    x: padding.left + (chartData.length > 1 ? (i / (chartData.length - 1)) * plotW : plotW / 2),
    y: padding.top + plotH - (entry.score / 100) * plotH,
    score: entry.score,
    timestamp: entry.timestamp,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const areaD =
    pathD +
    ` L${points[points.length - 1].x},${padding.top + plotH} L${points[0].x},${padding.top + plotH} Z`;

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <Sparkline scores={sparklineScores} />
          <div>
            <span
              className="text-sm font-bold"
              style={{ color: trend.color }}
            >
              {trend.icon} {trend.label}
            </span>
            <p className="text-[10px] text-perf-muted">Last {sparklineScores.length} audits</p>
          </div>
        </div>
        <span className="text-xs text-perf-muted">{history.length} total audits</span>
      </div>

      <div className="bg-perf-surface border border-perf-border rounded-lg p-3">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="w-full"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {gridLines.map((value) => {
            const y = padding.top + plotH - (value / 100) * plotH;
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#2a2d3a"
                  strokeWidth={0.5}
                  strokeDasharray={value === 0 || value === 100 ? 'none' : '2,3'}
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#8b8fa3"
                  fontSize={8}
                  fontFamily="system-ui"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {chartData.length > 1 && (
            <>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4dabf7" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#4dabf7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaD} fill="url(#areaGradient)" />
              <path
                d={pathD}
                fill="none"
                stroke="#4dabf7"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === i ? 5 : 3}
                fill={getScoreColor(p.score)}
                stroke="#0f1117"
                strokeWidth={2}
                className="transition-all duration-150 cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
              />
              {hoveredIndex === i && (
                <g>
                  <rect
                    x={p.x - 40}
                    y={p.y - 34}
                    width={80}
                    height={26}
                    rx={4}
                    fill="#1a1d27"
                    stroke="#2a2d3a"
                    strokeWidth={1}
                  />
                  <text
                    x={p.x}
                    y={p.y - 23}
                    textAnchor="middle"
                    fill={getScoreColor(p.score)}
                    fontSize={10}
                    fontWeight="bold"
                    fontFamily="system-ui"
                  >
                    Score: {p.score}
                  </text>
                  <text
                    x={p.x}
                    y={p.y - 13}
                    textAnchor="middle"
                    fill="#8b8fa3"
                    fontSize={8}
                    fontFamily="system-ui"
                  >
                    {formatDate(p.timestamp)} {formatTime(p.timestamp)}
                  </text>
                </g>
              )}
            </g>
          ))}

          {chartData.length > 0 &&
            points.filter((_, i) => {
              const step = Math.max(1, Math.floor(chartData.length / 5));
              return i % step === 0 || i === chartData.length - 1;
            }).map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={chartHeight - 4}
                textAnchor="middle"
                fill="#8b8fa3"
                fontSize={7}
                fontFamily="system-ui"
              >
                {formatDate(p.timestamp)}
              </text>
            ))}
        </svg>
      </div>

      <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
        {history.slice(0, 20).map((audit, idx) => (
          <div
            key={audit.timestamp + '-' + idx}
            className="flex items-center gap-3 px-3 py-2 bg-perf-surface border border-perf-border rounded-lg hover:border-perf-border/80 transition-colors"
          >
            <span
              className="text-sm font-bold min-w-[32px] text-center"
              style={{ color: getScoreColor(audit.score) }}
            >
              {audit.score}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-perf-muted truncate">{formatDate(audit.timestamp)}</p>
              <p className="text-[10px] text-perf-muted/60">{formatTime(audit.timestamp)}</p>
            </div>
            {idx > 0 && (
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    audit.score > history[idx - 1].score
                      ? '#ff5252'
                      : audit.score < history[idx - 1].score
                        ? '#00c853'
                        : '#8b8fa3',
                }}
              >
                {audit.score > history[idx - 1].score
                  ? `↓${audit.score - history[idx - 1].score}`
                  : audit.score < history[idx - 1].score
                    ? `↑${history[idx - 1].score - audit.score}`
                    : '='}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
