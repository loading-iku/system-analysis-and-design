# Project Memory

## Overview
- Project: `system-analysis-and-design`
- Stack: Next.js 16, React 19, TypeScript, CSS Modules, Clerk auth
- Product direction: educational game for learning system analysis and design concepts through a real-time CLI/TUI-style labyrinth, gate-triggered UML progress, optional Diagram Wizard puzzles, and parkour-style challenges.

## Current State
- The runtime has been overhauled to schema v2. `src/lib/level/types.ts` now defines `LabyrinthLevelJSON` with authored maze maps, gates, challenges, endings, scoring, rewards, and `ProgressProfile`/`LevelSummary`.
- All shipped levels are JSON-driven v2 labyrinth levels in `src/data/levels/` and registered in `src/data/levels/manifest.json`: `place-order`, `user-login`, and `user-registration`.
- `LevelStage` is the gameplay coordinator. It runs a reducer from `src/lib/level/engine.ts`, a `requestAnimationFrame` tick loop, WASD/arrow-key movement, touch/click direction controls, and completion summary creation.
- `LabyrinthPanel` renders the maze viewport with tile layers, reveal/fog state, gate labels, endings, and player position. The camera follows the player and clamps to the authored world.
- `ActivityDiagramPanel` is now read-only progress. It shows accumulated UML nodes appended by cleared gates and successful challenges instead of hosting the main drag/drop loop.
- The old activity-diagram builder survives inside `DiagramWizardModal`, backed by `src/lib/level/diagramEngine.ts`. It supports toolbox placement, branch choices, feedback, and auto start/end semantics for diagram puzzles.
- `ParkourChallengeModal` supports bounded challenge rooms with moving obstacles, reset-on-hit behavior, and reward/penalty integration through the main engine.
- Progress is Clerk-backed in v2: `GET /api/progress` reads `logicPathProgressV2` from Clerk private metadata; `POST /api/progress/runs` merges completed `LevelSummary` payloads and de-duplicates repeated run submissions. `src/lib/progress.ts` keeps an SSR-safe client cache with localStorage fallback/migration, but authenticated Clerk metadata is the intended source of truth.
- `/levels` uses the v2 profile to show unlock state, best ending, endings seen, attempts, XP, and coins. Unlocks still follow manifest order: a level unlocks when the previous level has any clearing ending.
- App access remains gated by Clerk auth in `src/proxy.ts`, protecting `/start` and `/levels(.*)`.

## Level Content
- `place-order`: checkout labyrinth with optional/best-route learning around 3D Secure. Current verifier reports 10 gates, 10 endings, 23 reachable routes, 1 challenge, and 1 completing ending.
- `user-login`: security/auth labyrinth with endings for failure, recovery, standard success, and stronger secured routes. Current verifier reports 13 gates, 6 endings, 6 reachable routes, 1 challenge, and 2 completing endings.
- `user-registration`: onboarding/sign-up labyrinth with richer alternate outcomes. Current verifier reports 11 gates, 12 endings, 5 reachable routes, 0 challenges, and 6 completing endings.

## Verified Working Behavior
- `npm run verify:levels:v2` passes for all three v2 level files: dimensions, references, routes, endings, and challenge references validate.
- `npm run lint` passes.
- `npm run build` passes.
- Dev server runs on the next available port; during the latest check, port 3000 was busy and Next served at `http://localhost:3002`.
- Browser smoke check reached `/levels` and correctly redirected to the Clerk login screen when unauthenticated. Authenticated gameplay still needs manual browser QA with a signed-in session.

## Constraints To Preserve
- No Tailwind; use CSS Modules.
- Preserve the monochrome CLI/TUI aesthetic.
- Preserve `Roboto Mono` as the presentation font unless intentionally redesigning. The app shell now uses the CSS font stack instead of network-loaded `next/font/google` so offline builds can pass.
- Keep the level system JSON-driven.
- Keep game state reducer-based.
- Keep the old drag/drop activity-diagram builder as a Diagram Wizard challenge mechanic, not as the main level runtime.
- Maintain TypeScript strictness and ESLint cleanliness.
- Treat Clerk private metadata as the canonical v2 progress store for authenticated users.

## Known Good Commands
- `npm run dev`
- `npm run verify:levels:v2`
- `npm run lint`
- `npm run build`

## Follow-Up Ideas
- Run authenticated manual QA for all three levels: WASD/arrows, camera tracking, gate labels, endings, Diagram Wizard, parkour, completion overlay, and progress persistence after refresh/re-login.
- Add focused unit tests for engine movement/collision, gate trigger resolution, camera clamp, scoring, duplicate run sync, diagram challenge success/failure, and parkour obstacle reset.
- Improve mobile/touch layout for the full maze shell.
- Add more challenges to `user-registration` if the capstone should include Diagram Wizard or parkour interactions.
- Continue authoring more levels, including fork/join concurrency once new UML shapes and engine behavior are designed.
- Add accessibility testing for modal focus management, keyboard movement, and screen-reader labels.

## Source Notes
- Original Claude transcript source: [SESSION_TRANSCRIPT.md](/Users/yusufberkcekic/Documents/system-analysis-and-design/.claude/worktrees/wizardly-burnell-10f74a/SESSION_TRANSCRIPT.md)
- Imported Codex implementation thread: `codex://threads/019e7e4b-998a-7271-a941-b1cf71f9f1a6` ("Expand labyrinth game logic")
