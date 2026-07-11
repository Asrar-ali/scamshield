import { test, expect } from '@playwright/test';
import { uniqueAlias, startCall, sendTurn } from './helpers';

test('leaderboard keeps a caught session listed after a new call starts', async ({ page }) => {
  const aliasA = uniqueAlias('LB-Caught');
  const aliasB = uniqueAlias('LB-New');

  await page.goto('/');
  await startCall(page, aliasA);

  // Drive session A all the way to a guardian takeover (same escalating turns as
  // escalation.spec.ts — see that file for why these four messages are deterministic
  // in mock mode).
  await sendTurn(page, "This is the CRA calling — you will be arrested and sent to jail if you don't pay immediately.");
  await sendTurn(page, "You need to buy gift cards right now, and don't tell anyone or you'll be in trouble.");
  await sendTurn(page, 'Please wire money right now through western union, and give me your card number.');
  await sendTurn(page, 'I need you to install anydesk on your computer right now and read me the one-time code.');
  await expect(page.getByText('SCAMMER CAUGHT')).toBeVisible();

  const leaderboard = page.locator('.leaderboard-panel');
  await expect(leaderboard).toContainText(aliasA, { timeout: 10_000 });
  await expect(leaderboard.locator('.leaderboard-row', { hasText: aliasA })).toContainText('Caught');

  // Start a brand new call with a different alias — the earlier caught session
  // must remain listed (the in-memory store persists across sessions for the
  // life of the server process).
  await startCall(page, aliasB);
  await expect(page.getByText('LIVE CALL')).toBeVisible();
  await expect(leaderboard).toContainText(aliasA);
});
