import type { ChangeEvent } from 'react';
import type { Persona } from '../../lib/api';

interface PersonaEditorProps {
  persona: Persona;
  onChange: (persona: Persona) => void;
}

/** Composes the persona fields into the one-line story preview, e.g.
 * "Rose, 78, Ottawa — grandkid Tyler — gardening, a cat named Muffin." */
function personaLine(p: Persona): string {
  const age = p.age > 0 ? String(p.age) : '';
  const head = [p.name.trim(), age, p.city.trim()].filter(Boolean).join(', ');
  const grandkid = p.grandkid.trim() ? `grandkid ${p.grandkid.trim()}` : '';
  const quirks = p.quirks.trim();
  const segments = [head, grandkid, quirks].filter(Boolean);
  return segments.length > 0 ? segments.join(' — ') : 'Fill in the fields above to preview the persona.';
}

export function PersonaEditor({ persona, onChange }: PersonaEditorProps) {
  const set =
    (field: 'name' | 'city' | 'grandkid' | 'quirks') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
      onChange({ ...persona, [field]: e.target.value });

  const setAge = (e: ChangeEvent<HTMLInputElement>): void => {
    const parsed = Number.parseInt(e.target.value, 10);
    // Keep the previous age rather than snapping to 0 while the field is transiently empty
    // (e.g. the user selecting-all to retype) — the server rejects out-of-range ages anyway.
    onChange({ ...persona, age: Number.isNaN(parsed) ? persona.age : parsed });
  };

  return (
    <section className="settings-section">
      <h3>Persona</h3>
      <div className="persona-grid">
        <input className="settings-input" value={persona.name} onChange={set('name')} placeholder="Name" aria-label="Persona name" />
        <input
          className="settings-input"
          type="number"
          min={1}
          max={120}
          value={persona.age}
          onChange={setAge}
          placeholder="Age"
          aria-label="Persona age"
        />
        <input
          className="settings-input persona-field-full"
          value={persona.city}
          onChange={set('city')}
          placeholder="City"
          aria-label="Persona city"
        />
        <input
          className="settings-input persona-field-full"
          value={persona.grandkid}
          onChange={set('grandkid')}
          placeholder="Grandkid's name"
          aria-label="Grandkid's name"
        />
        <textarea
          className="persona-textarea persona-field-full"
          value={persona.quirks}
          onChange={set('quirks')}
          placeholder="Personality & quirks"
          aria-label="Personality and quirks"
          rows={3}
        />
      </div>
      <p className="persona-preview">{personaLine(persona)}</p>
    </section>
  );
}
