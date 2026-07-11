# Decision Log

Append-only. Format: date · decision · why.

- **2026-07-11 · Idea: ScamShield Live** over Red Arena / TrustLens. Universal problem, judge-as-antagonist demo, plays to team strengths (guardrails, telemetry dashboards, agent orchestration). Full research: `~/Hackathon/research/hackathon-idea-research.md`.
- **2026-07-11 · QNX / hardware track dropped.** Team did not get a loaner Pi. All-software build.
- **2026-07-11 · No booth.** Pitch leads with verified problem numbers; interactive demo is the closer, not the venue. Numbers must be primary-sourced before they go on a slide.
- **2026-07-11 · Sponsor stack:** ElevenLabs (voice), Gemini (analyst+guardian), MongoDB Atlas (telemetry), DigitalOcean (hosting). Skipped Solana and Auth0 — no honest fit, bolted-on integrations cost Execution points.
- **2026-07-11 · TypeScript monorepo** (npm workspaces: apps/server, apps/web). One language across the team, shared event types.
- **2026-07-11 · Text mode ships first** (descope ladder rung 1). Voice is layered on, never load-bearing for the demo's existence.
- **2026-07-11 · Voice pipeline resolved: hybrid turn-based** (not ElevenLabs Agents). Judge speaks via browser Web Speech API (mic toggle, not push-to-hold — more reliable across devices); grandma/guardian replies spoken via server-side ElevenLabs TTS proxy (`POST /api/tts`), falling back to browser `speechSynthesis` when keyless or on any error. Full control over turn boundaries, zero hard dependency on ElevenLabs uptime at demo time.
- **2026-07-11 · Risk arc capped at +22/turn** with takeover additionally gated on the coach having fired (or 2 capped turns) — guarantees the demo always shows BOTH guardian moments. Verified: aggressive escalation runs 22 → 44 → 66 → 88.
- **2026-07-11 · `POST /api/session/:id/end` is idempotent** (200 on already-ended); 409 is reserved for `/api/turn` on a terminated call.
- **2026-07-11 · Persistence is write-behind and optional.** Mongo Atlas when `MONGODB_URI` set, in-memory otherwise; a store failure can never fail a request.
