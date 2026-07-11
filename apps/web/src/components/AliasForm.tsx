import { useState } from 'react';
import { PhoneIcon } from './icons';

interface AliasFormProps {
  busy: boolean;
  ended: boolean;
  onStart: (alias: string) => void;
  /** 'hero' = big landing CTA; 'inline' = compact end-of-call footer. */
  variant?: 'hero' | 'inline';
}

export function AliasForm({ busy, ended, onStart, variant = 'inline' }: AliasFormProps) {
  const [alias, setAlias] = useState('');

  return (
    <form
      className={`alias-form alias-form--${variant}`}
      onSubmit={(e) => {
        e.preventDefault();
        onStart(alias.trim());
      }}
    >
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Your scammer alias"
        disabled={busy}
        maxLength={40}
        aria-label="Scammer alias"
      />
      <button
        type="submit"
        className="btn-call"
        // Keep an explicit accessible name on the idle CTA so it reads "start the
        // call" while the visible label stays the friendlier "Call Rose".
        aria-label={ended ? undefined : 'Call Rose, start the call'}
        disabled={busy}
      >
        {busy ? (
          <span className="btn-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        ) : ended ? (
          'Call again'
        ) : (
          <>
            <PhoneIcon width={18} height={18} />
            Call Rose
          </>
        )}
      </button>
    </form>
  );
}
