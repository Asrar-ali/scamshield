import { useId } from 'react';
import { TACTIC_HUE, TACTIC_LABELS } from '../types';
import type { RiskSample, TacticMarker, InterventionMoment } from '../lib/autopsy';

interface RiskTimelineProps {
  samples: RiskSample[];
  markers: TacticMarker[];
  interventions: InterventionMoment[];
  thresholds: { flag: number };
  startTs: number;
  endTs: number;
  /** 'spark' = compact under-gauge trace; 'full' = labelled forensic version. */
  variant: 'spark' | 'full';
}

const GEO = {
  spark: { w: 320, h: 88, padT: 10, padR: 10, padB: 10, padL: 10, dot: 3.4, line: 2 },
  full: { w: 320, h: 172, padT: 16, padR: 14, padB: 22, padL: 14, dot: 4.6, line: 2 },
} as const;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Linear-interpolate the risk score at an arbitrary ts from the sample trace. */
function riskAt(ts: number, samples: RiskSample[]): number {
  if (samples.length === 0) return 0;
  if (ts <= samples[0].ts) return samples[0].score;
  const last = samples[samples.length - 1];
  if (ts >= last.ts) return last.score;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (ts <= b.ts) {
      const t = b.ts === a.ts ? 0 : (ts - a.ts) / (b.ts - a.ts);
      return a.score + (b.score - a.score) * t;
    }
  }
  return last.score;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RiskTimeline({ samples, markers, interventions, thresholds, startTs, endTs, variant }: RiskTimelineProps) {
  const g = GEO[variant];
  const uid = useId();
  const span = Math.max(1, endTs - startTs);
  const plotW = g.w - g.padL - g.padR;
  const plotH = g.h - g.padT - g.padB;

  const xForTs = (ts: number) => g.padL + clamp01((ts - startTs) / span) * plotW;
  const yForScore = (score: number) => g.padT + (1 - clamp01(score / 100)) * plotH;

  const pts = samples.map((s) => `${xForTs(s.ts).toFixed(1)},${yForScore(s.score).toFixed(1)}`);
  const linePath = pts.length ? `M ${pts.join(' L ')}` : '';
  const areaPath = pts.length
    ? `M ${xForTs(samples[0].ts).toFixed(1)},${(g.padT + plotH).toFixed(1)} L ${pts.join(' L ')} L ${xForTs(
        samples[samples.length - 1].ts,
      ).toFixed(1)},${(g.padT + plotH).toFixed(1)} Z`
    : '';

  const last = samples[samples.length - 1];
  const gradId = `rt-grad-${uid}`;

  return (
    <div className={`risk-timeline risk-timeline--${variant}`}>
      <svg viewBox={`0 0 ${g.w} ${g.h}`} className="rt-svg" role="img" aria-label="Risk over the call">
        <defs>
          <linearGradient id={gradId} x1="0" y1={g.padT} x2="0" y2={g.padT + plotH} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--crit)" />
            <stop offset="0.45" stopColor="var(--warn)" />
            <stop offset="1" stopColor="var(--grandma)" />
          </linearGradient>
        </defs>

        {/* threshold guide */}
        {(() => {
          const y = yForScore(thresholds.flag).toFixed(1);
          return (
            <g>
              <line x1={g.padL} y1={y} x2={g.w - g.padR} y2={y} className="rt-guide rt-guide-flag" />
              {variant === 'full' && (
                <text x={g.w - g.padR} y={Number(y) - 3} className="rt-guide-label rt-guide-label-flag" textAnchor="end">
                  Flag {thresholds.flag}
                </text>
              )}
            </g>
          );
        })()}

        {/* intervention moments */}
        {interventions.map((iv, i) => {
          const x = xForTs(iv.ts).toFixed(1);
          return (
            <g key={`iv-${i}`}>
              <line x1={x} y1={g.padT} x2={x} y2={g.padT + plotH} className={`rt-mark rt-mark-${iv.level}`} />
              {variant === 'full' && (
                <text x={Number(x)} y={g.padT - 4} className={`rt-mark-label rt-mark-label-${iv.level}`} textAnchor="middle">
                  Flag
                </text>
              )}
            </g>
          );
        })}

        {areaPath && <path d={areaPath} className="rt-area" fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} className="rt-line" stroke={`url(#${gradId})`} strokeWidth={g.line} />}

        {/* tactic detections riding the trace */}
        {markers.map((m, i) => (
          <circle
            key={`m-${i}`}
            cx={xForTs(m.ts).toFixed(1)}
            cy={yForScore(riskAt(m.ts, samples)).toFixed(1)}
            r={g.dot}
            className="rt-dot"
            style={{ fill: TACTIC_HUE[m.tactic] }}
          >
            <title>{TACTIC_LABELS[m.tactic]}</title>
          </circle>
        ))}

        {last && (
          <circle cx={xForTs(last.ts).toFixed(1)} cy={yForScore(last.score).toFixed(1)} r={g.dot + 0.6} className="rt-head" />
        )}

        {variant === 'full' && (
          <>
            <text x={g.padL} y={g.h - 6} className="rt-axis" textAnchor="start">
              0:00
            </text>
            <text x={g.w - g.padR} y={g.h - 6} className="rt-axis" textAnchor="end">
              {fmtElapsed(endTs - startTs)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
