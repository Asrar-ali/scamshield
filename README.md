# ScamShield Live

> Scam detection today is an autopsy. ScamShield is a bodyguard — it catches the manipulation live, on the call, and steps in before the money moves.

Real-time manipulation-detection engine for live conversations. Rose — an AI "grandma" persona — takes the call; an analyst agent classifies psychological manipulation tactics (urgency, authority impersonation, isolation, payment redirection, remote access, info harvesting, and more) turn by turn; a guardian agent coaches Rose, then seizes the call and fires a family alert once risk crosses threshold.

It ships as a configurable protection product, not just a demo toy: a settings drawer lets you pick the model, the ElevenLabs voice, Rose's persona, and how sensitive/paranoid the guardian is; real alerts go out over Telegram and (optionally) macOS iMessage; every call is persisted and replayable; and the whole thing degrades gracefully (mock detections, browser TTS, in-memory store) when no API keys are configured.

**Demo:** play the scammer against Rose — watch your own manipulation techniques get named on screen in real time before the guardian defuses the call. You can also just text Rose's Telegram bot from your own phone — same pipeline, same dashboard, no browser mic needed.

Built at cuHacking 7 (July 10–12, 2026, Carleton University).

## Feature set

- **Live call, three coordinated agents.** Rose (persona under attack), an analyst that classifies each caller utterance against a 10-tactic taxonomy with confidence + evidence quote, and a guardian that coaches Rose mid-call and takes over the call at high risk — confronting the caller, naming the detected tactics, and ending the session.
- **Voice.** Rose's and the guardian's lines can be spoken via ElevenLabs TTS (`POST /api/tts`); the dashboard falls back to the browser's `speechSynthesis` when ElevenLabs is unconfigured or a request fails, so voice is never a hard dependency.
- **Telegram is Rose's real phone line.** A configured Telegram bot long-polls for messages; every private chat is a real conversation with Rose driven through the exact same turn pipeline as the browser, so the wall dashboard mirrors it live. The landing page shows a QR code / handle to text Rose directly from your own phone.
- **Real family alerts.** When risk crosses threshold, a family alert can go out to configured contacts over Telegram and/or macOS iMessage (via Messages.app automation, opt-in). Delivery success/failure per contact is broadcast to the dashboard as a toast.
- **MongoDB Atlas persistence (optional).** Sessions, per-session event streams, and settings persist to Atlas when `MONGODB_URI` is set; falls back to an in-memory store otherwise. Persistence is write-behind — a store failure never fails a request.
- **Configurable settings.** A tabbed settings drawer (Protection / AI / Alerts) covers: Rose's persona (name, age, city, grandkid, quirks), sensitivity presets (relaxed / balanced / paranoid — remaps the coach/takeover risk thresholds), model picker, voice picker (with live preview), notify-on level (coach vs. takeover), and up to 5 family contacts.
- **Analytics / threat intel.** `GET /api/analytics` aggregates finished calls into catch rate, average turns-to-catch, average peak risk, tactic frequency, and total alerts sent — shown in a Threat Intel panel alongside the leaderboard.
- **Session replay ("scam autopsy").** Every finished call — live or from the leaderboard — gets a forensic report: risk timeline, tactic ledger with evidence quotes, and a closing summary. Past sessions replay from their persisted event stream.
- **AI-status resilience.** The server tracks whether Gemini calls are currently succeeding and reports `live` / `degraded` / `unconfigured` via `/health`; the dashboard shows this as an AI status chip. Gemini requests retry across a model-and-key fallback chain (see below) before ever falling back to scripted mock responses — the demo never goes blank.
- **Prompt-injection hardening.** The analyst and grandma prompts fence caller input as untrusted data and instruct the models to never break character or treat caller text as instructions — a live call is an adversarial input channel, and the system is designed so the caller's words can be *observed and classified*, never *obeyed*.

## Scope: what's real vs. roadmap

Being straight about this, because it's the honest core of the pitch:

- **Real today:** the full detection → intervention loop on live text and Telegram channels; Gemini-driven persona/analyst/guardian; ElevenLabs voice; and **genuine family alerts** dispatched over Telegram and macOS iMessage when a call crosses threshold.
- **Roadmap (not built):** bridging onto an actual phone line (SIP/PSTN + speech-to-text) so ScamShield screens a real inbound call to a real senior, and a real fraud-reporting sink. The guardian therefore says only what is true — "ending the call, family alerted" — and never claims to have reported anything to authorities.

We demonstrate the hard part — catching manipulation *as it happens* and intervening — on a channel we can run end-to-end. Telephony is productization, not the research risk.

## Quickstart

```bash
npm install
npm run dev          # starts server (:3001) + web (:5173)
```

Runs in **mock mode** with no keys — keyword-pattern tactic detection, scripted grandma lines, browser `speechSynthesis` for voice, in-memory storage, Telegram/iMessage disabled. The full loop (transcript, tactic cards, risk gauge, interventions, settings, leaderboard, replay) works end to end with zero configuration.

Add keys to `apps/server/.env` to unlock the real thing:

```
GEMINI_API_KEY=              # single key; unlocks the real analyst/grandma/guardian
GEMINI_API_KEYS=             # optional: comma-separated additional keys (separate quota buckets)
GEMINI_MODEL=                # optional: override the primary model (default gemini-3-flash-preview)
GEMINI_FALLBACK_MODELS=      # optional: comma-separated fallback models (default gemini-flash-lite-latest)

ELEVENLABS_API_KEY=          # unlocks real TTS via POST /api/tts and the voice picker
ELEVENLABS_VOICE_GRANDMA=    # optional: override Rose's default voice ID
ELEVENLABS_VOICE_GUARDIAN=   # optional: override the guardian's default voice ID

MONGODB_URI=                 # unlocks Atlas persistence (sessions, events, settings); in-memory otherwise
MONGODB_DB=                  # optional: database name (default scamshield)

TELEGRAM_BOT_TOKEN=          # unlocks Rose's real Telegram phone line + Telegram family alerts
SCAMSHIELD_IMESSAGE_ENABLED=1  # opt in to macOS iMessage family alerts (requires host signed into Messages)
```

Every one of these is independently optional — the server never fails to start or fails a request because a key is missing; it just falls back (mock analysis, browser TTS, in-memory store, disabled channel).

## Tests

```bash
npm test -w apps/server   # vitest — 258 tests passing across 13 files, as of this writing
npm run test:e2e          # playwright — 5 end-to-end specs (escalation/takeover, innocent call, give-up, restart, leaderboard persistence)
```

## Prize tracks this targets

1st/2nd/3rd · Best AI Hack · People's Choice · Marketing Challenge · Best Use of ElevenLabs · Best Use of MongoDB Atlas · Best Use of DigitalOcean

Submission: cuhacking07.devpost.com, **due 10 AM Sunday July 12**.

## Docs

| Doc | What's in it |
|---|---|
| [docs/PROBLEM.md](docs/PROBLEM.md) | Problem statement + quantified impact numbers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agent roles, WebSocket + REST contract, persistence, AI fallback chain |

## Structure

```
apps/
  server/   # Express + WebSocket — conversation loop, analyst + guardian agents (Gemini),
            # Telegram channel, family alerts (Telegram/iMessage), settings, Mongo/in-memory
            # store, analytics, TTS proxy (ElevenLabs)
  web/      # Vite + React — live dashboard: transcript, tactic cards, risk gauge,
            # interventions, settings drawer, leaderboard, threat intel, scam autopsy
e2e/        # Playwright end-to-end specs against the full stack
```
