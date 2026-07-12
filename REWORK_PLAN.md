# Monitoring Rework — Execution Plan

Repo: `/home/eric/ZCodeProject/scamshield` · Branch: `discord-monitoring`

Goal: strip the Rose persona / interactive demo / voice, make the Discord bot a
pure **monitor → delete → warn → mute → report** tool. Detection stays Gemini-powered;
risk collapses to one "flag" threshold per sensitivity; the existing server is the
centralized hub (bot + console are one process).

This rework is pass 2, layered on the pass-1 Discord wiring that already lives on
this branch.

---

## ✅ Completed

### Server core (source, non-test — compiles clean)
- `types.ts` — `Role` now `'scammer' | 'guardian'`; `Event` dropped `coach/takeover`
  → single `flag` intervention level + new `action` event (`deleted|warned|muted|reported`);
  `Settings` dropped `persona`/`voices`/`notifyOn`, `protectedName` → `serverName`.
- `risk.ts` — one `FLAG_THRESHOLD = 50` (relaxed 65 / balanced 50 / paranoid 35);
  `shouldCoach`/`canTakeover`/`COACH_THRESHOLD`/`CAPPED_TURNS_FOR_TAKEOVER` removed;
  added `shouldFlag`.
- `prompts.ts` — trimmed to `ANALYST_SYSTEM` + fence helpers only; deleted grandma/
  guardian-coach/guardian-takeover builders.
- `mock.ts` — kept `mockAnalyze`; deleted `mockGrandma`/`mockCoach`/`mockTakeover`.
- `settings.ts` — dropped `validatePersona`/`validateVoices`/`isNotifyOn` + constants;
  default settings = `{ serverName, contacts, model, sensitivity }`.
- `app.ts` — rewrote wholesale: deleted `runTurn`/`grandmaReply`/`guardianLine` and the
  dashboard routes (`/api/session/start`, `/api/session/:id/end`, `/api/turn`, `/api/tts`,
  `/api/voices`); `runMonitoringTurn` → `runMessage` which on flag does
  delete → warn (deterministic template) → mute → report, broadcasts `action` events;
  `createSession` lost its `channel` arg; per-user serialization queue retained.
- `index.ts` — dropped the ElevenLabs/iMessage voice log line.
- `alerts.ts` — `AlertContext` now `{ serverName, user, risk, tactics, timestamp }`;
  alert text rewritten ("deleted the message and muted the user").
- `store-mongo.ts` — `getSettings` reads the new 4-field shape.
- `discord.ts` — `DiscordCallbacks.onMessage` returns `{ flagged }` (not `{takeover}`);
  the public-callout posting moved out of discord.ts into app.ts (which owns warning text).

### Server files deleted
- `tts.ts`, `tts.test.ts`

### Web (source — typechecks clean + Vite build green)
- Deleted demo-only: `Transcript`, `Composer`, `AliasForm`, `RoseAvatar`, `TakeoverFlash`,
  `FamilyAlertToast`, `Landing`, `settings/PersonaEditor`, `settings/VoicePicker`,
  `settings/usePreviewPlayer`, `settings/ProtectionTab`, `hooks/useVoiceOutput`,
  `hooks/useSpeechInput`, `hooks/useElapsedTimer`, `speech.d.ts`.
- `App.tsx` — rewritten as a monitoring console (adopts a monitored user's session;
  risk gauge + tactics + actions feed; no alias form / composer / mute).
- `types.ts`, `lib/api.ts` (dropped session/turn/tts/voices fns), `lib/autopsy.ts`
  (`flag` only), `Header` (no call-state/mute/elapsed), `InterventionsPanel` (actions
  feed), `RiskGauge`/`RiskTimeline` (single flag threshold), `Autopsy` (flag wording),
  `SettingsDrawer` (2 tabs: Detection/Alerts), `AlertsTab`, `ContactsSection`,
  `settings/defaults.ts`, `settings/SensitivityControl`, `settings/AITab` (model-only),
  `icons.tsx` (added Trash/VolumeOff/Alert/Shield line icons).

### e2e
- Deleted all 5 specs (`escalation`, `give-up`, `innocent`, `leaderboard-persistence`,
  `restart`) + `helpers.ts`. `e2e/` is now empty (honest — no browser flow remains).

### Tests already rewritten for new shape
- `prompts.test.ts` ✓ (analyst + fence only)
- `mock.test.ts` ✓ (analyze only)
- `risk.test.ts` ✓ (flag model)

---

## ✅ Also completed (pass 2)

### Server tests
- `app.test.ts` — fixed PUT `/api/settings` token test to send `{ serverName, contacts: [] }` (valid post-rework shape); all 180 tests pass across 13 files.

### Docs + `.env.example`
- `.env.example` — removed all `ELEVENLABS_*` vars.
- `README.md` — rewritten around Discord monitoring bot framing; removed Rose/persona/voice/ElevenLabs; updated test counts.
- `docs/ARCHITECTURE.md` — updated diagram, agent roles (Analyst only), WS event contract (`flag`+`action`), REST table (dropped `/api/turn`/`/api/tts`/`/api/voices`/`/api/session/*`), risk model (single `FLAG_THRESHOLD`), prize table (dropped ElevenLabs).
- `docs/PROBLEM.md` — replaced persona/grandma framing with Discord community framing.

### Cleanup
- `TelegramIcon` removed from `icons.tsx`.
- `qrcode` + `@types/qrcode` removed from `apps/web/package.json`.

---

## ⏳ Remaining

### 1. Verify
- `npx tsc -p apps/server/tsconfig.json --noEmit` ✅
- `npx tsc -p apps/web/tsconfig.json --noEmit` ✅
- `npm test -w apps/server` → 180 tests, 13 files, all green ✅
- `npm run build -w apps/web` → green ✅
- `npm run test:e2e` → "no tests found" (expected — empty `e2e/` dir)

### 2. Cleanup before PR
- Run `npm install` to prune `qrcode` from `node_modules`.
- Delete this `REWORK_PLAN.md` file when ready.
- Final `git diff --stat` review.

---

## Notes / risks
- The `store.ts` `SessionOutcome` (`in_progress | caught | gave_up`) is kept intact on
  purpose — flagged users map to `caught`, there's no `gave_up`, and rewriting the store
  interface would cascade into store-mongo's aggregation. Minimal blast radius.
- The dashboard console (App.tsx) is the piece most likely to need iteration — it's a new
  UI shape (monitoring focus view), not a 1:1 swap. It compiles and builds but hasn't been
  visually verified against a live Discord session.
- The `RISK_FLAG_THRESHOLD` constant in web `types.ts` is hardcoded to 50 (balanced). The
  server-computed threshold per sensitivity comes via `/api/settings` `thresholds.flag`;
  the web constant is only the gauge/timeline default before settings load.
