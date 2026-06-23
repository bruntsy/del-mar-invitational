# Rotation Sixes Game Spec

Date: 2026-06-23
Branch reviewed: `rewrite`
Repo state reviewed: `b3378e5`, already up to date with `origin/rewrite`

## Summary

Add a new standalone four-player game called **Rotation Sixes**.

Traditional golf naming for this format is **Round Robin**, also known as
**Hollywood** or **Sixes**: four players compete in two-player sides and rotate
partners every six holes. The app should use **Rotation Sixes** as the primary
product label, with helper copy such as `Round Robin / Sixes` in setup where a
golf shorthand is useful.

The game is always one foursome, three six-hole matches:

- Holes 1-6: Player 1 + Player 2 vs Player 3 + Player 4
- Holes 7-12: Player 1 + Player 3 vs Player 2 + Player 4
- Holes 13-18: Player 1 + Player 4 vs Player 2 + Player 3

Each six-hole match can be scored as one of:

- Best Ball
- High Ball / Low Ball
- Best Ball + Aggy

The game can be gross or net. Net scoring must use the existing course handicap
and stroke allocation infrastructure (`computeWHSCourseHcp`, `allocateNetStrokes`,
`getsStroke`, and `playerHoleScore`) without adding a separate handicap system.

V1 should be deliberately thin: store only the Rotation Sixes configuration,
derive the three matches from the current four-player order, reuse existing
score primitives, reuse existing match/results UI patterns, and avoid new
persistence or event concepts.

## Goals

- Let a user select Rotation Sixes as a new game during round setup.
- Make Rotation Sixes available only for ad hoc rounds, not event round format
  selection.
- Let a user choose the Rotation Sixes scoring variant: Best Ball, High/Low, or
  Best Ball + Aggy.
- Let a user choose gross or net scoring.
- Let a user set a single dollar stake per person per six-hole match.
- Dynamically show match progress on the scorecard as hole scores are entered.
- Show final match winners, player gross/net totals, player P&L, and peer-to-peer
  payments on the results screen.
- Keep the implementation aligned with the current architecture: scoring in pure
  `src/scoring/*` modules, state derivation in `src/stores/round.ts`, and Vue
  screens rendering derived data.

## Non-Goals For V1

- Presses.
- Carryovers.
- Manual partner rotation.
- More than four players in this game.
- Event/Ryder points integration.
- Event round format selection in `EventConfigEditor.vue`.
- Team-level scramble entry.
- Coexistence with other fixed-team or pair-match games.
- Optimized net settlement that collapses all debts. Rotation Sixes settlement
  should preserve match-derived peer-to-peer payments first.

## Codebase Review Notes

The current rewrite app is a Vue 3 + TypeScript + Pinia app. Game config lives in
`src/types/games.ts` and defaults/normalization live in `src/domain/games.ts`.
Round persistence is JSON-shaped through `RoundState.games`, so adding a new
optional game config is compatible with the existing localStorage and Supabase
round-state model as long as `normalizeGames()` provides defaults.

Existing scoring rules already cover the core math needed for this game:

- `src/scoring/round.ts`
  - `playerHoleScore()` handles gross/net scoring.
  - `pairBestBallScore()`, `pairHighBallScore()`, and `pairAggyScore()` are the
    exact per-hole primitives needed for the three Rotation Sixes variants.
- `src/scoring/bestBallAggy.ts`
  - Already computes best-ball and aggregate contests per hole.
  - Already creates peer-to-peer ledger entries.
  - Current segment model is front/back/overall, so it should not be reused
    directly for six-hole matches.
- `src/scoring/highBallLowBall.ts`
  - Already computes low-ball and high-ball contests per hole.
  - Already creates peer-to-peer ledger entries.
  - Current segment model is front/back/overall, so it should not be reused
    directly for six-hole matches.
- `src/scoring/matchStatus.ts`
  - `runningMatchStatus()` and `finalMatchStatus()` are a good fit for Best Ball.
  - Do not build a generalized two-point closeout engine in V1. High/Low and
    Best Ball + Aggy can display simple component-point standings through the
    current six-hole segment, such as `A+B leads 5-3 thru 4`.
- `src/scoring/settlement.ts`
  - `computePlayerPnL()` accepts ledgers from combo games.
  - `computeSettlement()` currently minimizes net transfers. For Rotation Sixes,
    preserve raw match ledger entries for the game-detail UI, while continuing
    to include the amounts in net P&L.
- `src/stores/round.ts`
  - Existing getters expose derived results such as `bestBallAggyResults`,
    `highBallLowBallResults`, `twoManScrambleResults`, `leaderboard`, and
    `settlement`.
  - Add a `rotationSixesResult` getter and feed it into existing results and
    scorecard views.
- `src/components/screens/SetupScreen.vue`
  - Existing game toggles and pair-match setup are designed around two fixed
    teams. Rotation Sixes should be a separate game card that requires exactly
    four players and does not use the pair-match builder.
- `src/components/screens/ScorecardScreen.vue`
  - This is the right place for live progress. It already renders match-play
    panels for Best Ball + Aggy, High/Low, and Two-Man Scramble using pure
    scoring output. Adapt the existing `MpPanel` shape instead of adding a
    separate display model where possible.
- `src/components/screens/ResultsScreen.vue`
  - This is the right place for final match outcomes and payment detail. It
    already has the individual leaderboard, story card, settlement section, and
    match-game summaries. Reuse the current match-game table/card conventions.

## Product Behavior

### Setup

Add a new game option in Round Setup:

Label: `Rotation Sixes`
Secondary label: `Round Robin / Sixes`

Availability:

- Show Rotation Sixes only in ad hoc round setup.
- Hide Rotation Sixes when setup is launched from an event round
  (`event.pendingRoundLink != null`).
- Do not add Rotation Sixes to event round format controls in
  `EventConfigEditor.vue`.
- Do not add a new `EventRoundFormat` value for Rotation Sixes in V1.

Controls:

- Enable toggle.
- Variant segmented control:
  - `Best Ball`
  - `High / Low`
  - `Best Ball + Aggy`
- Basis segmented control:
  - `Net`
  - `Gross`
- Stake input:
  - Label: `$ / player / match`
  - Default: `0`
  - Example helper: `$5 means each player risks $5 in each six-hole match.`

Validation:

- Requires exactly four named players in the round.
- Requires a course with handicap indexes available when basis is net.
- Stake must be a number greater than or equal to zero.
- Rotation Sixes can coexist with skins and putt poker.
- Rotation Sixes cannot coexist in V1 with fixed-team or pair-match games:
  Best Ball, Best Ball + Aggy, High Ball / Low Ball, Two-Man Scramble,
  4-Man Scramble, or Wolf. Block start/save with a plain validation message.

Recommended player order source:

- Use the existing scorecard player order: `store.playerNames`, currently team1
  followed by team2.
- The setup screen should make the resulting rotation visible before start:
  `1-6 A+B vs C+D`, `7-12 A+C vs B+D`, `13-18 A+D vs B+C`.
- V1 does not need manual reorder if the user can control order by editing teams
  and player rows before launch.

Persistence:

- Persist only the game config under `round.games.rotationSixes`.
- Do not persist match objects, side assignments, running status, or payment
  rows.
- Derive match pairings from `store.playerNames.slice(0, 4)` every time the
  scoring getter runs.

### Scorecard

Recommendation: show Rotation Sixes in the existing match-play panel area, not
inside each score input row.

Why:

- The current scorecard already has a derived match-play panel pattern.
- This game has three matches and, for two variants, two component contests per
  hole. Inline score cells would become too dense on mobile.
- A panel can stay compact on desktop and become a per-hole summary card on
  mobile, matching the current mobile scorecard direction.
- Reuse/adapt the existing `MpPanel`, `MpMatch`, and `MpContest` display pattern
  in `ScorecardScreen.vue` so this slides into the current scorecard test
  surface.

Scorecard panel requirements:

- Header: `Rotation Sixes`
- Meta: `Net Best Ball`, `Gross High / Low`, or `Net Best Ball + Aggy`
- Show three match cards:
  - `Holes 1-6`
  - `Holes 7-12`
  - `Holes 13-18`
- Each card shows:
  - Side A players
  - Side B players
  - Current status
  - Holes/points played
  - Segment result if complete
  - Stake

Best Ball live status:

- One point is available per hole.
- Lower best-ball score wins the hole.
- Ties halve/push the hole for match status purposes.
- Display examples:
  - `All square thru 3`
  - `A+B 2 up thru 4`
  - `A+B wins 3 & 1`
  - `Push 3-3`

High / Low live status:

- Two component points are available per hole:
  - Low Ball: lower best score wins.
  - High Ball: lower high/worse score wins.
- Display component rows:
  - `Low Ball: A+B 2-1 thru 3`
  - `High Ball: C+D 2-1 thru 3`
- Display combined match status:
  - `A+B leads 4-2 thru 3`
  - `All square, 6-6`
  - `A+B wins 7-5`
- Do not display `3 & 1` closeout language for two-component variants in V1.
  Use component-point totals only.

Best Ball + Aggy live status:

- Two component points are available per hole:
  - Best Ball: lower best score wins.
  - Aggy: lower aggregate pair score wins.
- Display component rows:
  - `Best Ball: A+B 2-1 thru 3`
  - `Aggy: C+D 2-1 thru 3`
- Display combined match status the same way as High / Low.
- Do not display `3 & 1` closeout language for two-component variants in V1.
  Use component-point totals only.

Incomplete score behavior:

- A hole is incomplete until all four player scores required for that hole are
  entered.
- An incomplete hole should not affect match status.
- A six-hole match is incomplete until all six holes in that segment have all
  four scores entered.

### Results

Results screen should add a dedicated `Rotation Sixes` section before or near
the existing settlement section.

The section should show:

- Game basis and variant.
- Stake per player per match.
- Three match cards:
  - Hole range.
  - Pairing.
  - Component results.
  - Winner or `Push`.
  - Payments generated by that match.
- Player P&L from Rotation Sixes.

The existing `Individual Leaderboard` remains the source of player score totals:

- Gross
- Strokes received
- Net
- Rank

The existing settlement section should include Rotation Sixes in total net P&L,
but the Rotation Sixes section should also show the game-native peer-to-peer
payments before netting.

Do not change the global `computeSettlement()` behavior in V1. It should
continue to minimize net transfers for the global settlement table. Rotation
Sixes-specific raw payments belong only in the Rotation Sixes result detail.

## Scoring Rules

### Shared Rules

All Rotation Sixes scoring is match play over each six-hole segment.

Segments:

- `one`: holes 1-6, zero-based range `[0, 6)`
- `two`: holes 7-12, zero-based range `[6, 12)`
- `three`: holes 13-18, zero-based range `[12, 18)`

Score basis:

- `gross`: use raw score.
- `net`: use `playerHoleScore(context, player, hole, 'net')`, which applies
  relative net strokes using the course stroke index.

Tie behavior:

- Tied component holes are pushed.
- Tied six-hole matches are pushed.
- No carryovers.
- No payment is generated for pushed matches.

### Best Ball Variant

For each hole:

- Side A score = lower score of its two players.
- Side B score = lower score of its two players.
- Lower side score wins the hole.
- Ties push the hole.

For the six-hole match:

- The side with more holes won wins the match.
- If both sides win the same number of holes, the match pushes.

### High / Low Variant

For each hole:

- Low Ball component:
  - Side score = lower score of its two players.
  - Lower side score wins one component point.
- High Ball component:
  - Side score = higher score of its two players.
  - Lower side score wins one component point.

For the six-hole match:

- Sum component points across the six holes.
- Maximum available = 12 component points.
- The side with more component points wins the match.
- If both sides have the same component points, the match pushes.

### Best Ball + Aggy Variant

For each hole:

- Best Ball component:
  - Side score = lower score of its two players.
  - Lower side score wins one component point.
- Aggy component:
  - Side score = sum of both player scores.
  - Lower side score wins one component point.

For the six-hole match:

- Sum component points across the six holes.
- Maximum available = 12 component points.
- The side with more component points wins the match.
- If both sides have the same component points, the match pushes.

## Settlement Rules

Stake meaning:

- `$5 / player / match` means every player risks `$5` in each six-hole match.
- If a side wins a six-hole match, each losing player pays each winning player
  half of the stake.
- For a two-player side, this creates four peer-to-peer entries.

Example:

- Stake = `$5`
- Match 1: A+B beat C+D
- Entries:
  - C pays A `$2.50`
  - C pays B `$2.50`
  - D pays A `$2.50`
  - D pays B `$2.50`
- Each winner nets `+$5`.
- Each loser nets `-$5`.

Rationale:

- This preserves peer-to-peer payment detail, as requested.
- It matches the existing combo-game ledger style in `bestBallAggy.ts` and
  `highBallLowBall.ts`, where losing side exposure is distributed across the
  winning side.

Results display:

- In the Rotation Sixes section, show raw match-generated payments.
- In the global Settlement section, continue showing net P&L and minimized
  payments.

## Proposed Types

Add to `src/types/games.ts`:

```ts
export type RotationSixesVariant = 'best_ball' | 'high_low' | 'best_ball_aggy';

export interface RotationSixesGameConfig {
  enabled: boolean;
  variant: RotationSixesVariant;
  scoreBasis: ScoreType;
  stakePerPlayer: number;
}
```

Add to `GameConfig`:

```ts
rotationSixes: RotationSixesGameConfig;
```

Add default in `src/domain/games.ts`:

```ts
rotationSixes: {
  enabled: false,
  variant: 'best_ball',
  scoreBasis: 'net',
  stakePerPlayer: 0,
}
```

Normalize with nested defaults in `normalizeGames()`.

No other persisted state is required for V1.

## Proposed Scoring Module

Add `src/scoring/rotationSixes.ts`.

Suggested public API:

```ts
export interface RotationSixesConfig {
  players: [string, string, string, string];
  variant: 'best_ball' | 'high_low' | 'best_ball_aggy';
  scoreBasis: 'gross' | 'net';
  stakePerPlayer: number;
}

export interface RotationSixesMatch {
  id: 'one' | 'two' | 'three';
  label: string;
  holes: [number, number];
  sideA: [string, string];
  sideB: [string, string];
}

export interface RotationSixesComponentResult {
  key: 'best_ball' | 'low_ball' | 'high_ball' | 'aggy';
  label: string;
  sideAPoints: number;
  sideBPoints: number;
  pushed: number;
  winnerSide: 'a' | 'b' | 'push' | 'open';
}

export interface RotationSixesMatchResult {
  match: RotationSixesMatch;
  complete: boolean;
  components: RotationSixesComponentResult[];
  sideAPoints: number;
  sideBPoints: number;
  winnerSide: 'a' | 'b' | 'push' | 'open';
  ledgerEntries: RotationSixesLedgerEntry[];
}

export interface RotationSixesResult {
  gameType: 'rotation_sixes';
  valid: boolean;
  validationError?: string;
  variant: RotationSixesConfig['variant'];
  scoreBasis: RotationSixesConfig['scoreBasis'];
  stakePerPlayer: number;
  matches: RotationSixesMatchResult[];
  ledgerEntries: RotationSixesLedgerEntry[];
}
```

Implementation notes:

- Export a helper like `defaultRotationSixesMatches(players)` so tests and UI
  share the same rotation.
- Use existing `pairBestBallScore`, `pairHighBallScore`, `pairAggyScore`, and
  `playerHoleScore`.
- Return `valid: false` when the config does not contain exactly four unique
  players.
- Avoid importing Vue, Pinia, or stores into this module.
- Keep this module as a small adapter over existing scoring primitives. Do not
  duplicate handicap calculation, score-cell parsing, skins logic, or global
  settlement minimization.

## Store Integration

Add a getter to `src/stores/round.ts`:

```ts
rotationSixesResult(state): RotationSixesResult | null {
  const context = this.scoreContext;
  if (!context || !state.round || !this.games.rotationSixes.enabled) return null;
  return scoreRotationSixes({
    players: this.playerNames.slice(0, 4) as [string, string, string, string],
    variant: this.games.rotationSixes.variant,
    scoreBasis: this.games.rotationSixes.scoreBasis,
    stakePerPlayer: this.games.rotationSixes.stakePerPlayer,
  }, context);
}
```

Add Rotation Sixes to:

- `computePlayerPnL()` via raw ledger application.
- `gamesHaveBets()`.
- Any setup summary lists of enabled games.
- Scorecard enabled-game labels.

Do not modify `computeSettlement()` for V1.

## UI Implementation Plan

1. Add the game config and defaults.
2. Add the pure `rotationSixes` scoring module with unit tests.
3. Add store getter and settlement integration.
4. Add ad-hoc-only setup UI card and strict V1 validation.
5. Adapt the existing scorecard match-play panel pattern for live progress.
6. Add results section using existing match-game summary conventions.
7. Add focused tests only around the new scorer, getter, setup validation, and
   one scorecard/results render path.

## Testing Plan

Pure scoring tests:

- Validates exactly four unique players.
- Builds the default three-match rotation.
- Scores gross Best Ball across holes 1-6.
- Scores net Best Ball with strokes applied by stroke index.
- Scores High/Low as two component points per hole.
- Scores Best Ball + Aggy as two component points per hole.
- Pushes tied six-hole matches.
- Marks a match incomplete when any required player score is missing.
- Generates four peer-to-peer ledger entries for a won match.

Store tests:

- `normalizeGames()` fills `rotationSixes`.
- `rotationSixesResult` returns null when disabled.
- `rotationSixesResult` derives from `store.playerNames` and `scoreContext`.
- `computePlayerPnL()` includes Rotation Sixes ledger entries.
- `gamesHaveBets()` detects nonzero `stakePerPlayer`.

Setup screen tests:

- Shows `Rotation Sixes` in game choices.
- Hides `Rotation Sixes` when setup is launched from an event round.
- Shows variant, basis, and stake controls when enabled.
- Blocks start when enabled with fewer or more than four players.
- Blocks start when Rotation Sixes is enabled with fixed-team or pair-match
  games other than skins and putt poker.
- Shows the default three-match rotation preview.
- Persists config into `store.round.games.rotationSixes`.

Scorecard screen tests:

- Shows a live Rotation Sixes panel when enabled.
- Shows three six-hole match cards.
- Shows component-point standings for either High/Low or Best Ball + Aggy.
- Does not show settlement on the live scorecard.

Results screen tests:

- Shows Rotation Sixes section.
- Shows all three match outcomes.
- Shows peer-to-peer match payments.
- Includes Rotation Sixes in player net P&L.

Existing regression coverage should continue to protect leaderboard, settlement
minimization, score entry, skins, putt poker, and existing pair-match games.

Regression gates:

```bash
npm run test:run
npm run build
```

Browser smoke after implementation:

- Desktop setup flow.
- Mobile setup flow at 390px width.
- Desktop scorecard live match panel.
- Results screen with final outcomes and payments.

## Open Product Questions For Later

- Should V2 allow manual player ordering for the rotation?
- Should V2 support presses per six-hole match?
- Should V2 allow separate stakes per six-hole match?
- Should V2 allow separate stakes per component for High/Low or Best Ball + Aggy?
- Should global settlement preserve raw peer-to-peer Rotation Sixes payments
  instead of minimizing all payments?

## References

- Traditional format name: Round Robin, also known as Hollywood or Sixes.
  https://en.wikipedia.org/wiki/Variations_of_golf
- Four-ball / better-ball background.
  https://www.golfmonthly.com/features/the-game/how-does-golfs-four-ball-format-work-245076
- Six-hole team match-play reference point.
  https://en.wikipedia.org/wiki/GolfSixes
