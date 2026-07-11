export interface AlertToast {
  id: number;
  text: string;
}

interface FamilyAlertToastProps {
  toasts: AlertToast[];
  onDismiss: (id: number) => void;
}

/** Phone-notification-style toast stack for the "family alert" intervention. */
export function FamilyAlertToast({ toasts, onDismiss }: FamilyAlertToastProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="phone-toast" role="alert">
          <div className="phone-toast-icon">📵</div>
          <div className="phone-toast-body">
            <div className="phone-toast-title">Family Alert</div>
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
