// Normalizes a session — whether live (App state) or replayed (fetched events)
// — into one AutopsyData shape the Autopsy component renders. Keeping the two
// sources behind a single builder means the forensic report is byte-identical
// live and in replay.

import { RISK_FLAG_THRESHOLD, type Event, type TacticId } from '../types';

export interface RiskSample {
  score: number;
  ts: number;
}

export interface TacticMarker {
  tactic: TacticId;
  ts: number;
}

export interface TacticLedgerRow {
  tactic: TacticId;
  count: number;
  evidence: string[];
}

export interface InterventionMoment {
  level: 'flag';
  ts: number;
}

export interface AutopsyData {
  alias: string;
  outcome: 'caught' | 'gave_up';
  durationMs: number;
  turns: number;
  peakRisk: number;
  startTs: number;
  endTs: number;
  riskSamples: RiskSample[];
  tacticMarkers: TacticMarker[];
  ledger: TacticLedgerRow[];
  interventions: InterventionMoment[];
  thresholds: { flag: number };
}

const MAX_EVIDENCE_PER_TACTIC = 3;

/** Aggregate per-detection tactic hits into a deduped ledger, first-seen order. */
function toLedger(hits: { tactic: TacticId; evidence: string }[]): TacticLedgerRow[] {
  const rows: TacticLedgerRow[] = [];
  const index = new Map<TacticId, TacticLedgerRow>();
  for (const hit of hits) {
    let row = index.get(hit.tactic);
    if (!row) {
      row = { tactic: hit.tactic, count: 0, evidence: [] };
      index.set(hit.tactic, row);
      rows.push(row);
    }
    row.count += 1;
    const quote = hit.evidence?.trim();
    if (quote && !row.evidence.includes(quote) && row.evidence.length < MAX_EVIDENCE_PER_TACTIC) {
      row.evidence.push(quote);
    }
  }
  return rows;
}

function withBaseline(samples: RiskSample[], startTs: number): RiskSample[] {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0 || sorted[0].ts > startTs) {
    return [{ score: 0, ts: startTs }, ...sorted];
  }
  return sorted;
}

export interface LiveAutopsyInput {
  alias: string;
  outcome: 'caught' | 'gave_up';
  startTs: number;
  endTs: number;
  turns: number;
  riskSamples: RiskSample[];
  hits: { tactic: TacticId; evidence: string; ts: number }[];
  interventions: { level: 'flag'; ts: number }[];
}

/** Build from live App state captured over the WebSocket stream. */
export function buildAutopsyFromLive(input: LiveAutopsyInput): AutopsyData {
  const chronoHits = [...input.hits].sort((a, b) => a.ts - b.ts);
  const riskSamples = withBaseline(input.riskSamples, input.startTs);
  const peakRisk = riskSamples.reduce((max, s) => Math.max(max, s.score), 0);
  return {
    alias: input.alias,
    outcome: input.outcome,
    durationMs: Math.max(0, input.endTs - input.startTs),
    turns: input.turns,
    peakRisk,
    startTs: input.startTs,
    endTs: input.endTs,
    riskSamples,
    tacticMarkers: chronoHits.map((h) => ({ tactic: h.tactic, ts: h.ts })),
    ledger: toLedger(chronoHits),
    interventions: [...input.interventions].sort((a, b) => a.ts - b.ts),
    thresholds: { flag: RISK_FLAG_THRESHOLD },
  };
}

/**
 * Build from a replayed event stream. Handles sparse/legacy sessions: any
 * missing signal (no risk events, no interventions) simply yields an empty
 * slice rather than throwing. Returns null when the stream has no usable events.
 */
export function buildAutopsyFromEvents(events: Event[], fallbackAlias: string): AutopsyData | null {
  if (events.length === 0) return null;
  const ordered = [...events].sort((a, b) => a.ts - b.ts);

  const startEvent = ordered.find((e) => e.type === 'session' && e.state === 'start');
  const endEvent = [...ordered].reverse().find((e) => e.type === 'session' && e.state === 'end');
  const startTs = startEvent?.ts ?? ordered[0].ts;
  const endTs = endEvent?.ts ?? ordered[ordered.length - 1].ts;
  const alias = (startEvent && startEvent.type === 'session' && startEvent.alias) || fallbackAlias;

  const hits = ordered
    .filter((e): e is Extract<Event, { type: 'tactic' }> => e.type === 'tactic')
    .map((e) => ({ tactic: e.tactic, evidence: e.evidence, ts: e.ts }));
  const riskSamples = withBaseline(
    ordered
      .filter((e): e is Extract<Event, { type: 'risk' }> => e.type === 'risk')
      .map((e) => ({ score: e.score, ts: e.ts })),
    startTs,
  );
  const interventions = ordered
    .filter((e): e is Extract<Event, { type: 'intervention' }> => e.type === 'intervention')
    .map((e) => ({ level: e.level, ts: e.ts }));
  const turns = ordered.filter((e) => e.type === 'utterance' && e.role === 'scammer').length;
  const caught = interventions.length > 0;

  return {
    alias,
    outcome: caught ? 'caught' : 'gave_up',
    durationMs: Math.max(0, endTs - startTs),
    turns,
    peakRisk: riskSamples.reduce((max, s) => Math.max(max, s.score), 0),
    startTs,
    endTs,
    riskSamples,
    tacticMarkers: hits.map((h) => ({ tactic: h.tactic, ts: h.ts })),
    ledger: toLedger(hits),
    interventions,
    thresholds: { flag: RISK_FLAG_THRESHOLD },
  };
}
