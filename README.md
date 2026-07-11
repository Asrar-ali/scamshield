# ScamShield Live

> Scam detection today is an autopsy. ScamShield is a bodyguard — it catches the manipulation live, on the call, and steps in before the money moves.

Real-time manipulation-detection engine for live conversations. An AI "grandma" takes the call; an analyst agent classifies psychological manipulation tactics (urgency, authority impersonation, isolation, payment redirection) as they happen; a guardian agent intervenes mid-call when risk crosses threshold.

**Demo:** the judge plays the scammer against the AI grandma — and watches their own manipulation techniques get named on screen in real time before the guardian defuses the call.

Built at cuHacking 7 (July 10–12, 2026, Carleton University).

## Docs

| Doc | What's in it |
|---|---|
| [docs/PROBLEM.md](docs/PROBLEM.md) | Problem statement + quantified impact numbers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agent roles, voice-pipeline decision |
| [docs/PLAN.md](docs/PLAN.md) | Descope ladder, team split, timeline to submission |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Running decision log — append as we decide |

## Structure

```
apps/
  server/   # Express + WebSocket — conversation loop, analyst + guardian agents (Gemini), telemetry
  web/      # Vite + React — live dashboard: transcript, tactic cards, risk gauge, interventions
```

## Quickstart

```bash
npm install
npm run dev          # starts server (:3001) + web (:5173)
```

Runs in **mock mode** with no keys (scripted detections, so the dashboard is developable offline). Add keys to `apps/server/.env` for the real thing:

```
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
```

## Prize tracks this targets

1st/2nd/3rd · Best AI Hack · People's Choice · Marketing Challenge · Best Use of ElevenLabs · Best Use of MongoDB Atlas · Best Use of DigitalOcean

Submission: cuhacking07.devpost.com, **due 10 AM Sunday July 12**.
