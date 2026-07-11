import { test, expect } from '@playwright/test';
import { uniqueAlias, startCall, sendTurn } from './helpers';

test('give up flow ends the call and records a gave_up leaderboard entry', async ({ page }) => {
  const alias = uniqueAlias('GiveUp');
  await page.goto('/');
  await startCall(page, alias);

  await sendTurn(page, "This is the CRA calling — you will be arrested and sent to jail if you don't pay immediately.");

  await page.getByRole('button', { name: 'Give up' }).click();

  await expect(page.getByText('CALL TERMINATED')).toBeVisible();
  await expect(page.getByPlaceholder(/Say something to Rose/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Call again' })).toBeVisible();

  const leaderboard = page.locator('.leaderboard-panel');
  await expect(leaderboard).toContainText(alias, { timeout: 10_000 });
  await expect(leaderboard.locator('.leaderboard-row', { hasText: alias })).toContainText('Gave up');
});
