import type { DeliveryChannel } from '../types';
import { CheckIcon, CrossIcon, MessageIcon, SirenIcon, TelegramIcon, WhisperIcon } from './icons';

export interface Intervention {
  kind: 'intervention';
  level: 'coach' | 'takeover' | 'alert';
  text: string;
  ts: number;
}

export interface DeliveryReceipt {
  kind: 'delivery';
  contact: string;
  channel: DeliveryChannel;
  ok: boolean;
  ts: number;
}

export type FeedItem = Intervention | DeliveryReceipt;

interface InterventionsPanelProps {
  items: FeedItem[];
}

const LEVEL_LABEL: Record<Intervention['level'], string> = {
  coach: 'Coaching whisper',
  takeover: 'Guardian takeover',
  alert: 'Family alert',
};

function channelLabel(channel: DeliveryChannel): string {
  return channel === 'telegram' ? 'Telegram' : 'iMessage';
}

function ChannelGlyph({ channel }: { channel: DeliveryChannel }) {
  return channel === 'telegram' ? (
    <TelegramIcon width={13} height={13} />
  ) : (
    <MessageIcon width={13} height={13} />
  );
}

export function InterventionsPanel({ items }: InterventionsPanelProps) {
  return (
    <div className="panel guardian-panel">
      <div className="panel-head">
        <h2>Guardian Interventions</h2>
      </div>
      <div className="interventions">
        {items.length === 0 && (
          <p className="empty guardian-empty">
            <span className="guardian-eye" aria-hidden="true" />
            Guardian is watching silently.
          </p>
        )}
        {items.map((item, i) =>
          item.kind === 'delivery' ? (
            <div key={i} className={`delivery-receipt ${item.ok ? 'ok' : 'fail'}`}>
              <span className="dr-icon" aria-hidden="true">
                {item.ok ? <CheckIcon width={14} height={14} /> : <CrossIcon width={14} height={14} />}
              </span>
              <ChannelGlyph channel={item.channel} />
              <span className="dr-text">
                {item.ok
                  ? `${item.contact} alerted via ${channelLabel(item.channel)}`
                  : `${item.contact} — ${channelLabel(item.channel)} failed`}
              </span>
            </div>
          ) : (
            <div key={i} className={`intervention ${item.level}`}>
              <span className="iv-icon" aria-hidden="true">
                {item.level === 'coach' ? <WhisperIcon width={16} height={16} /> : <SirenIcon width={16} height={16} />}
              </span>
              <div className="iv-body">
                <span className="level">{LEVEL_LABEL[item.level]}</span>
                <p>{item.text}</p>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
