import { useEffect, useRef } from 'react';
import { AliasForm } from './AliasForm';
import { Composer } from './Composer';
import { RoseAvatar } from './RoseAvatar';

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
  connected: boolean;
  speaking: boolean;
  elapsed: string;
}

const ROLE_LABEL: Record<Line['role'], string> = {
  scammer: 'You',
  grandma: 'Rose',
  guardian: 'Guardian',
};

function SpeakingWave() {
  return (
    <span className="wave" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

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
  connected,
  speaking,
  elapsed,
}: TranscriptProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, turnBusy]);

  const activeSpeaking = live && speaking;

  return (
    <section className="panel call-panel">
      <div className="call-header">
        <RoseAvatar size={48} speaking={activeSpeaking} />
        <div className="call-id">
          <div className="call-name">
            Rose {activeSpeaking && <SpeakingWave />}
          </div>
          <div className="call-sub">78 · Ottawa · {ended ? 'call ended' : 'on the line'}</div>
        </div>
        <div className={`call-conn ${connected ? 'on' : 'off'}`}>
          <span className="conn-dot" />
          <span className="call-timer">{elapsed}</span>
        </div>
      </div>

      <div className="transcript-scroll" ref={transcriptRef}>
        {outcome === 'caught' && (
          <div className="stamp-banner">
            <span className="stamp">SCAMMER CAUGHT</span>
          </div>
        )}
        <div className="transcript">
          {lines.length === 0 && (
            <p className="empty transcript-empty">Start a session, then play the scammer. Try to trick Rose.</p>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`bubble bubble-${l.role}`} style={{ animationDelay: `${Math.min(i, 6) * 0.02}s` }}>
              <span className="who">{ROLE_LABEL[l.role]}</span>
              <p>{l.text}</p>
            </div>
          ))}
          {live && turnBusy && (
            <div className="typing" aria-label="Rose is thinking">
              <span className="typing-who">Rose is thinking</span>
              <span className="typing-dots"><i /><i /><i /></span>
            </div>
          )}
        </div>
      </div>

      {!sessionActive || ended ? (
        <div className="call-footer">
          {ended && (
            <div className={`end-summary end-summary--${outcome ?? 'done'}`}>
              <span className="end-title">
                {outcome === 'caught'
                  ? 'Guardian seized the call'
                  : outcome === 'gave_up'
                    ? 'You hung up'
                    : 'Call ended'}
              </span>
              <span className="end-sub">
                {outcome === 'caught'
                  ? 'Rose is safe. The family has been alerted.'
                  : 'Rose is safe. Start a new call to try again.'}
              </span>
            </div>
          )}
          <AliasForm busy={startBusy} ended={ended} onStart={onStart} variant="inline" />
        </div>
      ) : (
        <Composer
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onGiveUp={onGiveUp}
          disabled={ended}
          busy={turnBusy}
          showSuggestions={lines.length === 0}
        />
      )}
    </section>
  );
}
