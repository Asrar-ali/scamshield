import { PhoneIcon } from './icons';

export interface AlertToast {
  id: number;
  text: string;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** OS-style notification toast for the "family alert" intervention. */
export function FamilyAlertToast({ toasts, onDismiss }: { toasts: AlertToast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="phone-toast" role="alert">
          <div className="phone-toast-icon">
            <PhoneIcon width={18} height={18} />
          </div>
          <div className="phone-toast-body">
            <div className="phone-toast-head">
              <span className="phone-toast-title">Family Alert</span>
              <span className="phone-toast-time">now · {timestamp()}</span>
            </div>
            <p>{t.text}</p>
          </div>
          <button type="button" className="phone-toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
