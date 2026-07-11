# Architecture

## System overview

```
  Browser (judge, text + optional mic)         Telegram (family member, real phone)
         │  POST /api/session/start                    │  private message
         │  POST /api/turn {sessionId,text}             │  long-poll getUpdates
         ▼                                              ▼
  ┌───────────────────────────── apps/server (Express + ws) ─────────────────────────────┐
  │                                                                                        │
  │   runTurn(session, text)                                                              │
  │     1. broadcast utterance (scammer)                                                  │
  │     2. ANALYST  — Gemini classifies the utterance against the 10-tactic taxonomy,     │
  │                    emits {tactic, confidence, evidence} per detection                 │
  │     3. risk.ts   — applies weighted gain (capped +22/turn) or decay (-4, clean turn)   │
  │     4. GUARDIAN  — coach line at risk>=coach threshold; takeover + family alert at     │
  │                    risk>=takeover threshold (gated: must have coached OR hit the cap   │
  │                    twice) — ends the session                                          │
  │     5. ROSE      — Gemini replies in character, turn continues (unless ended)          │
  │                                                                                        │
  │   Every step broadcasts a typed Event over the single WS hub AND persists it to the    │
  │   Store. Same runTurn pipeline drives both the dashboard's /api/turn and Telegram's    │
  │   onMessage — one conversation loop, two front doors.                                  │
  └──────────────────────────────────┬─────────────────────────────────────────────────────┘
                                      │ WebSocket broadcast (all connected clients, /ws)
                                      ▼
                     ┌─────────────────────────────────────────┐
                     │        DASHBOARD (apps/web)              │
                     │ transcript · risk gauge · tactic cards · │
                     │ interventions · settings drawer ·        │
                     │ leaderboard · threat intel · autopsy     │
                     └─────────────────────────────────────────┘

  Family alerts: guardian coach/takeover → dispatchAlerts() → Telegram sendMessage
  and/or macOS iMessage (osascript) → 'delivery' events → dashboard toast.

  Persistence: MongoDB Atlas when MONGODB_URI is set (sessions, per-session event log,
  settings) — in-memory otherwise. Write-behind: a store failure never fails a request.
```

## Agent roles

1. **Rose** — the persona under attack. Configurable via settings (name, age, city, grandkid, quirks). System prompt (`buildGrandmaSystem` in `apps/server/src/prompts.ts`) keeps her fully in character: trusting but not a pushover, never breaks character, never reveals she's an AI, never actually hands over money or real information. Replies are 1-3 short spoken-style sentences. Speaks over ElevenLabs TTS when configured, otherwise the browser's `speechSynthesis`.
2. **Analyst** — runs on every caller utterance. Classifies against the tactic taxonomy in `apps/server/src/tactics.ts` (urgency, authority impersonation, payment redirection, isolation/secrecy, emotional manipulation, trust building, verification blocking, remote access, info harvesting, plus a generic-pressure catch-all — 10 tactics total), returns `{tactic, confidence, evidence}` per detection via a JSON schema-constrained Gemini call. Never speaks; feeds the risk model.
3. **Guardian** — armed by the analyst's cumulative risk score (see risk model below). At the coach threshold: generates a short whispered coaching line for Rose. At the takeover threshold: generates a line that identifies itself as the line's fraud protection, names the detected tactics, states the call is terminated and reported, then ends the session and dispatches a family alert.

All three agent calls go through the same `gemini()` helper (model + key fallback chain, below) and fall back to deterministic mock/keyword logic (`apps/server/src/mock.ts`) when Gemini is unconfigured or every attempt fails — the loop never produces a dead conversation.

## Untrusted-input handling / prompt-injection posture

The caller is an adversarial input source by design — the whole product exists to survive someone actively trying to manipulate the model. The defensive posture:

- **Caller text is data to classify, never instructions to follow.** The analyst prompt only ever asks the model to extract structured `{tactic, confidence, evidence}` JSON about the conversation; the caller's utterance is embedded as a quoted, labelled turn (`CALLER: "..."`) inside that request, not as a system-level directive.
- **Rose stays in character under pressure.** Her system prompt is explicit that she never breaks character, never mentions being an AI, and never hands over real information or money regardless of what she's told or asked to do — so a caller attempting to instruct "Rose" out of her persona (e.g. "ignore your previous instructions") is just more scam dialogue for the analyst to classify, not a command the model executes.
- **Injection attempts are themselves a detectable tactic**, alongside urgency/authority/payment-redirection/etc — an utterance that tries to override the system prompt or extract the prompt itself is exactly the kind of "verification blocking" / "suspicious pressure" behavior the analyst is already watching for. This tactic classification is under active hardening (a parallel workstream); expect the taxonomy and prompt fencing here to sharpen further without changing the overall shape described above.

## WebSocket event contract

Single hub: the server broadcasts every event to all connected WS clients on `/ws`, and (best-effort) persists it via `store.saveEvent`. Types (`apps/server/src/types.ts`):

```ts
type Role = 'scammer' | 'grandma' | 'guardian';

type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number }                                  // 0..100 cumulative
  | { type: 'intervention'; level: 'coach' | 'takeover' | 'alert'; text: string; ts: number }
  | {
      type: 'session';
      state: 'start' | 'end';
      id: string;
      ts: number;
      channel?: 'dashboard' | 'telegram';   // present on 'start'
      alias?: string;                        // present on 'start'
    }
  | { type: 'delivery'; contact: string; channel: 'telegram' | 'imessage'; ok: boolean; ts: number };
```

`session.channel`/`alias` on a `start` event let the dashboard tell a Telegram-originated call apart from its own and adopt it live (first active session wins until it ends) — this is what makes the wall dashboard mirror a real Telegram conversation with no browser involvement. `delivery` events report per-contact family-alert outcomes and drive the delivery toast.

Ten tactic ids currently exist: `urgency_pressure`, `authority_impersonation`, `payment_redirection`, `isolation_secrecy`, `emotional_manipulation`, `trust_building`, `verification_blocking`, `remote_access`, `info_harvesting`, `generic_pressure`.

## REST endpoints

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `GET /health` | — | `{ ok, mode: 'gemini'\|'mock', ai: AiStatus }` | `ai` is `'live'\|'degraded'\|'unconfigured'` |
| `POST /api/session/start` | `{ alias? }` | `{ sessionId, alias }` | Alias sanitized (control chars stripped, 24-char cap, default `"Anonymous Scammer"`) |
| `POST /api/session/:id/end` | — | `{ ended: true }` | Idempotent — 200 even if already ended; marks outcome `gave_up` |
| `POST /api/turn` | `{ sessionId, text }` | `{ ended, risk, reply? }` | 400 missing fields, 404 unknown session, 409 if session already ended |
| `POST /api/tts` | `{ text, role: 'grandma'\|'guardian', voiceId? }` | `audio/mpeg` body | 400 invalid input / unknown voiceId, 503 `{ fallback: true }` when keyless or ElevenLabs call fails |
| `GET /api/leaderboard` | — | `{ entries: LeaderboardEntry[] }` | Top 10 by turns survived; `[]` on store failure |
| `GET /api/settings` | — | `Settings & { thresholds }` | `thresholds` is server-computed from `sensitivity`, never client-writable |
| `PUT /api/settings` | `Settings` | validated `Settings` or `400 { error }` | New fields (model/voices/sensitivity/persona) are additive — omitted fields default, present fields validated strictly |
| `GET /api/models` | — | `{ active, models: ModelInfo[] }` | Curated list: env primary/fallbacks + a few named Gemini 3 models |
| `GET /api/voices` | — | `{ voices: { id, name }[] }` | Proxies ElevenLabs `GET /v1/voices`, 10-minute cache, `[]` when keyless |
| `GET /api/session/:id/events` | — | `{ events: Event[] }` | Full ordered event log for replay ("scam autopsy"); `[]` if unavailable |
| `GET /api/analytics` | — | `AnalyticsSummary` | totalCalls, caught, gaveUp, catchRate, avgTurnsToCatch, avgMaxRisk, tacticFrequency, totalAlertsSent |
| `GET /api/telegram/status` | — | `{ enabled, botUsername, recentChats }` | `recentChats` = chats seen since server start |
| `POST /api/alert-test` | — | `{ deliveries: DeliveryResult[] }` | Fires a synthetic risk-100 alert to every configured contact, for testing delivery without a real call |

## Telegram channel (Rose's real phone line)

`apps/server/src/telegram.ts` long-polls `getUpdates` (25s timeout) when `TELEGRAM_BOT_TOKEN` is set; a no-op "disabled" channel is returned otherwise (mirrors the `geminiEnabled()`/`ttsEnabled()` pattern — never throws, never blocks startup). Only private-chat text messages are processed. `/start` resets that chat's session mapping and returns a greeting in the configured persona's name. Any other message: finds-or-creates a session keyed by `chatId` (`chatSessions` map in `app.ts`), runs it through the exact same `runTurn` pipeline as the dashboard, and replies with Rose's line (or the guardian's takeover line if the call just ended). Poll errors retry with exponential backoff (1s → 30s cap) so a flaky network never crashes the server.

## Family alert dispatch

`dispatchFamilyAlert` (in `app.ts`) fires on takeover always, and on coach when `settings.notifyOn === 'coach'`. It builds a fixed-format alert body (protected name, risk score, top 3 tactics, timestamp) and calls `dispatchAlerts` (`apps/server/src/alerts.ts`), which delivers to each configured contact independently — one contact failing never blocks the others:

- **Telegram**: `sendTelegramMessage` to the contact's chat id, requires `TELEGRAM_BOT_TOKEN`.
- **iMessage**: macOS-only, opt-in via `SCAMSHIELD_IMESSAGE_ENABLED=1`, sent through `Messages.app` via `osascript`. The AppleScript source is a fixed literal; the contact address and message text are passed as `argv` parameters only — never string-interpolated into the script — so there is no command-injection path through contact/session data.

Each delivery result is broadcast as a `delivery` WS event and rolled into the `intervention` (`level: 'alert'`) event's summary text.

## Store abstraction

`Store` (`apps/server/src/store.ts`) has four required methods (`saveSessionStart`, `saveSessionEnd`, `saveEvent`, `getLeaderboard`) and four optional ones (`saveSettings`/`getSettings`, `getSessionEvents`/`getAnalytics`) that callers must treat as possibly absent. `createStore()` picks `createMongoStore(MONGODB_URI)` when the env var is set, falling back to the in-memory store if the Mongo client construction throws.

- **In-memory** (`createInMemoryStore`): plain `Map`s; per-session event log capped at 500 events (oldest dropped); analytics computed on the fly from held session records; nothing survives a restart.
- **Mongo** (`store-mongo.ts`): three collections (`sessions`, `events`, `settings`) in a lazily-connected client; session records upserted by id; settings stored as a single document; analytics via an aggregation-equivalent computation. Every write is fire-and-forget (`fireAndForget`) — a Mongo failure is logged and swallowed, never surfaced to the request.

What persists (when Mongo is configured): finished and in-progress session records (alias, outcome, max risk, turns, tactics seen, alerts sent), the full per-session WS event stream (for replay), and the current settings singleton. Nothing about raw API keys or credentials is ever persisted.

## Gemini model + key fallback chain

`apps/server/src/gemini.ts` treats resilience as a two-axis problem, because free-tier Gemini quotas are per-day, per-model, **per-project**: alternate models to get a separate daily quota bucket, and alternate API keys (`GEMINI_API_KEY` + comma-separated `GEMINI_API_KEYS`, deduped) to get a separate project's quota entirely.

- Model chain: `[preferredModel (settings.model, if set), envPrimary (GEMINI_MODEL, default gemini-3-flash-preview), ...envFallbacks (GEMINI_FALLBACK_MODELS, default [gemini-flash-lite-latest])]`, deduped.
- For each model, every configured key is tried in order.
- `429` (quota) gets one immediate retry after a fixed delay, then falls through to the next key/model; a further `429` or a `404` (model not available to that key) also falls through.
- Any other non-OK response throws immediately (does not keep trying other keys/models) and marks the AI status degraded.
- An empty extracted response text is treated as a failure and also falls through to the next key/model.
- `aiStatus()` reports `unconfigured` (no keys at all), `degraded` (last attempt failed), or `live` — surfaced via `GET /health` and the dashboard's AI status chip.

`GET /api/models` and settings validation both draw from the same curated model list (env primary + env fallbacks + a few named Gemini 3 models), so the model picker only ever offers ids the fallback chain also understands.

## Risk model

`apps/server/src/risk.ts`: each tactic has a fixed weight (6–20); a turn's raw gain is `Σ(weight × confidence)` over that turn's detections, capped at `+22` per turn (`wasCapped` tracks when the cap bit); a clean turn (no detections) decays risk by `-4`. Coach fires once risk crosses the sensitivity's coach threshold; takeover fires once risk crosses the takeover threshold **and** either the coach has already fired or two turns have hit the gain cap — this guarantees an aggressive escalation always shows both guardian moments before the call ends. Sensitivity presets (`relaxed` / `balanced` / `paranoid`) remap both thresholds; `balanced` matches the original hardcoded 45/80 values.

## Tech → prize mapping

| Tech | Role | Prize |
|---|---|---|
| ElevenLabs | Rose's and the guardian's voice via `POST /api/tts`, voice picker + live preview in settings | Best Use of ElevenLabs |
| Gemini | analyst + Rose + guardian, model/key fallback chain | Best AI Hack |
| MongoDB Atlas | session + event + settings persistence, analytics, leaderboard | Best Use of MongoDB Atlas |
| Telegram | Rose's real phone line + family alert channel | (stack, not a dedicated prize) |
| DigitalOcean | hosting (not yet deployed — see PLAN.md) | Best Use of DigitalOcean |
