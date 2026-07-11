import { test, expect } from '@playwright/test';
import { uniqueAlias, startCall, sendTurn, getRisk } from './helpers';

test('restart flow resets transcript and risk after a terminated call', async ({ page }) => {
  const alias = uniqueAlias('Restart');
  await page.goto('/');
  await startCall(page, alias);

  await sendTurn(page, "This is the CRA calling — you will be arrested and sent to jail if you don't pay immediately.");
  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByText('CALL TERMINATED')).toBeVisible();

  const newAlias = uniqueAlias('Restart-2');
  await startCall(page, newAlias);

  await expect(page.getByText('LIVE CALL')).toBeVisible();
  await expect(page.locator('.transcript .bubble')).toHaveCount(0);
  await expect(page.getByText(/Start a session, then play the scammer/)).toBeVisible();
  expect(await getRisk(page)).toBe(0);
  await expect(page.locator('.tactic-card')).toHaveCount(0);
  await expect(page.locator('.intervention')).toHaveCount(0);
});
