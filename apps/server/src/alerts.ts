import { execFile } from 'node:child_process';
import type { Contact, ContactChannel } from './types.js';
import { sendTelegramMessage } from './telegram.js';
import { log } from './log.js';

const IMESSAGE_TIMEOUT_MS = 10_000;

export interface AlertContext {
  protectedName: string;
  risk: number;
  tactics: string[];
  timestamp: number;
}

export interface DeliveryResult {
  contact: string;
  channel: ContactChannel;
  ok: boolean;
  error?: string;
}

export function imessageEnabled(): boolean {
  return process.env.SCAMSHIELD_IMESSAGE_ENABLED === '1';
}

function formatAlertText(ctx: AlertContext): string {
  const when = new Date(ctx.timestamp).toLocaleString();
  const topTactics = ctx.tactics.slice(0, 3);
  return [
    'SCAMSHIELD ALERT',
    `Protected: ${ctx.protectedName}`,
    `Risk score: ${Math.round(ctx.risk)}/100`,
    topTactics.length > 0 ? `Detected tactics: ${topTactics.join(', ')}` : 'Detected tactics: none recorded',
    `Time: ${when}`,
    'ScamShield ended the call to protect them.',
  ].join('\n');
}

async function deliverTelegram(contact: Contact, text: string): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { contact: contact.name, channel: 'telegram', ok: false, error: 'Telegram is not configured' };
  }
  try {
    await sendTelegramMessage(token, contact.address, text);
    return { contact: contact.name, channel: 'telegram', ok: true };
  } catch (err) {
    return { contact: contact.name, channel: 'telegram', ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}

/**
 * Sends via macOS Messages.app using execFile + argv-only parameters — the
 * AppleScript source is a fixed literal, never built from contact/text input,
 * so there is no command-injection path through untrusted data.
 */
function runOsascript(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      [
        '-e',
        'on run argv',
        '-e',
        'tell application "Messages" to send (item 2 of argv) to participant (item 1 of argv) of (account 1 whose service type is iMessage)',
        '-e',
        'end run',
        ...argv,
      ],
      { timeout: IMESSAGE_TIMEOUT_MS },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

async function deliverIMessage(contact: Contact, text: string): Promise<DeliveryResult> {
  if (!imessageEnabled()) {
    return { contact: contact.name, channel: 'imessage', ok: false, error: 'iMessage delivery is disabled' };
  }
  try {
    await runOsascript([contact.address, text]);
    return { contact: contact.name, channel: 'imessage', ok: true };
  } catch (err) {
    return { contact: contact.name, channel: 'imessage', ok: false, error: err instanceof Error ? err.message : 'osascript failed' };
  }
}

/** Dispatches a family alert to every contact. One contact failing never blocks the others. */
export async function dispatchAlerts(contacts: Contact[], ctx: AlertContext): Promise<DeliveryResult[]> {
  const text = formatAlertText(ctx);
  const results: DeliveryResult[] = [];
  for (const contact of contacts) {
    try {
      const result = contact.channel === 'telegram' ? await deliverTelegram(contact, text) : await deliverIMessage(contact, text);
      results.push(result);
    } catch (err) {
      log.warn('Alert dispatch threw unexpectedly:', err instanceof Error ? err.message : err);
      results.push({ contact: contact.name, channel: contact.channel, ok: false, error: 'delivery failed' });
    }
  }
  return results;
}

export function summarizeDeliveries(deliveries: DeliveryResult[]): string {
  if (deliveries.length === 0) return 'No family contacts configured — no alert sent.';
  const successful = deliveries.filter((d) => d.ok);
  if (successful.length === 0) return 'Family alert attempted but delivery failed for all contacts.';
  const label = (d: DeliveryResult) => `${d.contact} (${d.channel === 'telegram' ? 'Telegram' : 'iMessage'})`;
  return `Family alert sent to ${successful.map(label).join(', ')}.`;
}
