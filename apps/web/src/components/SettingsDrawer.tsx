import { useEffect, useRef, useState } from 'react';
import type { Contact, NotifyOn, Persona, Sensitivity, Settings, TelegramStatus, TtsRole } from '../lib/api';
import { fetchSettings, updateSettings } from '../lib/api';
import { ProtectionTab } from './settings/ProtectionTab';
import { AITab } from './settings/AITab';
import { AlertsTab } from './settings/AlertsTab';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings/defaults';
import { CheckIcon } from './icons';

const SAVE_DEBOUNCE_MS = 600;
const SAVED_TICK_MS = 1800;
const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
const CLOSE_ANIMATION_MS = REDUCED_MOTION ? 0 : 260;

type TabId = 'protection' | 'ai' | 'alerts';
const TABS: { id: TabId; label: string }[] = [
  { id: 'protection', label: 'Protection' },
  { id: 'ai', label: 'AI' },
  { id: 'alerts', label: 'Alerts' },
];

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
 * the DOM node is removed. Three tabs (Protection / AI / Alerts) share one
 * debounced-save pipeline against PUT /api/settings. */
export function SettingsDrawer({ open, onClose, initialSettings, telegramStatus }: SettingsDrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [settings, setSettings] = useState<Settings>(normalizeSettings(initialSettings, DEFAULT_SETTINGS));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<TabId>('protection');
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
      setSettings((prev) => normalizeSettings(initialSettings, prev));
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

  const persist = (next: Settings, afterSave?: () => void) => {
    setSettings(next);
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const result = await updateSettings(next);
        if (result) {
          // Merge over `next` (not the shipped default) so fields the server doesn't yet
          // echo back — model/voices/sensitivity/persona while that contract lands — aren't
          // wiped out on every save.
          setSettings(normalizeSettings(result, next));
          setSaveState('saved');
          if (tickTimer.current) clearTimeout(tickTimer.current);
          tickTimer.current = setTimeout(() => setSaveState('idle'), SAVED_TICK_MS);
          if (afterSave) afterSave();
        } else {
          // Server unreachable / feature not live yet — keep the optimistic
          // local value, just surface that it wasn't persisted.
          setSaveState('error');
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  };

  const onPersonaChange = (persona: Persona) => {
    // The persona's name IS the protected person's name — keep protectedName (used
    // server-side for alerts) in sync instead of showing a second, redundant field.
    persist({ ...settings, persona, protectedName: persona.name.trim() || settings.protectedName });
  };

  const onSensitivityChange = (sensitivity: Sensitivity) => {
    // The PUT response doesn't echo `thresholds` back (it's read-only/server-computed), so
    // follow up with a plain GET to pick up the real cutoffs for the newly active level.
    persist({ ...settings, sensitivity }, () => {
      void fetchSettings().then((fresh) => {
        if (fresh && typeof fresh.thresholds?.coach === 'number' && typeof fresh.thresholds?.takeover === 'number') {
          setSettings((prev) => ({ ...prev, thresholds: fresh.thresholds }));
        }
      });
    });
  };
  const onModelChange = (model: string) => persist({ ...settings, model });
  const onVoiceChange = (role: TtsRole, voiceId: string) => persist({ ...settings, voices: { ...settings.voices, [role]: voiceId } });
  const onNotifyOnChange = (notifyOn: NotifyOn) => persist({ ...settings, notifyOn });
  const onContactsChange = (contacts: Contact[]) => persist({ ...settings, contacts });

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === tab);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(idx + dir + TABS.length) % TABS.length];
    setTab(next.id);
  };

  if (!mounted) return null;

  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        className={`settings-drawer settings-drawer--tabbed ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
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

        <div className="settings-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              className={`settings-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          <div
            className="settings-tab-panel"
            role="tabpanel"
            id="settings-panel-protection"
            aria-labelledby="settings-tab-protection"
            hidden={tab !== 'protection'}
          >
            <ProtectionTab settings={settings} onPersonaChange={onPersonaChange} onSensitivityChange={onSensitivityChange} />
          </div>

          <div
            className="settings-tab-panel"
            role="tabpanel"
            id="settings-panel-ai"
            aria-labelledby="settings-tab-ai"
            hidden={tab !== 'ai'}
          >
            <AITab settings={settings} onModelChange={onModelChange} onVoiceChange={onVoiceChange} />
          </div>

          <div
            className="settings-tab-panel"
            role="tabpanel"
            id="settings-panel-alerts"
            aria-labelledby="settings-tab-alerts"
            hidden={tab !== 'alerts'}
          >
            <AlertsTab
              settings={settings}
              telegramStatus={telegramStatus}
              onNotifyOnChange={onNotifyOnChange}
              onContactsChange={onContactsChange}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
