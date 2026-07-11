# Architecture

## System overview

```
 Scammer (judge)
      │  voice (ElevenLabs Agents)  /  text (fallback mode, ships first)
      ▼
┌─────────────┐   transcript events    ┌──────────────┐
│   GRANDMA    │ ─────────────────────▶ │   ANALYST    │  Gemini: classifies manipulation
│ ElevenLabs   │                        │    agent     │  tactics per utterance, streams
│ conv. agent  │ ◀───────────────────── │  + risk score│  telemetry to dashboard
└─────────────┘   guardian override     └──────┬───────┘
                                               │ risk > threshold
                                        ┌──────▼───────┐
                                        │  GUARDIAN    │  Gemini: intervenes — coaches
                                        │    agent     │  grandma / seizes conversation /
                                        └──────┬───────┘  "family alert"
                                               │
                    WebSocket broadcast        ▼
                 ┌───────────────────────────────────┐
                 │            DASHBOARD (web)         │
                 │ transcript · tactic cards ignite ·│
                 │ risk gauge · intervention log     │
                 └───────────────────────────────────┘

 MongoDB Atlas: sessions, per-utterance tactic telemetry, leaderboard of "scam attempts survived"
 DigitalOcean: hosts server + dashboard
```

## Agent roles (the Best-AI-Hack story: three coordinated agents)

1. **Grandma** — the persona under attack. Voice: ElevenLabs conversational agent. Deliberately trusting but not stupid; her system prompt gives her a life story so improvising judges get natural responses.
2. **Analyst** — runs in parallel on every utterance. Classifies against the tactic taxonomy (see `apps/server/src/prompts/`), emits `{tactic, confidence, evidence-quote}` events, maintains a cumulative risk score. Never speaks.
3. **Guardian** — armed by the analyst's risk score. At threshold: injects coaching into grandma's context ("this caller is pressuring you — real agencies never do"), and at high threshold takes over the call and confronts the scammer + fires a family alert. The audible takeover is the demo climax.

## Voice pipeline decision (OPEN — 1-hour spike gate)

- **Option A (recommended): ElevenLabs Agents** platform runs the whole voice loop (STT, turn-taking, TTS). Requires proving in a 1-hour spike: (1) real-time transcript events consumable by the analyst, (2) mid-session behavior change for guardian intervention (contextual updates / system-prompt override on a live session).
- **Option B (fallback): hand-rolled turn-based** — push-to-talk: STT → Gemini-as-grandma → ElevenLabs TTS. Fully controllable, honest turn boundaries, less magical.
- **Mode 0 (ships FIRST regardless): text chat** — scammer types, grandma replies in text, full analyst/guardian/dashboard loop works. This is the complete-product fallback and the dev harness for everyone else.

Decision recorded in DECISIONS.md once the spike lands.

## Data flow contract (agree on this before splitting up)

All components communicate through one WebSocket event stream (server = hub). Event types:

```ts
type Event =
  | { type: 'utterance'; role: 'scammer' | 'grandma' | 'guardian'; text: string; ts: number }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number }                       // 0..100 cumulative
  | { type: 'intervention'; level: 'coach' | 'takeover' | 'alert'; text: string; ts: number }
  | { type: 'session'; state: 'start' | 'end'; id: string; ts: number }
```

Dashboard is a pure consumer of this stream → it can be built 100% against mock mode.

## Tech → prize mapping (every integration load-bearing)

| Tech | Role | Prize |
|---|---|---|
| ElevenLabs | grandma's voice / conversational agent | Best Use of ElevenLabs |
| Gemini | analyst + guardian | Best AI Hack |
| MongoDB Atlas | session + tactic telemetry, attempts leaderboard | Best Use of MongoDB Atlas |
| DigitalOcean | hosting | Best Use of DigitalOcean |
