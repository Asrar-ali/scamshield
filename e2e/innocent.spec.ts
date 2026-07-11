import { test, expect } from '@playwright/test';
import { uniqueAlias, startCall, sendTurn, getRisk } from './helpers';

test('innocent conversation stays well below the coach threshold', async ({ page }) => {
  const alias = uniqueAlias('Innocent');
  await page.goto('/');
  await startCall(page, alias);

  // Turn 1: matches none of apps/server/src/mock.ts's keyword patterns.
  await sendTurn(page, 'hello how are you today');
  expect(await getRisk(page)).toBe(0);
  await expect(page.locator('.tactic-card')).toHaveCount(0);
  await expect(page.locator('.intervention')).toHaveCount(0);

  // Turn 2: NOTE — mock.ts's trust_building pattern includes the literal phrase
  // "lovely weather" (small talk / feigned familiarity is a real grooming
  // precursor tactic), so this exact message DOES trigger one "Trust Building"
  // detection in mock mode. That's a deliberate design choice in mock.ts, not a
  // bug, but it means this test can't assert zero tactic cards for this phrase —
  // see final report. The risk contribution (weight 8 * confidence 0.85 ≈ 6.8)
  // is still far below the 45 coach threshold, so no intervention fires.
  await sendTurn(page, 'what lovely weather we are having');
  const risk = await getRisk(page);
  expect(risk).toBeLessThan(45);
  await expect(page.locator('.intervention')).toHaveCount(0);
});
