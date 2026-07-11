import type { Detection, Sensitivity } from './types.js';
import { TACTIC_BY_ID } from './tactics.js';

export const COACH_THRESHOLD = 45;
export const TAKEOVER_THRESHOLD = 80;
export const RISK_DECAY_PER_CLEAN_TURN = 4;
export const MAX_RISK_GAIN_PER_TURN = 22;
export const CAPPED_TURNS_FOR_TAKEOVER = 2;
export const MIN_RISK = 0;
export const MAX_RISK = 100;

export interface RiskThresholds {
  coach: number;
  takeover: number;
}

// Sensitivity presets remap the coach/takeover thresholds; 'balanced' matches the
// original hardcoded values so default behavior (and every caller that doesn't
// pass thresholds explicitly) is unchanged.
export const SENSITIVITY_THRESHOLDS: Record<Sensitivity, RiskThresholds> = {
  relaxed: { coach: 55, takeover: 90 },
  balanced: { coach: COACH_THRESHOLD, takeover: TAKEOVER_THRESHOLD },
  paranoid: { coach: 35, takeover: 65 },
};

export function thresholdsFor(sensitivity: Sensitivity): RiskThresholds {
  return SENSITIVITY_THRESHOLDS[sensitivity];
}

export interface RiskUpdate {
  risk: number;
  rawGain: number;
  appliedGain: number;
  wasCapped: boolean;
}

function clamp(value: number): number {
  return Math.min(MAX_RISK, Math.max(MIN_RISK, value));
}

export function computeRawGain(detections: Detection[]): number {
  return detections.reduce((sum, d) => {
    const weight = TACTIC_BY_ID.get(d.tactic)?.weight ?? 6;
    return sum + weight * d.confidence;
  }, 0);
}

export function applyDetections(currentRisk: number, detections: Detection[]): RiskUpdate {
  if (detections.length === 0) {
    const risk = clamp(currentRisk - RISK_DECAY_PER_CLEAN_TURN);
    return { risk, rawGain: 0, appliedGain: risk - currentRisk, wasCapped: false };
  }
  const rawGain = computeRawGain(detections);
  const appliedGain = Math.min(rawGain, MAX_RISK_GAIN_PER_TURN);
  const risk = clamp(currentRisk + appliedGain);
  return { risk, rawGain, appliedGain, wasCapped: rawGain > MAX_RISK_GAIN_PER_TURN };
}

export function shouldCoach(
  risk: number,
  alreadyCoached: boolean,
  thresholds: RiskThresholds = SENSITIVITY_THRESHOLDS.balanced,
): boolean {
  return risk >= thresholds.coach && !alreadyCoached;
}

export function canTakeover(
  risk: number,
  coached: boolean,
  cappedTurns: number,
  thresholds: RiskThresholds = SENSITIVITY_THRESHOLDS.balanced,
): boolean {
  return risk >= thresholds.takeover && (coached || cappedTurns >= CAPPED_TURNS_FOR_TAKEOVER);
}
