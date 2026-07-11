import { expect, type Page } from '@playwright/test';

/** Test-scoped alias so the shared in-memory server/leaderboard never collides
 * between tests in the same run. */
export function uniqueAlias(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
}

/** Fills the alias field and starts (or restarts) a call. Works from both the
 * initial idle screen ("Start the call") and the post-call screen ("Call
 * again") since both render the same AliasForm. */
export async function startCall(page: Page, alias: string): Promise<void> {
  await page.getByLabel('Scammer alias').fill(alias);
  await page.getByRole('button', { name: /start the call|call again/i }).click();
  await expect(page.getByText('LIVE CALL')).toBeVisible();
  await expect(page.getByPlaceholder(/Say something to Rose/)).toBeVisible();
}

/** Sends one composer message and waits for both the echoed scammer bubble
 * and the reply bubble (grandma, or guardian on a takeover turn) to land via
 * the WebSocket stream. Never uses a fixed sleep — relies on Playwright's
 * auto-waiting expect polling. */
export async function sendTurn(page: Page, text: string): Promise<void> {
  const bubbles = page.locator('.transcript .bubble');
  const before = await bubbles.count();

  await page.getByPlaceholder(/Say something to Rose/).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  // In mock mode the reply (grandma, or guardian on a takeover turn) follows the
  // scammer echo over the WebSocket almost immediately, so the transient "+1"
  // state is not reliably observable — wait for the settled "+2" state instead,
  // then confirm our own scammer line landed with the right text.
  await expect(bubbles).toHaveCount(before + 2, { timeout: 10_000 });
  await expect(page.locator('.bubble-scammer p').last()).toHaveText(text);
}

/** Reads the numeric value out of the risk gauge. */
export async function getRisk(page: Page): Promise<number> {
  const text = await page.locator('.risk-score').innerText();
  return Number(text.trim());
}

/** Locates a tactic card's label in the Manipulation Tactics panel by name.
 * Scoped to `.tactic-name` (rather than a bare page.getByText) because on a
 * takeover turn the guardian's spoken line recites the accumulated tactic
 * labels too (e.g. "I have detected Authority Impersonation, ..."), which
 * would otherwise make a plain text locator ambiguous. */
export function tacticCard(page: Page, label: string) {
  return page.locator('.tactic-name', { hasText: label });
}
