# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build process, no package.json — just three files (`index.html`, `style.css`, `game.js`).

## Running the game

There is no build/lint/test tooling. Open `index.html` directly, or serve it with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`. Changes to `game.js`/`style.css`/`index.html` just require a browser refresh.

## Architecture

All game logic lives in `game.js` (~300 lines, single file, no modules). Key pieces to understand before making changes:

- **Board model**: `board` is a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there. `COLS=10`, `ROWS=20`, `BLOCK=30` (pixel size) — these three plus the canvas `width`/`height` in `index.html` must stay in sync (`COLS × BLOCK` and `ROWS × BLOCK`).
- **Pieces**: the 7 tetrominoes are defined as square matrices in `PIECES` (index 0 unused/null, 1–7 = I,O,T,S,Z,J,L). Rotation is done functionally via `rotateCW` (transpose + reverse), not via precomputed rotation states.
- **Collision** (`collide(shape, ox, oy)`): checks board bounds and overlap with already-locked cells. Used for movement, rotation, ghost-piece projection, and spawn validation.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded. This is a simplified kick table, not the full SRS spec.
- **Game loop** (`loop(ts)`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and drops the piece one row once `dropAccum >= dropInterval`.
- **Locking & clearing**: `lockPiece()` → `merge()` (bakes current piece into `board`) → `clearLines()` (bottom-up scan, splices full rows out and unshifts empty rows in) → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece immediately collides).
- **Scoring/leveling**: `LINE_SCORES = [0,100,300,500,800]` multiplied by `level`; hard drop adds 2 pts/cell dropped, soft drop 1 pt/row. `level` increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece (`ghostY()` projects straight down, drawn at `globalAlpha=0.2`), and the current piece, every frame. `drawNext()` renders the preview piece on a separate small canvas (`next-canvas`).
- **State variables** (`board, current, next, score, lines, level, paused, gameOver, ...`) are module-level `let` bindings reset by `init()`, not encapsulated in a class/object — keep this in mind when adding features, since most functions read/write these globals directly rather than taking parameters.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `Space`, `KeyX`, `KeyP`); movement/rotation is ignored while `paused || gameOver` except unpausing.

Tunable constants worth knowing about when asked to customize behavior: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval` — all at the top of `game.js`.
