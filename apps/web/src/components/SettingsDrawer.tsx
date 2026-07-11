import { useEffect, useRef, useState } from 'react';
import type { NotifyOn, Settings, TelegramStatus } from '../lib/api';
import { updateSettings } from '../lib/api';
import { ContactsSection } from './ContactsSection';
import { CheckIcon } from './icons';

const DEFAULT_SETTINGS: Settings = { protectedName: 'Rose', notifyOn: 'takeover', contacts: [] };
const SAVE_DEBOUNCE_MS = 600;
const SAVED_TICK_MS = 1800;
const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
const CLOSE_ANIMATION_MS = REDUCED_MOTION ? 0 : 260;

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  initialSettings: Settings | null;
  telegramStatus: TelegramStatus;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Right-side slide-over drawer. Stays mounted briefly after `open` goes false
 * so the CSS close transition can play, then unmounts — the animation itself
 * is pure CSS (transform/opacity transitions), this timer only controls when
 * the DOM node is removed. */
export function SettingsDrawer({ open, onClose, initialSettings, telegramStatus }: SettingsDrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [settings, setSettings] = useState<Settings>(initialSettings ?? DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const seeded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Adopt the server's settings the first time they arrive, without clobbering
  // in-flight local edits on later refreshes.
  useEffect(() => {
    if (!seeded.current && initialSettings) {
      setSettings(initialSettings);
      seeded.current = true;
    }
  }, [initialSettings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (tickTimer.current) clearTimeout(tickTimer.current);
    },
    [],
  );

  const persist = (next: Settings) => {
    setSettings(next);
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const result = await updateSettings(next);
        if (result) {
          setSettings(result);
          setSaveState('saved');
          if (tickTimer.current) clearTimeout(tickTimer.current);
          tickTimer.current = setTimeout(() => setSaveState('idle'), SAVED_TICK_MS);
        } else {
          // Server unreachable / feature not live yet — keep the optimistic
          // local value, just surface that it wasn't persisted.
          setSaveState('error');
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  };

  if (!mounted) return null;

  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`settings-drawer ${open ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-drawer-head">
          <h2>Settings</h2>
          <span className={`save-indicator save-indicator--${saveState}`}>
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && (
              <>
                <CheckIcon width={13} height={13} /> Saved
              </>
            )}
            {saveState === 'error' && 'Offline — not saved'}
          </span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Protected Person</h3>
            <input
              className="settings-input"
              value={settings.protectedName}
              onChange={(e) => persist({ ...settings, protectedName: e.target.value })}
              placeholder="Rose"
              aria-label="Protected person's name"
            />
          </section>

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
                  onClick={() => persist({ ...settings, notifyOn: opt })}
                >
                  {opt === 'takeover' ? 'On takeover (recommended)' : 'As soon as coaching starts'}
                </button>
              ))}
            </div>
          </section>

          <ContactsSection
            contacts={settings.contacts}
            telegramStatus={telegramStatus}
            onChange={(contacts) => persist({ ...settings, contacts })}
          />
        </div>
      </aside>
    </>
  );
}
