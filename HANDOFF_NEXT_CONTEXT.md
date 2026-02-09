# Amber_True Handoff (Next Context)

## Current status
- App works with `local` adapter and `liveblocks` adapter switch.
- `VITE_ROOM_ADAPTER=liveblocks` now enables Liveblocks adapter path.
- Liveblocks adapter mirrors room state between Liveblocks storage (`gameState`) and local cache.
- Guest join issue caused by update race was fixed by re-applying updater on latest storage snapshot.
- Dev-only debug features are active in Room:
  - virtual 8 participants
  - auto RESULT after non-debug voters complete
  - prompt reroll button
- Prompt data flow is `SQLite -> public/prompts.json` and currently stable.

## Environment variables
- `VITE_ROOM_ADAPTER=liveblocks`
- Preferred auth setting: `VITE_LIVEBLOCKS_AUTH_ENDPOINT`
- Fallback setting: `VITE_LIVEBLOCKS_PUBLIC_KEY`

## Liveblocks auth behavior (implemented)
- If `VITE_LIVEBLOCKS_AUTH_ENDPOINT` is set, client calls it as:
  - `POST` with JSON body `{ room }`
  - `Content-Type: application/json`
  - `cache: no-store`
- If auth endpoint is not set, adapter can still use `VITE_LIVEBLOCKS_PUBLIC_KEY`.
- If setup fails, adapter falls back to local.

## Important files
- `src/lib/liveblocksAdapter.ts` : Liveblocks adapter implementation (init/read/write/subscribe + fallback)
- `src/lib/stateAdapter.ts` : adapter selector
- `src/lib/roomStateAdapterTypes.ts` : adapter contract
- `src/lib/debugTools.ts` : debug helpers
- `src/lib/roundLogic.ts` : round transition logic
- `src/lib/roundLogic.test.ts` : transition tests
- `README.md`, `agents.md` : updated project notes

## Commands to verify
- `npm test`
- `npm run build`
- `npm run dev`

## Open items (next)
- No critical open items. Next tasks can focus on operational hardening and monitoring refinement.

## Recently fixed
- 2026-02-09: `.env.local` gitignore policy fixed (`.env.example` can be committed).
- 2026-02-09: Liveblocks production auth API contract and deployment path documented in `README.md`.
- 2026-02-09: Auth/Sync failure telemetry implemented (`VITE_TELEMETRY_ENDPOINT`, adapter event reporting).
- 2026-02-09: Reconnect/degraded-mode UX policy implemented (status banner + retry action in Room).
