import { useState } from 'react';

interface AliasFormProps {
  busy: boolean;
  ended: boolean;
  onStart: (alias: string) => void;
}

export function AliasForm({ busy, ended, onStart }: AliasFormProps) {
  const [alias, setAlias] = useState('');

  return (
    <form
      className="alias-form"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(alias.trim());
      }}
    >
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Anonymous Scammer"
        disabled={busy}
        maxLength={40}
        aria-label="Scammer alias"
      />
      <button type="submit" className="primary" disabled={busy}>
        {busy ? '…' : ended ? 'Call again' : 'Start the call'}
      </button>
    </form>
  );
}
