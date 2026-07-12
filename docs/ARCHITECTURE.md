# Architecture

## System overview

```
  Discord (monitored server members)
         │  guild text-channel message
         │  Gateway messageCreate event
         ▼
  ┌───────────────────────── apps/server (Express + ws) ──────────────────────────┐
  │                                                                                 │
  │   runMessage(session, msg)   [Discord — per-user]                              │
  │     1. ANALYST  — Gemini classifies the utterance against the 11-tactic        │
  │                    taxonomy, emits {tactic, confidence, evidence} per detection │
  │     2. risk.ts   — applies weighted gain (capped +22/turn) or decay (-4, clean) │
  │     3. on flag (risk >= FLAG_THRESHOLD):                                        │
  │          a. delete the flagged message                                          │
  │          b. post a public warning naming the detected tactics                   │
  │          c. mute the user (Discord timeout)                                     │
  │          d. report — dispatchAlerts() to configured contacts                    │
  │          → broadcasts 'action' events (deleted / warned / muted / reported)    │
  │                                                                                 │
  │   Every step broadcasts a typed Event over the single WS hub AND persists it   │
  │   to the Store.                                                                 │
  └──────────────────────────────────┬──────────────────────────────────────────────┘
                                      │ WebSocket broadcast (all connected clients, /ws)
                                      ▼
                     ┌─────────────────────────────────────────┐
                     │      MONITORING CONSOLE (apps/web)       │
                     │ risk gauge · tactic cards · action feed  │
                     │ alert toasts · settings drawer ·         │
                     │ leaderboard · threat intel · autopsy     │
                     └─────────────────────────────────────────┘

  Discord interventions: flag → msg.delete() + channel.send(warning) +
  member.timeout() (mute) + dispatchAlerts() → Discord channel/DM and/or
  macOS iMessage (osascript) → 'action' + 'delivery' events → console.

  Persistence: MongoDB Atlas when MONGODB_URI is set (sessions, per-session event log,
  settings) — in-memory otherwise. Write-behind: a store failure never fails a request.
```

## Agent roles

1. **Analyst** — runs on every monitored message. Classifies against the tactic taxonomy in `apps/server/src/tactics.ts` (urgency, authority impersonation, payment redirection, isolation/secrecy, emotional manipulation, trust building, verification blocking, remote access, info harvesting, prompt injection / AI manipulation, plus a generic-pressure catch-all — 11 tactics total), returns `{tactic, confidence, evidence}` per detection via a JSON schema-constrained Gemini call. Never speaks; feeds the risk model.

The analyst call goes through the `gemini()` helper (model + key fallback chain, below) and falls back to deterministic mock/keyword logic (`apps/server/src/mock.ts`) when Gemini is unconfigured or every attempt fails — the loop never produces a silent response.

## Untrusted-input handling / prompt-injection posture

Every monitored message is an adversarial input source by design. The defensive posture:

- **Message text is data to classify, never instructions to follow.** The analyst prompt only ever asks the model to extract structured `{tactic, confidence, evidence}` JSON; the monitored text is embedded as a quoted, labelled turn (`USER: "..."`) inside that request, not as a system-level directive.
- **Injection attempts are themselves a detectable tactic** — an utterance that tries to override the system prompt or extract it is classified as `prompt_injection`, the highest-weight tactic in the taxonomy. This means an adversary trying to jailbreak the detection pipeline actually accelerates their own flag.

## WebSocket event contract

Single hub: the server broadcasts every event to all connected WS clients on `/ws`, and (best-effort) persists it via `store.saveEvent`. Types (`apps/server/src/types.ts`):

```ts
type Role = 'scammer' | 'guardian';

type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number; userId?: string; avatar?: string }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number; userId?: string }                     // 0..100 cumulative
  | { type: 'intervention'; level: 'flag' | 'alert'; text: string; ts: number }
  | { type: 'action'; action: 'deleted' | 'warned' | 'muted' | 'reported'; ts: number }
  | {
      type: 'session';
      state: 'start' | 'end';
      id: string;
      ts: number;
      channel?: 'discord';     // present on 'start'
      userId?: string;          // Discord user behind a monitored session
      avatar?: string;
    }
  | { type: 'delivery'; contact: string; channel: 'discord' | 'imessage'; ok: boolean; ts: number };
```

`userId`/`avatar` carry the Discord member behind the session. `delivery` events report per-contact alert outcomes and drive the delivery toast.

Eleven tactic ids: `urgency_pressure`, `authority_impersonation`, `payment_redirection`, `isolation_secrecy`, `emotional_manipulation`, `trust_building`, `verification_blocking`, `remote_access`, `info_harvesting`, `prompt_injection` (AI Manipulation — highest weight), `generic_pressure`.

## REST endpoints

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `GET /health` | — | `{ ok, mode: 'gemini'\|'mock', ai: AiStatus }` | `ai` is `'live'\|'degraded'\|'unconfigured'` |
| `GET /api/leaderboard` | — | `{ entries: LeaderboardEntry[] }` | Top 10 by turns survived; `[]` on store failure |
| `GET /api/settings` | — | `Settings & { thresholds }` | `thresholds` is server-computed from `sensitivity`, never client-writable |
| `PUT /api/settings` | `Settings` | validated `Settings` or `400 { error }` | Requires `x-scamshield-token` header when `SCAMSHIELD_OPERATOR_TOKEN` is set |
| `GET /api/models` | — | `{ active, models: ModelInfo[] }` | Curated list: env primary/fallbacks + a few named Gemini 3 models |
| `GET /api/session/:id/events` | — | `{ events: Event[] }` | Full ordered event log for replay ("scam autopsy"); `[]` if unavailable |
| `GET /api/analytics` | — | `AnalyticsSummary` | totalCalls, caught, catchRate, avgTurnsToCatch, avgMaxRisk, tacticFrequency, totalAlertsSent |
| `GET /api/discord/status` | — | `{ enabled, botTag, guildName, monitoredUsers, recentUsers }` | `recentUsers`/`monitoredUsers` = members seen since server start |
| `POST /api/alert-test` | — | `{ deliveries: DeliveryResult[] }` | Fires a synthetic risk-100 alert to every configured contact; requires operator token when set |

## Discord monitoring channel

`apps/server/src/discord.ts` connects a discord.js v14 `Client` to the Gateway when `DISCORD_BOT_TOKEN` is set; a no-op "disabled" channel is returned otherwise. The client subscribes to `messageCreate` with the Server Members + Message Content privileged intents and processes only human-authored guild text-channel messages (bot messages and DMs ignored).

Each observed message finds-or-creates a **per-user** monitoring session keyed by Discord user id (`watchedUsers` map in `app.ts`), so a member's risk accrues across everything they say server-wide. Messages from one user are serialized through a per-user promise chain so a flag (delete + mute) lands before the next message is evaluated. On flag, `app.ts` owns the intervention sequence — discord.ts returns `{ flagged }` and `app.ts` drives delete → warn → mute → report. A flagged user is added to `blockedUsers`; further messages are stonewalled rather than analyzed.

The connected client is shared with `alerts.ts` so Discord alert delivery reuses the same connection (one bot, one Gateway socket).

## Alert dispatch

`dispatchAlerts` (`apps/server/src/alerts.ts`) fires on every flag. It builds a fixed-format alert body (server name, user, risk score, top tactics, timestamp) and delivers to each configured contact independently — one contact failing never blocks the others:

- **Discord**: `sendDiscordAlert` posts to the contact's channel id (or DMs the user id) via the shared bot client.
- **iMessage**: macOS-only, opt-in via `SCAMSHIELD_IMESSAGE_ENABLED=1`, sent through `Messages.app` via `osascript`. Contact address and message text are passed as `argv` parameters only — never string-interpolated into the script — so there is no command-injection path through contact/session data.

Each delivery result is broadcast as a `delivery` WS event.

## Store abstraction

`Store` (`apps/server/src/store.ts`) has four required methods (`saveSessionStart`, `saveSessionEnd`, `saveEvent`, `getLeaderboard`) and four optional ones (`saveSettings`/`getSettings`, `getSessionEvents`/`getAnalytics`) that callers must treat as possibly absent. `createStore()` picks `createMongoStore(MONGODB_URI)` when the env var is set, falling back to the in-memory store if the Mongo client construction throws.

- **In-memory** (`createInMemoryStore`): plain `Map`s; per-session event log capped at 500 events (oldest dropped); analytics computed on the fly; nothing survives a restart.
- **Mongo** (`store-mongo.ts`): three collections (`sessions`, `events`, `settings`) in a lazily-connected client; session records upserted by id; settings stored as a single document; analytics via an aggregation-equivalent computation. Every write is fire-and-forget (`fireAndForget`) — a Mongo failure is logged and swallowed, never surfaced to the request.

## Gemini model + key fallback chain

`apps/server/src/gemini.ts` treats resilience as a two-axis problem — alternate models to get a separate daily quota bucket, and alternate API keys to get a separate project's quota entirely:

- Model chain: `[preferredModel (settings.model, if set), envPrimary (GEMINI_MODEL, default gemini-3-flash-preview), ...envFallbacks (GEMINI_FALLBACK_MODELS, default [gemini-flash-lite-latest])]`, deduped.
- For each model, every configured key is tried in order.
- `429` (quota) gets one immediate retry after a fixed delay, then falls through to the next key/model; `404` (model unavailable) also falls through.
- Any other non-OK response throws immediately and marks AI status degraded.
- `aiStatus()` reports `unconfigured` / `degraded` / `live` — surfaced via `GET /health`.

## Risk model

`apps/server/src/risk.ts`: each tactic has a fixed weight (6–20); a turn's raw gain is `Σ(weight × confidence)` over that turn's detections, capped at `+22` per turn; a clean turn (no detections) decays risk by `-4`. A single `FLAG_THRESHOLD` fires when risk crosses it: 65 (relaxed), 50 (balanced), 35 (paranoid). `shouldFlag(score, sensitivity)` is the only exported decision function — there is no coach/takeover split.

## Tech → prize mapping

| Tech | Role | Prize |
|---|---|---|
| Gemini | analyst, model/key fallback chain | Best AI Hack |
| MongoDB Atlas | session + event + settings persistence, analytics, leaderboard | Best Use of MongoDB Atlas |
| Discord | passive server monitoring bot + alert channel + intervention actions | (stack, not a dedicated prize) |
| DigitalOcean | hosting | Best Use of DigitalOcean |
