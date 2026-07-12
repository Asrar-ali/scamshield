import type { DiscordStatus } from '../lib/api';
import { DiscordIcon } from './icons';

/** Landing-hero chip: only renders when the server reports a connected Discord
 * bot. Shows the monitored guild and how many members are currently being
 * watched, so the demo audience can see ScamShield is live in the server.
 * Any 404/disabled/failure upstream already collapses to
 * { enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] }
 * (see lib/api.fetchDiscordStatus), so this component just needs one guard to
 * render nothing instead of a broken empty box. Reuses the telegram-panel CSS
 * classes so it picks up the existing landing-hero styling. */
export function DiscordPanel({ status }: { status: DiscordStatus }) {
  if (!status.enabled || !status.botTag) return null;
  const monitoredCount = status.recentUsers.length;

  return (
    <div className="discord-panel telegram-panel">
      <span className="telegram-panel-eyebrow">
        <DiscordIcon width={14} height={14} />
        ScamShield is monitoring your Discord
      </span>
      <span className="telegram-panel-handle">{status.guildName ?? 'your server'}</span>
      <span className="telegram-panel-link">
        {monitoredCount > 0
          ? `${monitoredCount} member${monitoredCount === 1 ? '' : 's'} watched`
          : 'watching for scammers…'}
      </span>
    </div>
  );
}
