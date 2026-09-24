# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS, extended past the classic ruleset with extra pieces, power-ups, and an advanced scoring system (combo/T-Spin/Back-to-Back/Perfect Clear). No dependencies, no build process, no package.json — five files: `index.html`, `style.css`, `game.js`, `scoring.js`, `effects.js`.

## Running the game

There is no build/lint/test tooling. Open `index.html` directly, or serve it with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`. Changes to any of the JS/CSS/HTML files just require a browser refresh.

`scoring.js` also runs standalone under Node (it ends with `module.exports = Scoring` when `module` exists), so its pure functions can be sanity-checked without a browser:

```bash
node -e "const S = require('./scoring.js'); console.log(S.evaluateLock({ lines: 4, level: 1, spin: null, combo: 0, b2b: 0, boardEmpty: false }));"
```

## Architecture

Logic is split across three scripts, loaded in this order in `index.html` (each is a classic `<script>`, no modules — top-level `const`/`let` in one is visible to the ones loaded after it):

```
scoring.js  → pure scoring math, no DOM, no game state (Scoring)
effects.js  → event bus + visual/sound feedback, no game state (GameEvents, FloatingText, SoundFX)
game.js     → owns all game state, orchestrates the loop, calls into the other two
```

### `game.js` (~700 lines) — state and game loop

- **Board model**: `board` is a `ROWS × COLS` matrix where each cell is `0` (empty), a color index `1–12` identifying which piece locked there, `HOLE` (99, solid but undrawn — the NUT piece's center), or `WILD` (98, a removable joker block from the Tinte power-up). `COLS=10`, `ROWS=20`, `BLOCK=30` (pixel size) — these three plus the canvas `width`/`height` in `index.html` must stay in sync (`COLS × BLOCK` and `ROWS × BLOCK`).
- **Pieces**: `PIECES` holds square matrices for the 7 classic tetrominoes (1–7 = I,O,T,S,Z,J,L) plus 4 extra pieces used as challenges/rewards: `NUT` (8, 3×3 ring with a `HOLE` center), `PLUS` (9, pentomino), `PENTO_U` (10), `PENTO_Y` (11), and `SINGLE` (12, a 1×1 tile only ever handed out as a post-Tetris reward, never drawn at random — see `PIECE_WEIGHTS`). Rotation is done functionally via `rotateCW` (transpose + reverse), not via precomputed rotation states; `current.rot` (0–3) tracks how many quarter-turns have been applied, used by T-Spin detection.
- **Random piece selection** (`randomType`/`randomPiece`): weighted draw from `PIECE_WEIGHTS` (index = piece type, weight 0 = never drawn — `SINGLE` and the un-drawable slot 0), restricted to the type list of the active `gameMode` (`randomType(types = modeCfg().types)`). `makePowerPiece()` always draws from `CLASSIC_TYPES` (1–7) regardless of mode and stamps one random filled cell with a power-up code (see below).
- **Game modes** (`GAME_MODES`, keyed by `gameMode`): `classic` (types 1–7, no power-ups, no SINGLE reward), `classicPower` (types 1–7, power-ups on, no SINGLE reward), `extended` (types 1–11, power-ups on, SINGLE reward on). `modeCfg()` returns the active entry. The player picks a mode from the overlay's `#mode-menu` (or keys `1`/`2`/`3`) before `init()` ever runs — `startGame(mode)` sets `gameMode` and calls `init()`; `gameMode` is **not** reset by `init()`, so "Reiniciar" replays the same mode. `resolveLock()` checks `modeCfg().rewards`/`modeCfg().powerups` before queuing `rewardPending`/`powerupPending`; `updatePowerHUD()` shows `OFF` when the mode has no power-ups.
- **Collision** (`collide(shape, ox, oy)`): checks board bounds and overlap with already-locked cells. Used for movement, rotation, ghost-piece projection, and spawn validation. `isOccupied(x, y)` is a single-cell variant (treats side/bottom out-of-bounds as occupied, above-the-board as empty) used only by `Scoring.detectTSpin()`.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded. This is a simplified kick table, not the full SRS spec. On success it also updates `current.rot`, `lastAction = 'rotate'`, and `lastKick` (all consumed by T-Spin detection).
- **Power-ups**: cells `POWER_BASE + n` (n = index into `POWERUPS`) only ever exist inside a piece's `shape` while it's in flight — `merge()` detects them, fires `POWERUPS[n].apply(x, y)`, and bakes the piece's own color in their place, so `board`/rendering never need to know about them. Effects: `applyBomb` (3×3, radius `BOMB_RADIUS`), `applyRay` (clears a row or column), `applyTint` (converts the board's most common color to `WILD`), `applyGravity` (compacts each column downward), `applyFreeze` (halts automatic drop for `FREEZE_MS`, tracked in `freezeRemaining` and consumed in `loop()`). `resolveWildContacts()` flood-fills and removes any `WILD` blocks orthogonally touching the piece just locked. A power-up piece is queued (`powerupPending`) every `POWERUP_LINE_INTERVAL` lines cleared; it never preempts a pending Tetris reward (`rewardPending`).
- **Game loop** (`loop(ts)`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and drops the piece one row once `dropAccum >= dropInterval` — unless `freezeRemaining > 0` (Congelar power-up), in which case the timer counts down instead of dropping.
- **Locking & clearing**: `lockPiece()` → `Scoring.detectTSpin()` (reads `current` before it's baked in) → `merge()` (bakes the piece into `board`, resolves power-up triggers) → `collapseFullRows()` (bottom-up scan, splices full rows out and unshifts empty rows in, returns the count) → `resolveLock(cleared, spin)` (calls `Scoring.evaluateLock()`, applies the returned score/combo/B2B state, advances level/power-up queue, emits `GameEvents`) → `spawn()` (promotes `next` to `current`, generates a new `next` — a reward `SINGLE`, a queued power-up piece, or a random piece, in that priority order — and calls `endGame()` if the new piece immediately collides).
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece (`ghostY()` projects straight down, drawn at `globalAlpha=0.2`), and the current piece, every frame; skipped while `gameOver`. `drawBlock()` looks up color/glyph via `cellColor()`/`cellGlyph()`, which also handle `WILD` and in-flight power-up codes. `drawNext()` renders the preview piece on a separate small canvas (`next-canvas`).
- **State variables** (`board, current, next, score, lines, level, paused, gameOver, combo, b2bChain, lastAction, lastKick, ...` plus the power-up state block) are module-level `let` bindings reset by `init()`, not encapsulated in a class/object — keep this in mind when adding features, since most functions read/write these globals directly rather than taking parameters.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `Space`, `KeyX`, `KeyP`); movement/rotation is ignored while `paused || gameOver` except unpausing. Arrow-move/soft-drop/hard-drop set `lastAction` to `'move'`/`'drop'` so `Scoring.detectTSpin()` can tell a rotated-in placement from a slid-in one.

### `scoring.js` — pure scoring logic (combo, T-Spin, Back-to-Back, Perfect Clear)

Nothing here touches the DOM or game globals; everything is passed in and returned. See the file's own header comments for the full contract.

- **`Scoring.detectTSpin({ type, rot, x, y, kick, lastAction, isOccupied })`** → `null | 'mini' | 'full'`. Only applies to the T piece (`type === 3`) when `lastAction === 'rotate'`. Uses the "3-corner rule": of the 4 cells diagonal to the T's center, ≥3 must be occupied; which 2 are the "front" corners (facing the T's point) depends on `rot`, and decides mini vs. full. A mini promoted by an aggressive (`|kick| >= 2`) wall kick counts as full — a documented simplification of full SRS.
- **`Scoring.evaluateLock({ lines, level, spin, combo, b2b, boardEmpty })`** → `{ points, combo, comboMult, b2b, b2bApplied, difficult, perfectClear, breakdown, badges }`. Order of the calculation (see in-file comments for the exact formula): base score from `BASE_SCORES`/`TSPIN_SCORES`/`TSPIN_MINI_SCORES` depending on `spin` → Back-to-Back ×1.5 (`B2B_MULT`) if this is a "difficult" play (Tetris or any scoring T-Spin) and a B2B chain was already active → combo multiplier (`1 + comboCount`, capped at `COMBO_MAX_MULT`) → scaled by `level` → Perfect Clear bonus added on top (from `PERFECT_CLEAR_SCORES`/`PERFECT_CLEAR_B2B_TETRIS`, not multiplied by combo). A no-line turn resets `combo` to 0 but does **not** break the B2B chain by itself. `badges` (e.g. `'T-Spin Double'`, `'Combo x3'`, `'B2B'`, `'PERFECT CLEAR'`) feed directly into `effects.js`'s floating text.
- Power-up scoring (`POWER_SCORES` in `game.js`, applied inside `applyBomb`/`applyRay`/`resolveWildContacts`) is intentionally separate from this module and is **not** multiplied by combo/B2B.

### `effects.js` — feedback hooks (visual text + sound stubs)

- **`GameEvents`**: minimal `on`/`off`/`emit` pub-sub; each listener runs in a `try/catch` so a broken effect can't crash the game loop. `game.js` emits `lock`, `lineClear`, `combo`, `comboBreak`, `b2b`, `tspin`, `perfectClear`, `levelUp`, `gameOver` — payload shapes are documented in the header comment of `effects.js`.
- **`FloatingText`**: renders `Combo x3!`-style text into the `#fx-layer` DOM overlay (positioned over `#board`, `pointer-events: none`), animated purely in CSS (`@keyframes fx-float-up` in `style.css`). It is deliberately DOM-based rather than canvas-drawn, so it doesn't interfere with `draw()`'s per-frame clear/redraw.
- **`SoundFX`**: hooks only — `enabled` is `false` and `play()` is a no-op by design; `SOUND_MAP` and the commented `Audio`/WebAudio wiring show how to turn it on later.
- Default wiring lives at the bottom of the file: the `lineClear` event spawns one floating-text per `badge` in the `Scoring.evaluateLock()` result and calls `SoundFX.pick(result)`.

## HTML/CSS structure worth knowing

- `index.html` loads `scoring.js` → `effects.js` → `game.js`, in that order (dependency direction: `game.js` calls into the other two). `#fx-layer` sits inside `.board-wrap` alongside `#board`, absolutely positioned over the canvas. The side panel (`.panel`) has sections for the active mode (`#mode-label`), score/lines/level, a combo/B2B row (`#combo`, `#b2b`), the next-piece preview, and the power-up indicator (`#powerup-next`, `#powerup-status`). The `#overlay` (shared by the initial mode-select screen, Game Over, and Pause) holds `#mode-menu` (three `data-mode` buttons for `classic`/`classicPower`/`extended`) and `#restart-btn`; both are toggled via the generic `.hidden` class from `showModeMenu()`/`hideModeMenu()` in `game.js`.
- `style.css` defines all colors as CSS custom properties on `:root`, redefined under `body.light` for the light theme (toggled by `toggleTheme()` in `game.js`) — when adding new UI elements, add both a dark and a light value rather than hardcoding a color.

Tunable constants worth knowing about when asked to customize behavior:
- `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECE_WEIGHTS`, `GAME_MODES`, `POWERUP_LINE_INTERVAL`, `POWERUP_CHANCE`, `FREEZE_MS`, `BOMB_RADIUS`, `POWER_SCORES`, `dropInterval` formula.
- `scoring.js`: `BASE_SCORES`, `TSPIN_SCORES`, `TSPIN_MINI_SCORES`, `PERFECT_CLEAR_SCORES`, `PERFECT_CLEAR_B2B_TETRIS`, `B2B_MULT`, `COMBO_MAX_MULT`.
