import type { Contact, NotifyOn, Settings, TelegramStatus } from '../../lib/api';
import { ContactsSection } from '../ContactsSection';

interface AlertsTabProps {
  settings: Settings;
  telegramStatus: TelegramStatus;
  onNotifyOnChange: (notifyOn: NotifyOn) => void;
  onContactsChange: (contacts: Contact[]) => void;
}

/** ALERTS tab — the pre-existing "Alert Trigger" control and family contacts, relocated
 * from the flat drawer unchanged. */
export function AlertsTab({ settings, telegramStatus, onNotifyOnChange, onContactsChange }: AlertsTabProps) {
  return (
    <>
      <section className="settings-section">
        <h3>Alert Trigger</h3>
        <div className="segmented" role="radiogroup" aria-label="Alert trigger">
          {(['takeover', 'coach'] as NotifyOn[]).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={settings.notifyOn === opt}
              className={`segmented-option ${settings.notifyOn === opt ? 'is-active' : ''}`}
              onClick={() => onNotifyOnChange(opt)}
            >
              {opt === 'takeover' ? 'On takeover (recommended)' : 'As soon as coaching starts'}
            </button>
          ))}
        </div>
      </section>

      <ContactsSection contacts={settings.contacts} telegramStatus={telegramStatus} onChange={onContactsChange} />
    </>
  );
}
