import { describe, expect, it } from 'vitest';
import { ANALYST_SYSTEM, buildGrandmaSystem, buildGuardianCoachSystem, buildGuardianTakeoverSystem } from './prompts.js';
import type { PersonaSettings } from './types.js';

// prompts.ts previously shipped as fixed string constants with no dedicated test
// file; it now builds persona-parameterized system prompts, so it gets one.

const PERSONA: PersonaSettings = {
  name: 'Gigi',
  age: 82,
  city: 'Halifax',
  grandkid: 'Max',
  quirks: 'baking bread and a parrot named Chip',
};

describe('buildGrandmaSystem', () => {
  it('substitutes every persona field into the system prompt', () => {
    const system = buildGrandmaSystem(PERSONA);
    expect(system).toContain('Gigi');
    expect(system).toContain('82-year-old');
    expect(system).toContain('Halifax');
    expect(system).toContain('Max');
    expect(system).toContain('baking bread and a parrot named Chip');
  });

  it('preserves the "trusting but not a pushover" character quality', () => {
    const system = buildGrandmaSystem(PERSONA);
    expect(system).toContain('NOT a pushover');
    expect(system).toContain('Never break character');
    expect(system).toContain('never actually hand over money or real information');
    expect(system).toContain('1-3 short sentences');
  });

  it('produces a different prompt for a different persona (no hardcoded Rose leakage)', () => {
    const rose = buildGrandmaSystem({ name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening' });
    const gigi = buildGrandmaSystem(PERSONA);
    expect(rose).not.toBe(gigi);
    expect(gigi).not.toContain('Rose');
    expect(gigi).not.toContain('Ottawa');
  });
});

describe('buildGuardianCoachSystem', () => {
  it('substitutes the persona name in place of the hardcoded Rose', () => {
    const system = buildGuardianCoachSystem('Gigi');
    expect(system).toContain('Gigi');
    expect(system).not.toContain('named Rose');
  });

  it('keeps the coaching-line instructions intact', () => {
    const system = buildGuardianCoachSystem('Gigi');
    expect(system).toContain('ONE short whispered coaching line');
    expect(system).toContain('Max 2 sentences');
  });
});

describe('buildGuardianTakeoverSystem', () => {
  it('substitutes the persona name in place of the hardcoded Rose', () => {
    const system = buildGuardianTakeoverSystem('Gigi');
    expect(system).toContain('taking over the call from Gigi');
    expect(system).not.toContain('taking over the call from Rose');
  });

  it('keeps the takeover instructions intact', () => {
    const system = buildGuardianTakeoverSystem('Gigi');
    expect(system).toContain('fraud protection');
    expect(system).toContain('call is terminated and reported');
  });
});

describe('ANALYST_SYSTEM', () => {
  it('lists the tactic taxonomy and the JSON response contract', () => {
    expect(ANALYST_SYSTEM).toContain('urgency_pressure');
    expect(ANALYST_SYSTEM).toContain('"detections"');
  });
});
