import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { log } from './log.js';

const DEFAULT_TIMEOUT_MINUTES = 60;

export function discordEnabled(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

export interface RecentUser {
  userId: string;
  name: string;
  lastSeen: number;
}

export interface MonitoredUser {
  userId: string;
  name: string;
  risk: number;
  maxRisk: number;
  turns: number;
  tactics: string[];
  blocked: boolean;
}

export interface DiscordAlertTarget {
  /** Channel id (text channel) or user id (DM) to post the alert to. */
  destination: string;
  text: string;
}

export interface DiscordTimeoutTarget {
  userId: string;
  guildId: string;
  minutes: number;
}

export interface DiscordMessage {
  userId: string;
  username: string;
  guildId: string;
  channelId: string;
  text: string;
  /** The discord.js message, so callers can reply/callout in-channel. Omitted in tests. */
  raw?: Message;
}

/**
 * What the Discord channel asks the host app to do for each incoming message.
 * Returns whether the message was flagged so the channel knows to track the
 * user as blocked.
 */
export interface DiscordCallbacks {
  /** Handle one observed guild message. Returns whether a flag fired. */
  onMessage(msg: DiscordMessage): Promise<{ flagged: boolean }>;
}

export interface DiscordChannel {
  /** The connected discord.js client, when active. alerts.ts reuses it to post mod-log alerts. */
  getClient(): Client | null;
  /** Tag the bot logged in as (e.g. "ScamShield#1234"), or null when disabled. */
  getBotTag(): string | null;
  /** Name of the guild the bot is monitoring, or null. */
  getGuildName(): string | null;
  /** Members the bot has observed since startup. */
  getRecentUsers(): RecentUser[];
  /** Active monitored-user summaries (risk + tactics seen), for the status endpoint. */
  getMonitoredUsers(): MonitoredUser[];
  stop(): void;
}

export interface StartDiscordOptions {
  /**
   * Injectable discord.js client for tests. When omitted, a real Client is built
   * from DISCORD_BOT_TOKEN. discord.js v14 Clients don't play well with fake timers,
   * so tests pass a stub and control message delivery directly.
   */
  client?: Client;
}

function relevantMessage(msg: Message): DiscordMessage | null {
  // Ignore bots (including ourselves) and DMs — ScamShield monitors guild text
  // channels for human scammer activity, not other bots or private chats.
  if (msg.author.bot) return null;
  if (!msg.guildId) return null; // DM / group DM
  const text = msg.content.trim();
  if (!text) return null; // embeds/attachments with no text content
  return {
    userId: msg.author.id,
    username: msg.author.username,
    guildId: msg.guildId,
    channelId: msg.channelId,
    text,
    raw: msg,
  };
}

/**
 * Starts monitoring guild messages when DISCORD_BOT_TOKEN is set (or a client is
 * injected). No-op but still returns a valid "disabled" channel otherwise — same
 * pattern as geminiEnabled()/ttsEnabled(): never throws, never blocks startup.
 */
export function startDiscordChannel(callbacks: DiscordCallbacks, options: StartDiscordOptions = {}): DiscordChannel {
  const token = process.env.DISCORD_BOT_TOKEN;
  const recent = new Map<string, RecentUser>();
  const monitored = new Map<string, MonitoredUser>();
  let botTag: string | null = null;
  let guildName: string | null = null;
  let client: Client | null = null;
  let stopped = false;

  const channel: DiscordChannel = {
    getClient: () => client,
    getBotTag: () => botTag,
    getGuildName: () => guildName,
    getRecentUsers: () => [...recent.values()],
    getMonitoredUsers: () => [...monitored.values()],
    stop: () => {
      stopped = true;
      if (client) {
        client.destroy().catch((err) => log.warn('discord client destroy failed:', err instanceof Error ? err.message : err));
      }
    },
  };

  // No token and no injected client → disabled channel. Keeps startup safe and
  // every status check honest.
  if (!token && !options.client) return channel;

  const trackUser = (userId: string, name: string) => {
    recent.set(userId, { userId, name, lastSeen: Date.now() });
    if (!monitored.has(userId)) {
      monitored.set(userId, { userId, name, risk: 0, maxRisk: 0, turns: 0, tactics: [], blocked: false });
    }
  };

  /** Exposed for app.ts to keep the monitored summary in sync as risk accrues. */
  const updateMonitored = (userId: string, patch: Partial<MonitoredUser>) => {
    const current = monitored.get(userId);
    if (current) monitored.set(userId, { ...current, ...patch });
  };
  // Stash on the channel via a symbol-free property so app.ts can call it without
  // a wider interface leak. Kept off the public DiscordChannel surface.
  (channel as DiscordChannel & { _updateMonitored?: typeof updateMonitored })._updateMonitored = updateMonitored;

  const handleMessage = async (msg: DiscordMessage): Promise<void> => {
    trackUser(msg.userId, msg.username);
    try {
      const result = await callbacks.onMessage(msg);
      if (result.flagged) {
        // The host app owns the warning text + message deletion; here we just mark
        // the user as blocked in our monitored summary (for the status endpoint).
        const m = monitored.get(msg.userId);
        if (m) monitored.set(msg.userId, { ...m, blocked: true });
      }
    } catch (err) {
      log.warn('Discord message handler failed:', err instanceof Error ? err.message : err);
    }
  };

  const wire = (c: Client) => {
    client = c;
    c.on(Events.ClientReady, (readyClient) => {
      botTag = readyClient.user?.tag ?? null;
      // Pin the first guild the bot sees as "the monitored guild" for the status chip.
      const guild = readyClient.guilds.cache.first();
      guildName = guild?.name ?? null;
      log.info(`Discord bot ready as ${botTag ?? 'unknown'} in guild ${guildName ?? 'n/a'}`);
    });
    c.on(Events.MessageCreate, (msg: Message) => {
      if (stopped) return;
      const parsed = relevantMessage(msg);
      if (parsed) void handleMessage(parsed);
    });
    c.on(Events.Error, (err: Error) => log.warn('Discord client error:', err.message));
  };

  if (options.client) {
    // Test/injected path: caller controls login timing and message delivery.
    wire(options.client);
    return channel;
  }

  const realClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });
  wire(realClient);

  // discord.js manages its own reconnect/heartbeat; login just needs to not crash startup.
  realClient
    .login(token)
    .then(() => {
      if (!guildName) {
        // Some guilds arrive after ready via caching; pick up the name opportunistically.
        const guild = realClient.guilds.cache.first();
        guildName = guild?.name ?? null;
      }
    })
    .catch((err: unknown) => {
      log.warn('Discord login failed:', err instanceof Error ? err.message : err);
    });

  return channel;
}

/**
 * Applies a timeout (mute) to a guild member via the shared connected client.
 * Returns ok=false when no client / member not found / missing permissions — never throws.
 */
export async function timeoutMember(channel: DiscordChannel, target: DiscordTimeoutTarget): Promise<{ ok: boolean; error?: string }> {
  const client = channel.getClient();
  if (!client) return { ok: false, error: 'Discord client is not connected' };
  try {
    const guild = await client.guilds.fetch(target.guildId);
    const member = await guild.members.fetch(target.userId);
    const ms = Math.max(1, target.minutes) * 60_000;
    await member.timeout(ms, 'Flagged by ScamShield');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'timeout failed' };
  }
}

/**
 * Posts an alert to a Discord channel id or user DM via the shared connected client.
 * Returns ok=false when no client / destination not reachable — never throws.
 */
export async function sendDiscordAlert(channel: DiscordChannel, destination: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const client = channel.getClient();
  if (!client) return { ok: false, error: 'Discord client is not connected' };
  try {
    // Channel ids are numeric snowflakes; DMs route through the user channel.
    const ch = await client.channels.fetch(destination);
    if (ch && ch.isTextBased() && 'send' in ch && typeof ch.send === 'function') {
      await ch.send(text);
      return { ok: true };
    }
    // Not a channel — try as a user DM.
    const user = await client.users.fetch(destination);
    await user.send(text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' };
  }
}
