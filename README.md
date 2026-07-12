# ScamShield

> Scam detection today is an autopsy. ScamShield is a bodyguard — it catches the manipulation live, names the tactics, and acts before the money moves.

A Discord scam-monitoring bot backed by a Gemini-powered detection pipeline. When it catches a scammer it **deletes their message, posts a public warning naming the tactics used, mutes them in the guild, and fires an alert to configured contacts** — all within the same message event.

Built at cuHacking 7 (July 10–12, 2026, Carleton University).

## Feature set

- **Live monitoring, zero human effort.** The bot watches every guild text channel it has access to; each member's messages run through a Gemini analyst that classifies 11 psychological manipulation tactics (urgency, authority impersonation, payment redirection, isolation/secrecy, emotional manipulation, trust building, verification blocking, remote access, info harvesting, prompt injection, and generic pressure) with per-detection confidence and evidence quotes.
- **Automatic interventions.** When a monitored user's risk score crosses the configured threshold, ScamShield: (1) deletes the flagged message, (2) posts a public callout in the channel naming the detected tactics, (3) mutes the user via Discord's timeout, and (4) reports via alert to configured contacts.
- **Real alerts.** Delivery goes over Discord (channel or DM) and optionally macOS iMessage (via Messages.app automation, opt-in). Per-contact delivery success/failure is broadcast to the monitoring console.
- **Per-user risk accumulation.** Risk accrues across every message a member sends server-wide, not just a single message — a scammer who spreads their approach across multiple messages still gets caught. Messages from one user are serialized so a flag lands before the next message is evaluated.
- **Configurable sensitivity.** Three presets — relaxed (flag at 65), balanced (flag at 50), paranoid (flag at 35) — remapped server-side from the `sensitivity` setting; the threshold is never client-controlled.
- **MongoDB Atlas persistence (optional).** Sessions, per-session event streams, and settings persist to Atlas when `MONGODB_URI` is set; falls back to an in-memory store otherwise. Write-behind: a store failure never fails a request.
- **Monitoring console.** A React dashboard mirrors the live Discord activity: risk gauge, tactic cards with evidence quotes, action feed (deleted/warned/muted/reported), alert delivery toasts, leaderboard, and scam autopsy (session replay).
- **AI-status resilience.** Gemini requests retry across a model-and-key fallback chain before falling back to scripted mock responses — the bot never goes silent.
- **Prompt-injection hardening.** Caller input is fenced as untrusted data inside the analyst prompt; injection attempts are themselves a classified tactic (`prompt_injection`), so a scammer trying to override the system prompt is just flagged at the highest weight.

## Scope: what's real vs. roadmap

- **Real today:** live Discord monitoring → detect → delete/warn/mute/report; Gemini-driven analyst; genuine alerts over Discord and macOS iMessage; MongoDB persistence, analytics, and session replay.
- **Roadmap (not built):** bridging onto an actual phone line (SIP/PSTN + speech-to-text) so ScamShield screens a real inbound call to a real senior. The hard part — catching manipulation *as it happens* and acting — is already working. Telephony is productization.

## Quickstart

```bash
docker compose up
```

The container builds and starts with a single command. Set your env vars in `apps/server/.env` (copy from `.env.example`) before running. See [Setup](#setup) below.

Or run locally without Docker:

```bash
npm install
npm run dev          # starts server (:3001) + web (:5173)
```

## Setup

Copy the example env file and fill in your keys:

```bash
cp apps/server/.env.example apps/server/.env
```

Minimum to connect your bot:

```
DISCORD_BOT_TOKEN=your_bot_token_here
GEMINI_API_KEY=your_gemini_key_here
```

Full env reference:

```
GEMINI_API_KEY=              # single key; unlocks the real analyst
GEMINI_API_KEYS=             # optional: comma-separated additional keys (separate quota buckets)
GEMINI_MODEL=                # optional: override the primary model (default gemini-3-flash-preview)
GEMINI_FALLBACK_MODELS=      # optional: comma-separated fallback models (default gemini-flash-lite-latest)

MONGODB_URI=                 # unlocks Atlas persistence (sessions, events, settings); in-memory otherwise
MONGODB_DB=                  # optional: database name (default scamshield)

DISCORD_BOT_TOKEN=           # unlocks the Discord monitoring bot + Discord alert delivery
SCAMSHIELD_IMESSAGE_ENABLED=1  # opt in to macOS iMessage alerts (requires host signed into Messages)

SCAMSHIELD_OPERATOR_TOKEN=   # optional: locks PUT /api/settings + POST /api/alert-test behind this token
SCAMSHIELD_ALLOWED_ORIGIN=   # optional: locks CORS to this origin in production
```

Every key is independently optional — the server never fails to start because a key is missing.

**Bot intents:** In the [Discord Developer Portal](https://discord.com/developers/applications) under **Bot → Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content Intent**.

## Tests

```bash
npm test -w apps/server   # vitest — 180 tests passing across 13 files
```

## Prize tracks this targets

1st/2nd/3rd · Best AI Hack · People's Choice · Marketing Challenge · Best Use of MongoDB Atlas · Best Use of DigitalOcean

Submission: cuhacking07.devpost.com, **due 10 AM Sunday July 12**.

## Docs

| Doc | What's in it |
|---|---|
| [docs/PROBLEM.md](docs/PROBLEM.md) | Problem statement + quantified impact numbers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agent roles, WebSocket + REST contract, persistence, AI fallback chain |

## Structure

```
apps/
  server/   # Express + WebSocket — message monitoring loop, Gemini analyst,
            # Discord bot (per-user risk), interventions (delete/warn/mute/report),
            # alerts (Discord/iMessage), settings, Mongo/in-memory store, analytics
  web/      # Vite + React — monitoring console: risk gauge, tactic cards,
            # action feed, settings drawer, leaderboard, threat intel, scam autopsy
```
