import { describe, expect, it } from 'vitest';
import {
  applyDetections,
  canTakeover,
  computeRawGain,
  shouldCoach,
  thresholdsFor,
  SENSITIVITY_THRESHOLDS,
  COACH_THRESHOLD,
  TAKEOVER_THRESHOLD,
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

  it('takes at least 2 turns to cross the coach threshold under the cap', () => {
    const detections = [
      detection('payment_redirection', 1),
      detection('authority_impersonation', 1),
      detection('isolation_secrecy', 1),
    ];
    let risk = 0;
    let turns = 0;
    while (risk < COACH_THRESHOLD) {
      risk = applyDetections(risk, detections).risk;
      turns += 1;
    }
    expect(turns).toBeGreaterThanOrEqual(2);
  });

  it('takes 3-4 turns to cross the takeover threshold under the cap', () => {
    const detections = [
      detection('payment_redirection', 1),
      detection('authority_impersonation', 1),
      detection('isolation_secrecy', 1),
    ];
    let risk = 0;
    let turns = 0;
    while (risk < TAKEOVER_THRESHOLD) {
      risk = applyDetections(risk, detections).risk;
      turns += 1;
    }
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(turns).toBeLessThanOrEqual(4);
  });
});

describe('shouldCoach', () => {
  it('is false below the coach threshold', () => {
    expect(shouldCoach(COACH_THRESHOLD - 1, false)).toBe(false);
  });

  it('is true at/above the coach threshold when not already coached', () => {
    expect(shouldCoach(COACH_THRESHOLD, false)).toBe(true);
    expect(shouldCoach(100, false)).toBe(true);
  });

  it('is false once already coached', () => {
    expect(shouldCoach(100, true)).toBe(false);
  });
});

describe('canTakeover', () => {
  it('is false below the takeover threshold regardless of coach state', () => {
    expect(canTakeover(TAKEOVER_THRESHOLD - 1, true, 5)).toBe(false);
  });

  it('is true at/above the takeover threshold when coached', () => {
    expect(canTakeover(TAKEOVER_THRESHOLD, true, 0)).toBe(true);
  });

  it('is false at/above the takeover threshold when not coached and fewer than 2 capped turns', () => {
    expect(canTakeover(TAKEOVER_THRESHOLD, false, 1)).toBe(false);
    expect(canTakeover(TAKEOVER_THRESHOLD, false, 0)).toBe(false);
  });

  it('guarantees takeover eligibility once 2 capped turns occurred, even without coaching', () => {
    expect(canTakeover(TAKEOVER_THRESHOLD, false, 2)).toBe(true);
  });
});

describe('sensitivity presets', () => {
  it('thresholdsFor maps each sensitivity to its documented coach/takeover pair', () => {
    expect(thresholdsFor('relaxed')).toEqual({ coach: 55, takeover: 90 });
    expect(thresholdsFor('balanced')).toEqual({ coach: 45, takeover: 80 });
    expect(thresholdsFor('paranoid')).toEqual({ coach: 35, takeover: 65 });
  });

  it('balanced matches the original hardcoded COACH_THRESHOLD/TAKEOVER_THRESHOLD', () => {
    expect(SENSITIVITY_THRESHOLDS.balanced).toEqual({ coach: COACH_THRESHOLD, takeover: TAKEOVER_THRESHOLD });
  });

  it('shouldCoach defaults to the balanced preset when no thresholds are passed', () => {
    expect(shouldCoach(COACH_THRESHOLD - 1, false)).toBe(false);
    expect(shouldCoach(COACH_THRESHOLD, false)).toBe(true);
  });

  it('shouldCoach respects an explicit relaxed threshold', () => {
    const relaxed = thresholdsFor('relaxed');
    expect(shouldCoach(50, false, relaxed)).toBe(false);
    expect(shouldCoach(55, false, relaxed)).toBe(true);
  });

  it('shouldCoach respects an explicit paranoid threshold', () => {
    const paranoid = thresholdsFor('paranoid');
    expect(shouldCoach(30, false, paranoid)).toBe(false);
    expect(shouldCoach(35, false, paranoid)).toBe(true);
  });

  it('canTakeover defaults to the balanced preset when no thresholds are passed', () => {
    expect(canTakeover(TAKEOVER_THRESHOLD - 1, true, 5)).toBe(false);
    expect(canTakeover(TAKEOVER_THRESHOLD, true, 0)).toBe(true);
  });

  it('canTakeover respects an explicit paranoid threshold (lower bar than balanced)', () => {
    const paranoid = thresholdsFor('paranoid');
    expect(canTakeover(65, true, 0, paranoid)).toBe(true);
    expect(canTakeover(64, true, 0, paranoid)).toBe(false);
  });

  it('canTakeover respects an explicit relaxed threshold (higher bar than balanced)', () => {
    const relaxed = thresholdsFor('relaxed');
    expect(canTakeover(80, true, 0, relaxed)).toBe(false);
    expect(canTakeover(90, true, 0, relaxed)).toBe(true);
  });
});
