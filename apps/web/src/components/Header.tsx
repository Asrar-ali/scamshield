import { Wordmark } from './Wordmark';
import { GearIcon } from './icons';
import type { ConnState } from '../hooks/useLiveSocket';

export type AiStatus = 'live' | 'degraded' | 'unconfigured';

interface HeaderProps {
  connState: ConnState;
  aiStatus: AiStatus | null;
  guildName: string | null;
  onOpenSettings: () => void;
}

const CONN_LABEL: Record<ConnState, string> = {
  connected: 'CONNECTED',
  reconnecting: 'RECONNECTING',
  offline: 'OFFLINE',
};

const AI_LABEL: Record<AiStatus, string> = {
  live: 'LIVE AI',
  degraded: 'OFFLINE AI',
  unconfigured: 'MOCK AI',
};

export function Header({ connState, aiStatus, guildName, onOpenSettings }: HeaderProps) {
  return (
    <header className="app-header">
      <Wordmark />
      <div className="header-status">
        {guildName && (
          <div className="call-state call-state-live">
            <span className="dot" />
            Monitoring {guildName}
          </div>
        )}
        <div className={`conn conn-${connState}`}>
          <span className="conn-dot" />
          {CONN_LABEL[connState]}
        </div>
        {aiStatus && (
          <div className={`ai-chip ai-chip-${aiStatus}`} title="Whether the analyst is powered by the live model">
            {AI_LABEL[aiStatus]}
          </div>
        )}
        <button type="button" className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <GearIcon width={16} height={16} />
        </button>
      </div>
    </header>
  );
}
