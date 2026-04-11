import React, { useEffect, useState } from 'react';

interface ScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#00c853';
  if (score >= 50) return '#ffab00';
  if (score >= 25) return '#ff6d00';
  return '#ff5252';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 50) return 'Needs Work';
  if (score >= 25) return 'Poor';
  return 'Critical';
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  size = 160,
  label,
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [dashOffset, setDashOffset] = useState(283);

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 6;
  const viewBox = `0 0 ${100 + strokeWidth} ${100 + strokeWidth}`;
  const center = (100 + strokeWidth) / 2;
  const color = getScoreColor(score);

  useEffect(() => {
    const targetOffset = circumference - (score / 100) * circumference;
    const duration = 1000;
    const startTime = performance.now();
    const startOffset = circumference;
    const startScore = 0;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDashOffset(startOffset + (targetOffset - startOffset) * eased);
      setAnimatedScore(Math.round(startScore + (score - startScore) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [score, circumference]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={viewBox}
          className="transform -rotate-90"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1a1d27"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#2a2d3a"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={0}
            opacity={0.3}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
              transition: 'stroke 0.3s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold tracking-tight"
            style={{
              fontSize: size * 0.28,
              color,
              lineHeight: 1,
            }}
          >
            {animatedScore}
          </span>
          <span
            className="text-perf-muted font-medium mt-0.5"
            style={{ fontSize: size * 0.09 }}
          >
            out of 100
          </span>
        </div>
      </div>
      <div className="text-center">
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            backgroundColor: `${color}18`,
            color,
            border: `1px solid ${color}35`,
          }}
        >
          {label || getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
};
