import { execFile } from 'node:child_process';
import type { Contact, ContactChannel } from './types.js';
import type { DiscordChannel } from './discord.js';
import { sendDiscordAlert } from './discord.js';
import { log } from './log.js';

const IMESSAGE_TIMEOUT_MS = 10_000;

export interface AlertContext {
  serverName: string;
  user: string;
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
    `Server: ${ctx.serverName}`,
    `Flagged user: ${ctx.user}`,
    `Risk score: ${Math.round(ctx.risk)}/100`,
    topTactics.length > 0 ? `Detected tactics: ${topTactics.join(', ')}` : 'Detected tactics: none recorded',
    `Time: ${when}`,
    'ScamShield deleted the message and muted the user.',
  ].join('\n');
}

async function deliverDiscord(contact: Contact, text: string, discord: DiscordChannel | null): Promise<DeliveryResult> {
  if (!discord) {
    return { contact: contact.name, channel: 'discord', ok: false, error: 'Discord is not connected' };
  }
  const result = await sendDiscordAlert(discord, contact.address, text);
  return { contact: contact.name, channel: 'discord', ok: result.ok, error: result.error };
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

/**
 * Dispatches a scam alert to every contact. One contact failing never blocks the others.
 * Discord alerts route through the shared connected bot client; iMessage stays local.
 */
export async function dispatchAlerts(
  contacts: Contact[],
  ctx: AlertContext,
  discord: DiscordChannel | null = null,
): Promise<DeliveryResult[]> {
  const text = formatAlertText(ctx);
  const results: DeliveryResult[] = [];
  for (const contact of contacts) {
    try {
      const result = contact.channel === 'discord' ? await deliverDiscord(contact, text, discord) : await deliverIMessage(contact, text);
      results.push(result);
    } catch (err) {
      log.warn('Alert dispatch threw unexpectedly:', err instanceof Error ? err.message : err);
      results.push({ contact: contact.name, channel: contact.channel, ok: false, error: 'delivery failed' });
    }
  }
  return results;
}

export function summarizeDeliveries(deliveries: DeliveryResult[]): string {
  if (deliveries.length === 0) return 'No contacts configured — no alert sent.';
  const successful = deliveries.filter((d) => d.ok);
  if (successful.length === 0) return 'Alert attempted but delivery failed for all contacts.';
  const label = (d: DeliveryResult) => `${d.contact} (${d.channel === 'discord' ? 'Discord' : 'iMessage'})`;
  return `Alert sent to ${successful.map(label).join(', ')}.`;
}
