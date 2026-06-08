# Rewrite Checkpoints

This file is the handoff trail for the Del Mar Invitational rewrite. Each
checkpoint should be enough for another agent to resume without relying on chat
history.

## Checkpoint 0: Baseline Plan

Date: 2026-06-08

Branch:

- `main`
- Upstream: `origin/main`
- Current HEAD before rewrite work: `b98c6db Fix mobile layout overflow on hub and roster screens`

Local worktree notes:

- Existing untracked `.playwright-cli/` directory was present before rewrite
  work and should be ignored unless browser artifacts are needed.
- Added `REWRITE_PLAN.md`.
- Added this `CHECKPOINTS.md`.

Baseline app shape:

- Current app is a static monolith at `index.html`.
- `index.html` is 3,557 lines.
- Existing regression harness is `scripts/event-format-tests.js`.
- Supabase functions live under `supabase/functions`.
- Current production host in `README.md` is GitHub Pages.

Baseline verification:

- `node scripts/event-format-tests.js` passed on 2026-06-08.

Key plan corrections:

- Use server-side `join_group_by_room_code(code text)` RPC for membership-gated
  room-code joins.
- Put score-cell timestamp migration behind compatibility helpers before
  porting scoring.
- Treat scoring parity and RLS verification as hard gates before UI cutover.

Next recommended steps:

1. Create or switch to branch `rewrite`.
2. Preserve the old app as `legacy/index.html` on the rewrite branch.
3. Scaffold Vite + Vue + TypeScript at repo root.
4. Run build and test smoke checks.

## Checkpoint 1: Vite Scaffold and Cell Compatibility Foundation

Date: 2026-06-08

Branch:

- `rewrite`
- Base commit: `b98c6db`
- No rewrite commit has been created yet.

Files changed:

- Added repo execution docs:
  - `REWRITE_PLAN.md`
  - `CHECKPOINTS.md`
- Added `.gitignore`.
- Copied old static app to `legacy/index.html`.
- Replaced root `index.html` with Vite entry markup.
- Added Vue/TypeScript scaffold:
  - `package.json`
  - `package-lock.json`
  - `vite.config.ts`
  - `tsconfig.json`
  - `tsconfig.node.json`
  - `src/main.ts`
  - `src/App.vue`
  - `src/router/index.ts`
  - `src/components/screens/HomeScreen.vue`
  - `src/styles/main.css`
- Added domain type foundations under `src/types`.
- Added score-cell compatibility helpers in `src/scoring/cells.ts`.
- Added tests:
  - `tests/smoke/app.test.ts`
  - `tests/scoring/cells.test.ts`
- Updated `scripts/event-format-tests.js` to run as ESM and read
  `legacy/index.html`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 2 files, 7 tests.
- `npm run build`: passed.
- Browser QA: Vite dev server at `http://127.0.0.1:5173/` rendered the Vue
  shell with heading `Del Mar Invitational` and status
  `Foundation scaffold is running.`

Install notes:

- `npm install` completed and generated `package-lock.json`.
- NPM reported 5 vulnerabilities, 4 moderate and 1 critical. No forced audit
  fix was run because scaffold stability matters more than taking breaking
  dependency changes blindly.

Current worktree notes:

- `node_modules/`, `dist/`, `.playwright-cli/`, and `output/playwright/` are
  ignored.
- The Vite dev server was stopped after browser QA.

Next recommended steps:

1. Port `DEFAULT_GAMES` and `normalizeGames` into typed modules.
2. Port event config normalization into pure helpers with tests.
3. Convert the legacy event-format assertions into first-class Vitest tests
   that use the new pure event scoring modules, while keeping the legacy script
   as an oracle until parity is proven.
4. Start extracting handicap and player score helpers before full game modules.

## Checkpoint 2: Game Config Normalization

Date: 2026-06-08

Branch:

- `rewrite`
- Base commit: `b98c6db`
- No rewrite commit has been created yet.

Files changed since Checkpoint 1:

- Added `src/domain/games.ts`.
- Added `tests/domain/games.test.ts`.

Implementation notes:

- Ported `DEFAULT_GAMES` from the legacy monolith into a typed module.
- Added `cloneDefaultGames()`.
- Added `normalizeGames()`.
- `normalizeGames()` is explicit per game key instead of using a generic
  assignment, because TypeScript correctly rejects assigning across the union of
  game config shapes.
- Stableford point config is deep-merged so partial point overrides keep default
  values for omitted outcomes.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 3 files, 11 tests.
- `npm run build`: passed.

Next recommended steps:

1. Add `src/domain/players.ts` for `normalizedGroupPlayers()` and
   `groupPlayerNames()` equivalents.
2. Add `src/domain/playingGroups.ts` for auto/normalize playing group helpers.
3. Add `src/scoring/handicap.ts` for `computeWHSCourseHcp()` and
   `getsStroke()`.
4. Begin porting event config normalization once players and playing groups are
   available.

## Checkpoint 3: Player, Playing Group, and Handicap Helpers

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `3619448 Add Vue rewrite foundation`

Files changed since Checkpoint 2:

- Added `src/domain/players.ts`.
- Added `src/domain/playingGroups.ts`.
- Added `src/scoring/handicap.ts`.
- Added tests:
  - `tests/domain/players.test.ts`
  - `tests/domain/playingGroups.test.ts`
  - `tests/scoring/handicap.test.ts`

Implementation notes:

- Ported legacy player normalization behavior for modern player objects and old
  string-based player entries.
- Ported automatic playing-group helpers:
  - chunk players into fours
  - interleave two teams
  - derive groups from pair matches
  - repair invalid/missing group assignments
- Ported handicap primitives:
  - `computeWHSCourseHcp()`
  - `getsStroke()`
  - relative net stroke allocation

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 6 files, 26 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port event format labels/default event round config into `src/domain/events.ts`.
2. Port `normalizeEventConfig()` using the new player and playing-group helpers.
3. Add tests for default event config, pair-match repair, duplicate team removal,
   and win-point calculation.
4. After event config normalization passes, begin extracting event round scoring.

## Checkpoint 4: Event Config Normalization

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `28723c4 Add core domain helpers`

Files changed since Checkpoint 3:

- Added `src/domain/events.ts`.
- Added `tests/domain/events.test.ts`.

Implementation notes:

- Ported event labels and scoring mode labels.
- Ported default event round construction.
- Ported event available-points and win-point calculation.
- Ported `defaultEventConfig()`.
- Ported `normalizeEventConfig()` as a pure function. It receives group player
  names as an argument rather than reading global `GROUP`.
- Preserved legacy behavior where players found in pair matches are pulled into
  event teams when missing.
- Pair matches are repaired to side-valid players and capped at two players per
  side.
- Events are clamped to 1-12 rounds.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 7 files, 34 tests.
- `npm run build`: passed.

Next recommended steps:

1. Start extracting low-level scoring helpers that event scoring depends on:
   `playerHoleScore`, `pairBestBallScore`, `pairSegmentHoles`, and related
   range-score helpers.
2. Port `bestBallAggyHoleComponent()` and `eventRoundAvailablePoints()` parity
   assertions from the legacy event regression script.
3. Convert the existing legacy event-format regression cases into Vitest cases
   against the new pure event scoring module.

## Checkpoint 5: Pure Event Round Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `811c39e Add event config normalization`

Files changed since Checkpoint 4:

- Added `src/scoring/round.ts`.
- Added `src/scoring/eventRound.ts`.
- Added `tests/scoring/eventRound.test.ts`.

Implementation notes:

- Added pure score helpers for:
  - player hole score
  - player range score
  - pair best-ball score
  - pair aggregate score
  - pair range score
  - best-ball range score
  - pair match range wins
  - pair segment summaries
- Added pure event round scoring for:
  - best-ball Nassau style rounds
  - two-man best ball + aggy rounds
  - scramble event branches
- Ported the existing best-ball + aggy regression cases from the legacy script
  into Vitest against the new TypeScript scoring module.
- Event scoring now receives an explicit `EventRoundInput` instead of reading
  global `ROUND` or `EVENT`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 8 files, 43 tests.
- `npm run build`: passed.

Next recommended steps:

1. Add more event scoring coverage for best-ball Nassau, scramble match play,
   and stroke-play branches.
2. Port skins scoring as the next standalone game module.
3. Continue porting one scoring module at a time with golden tests before
   stores or UI consume them.

## Checkpoint 6: Event Scoring Branch Coverage

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `a86019e Add pure event round scoring`

Files changed since Checkpoint 5:

- Updated `tests/scoring/eventRound.test.ts`.

Implementation notes:

- Added event scoring tests for:
  - best-ball Nassau match play
  - best-ball Nassau stroke play
  - four-man scramble match play
  - four-man scramble stroke play
- Corrected test expectations around Nassau overall points after validating
  front/back/overall scoring math.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 8 files, 47 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port skins scoring as `src/scoring/skins.ts`.
2. Include tests for gross/net skins, incomplete holes, tied holes, and the
   current legacy no-carry result behavior.
3. Then move to best-ball/two-ball/aggy team game modules.

## Checkpoint 7: Skins Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `3ca99ff Expand event scoring coverage`

Files changed since Checkpoint 6:

- Added `src/scoring/skins.ts`.
- Added `tests/scoring/skins.test.ts`.

Implementation notes:

- Ported the current legacy skins behavior as a pure function.
- Current parity behavior is net-only skins, matching legacy `computeSkins()`.
  The legacy UI has a skins type config, but the old scoring helper does not
  currently branch on gross vs net.
- Skins stop at the first incomplete hole.
- Tied holes award no skin and do not carry a pending pot in the current parity
  implementation.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 9 files, 52 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port best-ball, two-ball, and aggy team scoring totals.
2. Add tests for partial rounds and completed front/back/overall totals.
3. Decide later whether to intentionally fix gross skins/carry behavior after
   parity is fully protected.

## Checkpoint 8: Team Game Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `bc8fdbc Add skins scoring module`
- Empty Vercel trigger commit was pushed as `bc036bd Trigger Vercel rewrite preview`

Files changed since Checkpoint 7:

- Added `src/scoring/teamGames.ts`.
- Added `tests/scoring/teamGames.test.ts`.

Implementation notes:

- Ported best-ball, two-ball, and aggy team game helpers.
- Supports gross and net score modes.
- Preserves legacy partial-round behavior: totals include completed holes and
  skip incomplete holes.
- Returns `null` totals when no complete holes exist.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 10 files, 59 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port pair match play and head-to-head helpers.
2. Port Stableford scoring.
3. Continue keeping each scoring module pure and covered before stores/UI use it.

## Checkpoint 9: Pair Match and Head-to-Head Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `29894d7 Add team game scoring`

Files changed since Checkpoint 8:

- Added `src/scoring/pairMatch.ts`.
- Added `src/scoring/headToHead.ts`.
- Added `tests/scoring/pairMatch.test.ts`.
- Added `tests/scoring/headToHead.test.ts`.

Implementation notes:

- Ported pair-match repair/default generation behavior.
- Ported best-ball pair match scoring with configurable points per hole and
  gross/net modes.
- Added support for the best-ball + aggy point mode used by event rounds.
- Ported head-to-head total comparison with gross/net scoring.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 12 files, 67 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port Stableford scoring with configurable point map.
2. Port three-man Nassau.
3. Port Wolf and putt poker after the simpler scoring modules are covered.

## Checkpoint 10: Stableford Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `c764bab Add pair match and head-to-head scoring`

Files changed since Checkpoint 9:

- Added `src/scoring/stableford.ts`.
- Added `tests/scoring/stableford.test.ts`.

Implementation notes:

- Ported Stableford point mapping from the legacy monolith.
- Added pure per-player Stableford totals with configurable point maps.
- Preserved legacy behavior where incomplete holes are skipped and the player
  still receives totals for completed holes.
- Supports gross and net scoring by reusing the shared player-hole score helper.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 13 files, 73 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port three-man Nassau.
2. Port Wolf scoring after three-man Nassau is covered.
3. Port putt poker and then begin wiring pure modules into Pinia stores/UI.

## Checkpoint 11: Three-Man Nassau Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Current pushed commit: `29d14f1 Add stableford scoring`

Files changed since Checkpoint 10:

- Added `src/scoring/threeManNassau.ts`.
- Added `tests/scoring/threeManNassau.test.ts`.

Implementation notes:

- Ported three-man Nassau scoring from the legacy monolith as pure helpers.
- Added the front, back, and overall segment definitions.
- Scores each player as solo against the other two players' best ball.
- Preserves legacy partial-round behavior: incomplete solo or side segments
  remain open, while completed side holes require both side players.
- Supports gross and net scoring by reusing the shared range scoring helpers.
- Added a pure settlement helper for the legacy amount-per-opponent payout
  behavior.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 14 files, 81 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port Wolf scoring.
2. Port putt poker after Wolf scoring is covered.
3. Begin wiring pure modules into Pinia stores/UI once remaining scoring
   helpers are protected.

## Checkpoint 12: Wolf Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Current pushed commit: `c66d9f4 Update three-man Nassau handoff`

Files changed since Checkpoint 11:

- Added `src/scoring/wolf.ts`.
- Added `tests/scoring/wolf.test.ts`.
- Updated `README.md`.

Implementation notes:

- Ported Wolf scoring from the legacy monolith as pure helpers.
- Added default per-hole Wolf config generation, preserving the rotating wolf
  and first available partner behavior.
- Added per-hole result scoring for partner and solo modes.
- Added overall-only and Nassau front/back/overall segment helpers.
- Added segment winner detection and pure settlement for the winner-take-pot
  behavior, split on ties.
- Preserved legacy behavior where pushes do not carry and incomplete holes
  award no points.
- Supports gross and net scoring by reusing the shared player-hole score helper.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 15 files, 91 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port putt poker.
2. Begin wiring pure modules into Pinia stores/UI once putt poker is covered.
3. Keep README and CHECKPOINTS current before handing off.

## Checkpoint 13: Putt Poker Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `71bf1ce Clarify Wolf handoff status`

Files changed since Checkpoint 12:

- Added `src/scoring/puttPoker.ts`.
- Added `tests/scoring/puttPoker.test.ts`.
- Updated `README.md`.

Implementation notes:

- Ported putt poker from the legacy monolith as pure helpers. The actual legacy
  oracle is `computePuttPoker()` and `puttPenaltyNote()` (the handoff's named
  `puttPokerCards()` / `bestPokerHand()` / `renderPuttPokerPanel()` helpers do
  not exist in `legacy/index.html`; there is no poker-hand evaluation in the
  current app).
- `computePuttPoker(putts, players, pot)` returns card counts, the coin holder,
  the running pot, and per-player 3-putt/4+ putt counts.
- Every player starts with two cards. A no-putt hole adds two cards, a one-putt
  adds one, and a two-putt changes nothing.
- A three-putt hands the coin and adds $1; a four-or-more putt hands the coin
  and adds $2. The coin follows the most recent penalty in hole order, then
  player order, matching the legacy loop.
- Putts are read through the shared `scoreAt`/`cellValue` helpers, so raw
  numbers and timed putt cells both work.
- Parity check against the legacy settlement flow: putt poker is intentionally a
  standalone pot and is **not** part of `computePlayerPnL()` / `computeSettlement()`.
  It only feeds the putt poker panel display, so no settlement P&L helper was
  added.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 16 files, 101 tests.
- `npm run build`: passed.

Next recommended steps:

1. Begin wiring the pure scoring modules into Pinia stores/UI screens.
2. Keep `legacy/index.html` as the parity oracle during UI cutover.
3. Treat scoring parity and RLS verification as hard gates before UI cutover.

## Checkpoint 14: Settlement Aggregation

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `af6964a Add putt poker scoring`

Files changed since Checkpoint 13:

- Added `src/scoring/settlement.ts`.
- Added `tests/scoring/settlement.test.ts`.
- Updated `README.md`.

Implementation notes:

- Discovered a gap while planning the UI phase: the individual game modules were
  all ported, but the legacy `computePlayerPnL()` settlement aggregator and the
  `computeSettlement()` transfer matcher had not been. The results screen needs
  both, so they were ported first.
- `computePlayerPnL(input)` is a pure port that composes the existing skins,
  team game, head-to-head, Stableford, three-man Nassau, and Wolf modules into a
  single per-player profit/loss map. It takes an explicit `SettlementInput`
  instead of reading global `ROUND`.
- Scramble settlement reads the team score matrix directly through `scoreAt`,
  reproducing the legacy `teamScoreRange()` behavior.
- `computeSettlement(pnl)` is a faithful port of the greedy largest-debtor /
  largest-creditor transfer minimizer.
- Parity quirks preserved: putt poker and pair match play are NOT part of the
  P&L. `gamesHaveBets()` was also ported and DOES count putt poker, because the
  legacy results screen uses it only to decide whether to show the settlement
  section.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 17 files, 112 tests.
- `npm run build`: passed.

Next recommended steps:

1. Build the Pinia round store as the UI foundation (state, localStorage
   persistence, derived `players`/`courseHandicaps`/`strokes`/`scoreContext`
   getters, and score/putt mutation with cell timestamps).
2. Expose the pure scoring modules (including settlement) as store getters.
3. Then wire screens one at a time against `legacy/index.html`.

## Checkpoint 15: Pinia Round Store

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `b4c2a88 Add settlement aggregation`

Files changed since Checkpoint 14:

- Added `src/stores/round.ts`.
- Added `tests/stores/round.test.ts`.
- Added `tests/setup.ts` (localStorage polyfill for jsdom).
- Updated `vite.config.ts` to register the test setup file.
- Updated `README.md`.

Implementation notes:

- Added the first Pinia store, `useRoundStore`, as the UI foundation. It holds
  the active `RoundState` plus the player handicap-index `PlayerMap`.
- `emptyRound()` reproduces the legacy default round shape; `normalizeRoundState()`
  reproduces legacy `loadState()`/`normalizeRound()` repair (normalize games,
  backfill wolf/teamNames/pairMatches, re-derive playing groups from the roster).
- Derived getters mirror the legacy globals: `playerNames` (team1 then team2),
  `courseHandicaps` (`computeWHSCourseHcp` with `parTotal || sum(par)` fallback),
  `strokes` (`allocateNetStrokes`), and `scoreContext` for the pure modules.
- Scoring getters wire the pure modules to the live round: `skins`, `settlement`
  (P&L + transfers), `hasBets`, and the `puttPokerFor(groupPlayers)` action.
- `setScore`/`setPutt`/`setTeamScore` write timestamped cells via `writeCell()`
  and grow rows to 18 holes; out-of-range holes are ignored.
- Persistence: the round and player map are serialized together under
  `localStorage` key `dmi_round`. This is the store's own persistence; it is not
  yet byte-compatible with the legacy `dmi_round`/`dmi_group` split or the DB
  `rounds.state` sync shape. That reconciliation is deferred to the sync-wiring
  step. `roundForDb()` in legacy embeds `players` into state, which this store
  mirrors in spirit.
- Test infra: jsdom under Vitest does not expose a working `Storage`, so
  `tests/setup.ts` installs a minimal in-memory `localStorage` polyfill,
  registered via `test.setupFiles`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 18 files, 122 tests.
- `npm run build`: passed.

Next recommended steps:

1. Wire the first real screen against the store (round setup or the scorecard),
   validating layout/behavior against `legacy/index.html`.
2. Add a group/event store if the chosen screen needs group membership or event
   config beyond the round itself.
3. Reconcile the store's localStorage/DB persistence shape when realtime sync is
   wired.

## Checkpoint 16: Scorecard Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `82ef5d5 Add Pinia round store`

Files changed since Checkpoint 15:

- Added `src/components/screens/ScorecardScreen.vue`.
- Added `src/fixtures/demoRound.ts`.
- Added `tests/screens/scorecard.test.ts`.
- Added a `playerTotals` getter to `src/stores/round.ts`.
- Updated `src/router/index.ts` (added the `/scorecard` route).
- Updated `src/components/screens/HomeScreen.vue` (demo-round entry buttons).
- Updated `tests/smoke/app.test.ts` for the new HomeScreen.
- Updated `README.md`.

Implementation notes:

- First real rewrite screen. It renders player rows, par and stroke-index rows,
  per-hole score inputs with birdie/bogey color coding and net-stroke dots,
  OUT/IN/TOT/NET/SKN columns, and a live settlement panel.
- All scoring is read from round store getters. Added `playerTotals` to the
  store (gross out/in/total, net total, skins) so the component does no scoring
  math beyond display formatting.
- `demoRound.ts` seeds a ready-to-score sample (two teams of two, skins + net
  best-ball + putt poker enabled) so the screen is reachable from the home
  screen before the full setup flow exists.
- Score inputs write through `store.setScore`, which records timestamped cells.
- The smoke test now mocks `vue-router` and installs Pinia, because HomeScreen
  uses the router and store.

Browser verification (Vite dev server, preview tool):

- Home screen renders with "Start demo round" / "Open scorecard".
- Scorecard renders the demo roster, correct WHS course handicaps (e.g. index
  21.0 -> course hcp 25, +20 strokes) and stroke-dot allocation.
- Entering Wes's full front nine updated OUT to 34 live; birdies rendered green.
- Settlement correctly stayed "All square" with only one complete card, since
  team games and skins require every scorer on a hole.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 19 files, 126 tests.
- `npm run build`: passed (scorecard is a lazy-loaded route chunk).

Not yet ported from the legacy scorecard (future checkpoints):

- Scramble / best-ball / two-ball team rows and the pair-match and wolf live
  panels.
- Putt entry rows and the putt poker panel UI.
- Playing-group filtering and the mobile hole-by-hole entry mode.

Next recommended steps:

1. Extend the scorecard with putt entry rows + the putt poker panel (the store
   already exposes `puttPokerFor`), or
2. Build the round setup screen so rounds can be created without the demo
   fixture, then
3. Add a group/event store when a screen needs membership or event config.

## Checkpoint 17: Putt Entry and Putt Poker Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `5f9473a Add scorecard screen`

Files changed since Checkpoint 16:

- Updated `src/components/screens/ScorecardScreen.vue` (collapsible putt rows +
  putt poker panel).
- Added a `readPutt` action to `src/stores/round.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.

Implementation notes:

- Each player row now has a collapsible putt-tracking row, toggled by a chevron
  in the name cell. Putt inputs write through `store.setPutt` (timestamped
  cells) and are colored like legacy: green for 0-1 putts, neutral for 2, red
  for 3+. Putt OUT/IN/TOT sums are shown.
- Added a `readPutt` store action mirroring `readScore`.
- The putt poker panel renders per playing group (falling back to the two teams
  when no groups), showing the coin holder, each player's card count, penalty
  notes via `puttPenaltyNote`, and the running pot. All values come from
  `store.puttPokerFor`; the component does no putt poker math itself.
- The panel and putt rows only render when `games.puttPoker.enabled`.

Browser verification (preview tool, demo round):

- Entered all four cards plus putts including a Wes 3-putt (hole 1) and a Q
  4-putt (hole 7).
- Coin correctly went to Q (latest penalty by hole order); cards showed Wes ×4
  (two 1-putts), others ×2; penalty notes "1x 3-putt" and "1x 4+ putt".
- Pot showed $11 = $8 base ($2 x 4) + $1 (3-putt) + $2 (4-putt).
- Putt cell colors and OUT/IN/TOT putt sums rendered correctly.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 19 files, 128 tests.
- `npm run build`: passed.

Next recommended steps:

1. Build the round setup screen so real rounds can be created without the demo
   fixture (this is the planned Checkpoint 18).
2. Then add scramble/best-ball/two-ball team rows and the pair-match/wolf live
   panels to the scorecard.

## Checkpoint 18: Round Setup Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `1d9fd32 Add putt entry rows and putt poker panel`

Files changed since Checkpoint 17:

- Added `src/components/screens/SetupScreen.vue`.
- Added `tests/screens/setup.test.ts`.
- Updated `src/router/index.ts` (added the `/setup` route).
- Updated `src/components/screens/HomeScreen.vue` ("New round" button).
- Updated `README.md`.

Implementation notes:

- The setup screen creates a round without the demo fixture. Sections: course
  (club/course/location, tee rating/slope, an editable par + SI grid prefilled
  to a par-72 layout), teams and players (name + handicap index + team per row,
  add/remove), and a games config (skins, best ball, two-ball, aggy,
  head-to-head, Stableford, three-man Nassau, Wolf, putt poker).
- "Start round" validates (par present, both teams populated, unique names),
  builds the `RoundState` and player handicap map, generates head-to-head
  matchups by zipping `team1[i]` vs `team2[i]` (matching legacy setup), writes
  through `store.setRound`, and routes to the scorecard.
- The player handicap map is managed directly on the round store; no separate
  group/players store was needed for round creation.

Browser verification (preview tool):

- Filled four players (Ann 10, Bea 12 on Team 1; Cal 6, Dan 20 on Team 2),
  enabled skins ($5) and best ball (net 10/10/20), clicked Start round.
- Landed on the scorecard with correct teams, course handicaps (Ann +4, Bea +6,
  Cal +0, Dan +14 relative to scratch Cal), stroke-dot allocation, the zipped
  matchups (Ann vs Cal, Bea vs Dan), and the settlement section enabled.
- Note: the preview_click tool did not trigger the Vue submit handler on this
  page (a direct DOM `.click()` did); this looks like a preview-harness quirk,
  not an app bug. Component tests cover the submit path.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 20 files, 132 tests.
- `npm run build`: passed (setup is a lazy-loaded route chunk).

Next recommended steps:

1. Add scramble / best-ball / two-ball team rows and the pair-match and wolf
   live panels to the scorecard (and their setup config).
2. Build a results screen (leaderboard, team scores, per-game breakdowns) on top
   of the existing settlement/scoring getters.
3. Consider a group/event store and Supabase wiring when membership, course
   search, or realtime sync are needed.

## Checkpoint 19: Results Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `1f0c6a3 Add round setup screen`

Files changed since Checkpoint 18:

- Added `src/components/screens/ResultsScreen.vue`.
- Added `tests/screens/results.test.ts`.
- Updated `src/router/index.ts` (added the `/results` route).
- Updated `src/components/screens/HomeScreen.vue` (View results button).
- Updated `src/components/screens/ScorecardScreen.vue` (Results navigation).
- Updated `src/stores/round.ts` with results getters and completion action.
- Updated `tests/stores/round.test.ts`.
- Updated `README.md`.

Implementation notes:

- Added the first rewrite results view, routed at `/results`.
- Results shows team net scores, an individual leaderboard, settlement P&L and
  transfers, enabled team-game front/back/total breakdowns, and skins results.
- Store getters now expose:
  - `leaderboard`
  - `teamNetTotals`
  - `teamGameResults`
- `teamGameResults` composes `computeTeamTotals()` for best ball, two-ball, and
  aggy; scramble reads manually entered team scores through `scoreAt()`.
- `setCompleted()` marks a local round complete or reopens it, preserving the
  legacy `completeRound()` interaction shape until Supabase history persistence
  is wired.
- Components continue to read all scoring through the store instead of
  recomputing scoring in the UI.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 141 tests.
- `npm run build`: passed (results is a lazy-loaded route chunk).

Not yet ported from legacy results/game detail views:

- Pair-match, Wolf, Stableford, three-man Nassau, and putt-poker specific
  results/detail panels.
- Completed-round save to group history.
- Supabase-backed active/completed round status sync.

Next recommended steps:

1. Extend the scorecard + setup with scramble/team score rows and pair-match
   setup/live panels, or add the missing per-game detail panels to results.
2. Build the group/Supabase layer when membership, course search, history, or
   realtime sync becomes the next priority.
3. Keep README and this checkpoint file current before every push.

## Checkpoint 20: Scramble Setup and Team Score Rows

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `88ced8b Add results screen`

Files changed since Checkpoint 19:

- Updated `src/components/screens/SetupScreen.vue`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/stores/round.ts`.
- Updated `tests/screens/setup.test.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added 4-man scramble to the setup screen games list with front/back/total
  money fields. The rewrite preserves the legacy gross-only scramble model.
- Added `store.readTeamScore(teamKey, hole)` to mirror `readScore()` and
  `readPutt()` for `round.teamScores`.
- Scorecard now renders one 4-man scramble gross team-score row per side when
  `games.scramble4.enabled` is true.
- Scramble team rows write through `store.setTeamScore()`, use timestamped
  cells, apply the existing gross score color classes, and show OUT/IN/TOT
  summaries.
- Results already consumed `teamScores`, so scramble results and settlement are
  now reachable from normal setup + scorecard entry.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 143 tests.
- `npm run build`: passed.
- Browser QA at `http://127.0.0.1:5173/`:
  - `/setup` rendered the 4-Man Scramble row.
  - Created a four-player round with scramble enabled.
  - `/scorecard` rendered two scramble rows.
  - Entering a Team 1 hole score persisted in the row.
  - No page-level horizontal overflow was detected.

Next recommended steps:

1. Add best-ball and two-ball derived team rows to the scorecard.
2. Add pair-match setup configuration and the pair-match live/results panels.
3. Add Wolf live/results UX once pair-match parity is in better shape.
4. Keep README and checkpoints current before each push.

## Checkpoint 21: Derived Team Format Rows

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `5e1beea Add scramble team scoring rows`

Files changed since Checkpoint 20:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `tests/stores/round.test.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.scorecardTeamRowsFor(teamKey)` to expose scorecard-ready derived
  team rows while keeping scoring logic out of the component.
- The store now returns Best Ball and 2-Ball row values from
  `computeTeamHoleStats()` / `computeTeamTotals()` with the active game score
  type.
- Scorecard renders those rows under each team when Best Ball or 2-Ball are
  enabled.
- Rows are read-only, matching the legacy behavior: player score edits drive
  the derived team row values.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 145 tests.
- `npm run build`: passed.
- Browser QA at `http://127.0.0.1:5173/`:
  - Demo scorecard rendered Best Ball rows.
  - Entering player scores updated the derived row values.
  - No page-level horizontal overflow was detected.

Next recommended steps:

1. Add pair-match setup configuration.
2. Add pair-match live and results panels.
3. Add Wolf live/results UX.
4. Then move toward group/Supabase course search, membership, history, and
   realtime sync.

## Checkpoint 22: Pair Match Setup, Live Panel, and Results

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `e9ab93b Add derived team scorecard rows`

Files changed since Checkpoint 21:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/SetupScreen.vue`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/setup.test.ts`
  - `tests/screens/scorecard.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.pairMatchResult`, a store-derived display result that wraps the
  pure `computePairMatchPlay()` scorer and includes front/back/overall segment
  labels for each match.
- Added pair-match setup controls:
  - enable/disable Pair Match Play
  - points per hole
  - net/gross score type
  - explicit two-player-per-side match pairing builder
- New rounds persist repaired/default pair matches from setup.
- Scorecard renders a live Pair Match Play panel with total points/holes, match
  cards, per-hole winner chips, and front/back/total status.
- Results renders a Pair Match Play section with team totals and per-match
  front/back/overall breakdowns.
- Narrow viewport handling keeps the pair-match hole grid and result tables
  scrollable inside their panels instead of widening the page.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 149 tests.
- `npm run build`: passed.
- Browser QA at `http://localhost:5173/`:
  - Created a four-player round through `/setup`.
  - Enabled Pair Match Play and confirmed the setup pairing builder appeared.
  - Started the round and confirmed `/scorecard` rendered the live pair-match
    panel.
  - Entered first-hole scores and confirmed the live panel showed Team 1 up
    1-0.
  - Opened `/results` and confirmed the Pair Match Play section showed the
    matching front/overall result.
  - Mobile viewport `390x844`: no page-level horizontal overflow; scorecard
    pair-hole chips scroll inside the card; results pair table stays contained.
  - Browser console errors: none.

Next recommended steps:

1. Add Wolf live/results UX.
2. Add the remaining per-game results panels for Stableford, three-man Nassau,
   putt poker detail, and other legacy detail sections.
3. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
4. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 23: Wolf Live Panel and Results

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `cdf7246 Add pair match panels`

Files changed since Checkpoint 22:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/scorecard.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.wolfResult`, a store-derived display result that wraps the pure
  Wolf scorer and exposes:
  - per-hole Wolf config/result rows
  - point standings
  - optional Nassau front/back/overall segments
  - settled-hole count
- Added `store.setWolfHole()` so components can edit wolf/mode/partner state
  without mutating round internals directly.
- Scorecard renders an editable Wolf panel with hole, wolf, choice, partner,
  field, result, and points columns.
- Results renders Wolf standings, optional Nassau segment rows, and the
  hole-by-hole Wolf side / field / result / points table.
- Tables use horizontal containment for narrow screens instead of widening the
  page.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 152 tests.
- `npm run build`: passed.
- Browser QA note:
  - In-app browser could inspect pages, but form typing/localStorage seeding was
    blocked by the browser sandbox.
  - The standalone Playwright/Chrome QA path required broad macOS access and was
    rejected intentionally.
  - No broad access is required for this checkpoint; coverage is from unit,
    store, screen, event-format, and build verification.

Next recommended steps:

1. Add the remaining per-game results panels for Stableford, three-man Nassau,
   and putt poker detail.
2. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 24: Stableford Results Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `626f420 Add wolf panels`

Files changed since Checkpoint 23:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.stablefordResult`, a store-derived display result that wraps the
  pure `computeStableford` scorer and exposes:
  - enabled flag, score type, and per-player buy-in
  - per-player rows (points + completed holes) sorted best-first
  - a `leader` flag on the top scorer with completed holes for highlighting
- Results renders a Stableford points table (Player / Points / Holes), placed
  before the Wolf section to match the legacy `renderStablefordResults()` order.
- The component does no scoring math; it reads the getter and formats only.
- The pure `computeStableford` module and its tests already existed
  (Checkpoint 10); this checkpoint only wires the display layer.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 154 tests.
- `npm run build`: passed.
- Browser QA note:
  - Seeding a Stableford-enabled round needs form/localStorage input that the
    in-app browser sandbox blocked in prior checkpoints; no broad macOS access
    was requested.
  - Coverage is from the new store getter test and a screen test that mounts the
    real `ResultsScreen` and asserts the rendered Stableford table, plus
    event-format and build verification.

Next recommended steps:

1. Add the remaining per-game results panels for three-man Nassau and putt poker
   detail.
2. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 25: 3-Man Nassau Results Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `24b94ce Add stableford results panel`

Files changed since Checkpoint 24:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.threeManNassauResult`, a store-derived display result that wraps
  the existing pure `threeManNassauResults` scorer and exposes:
  - enabled flag, score type, and per-opponent amount
  - `valid` flag (false when roster ≠ 3 players — the pure module requires
    exactly 3)
  - per-segment rows (Match / Nassau / Solo score / Best Ball / Result) with a
    `resultLabel` string matching the legacy format
- Results renders a 3-Man Nassau section (after Stableford, before Wolf,
  matching legacy order). When the roster is not exactly 3 players it shows a
  "Requires exactly 3 players" note instead of an empty table.
- The component does no scoring math; it reads the getter only.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 157 tests.
- `npm run build`: passed.
- Browser QA: blocked by browser sandbox as in prior checkpoints; no broad
  macOS access requested. Coverage is from store getter tests (invalid-roster
  and valid 3-player round) plus a screen test asserting the "Requires exactly
  3 players" note for a 4-player demo round.

Next recommended steps:

1. Add the putt poker detail results panel (the last remaining per-game panel).
2. Start the group/Supabase layer for course search, group membership, history,
   and realtime sync.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Current Handoff: 3-Man Nassau Results Panel Live

Date: 2026-06-08

Branch:

- `rewrite`
- The 3-Man Nassau panel commit will be the latest after this checkpoint is
  pushed.
- Worktree status at handoff: clean after pushing Checkpoint 25.
- Vercel production branch tracking is set to `rewrite`, so pushes to this
  branch should create deployments.

Most recent verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 157 tests.
- `npm run build`: passed.
- Browser QA:
  - Checkpoint 22 pair-match browser QA passed.
  - Checkpoints 23–25 browser QA blocked by browser-tool sandbox; no broad
    macOS access requested.
  - All three panels are covered by focused store and screen tests.

Current implementation state:

- The full pure scoring layer plus the Pinia round store are complete and
  covered.
- A real local create-score-results flow works end to end: `/setup` builds a
  round (course, teams, players, games) and `/scorecard` scores it live with
  score entry, net/skins columns, putt rows, the putt poker panel, and
  settlement. `/results` shows team scores, leaderboard, team-game breakdowns,
  pair-match breakdowns, Wolf standings/detail tables, the Stableford points
  table, the 3-Man Nassau segment table, skins, and settlement. 4-man scramble
  can be enabled from setup, scored through team rows on the scorecard, and
  displayed/settled through results. Best Ball and 2-Ball render read-only
  derived team rows driven by player scores. Pair Match Play can be configured
  from setup and renders live scorecard plus results panels. Wolf can be
  configured from setup, adjusted per hole on the scorecard, and shown in
  results. All scoring is read from store getters/actions.
- `HomeScreen.vue` links to New round (`/setup`), Start demo round, the
  scorecard, and results. Routing: `/`, `/setup`, `/scorecard`, `/results`.
- Still demo/local only: no group membership, no Supabase course search, and no
  realtime sync. Results still lacks the legacy per-game detail panel for
  putt poker.
- The old monolith remains available as the parity oracle at
  `legacy/index.html`.

The next task should begin (pick one):

- Add the putt poker detail panel to the results screen (the last remaining
  per-game panel).
- Start the group/Supabase layer for course search, group membership, history,
  and realtime sync.
- Keep reusing store getters; do not recompute scoring in components. Validate
  against `legacy/index.html`.
- After each step, run:
  - `node scripts/event-format-tests.js`
  - `npm run test:run`
  - `npm run build`
- Add the next checkpoint, then commit and push to `origin/rewrite`.
