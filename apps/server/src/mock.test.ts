import { describe, expect, it } from 'vitest';
import { mockAnalyze, mockCoach, mockGrandma, mockTakeover } from './mock.js';
import type { TacticId } from './types.js';

const REPRESENTATIVE_LINES: Record<Exclude<TacticId, 'generic_pressure'>, string> = {
  urgency_pressure: 'Please hurry, we do not have much time left to fix this.',
  authority_impersonation: 'I am calling from the CRA regarding your file.',
  payment_redirection: 'Please purchase some gift cards for me right away.',
  isolation_secrecy: "Please don't tell anyone about this call.",
  emotional_manipulation: 'Your grandson is in jail and needs bail money.',
  trust_building: "It's me, remember? Your favourite nephew.",
  verification_blocking: "Please don't hang up while we resolve this.",
  remote_access: 'Please install teamviewer on your computer.',
  info_harvesting: 'Can you give me your social insurance number?',
};

describe('mockAnalyze', () => {
  it.each(Object.entries(REPRESENTATIVE_LINES))('detects %s from a representative scam line', (tactic, line) => {
    const detections = mockAnalyze(line);
    expect(detections.some((d) => d.tactic === tactic)).toBe(true);
  });

  it('returns no detections for an innocent line', () => {
    const detections = mockAnalyze('I fed the cat and then watered my tomato plants this morning.');
    expect(detections).toEqual([]);
  });

  it('returns evidence and a fixed confidence for each detection', () => {
    const detections = mockAnalyze('I am calling from the police about your account.');
    expect(detections.length).toBeGreaterThan(0);
    for (const d of detections) {
      expect(d.confidence).toBe(0.85);
      expect(typeof d.evidence).toBe('string');
      expect(d.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('mockGrandma', () => {
  it('cycles deterministically through lines by turn number', () => {
    const first = mockGrandma(0);
    const wrapped = mockGrandma(0 + 6);
    expect(first).toBe(wrapped);
    expect(typeof mockGrandma(3)).toBe('string');
  });
});

describe('mockCoach', () => {
  it('returns a non-empty coaching line', () => {
    expect(mockCoach().length).toBeGreaterThan(0);
  });
});

describe('mockTakeover', () => {
  it('includes the given tactic labels in the takeover line', () => {
    const line = mockTakeover(['Payment Redirection', 'Authority Impersonation']);
    expect(line).toContain('Payment Redirection');
    expect(line).toContain('Authority Impersonation');
  });
});
