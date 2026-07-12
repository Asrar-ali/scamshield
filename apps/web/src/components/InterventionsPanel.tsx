import type { DeliveryChannel, FlagAction } from '../types';
import { CheckIcon, CrossIcon, DiscordIcon, MessageIcon, ShieldIcon, TrashIcon, VolumeOffIcon, AlertIcon } from './icons';

export interface Intervention {
  kind: 'intervention';
  level: 'flag';
  text: string;
  ts: number;
}

export interface ActionEntry {
  kind: 'action';
  action: FlagAction;
  userId: string;
  detail?: string;
  ts: number;
}

export interface DeliveryReceipt {
  kind: 'delivery';
  contact: string;
  channel: DeliveryChannel;
  ok: boolean;
  ts: number;
}

export type FeedItem = Intervention | ActionEntry | DeliveryReceipt;

interface InterventionsPanelProps {
  items: FeedItem[];
}

const ACTION_LABEL: Record<FlagAction, string> = {
  deleted: 'Message deleted',
  warned: 'Warning posted',
  muted: 'User muted',
  reported: 'Reported to mods',
};

function ActionGlyph({ action }: { action: FlagAction }) {
  switch (action) {
    case 'deleted':
      return <TrashIcon width={14} height={14} />;
    case 'warned':
      return <AlertIcon width={14} height={14} />;
    case 'muted':
      return <VolumeOffIcon width={14} height={14} />;
    case 'reported':
      return <ShieldIcon width={14} height={14} />;
  }
}

function channelLabel(channel: DeliveryChannel): string {
  return channel === 'discord' ? 'Discord' : 'iMessage';
}

function ChannelGlyph({ channel }: { channel: DeliveryChannel }) {
  return channel === 'discord' ? <DiscordIcon width={13} height={13} /> : <MessageIcon width={13} height={13} />;
}

/** Actions feed — the running log of everything ScamShield did in response to a
 * flagged message: the flag itself, the delete, the warning, the mute, the
 * report, and any delivery receipts. */
export function InterventionsPanel({ items }: InterventionsPanelProps) {
  return (
    <div className="panel guardian-panel">
      <div className="panel-head">
        <h2>ScamShield Actions</h2>
      </div>
      <div className="interventions">
        {items.length === 0 && (
          <p className="empty guardian-empty">
            <span className="guardian-eye" aria-hidden="true" />
            Monitoring — no action taken yet.
          </p>
        )}
        {items.map((item, i) => {
          if (item.kind === 'action') {
            return (
              <div key={i} className="intervention flag">
                <span className="iv-icon" aria-hidden="true">
                  <ActionGlyph action={item.action} />
                </span>
                <div className="iv-body">
                  <span className="level">{ACTION_LABEL[item.action]}</span>
                  <p>{item.detail ?? item.userId}</p>
                </div>
              </div>
            );
          }
          if (item.kind === 'delivery') {
            return (
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
            );
          }
          // intervention: flag
          return (
            <div key={i} className="intervention flag">
              <span className="iv-icon" aria-hidden="true">
                <AlertIcon width={16} height={16} />
              </span>
              <div className="iv-body">
                <span className="level">Flag raised</span>
                <p>{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
