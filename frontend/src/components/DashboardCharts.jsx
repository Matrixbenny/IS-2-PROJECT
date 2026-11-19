import React from 'react';
import AnonymousAvatar from './AnonymousAvatar';

// Small, dependency-free SVG charts for the citizen dashboard. Every chart has a
// text equivalent (aria-label plus a visually hidden table) so none of the
// information is available only to people who can see colour.
export const CHART_COLORS = {
  teal: '#0d9488',
  blue: '#2563eb',
  amber: '#d97706',
  purple: '#7c3aed',
  rose: '#e11d48',
  slate: '#64748b'
};

export function DonutChart({ segments, centerValue, centerLabel, size = 150, stroke = 22, ariaLabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className="kw-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        {total > 0 && segments.filter((item) => item.value > 0).map((item) => {
          const length = (item.value / total) * circumference;
          const circle = (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ stroke: item.color }}
            />
          );
          offset += length;
          return circle;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="kw-donut-value">{centerValue}</text>
        {centerLabel && <text x="50%" y="62%" textAnchor="middle" className="kw-donut-label">{centerLabel}</text>}
      </svg>
      <ul className="kw-chart-legend">
        {segments.map((item) => (
          <li key={item.label}>
            <span className="kw-legend-swatch" style={{ background: item.color }} aria-hidden="true" />
            {item.label} <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function smoothPath(points) {
  if (points.length < 2) return '';
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = (x0 + x1) / 2;
    path += ` C${mid} ${y0}, ${mid} ${y1}, ${x1} ${y1}`;
  }
  return path;
}

export function LineChart({ points, ariaLabel, width = 260, height = 130, unit = 'reports' }) {
  const pad = { l: 8, r: 14, t: 22, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (width - pad.l - pad.r) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [pad.l + i * stepX, pad.t + (1 - p.value / max) * (height - pad.t - pad.b)]);
  const last = coords[coords.length - 1];
  const lastPoint = points[points.length - 1];
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <path d={smoothPath(coords)} fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: CHART_COLORS.amber }} />
        {last && <circle cx={last[0]} cy={last[1]} r="5" style={{ fill: '#fff', stroke: CHART_COLORS.amber, strokeWidth: 3 }} />}
        {last && (
          <g>
            <rect x={Math.min(last[0] - 22, width - 56)} y={Math.max(last[1] - 24, 2)} width="52" height="17" rx="5" style={{ fill: CHART_COLORS.amber }} />
            <text x={Math.min(last[0] - 22, width - 56) + 26} y={Math.max(last[1] - 24, 2) + 12} textAnchor="middle" className="kw-line-tip">
              {lastPoint.value} {unit}
            </text>
          </g>
        )}
        {points.map((p, i) => (
          <text key={p.label} x={coords[i][0]} y={height - 6} textAnchor="middle" className="kw-axis-label">{p.label}</text>
        ))}
      </svg>
    </div>
  );
}

export function StageBars({ bars, ariaLabel, height = 120 }) {
  const barWidth = 14;
  const gap = 8;
  const width = Math.max(1, bars.length) * (barWidth + gap);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height + 18}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMinYMid meet" className="kw-stage-bars">
      {[1, 2, 3, 4, 5].map((level) => (
        <line key={level} x1="0" x2={width} y1={height - (level / 5) * height} y2={height - (level / 5) * height} stroke="#e2e8f0" strokeDasharray="2 4" />
      ))}
      {bars.map((bar, i) => {
        const h = (bar.stage / 5) * height;
        return (
          <g key={bar.label}>
            <rect x={i * (barWidth + gap)} y={height - h} width={barWidth} height={h} rx="4" style={{ fill: bar.color }} />
            <text x={i * (barWidth + gap) + barWidth / 2} y={height + 13} textAnchor="middle" className="kw-axis-label">{bar.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// The "hub" card: the masked avatar surrounded by the numbers that describe the
// reporter's cases, as a quick visual of where everything stands.
export function CaseHub({ seed, satellites, ariaLabel }) {
  const size = 250;
  const center = size / 2;
  const orbit = 76;
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className="kw-hub">
      <circle cx={center} cy={center} r={orbit} fill="none" stroke="#e2e8f0" strokeDasharray="3 5" />
      <foreignObject x={center - 30} y={center - 30} width="60" height="60">
        <AnonymousAvatar seed={seed} size={60} />
      </foreignObject>
      {satellites.map((item, i) => {
        const angle = (-90 + (360 / satellites.length) * i) * (Math.PI / 180);
        const x = center + orbit * Math.cos(angle);
        const y = center + orbit * Math.sin(angle);
        return (
          <g key={item.label}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="#e2e8f0" />
            <circle cx={x} cy={y} r="17" style={{ fill: '#fff', stroke: item.color, strokeWidth: 3 }} />
            <text x={x} y={y + 5} textAnchor="middle" className="kw-hub-number">{item.value}</text>
            <text x={x} y={y + (y > center ? 31 : -23)} textAnchor="middle" className="kw-axis-label">{item.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Used by every chart so the numbers are available to screen readers.
export function ChartTable({ caption, rows }) {
  return (
    <table className="kw-sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([name, value]) => (
          <tr key={name}><th scope="row">{name}</th><td>{value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
