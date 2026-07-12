import { describe, expect, it } from 'vitest';
import {
  applyDetections,
  computeRawGain,
  shouldFlag,
  shouldInstantFlag,
  thresholdsFor,
  SENSITIVITY_THRESHOLDS,
  FLAG_THRESHOLD,
  INSTANT_FLAG_CONFIDENCE,
  MAX_RISK_GAIN_PER_TURN,
  RISK_DECAY_PER_CLEAN_TURN,
  MAX_RISK,
  MIN_RISK,
} from './risk.js';
import type { Detection } from './types.js';

function detection(tactic: Detection['tactic'], confidence = 1): Detection {
  return { tactic, confidence, evidence: 'x' };
}

describe('computeRawGain', () => {
  it('sums weight * confidence across detections', () => {
    const gain = computeRawGain([detection('urgency_pressure', 1), detection('trust_building', 0.5)]);
    expect(gain).toBeCloseTo(12 * 1 + 8 * 0.5);
  });

  it('returns 0 for no detections', () => {
    expect(computeRawGain([])).toBe(0);
  });
});

describe('applyDetections', () => {
  it('decays risk on a clean turn (no detections)', () => {
    const result = applyDetections(50, []);
    expect(result.risk).toBe(50 - RISK_DECAY_PER_CLEAN_TURN);
    expect(result.rawGain).toBe(0);
    expect(result.wasCapped).toBe(false);
  });

  it('never decays risk below MIN_RISK', () => {
    const result = applyDetections(2, []);
    expect(result.risk).toBe(MIN_RISK);
  });

  it('applies uncapped gain when raw gain is below the cap', () => {
    const result = applyDetections(0, [detection('generic_pressure', 1)]);
    expect(result.rawGain).toBe(6);
    expect(result.appliedGain).toBe(6);
    expect(result.risk).toBe(6);
    expect(result.wasCapped).toBe(false);
  });

  it('caps a single turn gain at MAX_RISK_GAIN_PER_TURN', () => {
    const detections = [
      detection('payment_redirection', 1),
      detection('authority_impersonation', 1),
      detection('isolation_secrecy', 1),
    ];
    const result = applyDetections(0, detections);
    expect(result.rawGain).toBeGreaterThan(MAX_RISK_GAIN_PER_TURN);
    expect(result.appliedGain).toBe(MAX_RISK_GAIN_PER_TURN);
    expect(result.risk).toBe(MAX_RISK_GAIN_PER_TURN);
    expect(result.wasCapped).toBe(true);
  });

  it('never exceeds MAX_RISK', () => {
    const detections = [detection('payment_redirection', 1), detection('authority_impersonation', 1)];
    const result = applyDetections(95, detections);
    expect(result.risk).toBe(MAX_RISK);
  });

  it('unknown tactic ids fall back to a default weight of 6', () => {
    const gain = computeRawGain([{ tactic: 'not_a_real_tactic' as Detection['tactic'], confidence: 1, evidence: 'x' }]);
    expect(gain).toBe(6);
  });

  it('takes at least 2 turns to cross the flag threshold under the cap', () => {
    const detections = [
      detection('payment_redirection', 1),
      detection('authority_impersonation', 1),
      detection('isolation_secrecy', 1),
    ];
    let risk = 0;
    let turns = 0;
    while (risk < FLAG_THRESHOLD) {
      risk = applyDetections(risk, detections).risk;
      turns += 1;
    }
    expect(turns).toBeGreaterThanOrEqual(2);
  });
});

describe('shouldInstantFlag', () => {
  it('is true when any detection meets or exceeds INSTANT_FLAG_CONFIDENCE', () => {
    expect(shouldInstantFlag([detection('info_harvesting', INSTANT_FLAG_CONFIDENCE)])).toBe(true);
    expect(shouldInstantFlag([detection('info_harvesting', INSTANT_FLAG_CONFIDENCE + 0.1)])).toBe(true);
  });

  it('is false when all detections are below INSTANT_FLAG_CONFIDENCE', () => {
    expect(shouldInstantFlag([detection('info_harvesting', INSTANT_FLAG_CONFIDENCE - 0.01)])).toBe(false);
    expect(shouldInstantFlag([])).toBe(false);
  });
});

describe('shouldFlag', () => {
  it('is false below the flag threshold', () => {
    expect(shouldFlag(FLAG_THRESHOLD - 1)).toBe(false);
  });

  it('is true at/above the flag threshold', () => {
    expect(shouldFlag(FLAG_THRESHOLD)).toBe(true);
    expect(shouldFlag(100)).toBe(true);
  });
});

describe('sensitivity presets', () => {
  it('thresholdsFor maps each sensitivity to its documented flag cutoff', () => {
    expect(thresholdsFor('relaxed')).toEqual({ flag: 65 });
    expect(thresholdsFor('balanced')).toEqual({ flag: 35 });
    expect(thresholdsFor('paranoid')).toEqual({ flag: 20 });
  });

  it('balanced matches FLAG_THRESHOLD', () => {
    expect(SENSITIVITY_THRESHOLDS.balanced).toEqual({ flag: FLAG_THRESHOLD });
  });

  it('shouldFlag defaults to the balanced preset when no thresholds are passed', () => {
    expect(shouldFlag(FLAG_THRESHOLD - 1)).toBe(false);
    expect(shouldFlag(FLAG_THRESHOLD)).toBe(true);
  });

  it('shouldFlag respects an explicit relaxed threshold (higher bar)', () => {
    const relaxed = thresholdsFor('relaxed');
    expect(shouldFlag(60, relaxed)).toBe(false);
    expect(shouldFlag(65, relaxed)).toBe(true);
  });

  it('shouldFlag respects an explicit paranoid threshold (lower bar)', () => {
    const paranoid = thresholdsFor('paranoid');
    expect(shouldFlag(19, paranoid)).toBe(false);
    expect(shouldFlag(20, paranoid)).toBe(true);
  });
});
