import { afterEach, describe, expect, it, vi } from 'vitest';
import { Events } from 'discord.js';
import { discordEnabled, startDiscordChannel, sendDiscordAlert, timeoutMember, type DiscordMessage } from './discord.js';

describe('discordEnabled', () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it('is false when no token is set', () => {
    delete process.env.DISCORD_BOT_TOKEN;
    expect(discordEnabled()).toBe(false);
  });

  it('is true when a token is set', () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    expect(discordEnabled()).toBe(true);
  });
});

describe('startDiscordChannel (disabled path)', () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it('returns a disabled channel and never invokes a callback when no token and no client', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const onMessage = vi.fn();

    const channel = startDiscordChannel({ onMessage });
    expect(channel.getBotTag()).toBeNull();
    expect(channel.getGuildName()).toBeNull();
    expect(channel.getRecentUsers()).toEqual([]);
    expect(channel.getMonitoredUsers()).toEqual([]);
    expect(() => channel.stop()).not.toThrow();
    expect(channel.getClient()).toBeNull();
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('startDiscordChannel (injected client path)', () => {
  // We drive an injected stub client's messageCreate handler directly. discord.js
  // v14 Clients don't cooperate with fake timers, so tests inject a minimal EventEmitter
  // shaped like the bits of Client we touch (on/emit + the ready user/guilds cache).
  function makeStubClient() {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    // Collection-shaped cache: a Map plus the .first() helper discord.js provides.
    const cache = new Map([['g1', { name: 'Demo Server' }]]);
    (cache as unknown as { first: () => unknown }).first = () => [...cache.values()][0];
    const client = {
      on: (event: string, fn: (...args: unknown[]) => void) => {
        (handlers[event] ??= []).push(fn);
        return client;
      },
      emit: (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((fn) => fn(...args)),
      destroy: vi.fn().mockResolvedValue(undefined),
      user: { tag: 'ScamShield#0001' },
      guilds: { cache },
    };
    return client;
  }

  /** Builds a discord.js-shaped Message for the relevantMessage filter path. */
  function fakeMessage(overrides: Partial<{ authorBot: boolean; guildId: string | null; content: string; authorId: string; authorUsername: string }> = {}) {
    return {
      author: { bot: overrides.authorBot ?? false, id: overrides.authorId ?? '42', username: overrides.authorUsername ?? 'scammer' },
      guildId: overrides.guildId === undefined ? 'g1' : overrides.guildId,
      channelId: 'c1',
      content: overrides.content ?? 'send gift cards now',
      reply: vi.fn().mockResolvedValue(undefined),
      channel: { send: vi.fn().mockResolvedValue(undefined) },
    };
  }

  it('marks ready with bot tag + guild name, and routes a guild message to onMessage', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const onMessage = vi.fn().mockResolvedValue({ takeover: false });

    const channel = startDiscordChannel({ onMessage }, { client: client as never });

    // Simulate the ClientReady event the real gateway would fire.
    client.emit(Events.ClientReady, client);

    const msg = fakeMessage();
    client.emit('messageCreate', msg);

    // onMessage runs async; let it settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(channel.getBotTag()).toBe('ScamShield#0001');
    expect(channel.getGuildName()).toBe('Demo Server');
    expect(onMessage).toHaveBeenCalledTimes(1);
    const passed = onMessage.mock.calls[0][0] as DiscordMessage;
    expect(passed.userId).toBe('42');
    expect(passed.username).toBe('scammer');
    expect(passed.text).toBe('send gift cards now');
    expect(channel.getRecentUsers()).toEqual([
      { userId: '42', name: 'scammer', lastSeen: expect.any(Number) },
    ]);
  });

  it('ignores bot messages, DMs, and empty content', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const onMessage = vi.fn().mockResolvedValue({ takeover: false });
    startDiscordChannel({ onMessage }, { client: client as never });

    client.emit('messageCreate', fakeMessage({ authorBot: true }));
    client.emit('messageCreate', fakeMessage({ guildId: null }));
    client.emit('messageCreate', fakeMessage({ content: '   ' }));

    await Promise.resolve();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('marks the user blocked in the monitored summary when onMessage reports a flag', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const onMessage = vi.fn().mockResolvedValue({ flagged: true });
    const channel = startDiscordChannel({ onMessage }, { client: client as never });

    const msg = fakeMessage();
    client.emit('messageCreate', msg);

    await Promise.resolve();
    await Promise.resolve();

    const monitored = channel.getMonitoredUsers().find((u) => u.userId === '42');
    expect(monitored?.blocked).toBe(true);
  });

  it('does not mark the user blocked when onMessage reports no flag', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const onMessage = vi.fn().mockResolvedValue({ flagged: false });
    const channel = startDiscordChannel({ onMessage }, { client: client as never });

    client.emit('messageCreate', fakeMessage());
    await Promise.resolve();
    await Promise.resolve();

    const monitored = channel.getMonitoredUsers().find((u) => u.userId === '42');
    expect(monitored?.blocked).toBe(false);
  });

  it('swallows the error (no throw escapes) when onMessage rejects', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const onMessage = vi.fn().mockRejectedValue(new Error('boom'));
    startDiscordChannel({ onMessage }, { client: client as never });

    const msg = fakeMessage();
    client.emit('messageCreate', msg);

    await Promise.resolve();
    await Promise.resolve();
    // The handler swallows the error — the point is no throw escapes and no callout is posted.
    expect(msg.channel.send).not.toHaveBeenCalled();
  });

  it('stop() destroys the injected client', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const client = makeStubClient();
    const channel = startDiscordChannel({ onMessage: vi.fn() }, { client: client as never });
    channel.stop();
    expect(client.destroy).toHaveBeenCalled();
  });
});

describe('sendDiscordAlert / timeoutMember (no client)', () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it('sendDiscordAlert reports failure when the channel has no client', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const channel = startDiscordChannel({ onMessage: vi.fn() });
    const result = await sendDiscordAlert(channel, '123', 'hi');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Discord client is not connected');
  });

  it('timeoutMember reports failure when the channel has no client', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const channel = startDiscordChannel({ onMessage: vi.fn() });
    const result = await timeoutMember(channel, { userId: '42', guildId: 'g1', minutes: 60 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Discord client is not connected');
  });
});
