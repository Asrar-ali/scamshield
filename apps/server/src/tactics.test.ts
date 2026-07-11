import { describe, expect, it } from 'vitest';
import { TACTICS, TACTIC_BY_ID } from './tactics.js';

describe('TACTICS table integrity', () => {
  it('has unique ids', () => {
    const ids = TACTICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every tactic a positive weight', () => {
    for (const t of TACTICS) {
      expect(t.weight).toBeGreaterThan(0);
    }
  });

  it('gives every tactic a non-empty label and description', () => {
    for (const t of TACTICS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('indexes every tactic by id in TACTIC_BY_ID', () => {
    expect(TACTIC_BY_ID.size).toBe(TACTICS.length);
    for (const t of TACTICS) {
      expect(TACTIC_BY_ID.get(t.id)).toEqual(t);
    }
  });
});
