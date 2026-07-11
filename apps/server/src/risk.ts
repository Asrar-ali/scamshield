import type { Detection } from './types.js';
import { TACTIC_BY_ID } from './tactics.js';

export const COACH_THRESHOLD = 45;
export const TAKEOVER_THRESHOLD = 80;
export const RISK_DECAY_PER_CLEAN_TURN = 4;
export const MAX_RISK_GAIN_PER_TURN = 22;
export const CAPPED_TURNS_FOR_TAKEOVER = 2;
export const MIN_RISK = 0;
export const MAX_RISK = 100;

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

export function shouldCoach(risk: number, alreadyCoached: boolean): boolean {
  return risk >= COACH_THRESHOLD && !alreadyCoached;
}

export function canTakeover(risk: number, coached: boolean, cappedTurns: number): boolean {
  return risk >= TAKEOVER_THRESHOLD && (coached || cappedTurns >= CAPPED_TURNS_FOR_TAKEOVER);
}
