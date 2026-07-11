import { useEffect, useState } from 'react';
import { fetchModels, type ModelsResponse } from '../../lib/api';

interface ModelPickerProps {
  selected: string;
  onSelect: (modelId: string) => void;
}

type LoadState = 'loading' | 'ready' | 'unavailable';

/** Radio-card list sourced from GET /api/models. The accent-highlighted card follows the
 * user's selection (settings.model); the small "active" tag marks whichever model the
 * server is actually running right now — the two can differ when a fallback kicked in. */
export function ModelPicker({ selected, onSelect }: ModelPickerProps) {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    void fetchModels().then((res) => {
      if (cancelled) return;
      if (res && Array.isArray(res.models)) {
        setData(res);
        setState('ready');
      } else {
        setState('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="settings-section">
      <h3>Model</h3>
      {state === 'loading' && <p className="settings-hint">Loading models…</p>}
      {state === 'unavailable' && <p className="settings-unavailable">Model list unavailable.</p>}
      {state === 'ready' && data && data.models.length === 0 && (
        <p className="settings-unavailable">No models configured.</p>
      )}
      {state === 'ready' && data && data.models.length > 0 && (
        <div className="model-list" role="radiogroup" aria-label="Model">
          {data.models.map((model) => {
            const isSelected = selected ? selected === model.id : model.id === data.active;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`model-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelect(model.id)}
              >
                <span className="model-card-info">
                  <span className="model-card-label">{model.label}</span>
                  <span className="model-card-id">{model.id}</span>
                </span>
                <span className="model-card-tags">
                  <span className="model-tag">{model.source}</span>
                  {model.id === data.active && <span className="model-tag model-tag--active">active</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
