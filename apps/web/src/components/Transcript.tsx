import { useEffect, useRef } from 'react';
import { AliasForm } from './AliasForm';
import { Composer } from './Composer';
import { ListeningPulse } from './ListeningPulse';

export interface Line {
  role: 'scammer' | 'grandma' | 'guardian';
  text: string;
  ts: number;
}

export type Outcome = 'caught' | 'gave_up' | null;

interface TranscriptProps {
  lines: Line[];
  live: boolean;
  ended: boolean;
  outcome: Outcome;
  sessionActive: boolean;
  startBusy: boolean;
  onStart: (alias: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (text?: string) => void;
  onGiveUp: () => void;
  turnBusy: boolean;
}

const ROLE_LABEL: Record<Line['role'], string> = {
  scammer: 'YOU (scammer)',
  grandma: 'ROSE',
  guardian: 'GUARDIAN',
};

export function Transcript({
  lines,
  live,
  ended,
  outcome,
  sessionActive,
  startBusy,
  onStart,
  input,
  onInputChange,
  onSubmit,
  onGiveUp,
  turnBusy,
}: TranscriptProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  return (
    <section className="panel transcript-panel">
      <div className="transcript-head">
        <h2>Call Transcript</h2>
        {live && <ListeningPulse />}
      </div>

      <div className="transcript-scroll" ref={transcriptRef}>
        {outcome === 'caught' && (
          <div className="stamp-banner">
            <span className="stamp">SCAMMER CAUGHT</span>
          </div>
        )}
        <div className="transcript">
          {lines.length === 0 && <p className="empty">Start a session, then play the scammer. Try to trick Rose.</p>}
          {lines.map((l, i) => (
            <div key={i} className={`bubble bubble-${l.role}`}>
              <span className="who">{ROLE_LABEL[l.role]}</span>
              <p>{l.text}</p>
            </div>
          ))}
        </div>
      </div>

      {!sessionActive || ended ? (
        <AliasForm busy={startBusy} ended={ended} onStart={onStart} />
      ) : (
        <Composer
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onGiveUp={onGiveUp}
          disabled={ended}
          busy={turnBusy}
        />
      )}
    </section>
  );
}
