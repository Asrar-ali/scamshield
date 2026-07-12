import { afterEach, describe, expect, it, vi } from 'vitest';

const sendDiscordAlert = vi.fn();
vi.mock('./discord.js', () => ({
  sendDiscordAlert: (...args: unknown[]) => sendDiscordAlert(...args),
  discordEnabled: () => Boolean(process.env.DISCORD_BOT_TOKEN),
}));

const execFile = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args: unknown[]) => execFile(...args) }));

const { dispatchAlerts, imessageEnabled, summarizeDeliveries } = await import('./alerts.js');
import type { Contact } from './types.js';
import type { DiscordChannel } from './discord.js';

function discordContact(overrides: Partial<Contact> = {}): Contact {
  return { id: 'd1', name: 'Sarah', channel: 'discord', address: '111', ...overrides };
}

function imessageContact(overrides: Partial<Contact> = {}): Contact {
  return { id: 'i1', name: 'Tom', channel: 'imessage', address: 'tom@example.com', ...overrides };
}

/** Minimal stub satisfying the DiscordChannel shape dispatchAlerts needs. */
function makeDiscord(): DiscordChannel {
  return {
    getClient: () => ({} as never),
    getBotTag: () => 'ScamShield#0001',
    getGuildName: () => 'Test Guild',
    getRecentUsers: () => [],
    getMonitoredUsers: () => [],
    stop: () => undefined,
  };
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
    vi.clearAllMocks();
  });

  const ctx = { serverName: 'My Server', user: 'ScammerTom', risk: 92, tactics: ['Payment Redirection', 'Urgency Pressure'], timestamp: 1700000000000 };

  it('delivers a discord alert successfully when the bot client is connected', async () => {
    sendDiscordAlert.mockResolvedValue({ ok: true });

    const results = await dispatchAlerts([discordContact()], ctx, makeDiscord());
    expect(results).toEqual([{ contact: 'Sarah', channel: 'discord', ok: true }]);
    expect(sendDiscordAlert).toHaveBeenCalledWith(expect.anything(), '111', expect.stringContaining('SCAMSHIELD ALERT'));
    const text = sendDiscordAlert.mock.calls[0][2] as string;
    expect(text).toContain('My Server');
    expect(text).toContain('ScammerTom');
    expect(text).toContain('92');
    expect(text).toContain('Payment Redirection');
    expect(text).toContain('deleted the message and muted the user');
  });

  it('marks discord delivery as failed when no discord channel is passed', async () => {
    const results = await dispatchAlerts([discordContact()], ctx, null);
    expect(results).toEqual([{ contact: 'Sarah', channel: 'discord', ok: false, error: 'Discord is not connected' }]);
    expect(sendDiscordAlert).not.toHaveBeenCalled();
  });

  it('marks discord delivery as failed when sendDiscordAlert reports failure', async () => {
    sendDiscordAlert.mockResolvedValue({ ok: false, error: 'missing permissions' });

    const results = await dispatchAlerts([discordContact()], ctx, makeDiscord());
    expect(results).toEqual([{ contact: 'Sarah', channel: 'discord', ok: false, error: 'missing permissions' }]);
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
    process.env.SCAMSHIELD_IMESSAGE_ENABLED = '1';
    sendDiscordAlert.mockResolvedValue({ ok: false, error: 'discord down' });
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(null, '', ''));

    const results = await dispatchAlerts([discordContact(), imessageContact()], ctx, makeDiscord());
    expect(results).toEqual([
      { contact: 'Sarah', channel: 'discord', ok: false, error: 'discord down' },
      { contact: 'Tom', channel: 'imessage', ok: true },
    ]);
  });

  it('returns an empty array for no contacts', async () => {
    expect(await dispatchAlerts([], ctx, makeDiscord())).toEqual([]);
  });
});

describe('summarizeDeliveries', () => {
  it('reports no contacts configured', () => {
    expect(summarizeDeliveries([])).toBe('No contacts configured — no alert sent.');
  });

  it('reports total failure distinctly from no contacts', () => {
    expect(summarizeDeliveries([{ contact: 'Sarah', channel: 'discord', ok: false, error: 'x' }])).toBe(
      'Alert attempted but delivery failed for all contacts.',
    );
  });

  it('names each successful delivery with its channel', () => {
    const text = summarizeDeliveries([
      { contact: 'Sarah', channel: 'discord', ok: true },
      { contact: 'Tom', channel: 'imessage', ok: true },
    ]);
    expect(text).toBe('Alert sent to Sarah (Discord), Tom (iMessage).');
  });

  it('only lists the successful deliveries when some fail', () => {
    const text = summarizeDeliveries([
      { contact: 'Sarah', channel: 'discord', ok: true },
      { contact: 'Tom', channel: 'imessage', ok: false, error: 'nope' },
    ]);
    expect(text).toBe('Alert sent to Sarah (Discord).');
  });
});
