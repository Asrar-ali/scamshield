import { test, expect } from '@playwright/test';
import { uniqueAlias, startCall, sendTurn, getRisk, tacticCard } from './helpers';

// Four escalating utterances, each crafted from apps/server/src/mock.ts's keyword
// patterns so mock mode (keyless, deterministic) fires exactly the tactic set named
// in the task per turn. Each message deliberately matches 3+ keyword categories so
// its raw risk gain exceeds MAX_RISK_GAIN_PER_TURN (22) — guaranteeing the applied
// gain is capped at exactly 22 every turn. That makes the progression fully
// deterministic: 0 -> 22 -> 44 -> 66 -> 88.
//   Turn 1 (CRA / arrested):       authority_impersonation + emotional_manipulation + urgency_pressure
//   Turn 2 (gift cards / secrecy): payment_redirection + isolation_secrecy + urgency + emotional
//   Turn 3 (wire / card number):   payment_redirection + urgency_pressure + info_harvesting
//   Turn 4 (anydesk / OTP):        remote_access + urgency_pressure + info_harvesting
//
// Risk thresholds (apps/server/src/risk.ts): coach @ 45, takeover @ 80.
// 44 (after turn 2) < 45, so coach only fires on turn 3 (risk 66) — before
// takeover fires on turn 4 (risk 88, and `coached` is already true).
const TURN_1 = "This is the CRA calling — you will be arrested and sent to jail if you don't pay immediately.";
const TURN_2 = "You need to buy gift cards right now, and don't tell anyone or you'll be in trouble.";
const TURN_3 = 'Please wire money right now through western union, and give me your card number.';
const TURN_4 = 'I need you to install anydesk on your computer right now and read me the one-time code.';

test('full scam escalation ends in guardian takeover and family alert', async ({ page }) => {
  const alias = uniqueAlias('Escalation');
  await page.goto('/');
  await expect(page.getByText('NO CALL')).toBeVisible();

  await startCall(page, alias);
  await expect(page.getByText('LIVE CALL')).toBeVisible();

  // --- Turn 1: authority + emotional + urgency ---
  await sendTurn(page, TURN_1);
  await expect(tacticCard(page, 'Authority Impersonation')).toBeVisible();
  await expect(tacticCard(page, 'Emotional Manipulation')).toBeVisible();
  const risk1 = await getRisk(page);
  expect(risk1).toBeGreaterThan(0);
  expect(risk1).toBeLessThan(45);
  await expect(page.locator('.intervention.coach')).toHaveCount(0);
  await expect(page.locator('.intervention.takeover')).toHaveCount(0);

  // --- Turn 2: payment redirection + isolation/secrecy ---
  await sendTurn(page, TURN_2);
  await expect(tacticCard(page, 'Payment Redirection')).toBeVisible();
  await expect(tacticCard(page, 'Isolation & Secrecy')).toBeVisible();
  const risk2 = await getRisk(page);
  expect(risk2).toBeGreaterThan(risk1);
  expect(risk2).toBeLessThan(45);
  await expect(page.locator('.intervention.coach')).toHaveCount(0);
  await expect(page.locator('.intervention.takeover')).toHaveCount(0);

  // --- Turn 3: crosses the coach threshold (45) ---
  await sendTurn(page, TURN_3);
  await expect(tacticCard(page, 'Info Harvesting')).toBeVisible();
  const risk3 = await getRisk(page);
  expect(risk3).toBeGreaterThan(risk2);
  expect(risk3).toBeGreaterThanOrEqual(45);
  expect(risk3).toBeLessThan(80);
  await expect(page.locator('.intervention.coach')).toHaveCount(1); // coach fired...
  await expect(page.locator('.intervention.takeover')).toHaveCount(0); // ...strictly before takeover

  // --- Turn 4: crosses the takeover threshold (80) — the demo climax ---
  await sendTurn(page, TURN_4);
  await expect(tacticCard(page, 'Remote Access Request')).toBeVisible();
  const risk4 = await getRisk(page);
  expect(risk4).toBeGreaterThanOrEqual(risk3);
  expect(risk4).toBeGreaterThanOrEqual(80);

  await expect(page.locator('.intervention.takeover')).toHaveCount(1);
  await expect(page.getByText('SCAMMER CAUGHT')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Family Alert');
  await expect(page.getByText('CALL TERMINATED')).toBeVisible();
  await expect(page.getByPlaceholder(/Say something to Rose/)).toHaveCount(0);
});
