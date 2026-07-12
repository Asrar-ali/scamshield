import type { Detection, Sensitivity } from './types.js';
import { TACTIC_BY_ID } from './tactics.js';

export const FLAG_THRESHOLD = 35;
export const RISK_DECAY_PER_CLEAN_TURN = 4;
export const MAX_RISK_GAIN_PER_TURN = 22;
export const MIN_RISK = 0;
export const MAX_RISK = 100;

// A single detection at or above this confidence immediately crosses the flag threshold
// regardless of accumulated risk — catches obvious single-message scams on the first hit.
export const INSTANT_FLAG_CONFIDENCE = 0.80;

export interface RiskThresholds {
  flag: number;
}

// Sensitivity presets remap the single flag threshold. 'balanced' is the default.
export const SENSITIVITY_THRESHOLDS: Record<Sensitivity, RiskThresholds> = {
  relaxed: { flag: 65 },
  balanced: { flag: FLAG_THRESHOLD },
  paranoid: { flag: 20 },
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

export function shouldFlag(
  risk: number,
  thresholds: RiskThresholds = SENSITIVITY_THRESHOLDS.balanced,
): boolean {
  return risk >= thresholds.flag;
}

/** Returns true if any detection is high enough confidence to flag immediately,
 * bypassing the accumulated-risk requirement. Catches single blatant scam messages. */
export function shouldInstantFlag(detections: Detection[]): boolean {
  return detections.some((d) => d.confidence >= INSTANT_FLAG_CONFIDENCE);
}
