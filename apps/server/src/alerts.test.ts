import { afterEach, describe, expect, it, vi } from 'vitest';

const sendTelegramMessage = vi.fn();
vi.mock('./telegram.js', () => ({ sendTelegramMessage: (...args: unknown[]) => sendTelegramMessage(...args) }));

const execFile = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args: unknown[]) => execFile(...args) }));

const { dispatchAlerts, imessageEnabled, summarizeDeliveries } = await import('./alerts.js');
import type { Contact } from './types.js';

function telegramContact(overrides: Partial<Contact> = {}): Contact {
  return { id: 't1', name: 'Sarah', channel: 'telegram', address: '111', ...overrides };
}

function imessageContact(overrides: Partial<Contact> = {}): Contact {
  return { id: 'i1', name: 'Tom', channel: 'imessage', address: 'tom@example.com', ...overrides };
}

describe('imessageEnabled', () => {
  afterEach(() => {
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
  });

  it('is false by default', () => {
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
    expect(imessageEnabled()).toBe(false);
  });

  it('is true only when set to exactly "1"', () => {
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = '1';
    expect(imessageEnabled()).toBe(true);
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = 'true';
    expect(imessageEnabled()).toBe(false);
  });
});

describe('dispatchAlerts', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
    vi.clearAllMocks();
  });

  const ctx = { protectedName: 'Rose', risk: 92, tactics: ['Payment Redirection', 'Urgency Pressure'], timestamp: 1700000000000 };

  it('delivers a telegram alert successfully when TELEGRAM_BOT_TOKEN is set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    sendTelegramMessage.mockResolvedValue(undefined);

    const results = await dispatchAlerts([telegramContact()], ctx);
    expect(results).toEqual([{ contact: 'Sarah', channel: 'telegram', ok: true }]);
    expect(sendTelegramMessage).toHaveBeenCalledWith('tok', '111', expect.stringContaining('SCAMSHIELD ALERT'));
    const text = sendTelegramMessage.mock.calls[0][2] as string;
    expect(text).toContain('Rose');
    expect(text).toContain('92');
    expect(text).toContain('Payment Redirection');
    expect(text).toContain('ScamShield ended the call to protect them.');
  });

  it('marks telegram delivery as failed (not thrown) when TELEGRAM_BOT_TOKEN is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const results = await dispatchAlerts([telegramContact()], ctx);
    expect(results).toEqual([{ contact: 'Sarah', channel: 'telegram', ok: false, error: 'Telegram is not configured' }]);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('marks telegram delivery as failed when sendTelegramMessage rejects', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    sendTelegramMessage.mockRejectedValue(new Error('telegram down'));
    const results = await dispatchAlerts([telegramContact()], ctx);
    expect(results).toEqual([{ contact: 'Sarah', channel: 'telegram', ok: false, error: 'telegram down' }]);
  });

  it('skips iMessage delivery when SCAMSHIELD_IMESSAGE_ENABLED is not "1"', async () => {
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
    const results = await dispatchAlerts([imessageContact()], ctx);
    expect(results).toEqual([{ contact: 'Tom', channel: 'imessage', ok: false, error: 'iMessage delivery is disabled' }]);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('delivers iMessage via osascript argv (never string-built from input) when enabled', async () => {
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = '1';
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(null, '', ''));

    const results = await dispatchAlerts([imessageContact()], ctx);
    expect(results).toEqual([{ contact: 'Tom', channel: 'imessage', ok: true }]);

    const [cmd, args, opts] = execFile.mock.calls[0];
    expect(cmd).toBe('osascript');
    expect(args).toEqual([
      '-e',
      'on run argv',
      '-e',
      'tell application "Messages" to send (item 2 of argv) to participant (item 1 of argv) of (account 1 whose service type is iMessage)',
      '-e',
      'end run',
      'tom@example.com',
      expect.stringContaining('SCAMSHIELD ALERT'),
    ]);
    expect(opts).toEqual(expect.objectContaining({ timeout: 10_000 }));
  });

  it('marks iMessage delivery as failed (not thrown) when osascript fails', async () => {
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = '1';
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(new Error('not signed in')));

    const results = await dispatchAlerts([imessageContact()], ctx);
    expect(results).toEqual([{ contact: 'Tom', channel: 'imessage', ok: false, error: 'not signed in' }]);
  });

  it('one contact failing never blocks delivery to the others', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = '1';
    sendTelegramMessage.mockRejectedValue(new Error('telegram down'));
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(null, '', ''));

    const results = await dispatchAlerts([telegramContact(), imessageContact()], ctx);
    expect(results).toEqual([
      { contact: 'Sarah', channel: 'telegram', ok: false, error: 'telegram down' },
      { contact: 'Tom', channel: 'imessage', ok: true },
    ]);
  });

  it('returns an empty array for no contacts', async () => {
    expect(await dispatchAlerts([], ctx)).toEqual([]);
  });
});

describe('summarizeDeliveries', () => {
  it('reports no contacts configured', () => {
    expect(summarizeDeliveries([])).toBe('No family contacts configured — no alert sent.');
  });

  it('reports total failure distinctly from no contacts', () => {
    expect(summarizeDeliveries([{ contact: 'Sarah', channel: 'telegram', ok: false, error: 'x' }])).toBe(
      'Family alert attempted but delivery failed for all contacts.',
    );
  });

  it('names each successful delivery with its channel', () => {
    const text = summarizeDeliveries([
      { contact: 'Sarah', channel: 'telegram', ok: true },
      { contact: 'Tom', channel: 'imessage', ok: true },
    ]);
    expect(text).toBe('Family alert sent to Sarah (Telegram), Tom (iMessage).');
  });

  it('only lists the successful deliveries when some fail', () => {
    const text = summarizeDeliveries([
      { contact: 'Sarah', channel: 'telegram', ok: true },
      { contact: 'Tom', channel: 'imessage', ok: false, error: 'nope' },
    ]);
    expect(text).toBe('Family alert sent to Sarah (Telegram).');
  });
});
