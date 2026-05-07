import React from 'react';
import type { WebVitals } from '../utils/types';

interface MetricsGridProps {
  vitals: WebVitals;
}

interface MetricConfig {
  key: keyof WebVitals;
  label: string;
  fullName: string;
  unit: string;
  thresholds: { good: number; poor: number };
  format: (v: number) => string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'lcp',
    label: 'LCP',
    fullName: 'Largest Contentful Paint',
    unit: 's',
    thresholds: { good: 2500, poor: 4000 },
    format: (v) => (v / 1000).toFixed(2) + 's',
  },
  {
    key: 'fid',
    label: 'FID',
    fullName: 'First Input Delay',
    unit: 'ms',
    thresholds: { good: 100, poor: 300 },
    format: (v) => Math.round(v) + 'ms',
  },
  {
    key: 'cls',
    label: 'CLS',
    fullName: 'Cumulative Layout Shift',
    unit: '',
    thresholds: { good: 0.1, poor: 0.25 },
    format: (v) => v.toFixed(3),
  },
  {
    key: 'inp',
    label: 'INP',
    fullName: 'Interaction to Next Paint',
    unit: 'ms',
    thresholds: { good: 200, poor: 500 },
    format: (v) => Math.round(v) + 'ms',
  },
  {
    key: 'fcp',
    label: 'FCP',
    fullName: 'First Contentful Paint',
    unit: 's',
    thresholds: { good: 1800, poor: 3000 },
    format: (v) => (v / 1000).toFixed(2) + 's',
  },
  {
    key: 'ttfb',
    label: 'TTFB',
    fullName: 'Time to First Byte',
    unit: 'ms',
    thresholds: { good: 800, poor: 1800 },
    format: (v) => Math.round(v) + 'ms',
  },
];

function getRating(
  value: number,
  thresholds: { good: number; poor: number }
): { label: string; color: string; bgColor: string } {
  if (value <= thresholds.good) {
    return { label: 'Good', color: '#00c853', bgColor: 'rgba(0,200,83,0.12)' };
  }
  if (value <= thresholds.poor) {
    return { label: 'Needs Improvement', color: '#ffab00', bgColor: 'rgba(255,171,0,0.12)' };
  }
  return { label: 'Poor', color: '#ff5252', bgColor: 'rgba(255,82,82,0.12)' };
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ vitals }) => {
  return (
    <div className="grid grid-cols-1 gap-2 min-[320px]:grid-cols-2 min-[560px]:grid-cols-3">
      {METRICS.map((metric) => {
        const value = vitals[metric.key];
        const hasValue = value !== null && value !== undefined;
        const rating = hasValue
          ? getRating(value, metric.thresholds)
          : { label: 'N/A', color: '#8b8fa3', bgColor: 'rgba(139,143,163,0.12)' };

        return (
          <div
            key={metric.key}
            className="metric-card min-w-0 flex flex-col items-center gap-1.5 text-center"
            title={metric.fullName}
          >
            <span className="text-[10px] font-semibold text-perf-muted tracking-wider uppercase">
              {metric.label}
            </span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: hasValue ? rating.color : '#8b8fa3' }}
            >
              {hasValue ? metric.format(value) : '—'}
            </span>
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: rating.bgColor,
                color: rating.color,
              }}
            >
              {rating.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
