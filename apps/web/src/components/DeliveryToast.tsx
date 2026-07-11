import type { DeliveryChannel } from '../types';
import { CheckIcon, CrossIcon, MessageIcon, TelegramIcon } from './icons';

export interface DeliveryToastItem {
  id: number;
  contact: string;
  channel: DeliveryChannel;
  ok: boolean;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function channelLabel(channel: DeliveryChannel): string {
  return channel === 'telegram' ? 'Telegram' : 'iMessage';
}

/** OS-style notification toast for the most recent delivery receipt — mirrors
 * FamilyAlertToast's visual pattern but uses role="status" (a delivery
 * confirmation, not an emergency alert) so it never competes with the
 * existing role="alert" family-alert toast in tests or assistive tech. */
export function DeliveryToast({ toasts, onDismiss }: { toasts: DeliveryToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack toast-stack--delivery">
      {toasts.map((t) => (
        <div key={t.id} className={`phone-toast delivery-toast ${t.ok ? 'ok' : 'fail'}`} role="status">
          <div className="phone-toast-icon">
            {t.channel === 'telegram' ? <TelegramIcon width={16} height={16} /> : <MessageIcon width={16} height={16} />}
          </div>
          <div className="phone-toast-body">
            <div className="phone-toast-head">
              <span className="phone-toast-title">
                {t.ok ? <CheckIcon width={12} height={12} /> : <CrossIcon width={12} height={12} />}
                {t.ok ? 'Delivered' : 'Delivery failed'}
              </span>
              <span className="phone-toast-time">now · {timestamp()}</span>
            </div>
            <p>
              {t.ok
                ? `${t.contact} alerted via ${channelLabel(t.channel)}`
                : `${t.contact} — ${channelLabel(t.channel)} failed`}
            </p>
          </div>
          <button type="button" className="phone-toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
