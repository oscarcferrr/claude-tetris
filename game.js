'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // NUT - gris metálico
  '#f06292', // PLUS - rosa
  '#4db6ac', // PENTO_U - verde azulado
  '#7986cb', // PENTO_Y - índigo
  '#fff176', // SINGLE - dorado (recompensa)
];

const NUT = 8;          // tipo de pieza: tuerca (reto, 3x3 con agujero)
const PLUS = 9;         // pentominó +
const PENTO_U = 10;     // pentominó U
const PENTO_Y = 11;     // pentominó Y
const SINGLE = 12;      // pieza 1x1 (recompensa tras un Tetris)
const HOLE = 99;        // celda del agujero: sólida y cuenta como llena, pero no se dibuja

// ---- Power-ups: códigos de celda ----
// WILD SÍ persiste en `board` (comodín eliminable al contacto).
// Los códigos POWER_BASE+n en cambio NUNCA llegan a `board`: sólo existen en el
// `shape` de la pieza en vuelo; merge() los detecta, dispara el efecto y escribe
// en su lugar el color base de la pieza. Así ni collapseFullRows() ni el
// render tienen que saber nada de ellos.
const WILD = 98;         // celda comodín (tinte)
const POWER_BASE = 100;  // celdas de power-up: POWER_BASE + índice en POWERUPS

// índice = tipo de pieza; peso 0 = nunca sale por sorteo (ej. SINGLE, sólo como recompensa)
const PIECE_WEIGHTS = [0, 10, 10, 10, 10, 10, 10, 10, 6, 7, 7, 7, 0];
const TOTAL_WEIGHT = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,HOLE,8],[8,8,8]],               // NUT - tuerca con agujero central
  [[0,9,0],[9,9,9],[0,9,0]],                  // PLUS - pentominó +
  [[10,0,10],[10,10,10],[0,0,0]],             // PENTO_U - pentominó U
  [[0,11,0,0],[11,11,0,0],[0,11,0,0],[0,11,0,0]], // PENTO_Y - pentominó Y
  [[12]],                                     // SINGLE - 1x1 (recompensa)
];

// Nota: la tabla de puntos por líneas (antes LINE_SCORES aquí) vive ahora en
// scoring.js como Scoring.BASE_SCORES, junto con el resto de la lógica de
// puntuación (combo, T-Spin, Back-to-Back, Perfect Clear).

// ---- Power-ups: configuración ----
const POWERUP_LINE_INTERVAL = 5; // cada cuántas líneas se encola un power-up
const POWERUP_CHANCE = 1;        // probabilidad al cruzar el umbral (1 = garantizado)
const FREEZE_MS = 5000;          // duración del efecto Congelar
const BOMB_RADIUS = 1;           // 1 → área 3×3 centrada en el impacto
const WILD_COLOR = '#ffffff';    // color de dibujo de los bloques comodín (tinte)
const POWER_SCORES = { cell: 10, ray: 25, wild: 15 }; // puntos por celda destruida (×level)

// Registro de efectos. Cada `apply` actúa sobre el tablero global y devuelve un
// texto corto para el HUD. El índice de cada entrada es el que viaja codificado
// en la celda de la pieza como POWER_BASE + índice.
const POWERUPS = [
  { id: 'bomb',    label: 'Bomba',    glyph: '💣', color: '#ff7043', apply: (x, y) => applyBomb(x, y) },
  { id: 'rayRow',  label: 'Rayo ↔',   glyph: '↔',  color: '#4fc3f7', apply: (x, y) => applyRay(x, y, 'row') },
  { id: 'rayCol',  label: 'Rayo ↕',   glyph: '↕',  color: '#4fc3f7', apply: (x, y) => applyRay(x, y, 'col') },
  { id: 'tint',    label: 'Tinte',    glyph: '🎨', color: '#ce93d8', apply: () => applyTint() },
  { id: 'gravity', label: 'Gravedad', glyph: '⬇',  color: '#a5d6a7', apply: () => applyGravity() },
  { id: 'freeze',  label: 'Congelar', glyph: '❄',  color: '#80deea', apply: () => applyFreeze() },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const b2bEl = document.getElementById('b2b');
const powerupNextEl = document.getElementById('powerup-next');
const powerupStatusEl = document.getElementById('powerup-status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending;
// Estado de power-ups (todo se resetea en init())
let powerupPending;     // hay un power-up esperando a entrar en `next`
let nextPowerUpAtLines; // umbral de líneas al que se encola el siguiente power-up
let freezeRemaining;    // ms restantes del efecto Congelar (0 = sin congelar)
let powerStatus;        // texto del último efecto disparado, para el panel

// Estado de combo/T-Spin/Back-to-Back (todo se resetea en init()). La lógica
// de cálculo vive en scoring.js; aquí sólo se guarda el estado entre jugadas.
let combo;       // nº de líneas limpiadas consecutivas (0 = sin cadena)
let b2bChain;    // nº de jugadas "difíciles" (Tetris/T-Spin) encadenadas (0 = sin cadena)
let lastAction;  // última acción del jugador sobre la pieza actual: 'spawn'|'move'|'rotate'|'drop'
let lastKick;    // desplazamiento de columnas del último wall kick aceptado (para detectTSpin)

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomType() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let t = 1; t < PIECE_WEIGHTS.length; t++) {
    r -= PIECE_WEIGHTS[t];
    if (r < 0) return t;
  }
  return 1;
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, rot: 0 };
}

function randomPiece() {
  return makePiece(randomType());
}

/* ================= Power-ups ================= */

// Sortea un tetromino base (tipos 1–7, sin mezclar con NUT/pentominós) y le
// incrusta una celda de power-up en un bloque relleno al azar.
function makePowerPiece() {
  let type;
  do { type = randomType(); } while (type < 1 || type > 7);
  const piece = makePiece(type);
  const kind = Math.floor(Math.random() * POWERUPS.length);
  const filled = [];
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) filled.push([r, c]);
  const [pr, pc] = filled[Math.floor(Math.random() * filled.length)];
  piece.shape[pr][pc] = POWER_BASE + kind;
  piece.power = kind; // usado por el panel NEXT/POWER-UP
  return piece;
}

// Color de dibujo de una celda del tablero o de una pieza, incluyendo los
// códigos especiales (power-up en vuelo, comodín). drawBlock() delega aquí.
function cellColor(v) {
  if (v >= POWER_BASE) return POWERUPS[v - POWER_BASE].color;
  if (v === WILD) return WILD_COLOR;
  return COLORS[v];
}

// Glifo a superponer sobre una celda especial, o null si no lleva ninguno.
function cellGlyph(v) {
  if (v >= POWER_BASE) return POWERUPS[v - POWER_BASE].glyph;
  if (v === WILD) return '★';
  return null;
}

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

// Bomba: destruye el área (2·BOMB_RADIUS+1)² centrada en el impacto.
function applyBomb(cx, cy) {
  let destroyed = 0;
  for (let y = cy - BOMB_RADIUS; y <= cy + BOMB_RADIUS; y++) {
    for (let x = cx - BOMB_RADIUS; x <= cx + BOMB_RADIUS; x++) {
      if (!inBounds(x, y)) continue;
      if (board[y][x]) { board[y][x] = 0; destroyed++; }
    }
  }
  score += destroyed * POWER_SCORES.cell * level;
  return `Bomba: ${destroyed} bloques`;
}

// Rayo: limpia toda la fila o toda la columna del impacto.
function applyRay(x, y, orientation) {
  let destroyed = 0;
  if (orientation === 'row') {
    for (let c = 0; c < COLS; c++) if (board[y][c]) destroyed++;
    board[y].fill(0);
  } else {
    for (let r = 0; r < ROWS; r++) if (board[r][x]) { board[r][x] = 0; destroyed++; }
  }
  score += destroyed * POWER_SCORES.ray * level;
  return orientation === 'row' ? `Rayo: fila ${y + 1}` : `Rayo: columna ${x + 1}`;
}

// Tinte: el color más frecuente del tablero (excluyendo huecos, HOLE y WILD ya
// existentes) se convierte en bloques comodín.
function applyTint() {
  const counts = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v === 0 || v === HOLE || v === WILD) continue;
      counts[v] = (counts[v] || 0) + 1;
    }
  const colors = Object.keys(counts);
  if (colors.length === 0) return 'Tinte: sin efecto';
  let best = [], bestCount = 0;
  for (const c of colors) {
    const n = counts[c];
    if (n > bestCount) { best = [c]; bestCount = n; }
    else if (n === bestCount) best.push(c);
  }
  const target = Number(best[Math.floor(Math.random() * best.length)]);
  let converted = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) { board[r][c] = WILD; converted++; }
  return `Tinte: ${converted} bloques comodín`;
}

// Gravedad: compacta cada columna hacia abajo, cerrando los huecos.
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) values.push(board[r][c]);
    const pad = ROWS - values.length;
    for (let r = 0; r < ROWS; r++) board[r][c] = r < pad ? 0 : values[r - pad];
  }
  return 'Gravedad aplicada';
}

// Congelar: detiene la caída automática durante FREEZE_MS (ver loop()).
function applyFreeze() {
  freezeRemaining = FREEZE_MS;
  return 'Congelar: 5s sin caída';
}

// Al fijar una pieza, cualquier bloque comodín (WILD) que toque ortogonalmente
// alguna de las celdas recién fijadas desaparece, junto con todos los WILD
// conectados a él (flood-fill 4-direccional).
function resolveWildContacts(lockedCells) {
  const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  let destroyed = 0;
  const seeds = [];
  for (const [x, y] of lockedCells) {
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbors)
      if (inBounds(nx, ny) && board[ny][nx] === WILD && !visited[ny][nx])
        seeds.push([nx, ny]);
  }
  for (const seed of seeds) {
    const stack = [seed];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (!inBounds(x, y) || visited[y][x] || board[y][x] !== WILD) continue;
      visited[y][x] = true;
      board[y][x] = 0;
      destroyed++;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  if (destroyed) score += destroyed * POWER_SCORES.wild * level;
}

function updatePowerHUD() {
  if (!powerupNextEl) return; // panel aún no montado (no debería pasar)
  const upcoming = next && next.power !== undefined ? POWERUPS[next.power] : null;
  powerupNextEl.textContent = upcoming ? `${upcoming.glyph} ${upcoming.label}` : '—';
  powerupStatusEl.textContent = freezeRemaining > 0
    ? `❄ Congelado ${(freezeRemaining / 1000).toFixed(1)}s`
    : (powerStatus || '');
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

// Consulta de una única celda para Scoring.detectTSpin(): una celda cuenta
// como "ocupada" si tiene un bloque fijo, o si cae fuera de los límites
// laterales o inferiores del tablero (el borde también sostiene un T-Spin).
// Por encima del tablero (ny < 0) NO cuenta como ocupada.
function isOccupied(x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return true;
  if (y < 0) return false;
  return !!board[y][x];
}

// true si no queda ningún bloque en el tablero (para el bonus Perfect Clear).
function isBoardEmpty() {
  return board.every(row => row.every(v => v === 0));
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      current.rot = (current.rot + 1) % 4;
      lastAction = 'rotate';
      lastKick = kick;
      return;
    }
  }
}

// Bakea la pieza actual en `board`. Las celdas de power-up (>= POWER_BASE)
// nunca llegan a `board`: se registran en `triggers` y se escriben con el
// color base de la pieza (current.type), para que el tablero sólo contenga
// colores normales, HOLE y WILD.
function merge() {
  const triggers = [];
  const lockedCells = [];
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      const v = current.shape[r][c];
      if (!v) continue;
      const x = current.x + c, y = current.y + r;
      if (v >= POWER_BASE) {
        triggers.push({ kind: v - POWER_BASE, x, y });
        board[y][x] = current.type;
      } else {
        board[y][x] = v;
      }
      lockedCells.push([x, y]);
    }
  return { triggers, lockedCells };
}

// Sólo colapsa las filas completas (splice/unshift) y devuelve cuántas se
// limpiaron. No toca puntuación ni estado de combo/B2B — eso es trabajo de
// resolveLock(), que llama a Scoring (scoring.js) para mantener el cálculo
// desacoplado del "motor" de filas.
function collapseFullRows() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

// Aplica el resultado de fijar una pieza: puntuación (vía Scoring.evaluateLock,
// que ya incluye combo/T-Spin/B2B/Perfect Clear), nivel, cola de power-ups y
// eventos de feedback. Se llama siempre desde lockPiece(), incluso cuando
// `cleared === 0`, porque una jugada sin líneas rompe el combo igualmente.
function resolveLock(cleared, spin) {
  const boardEmpty = cleared > 0 && isBoardEmpty();
  const prevCombo = combo;
  const result = Scoring.evaluateLock({ lines: cleared, level, spin, combo, b2b: b2bChain, boardEmpty });

  score += result.points;
  combo = result.combo;
  b2bChain = result.b2b;

  if (cleared) {
    lines += cleared;
    const prevLevel = level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (level > prevLevel) GameEvents.emit('levelUp', { level });
    if (cleared >= 4) rewardPending = true;
    // Al cruzar cada múltiplo de POWERUP_LINE_INTERVAL se encola un power-up.
    // `while` cubre el caso de que `cleared` salte de golpe varios umbrales.
    while (lines >= nextPowerUpAtLines) {
      nextPowerUpAtLines += POWERUP_LINE_INTERVAL;
      if (Math.random() < POWERUP_CHANCE) powerupPending = true;
    }
  }

  if (spin) GameEvents.emit('tspin', { kind: spin, lines: cleared });
  if (cleared || spin) GameEvents.emit('lineClear', { lines: cleared, result });
  if (result.combo > 0) GameEvents.emit('combo', { combo: result.combo, comboMult: result.comboMult });
  else if (prevCombo > 0) GameEvents.emit('comboBreak', { previousCombo: prevCombo });
  if (result.b2bApplied) GameEvents.emit('b2b', { b2b: result.b2b });
  if (result.perfectClear) GameEvents.emit('perfectClear', { lines: cleared, bonus: result.breakdown.perfectBonus });

  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  freezeRemaining = 0; // la congelación muere con la pieza que la disfrutó

  // Detectar T-Spin ANTES de bakear la pieza: necesita current.x/y/rot tal
  // como quedaron al fijarla, y sólo cuenta si la última acción fue rotar.
  const spin = Scoring.detectTSpin({
    type: current.type, rot: current.rot, x: current.x, y: current.y,
    kick: lastKick, lastAction, isOccupied,
  });

  const { triggers, lockedCells } = merge(); // 1. bakea la pieza (sin códigos POWER_*)
  GameEvents.emit('lock', { x: current.x, y: current.y });
  resolveWildContacts(lockedCells);          // 2. comodines tocados por esta pieza
  for (const t of triggers)                  // 3. dispara los efectos de power-up
    powerStatus = POWERUPS[t.kind].apply(t.x, t.y);
  // 4. líneas completadas (incluye las que generan los efectos de power-up:
  //    una bomba o un rayo que completa una fila cuenta para el combo y para
  //    el Perfect Clear igual que si la hubiera limpiado la propia pieza).
  const cleared = collapseFullRows();
  resolveLock(cleared, spin);                // 5. puntuación (combo/T-Spin/B2B/Perfect Clear) + eventos
  spawn();
}

function spawn() {
  current = next;
  lastAction = 'spawn'; // una pieza recién aparecida no cuenta como "rotada" para T-Spin
  lastKick = 0;
  // Prioridad de la cola: la recompensa de Tetris nunca se pisa con un
  // power-up pendiente; el power-up espera a la siguiente pieza si hace falta.
  if (rewardPending) {
    next = makePiece(SINGLE);
    rewardPending = false;
  } else if (powerupPending) {
    next = makePowerPiece();
    powerupPending = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  updatePowerHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (comboEl) comboEl.textContent = combo > 0 ? `x${Math.min(1 + combo, Scoring.COMBO_MAX_MULT)}` : '—';
  if (b2bEl) b2bEl.textContent = b2bChain > 1 ? `x${b2bChain}` : '—';
  updatePowerHUD();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex || colorIndex === HOLE) return; // el agujero de la tuerca no se dibuja
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = cellColor(colorIndex);
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  const glyph = cellGlyph(colorIndex);
  if (glyph) {
    context.fillStyle = 'rgba(0,0,0,0.75)';
    context.font = `${Math.floor(size * 0.55)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(glyph, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function gridColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-color').trim() || '#22222e';
}

function drawGrid() {
  ctx.strokeStyle = gridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
  const offX = Math.floor((4 - (maxC - minC + 1)) / 2) - minC;
  const offY = Math.floor((4 - (maxR - minR + 1)) / 2) - minR;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  freezeRemaining = 0;
  powerStatus = '';
  combo = 0;
  b2bChain = 0;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  GameEvents.emit('gameOver', { score });
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    dropAccum = 0;
    if (animId === null) animId = requestAnimationFrame(loop);
    overlay.classList.add('hidden');
  } else {
    cancelAnimationFrame(animId);
    animId = null;
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) {
    animId = null;
    return;
  }
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    // Congelar: la caída automática no avanza, pero ← → ↓ y Space (el
    // keydown listener) siguen funcionando con normalidad.
    freezeRemaining = Math.max(0, freezeRemaining - dt);
    dropAccum = 0;
    updatePowerHUD();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver || paused) {
    animId = null;
  } else {
    animId = requestAnimationFrame(loop);
  }
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  rewardPending = false;
  powerupPending = false;
  nextPowerUpAtLines = POWERUP_LINE_INTERVAL;
  freezeRemaining = 0;
  powerStatus = '';
  combo = 0;
  b2bChain = 0;
  lastAction = 'spawn';
  lastKick = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastAction = 'move'; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastAction = 'move'; }
      break;
    case 'ArrowDown':
      lastAction = 'drop';
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate(); // tryRotate() ya marca lastAction = 'rotate' si la rotación se acepta
      break;
    case 'Space':
      e.preventDefault();
      lastAction = 'drop';
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggleBtn.setAttribute('aria-pressed', String(isLight));
  draw();
  drawNext();
}

themeToggleBtn.addEventListener('click', toggleTheme);

init();
