# Plan

Submission: Devpost (cuhacking07.devpost.com) **10 AM Sunday July 12**. Assume ~20h of usable build time from Saturday midday.

## Descope ladder (each rung is a complete, demoable product)

1. **Rung 1 — text mode (target: +6h):** scammer types in a chat box → grandma replies (Gemini) → analyst classifies tactics → dashboard shows transcript, tactic cards, risk gauge → guardian text intervention. *If everything else fails, this is still a winnable demo.*
2. **Rung 2 — voice out (+3h):** grandma's replies spoken via ElevenLabs TTS. Judge still types. Half the magic for a tenth of the risk.
3. **Rung 3 — full voice (spike-gated):** ElevenLabs conversational agent; judge speaks. Only if the 1-hour spike proves transcript-out + mid-session-control.
4. **Rung 4 — polish:** leaderboard ("scam attempts survived"), family-alert SMS mock, animations, sound design on tactic ignition.

**Rule:** never start a rung until the one below is demoable end-to-end. Execution & Completeness is a scored criterion — half-built loses to small-but-flawless.

## Team split (4 people, parallel after the data contract in ARCHITECTURE.md)

| Person | Owns | First deliverable |
|---|---|---|
| A — Voice | ElevenLabs spike (1h, timeboxed) → grandma voice pipeline | spike verdict → DECISIONS.md |
| B — Brains | Gemini analyst + guardian prompts, tactic taxonomy, risk model | analyst classifying mock utterances |
| C — Dashboard | React dashboard against the WS event stream (mock mode) | transcript + tactic cards live |
| D — Glue & pitch | server hub, Mongo, DO deploy, domain, Devpost, 2-min video, pitch w/ verified numbers | server + mock loop running (done — scaffold) |

## Pitch structure (no booth — numbers carry the open)

1. **Cold open (20s):** one verified loss number + "every defense today starts after the money is gone."
2. **Live demo (90s):** invite the judge to be the scammer. Their words light up tactic cards; guardian takes over audibly.
3. **How (30s):** three coordinated agents — grandma, analyst, guardian. Name the stack.
4. **Close (20s):** O2's Daisy validated the honeypot; we built the bodyguard. Ask: "who's calling your grandmother right now?"

## Risks

| Risk | Mitigation |
|---|---|
| ElevenLabs realtime integration fails | spike gate + rungs 1–2 don't need it |
| Judge improvises something the analyst misses | taxonomy has a catch-all "suspicious pressure" class; risk score is cumulative so single misses don't kill the arc; rehearse with teammates as red-team |
| Noisy hall / no booth audio | headset mic; text mode always available; captions on screen |
| API quota/keys die at demo time | mock mode replays a recorded session — dashboard never shows a blank screen |
