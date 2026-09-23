'use strict';

/**
 * scoring.js — Lógica de puntuación avanzada, pura y desacoplada del render.
 *
 * Nada de lo que hay aquí toca el DOM, `board`, `canvas` ni ninguna variable
 * global del juego. Todo entra por parámetros y sale por el valor de
 * retorno, así que se puede probar con Node (`node -e "require('./scoring.js')..."`)
 * o reemplazar sin tocar `game.js`/`effects.js`.
 *
 * Uso desde game.js:
 *   const spin   = Scoring.detectTSpin({ type, rot, x, y, kick, lastAction, isOccupied });
 *   const result = Scoring.evaluateLock({ lines, level, spin, combo, b2b, boardEmpty });
 *   // aplicar result.points, result.combo, result.b2b ...
 */

const Scoring = (() => {

  // ---- Tablas de puntuación (multiplicadas por `level`, igual que LINE_SCORES hoy) ----
  const BASE_SCORES = [0, 100, 300, 500, 800];              // sin spin: 0,1,2,3,4 líneas
  const TSPIN_SCORES = [400, 800, 1200, 1600];               // T-Spin completo: 0,1,2,3 líneas
  const TSPIN_MINI_SCORES = [100, 200, 400, 400];             // T-Spin mini: 0,1,2,3 líneas

  // Bonus de Perfect Clear (tablero vacío tras la limpieza), indexado por líneas limpiadas.
  const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];
  // Caso especial: Perfect Clear de Tetris (4 líneas) encadenado tras otra jugada
  // difícil (B2B activo) — el remate más valioso del juego.
  const PERFECT_CLEAR_B2B_TETRIS = 3200;

  const B2B_MULT = 1.5;      // multiplicador por jugada difícil encadenada (Back-to-Back)
  const COMBO_MAX_MULT = 8;  // tope del multiplicador de combo (1 + combo, saturado aquí)

  /**
   * Detecta T-Spin (mini o completo) tras encajar la pieza actual.
   *
   * Sólo aplica a la pieza T (type === 3) y sólo cuando la última acción del
   * jugador fue una rotación (no vale deslizar la T al sitio: mover o caer
   * después de rotar invalida el T-Spin, igual que en las guidelines oficiales).
   *
   * Regla de las 3 esquinas (versión simplificada, no SRS completo):
   * de las 4 celdas diagonales al centro de la T, al menos 3 deben estar
   * ocupadas (por un bloque fijo o por el borde del tablero) para que cuente
   * como T-Spin. Las dos esquinas "frontales" (hacia donde apunta la punta
   * de la T según su rotación) deciden mini vs. completo:
   *   - ambas frontales ocupadas  → T-Spin completo
   *   - sólo una frontal ocupada  → T-Spin mini
   *
   * @param {object} ctx
   * @param {number} ctx.type        tipo de pieza (3 = T)
   * @param {number} ctx.rot         rotación actual 0-3 (0=spawn,1=CW,2=180,3=CCW; rotateCW gira en sentido horario)
   * @param {number} ctx.x           columna de la esquina superior-izq. de la matriz 3x3 de la pieza
   * @param {number} ctx.y           fila de la esquina superior-izq. de la matriz 3x3 de la pieza
   * @param {number} ctx.kick        desplazamiento de columnas que usó el wall kick al rotar (0 si ninguno)
   * @param {'spawn'|'move'|'rotate'|'drop'} ctx.lastAction última acción del jugador antes de fijar la pieza
   * @param {(x:number,y:number)=>boolean} ctx.isOccupied  true si la celda está ocupada o fuera de los límites laterales/inferiores
   * @returns {null|'mini'|'full'}
   */
  function detectTSpin({ type, rot, x, y, kick, lastAction, isOccupied }) {
    if (type !== 3 || lastAction !== 'rotate') return null;

    // Centro de la T dentro de su matriz 3x3.
    const cx = x + 1, cy = y + 1;

    // Las 4 esquinas diagonales al centro.
    const corners = {
      tl: isOccupied(cx - 1, cy - 1),
      tr: isOccupied(cx + 1, cy - 1),
      bl: isOccupied(cx - 1, cy + 1),
      br: isOccupied(cx + 1, cy + 1),
    };
    const occupiedCount = Object.values(corners).filter(Boolean).length;
    if (occupiedCount < 3) return null;

    // Esquinas "frontales" según hacia dónde apunta la punta de la T en cada rotación.
    // rot: 0=punta arriba, 1=punta derecha, 2=punta abajo, 3=punta izquierda.
    const frontPairs = {
      0: ['tl', 'tr'],
      1: ['tr', 'br'],
      2: ['bl', 'br'],
      3: ['tl', 'bl'],
    };
    const [f1, f2] = frontPairs[rot] ?? frontPairs[0];
    const frontOccupied = (corners[f1] ? 1 : 0) + (corners[f2] ? 1 : 0);

    let kind = frontOccupied === 2 ? 'full' : 'mini';

    // Simplificación respecto al SRS completo: un mini que necesitó el kick
    // más agresivo de tryRotate (±2 columnas) se promueve a T-Spin completo.
    if (kind === 'mini' && Math.abs(kick) >= 2) kind = 'full';

    return kind;
  }

  /**
   * Calcula el resultado de puntuación de una jugada (fijar una pieza que
   * limpia `lines` líneas, opcionalmente con T-Spin).
   *
   * @param {object} ctx
   * @param {number} ctx.lines        líneas limpiadas en esta jugada (0-4)
   * @param {number} ctx.level        nivel actual
   * @param {null|'mini'|'full'} ctx.spin  resultado de detectTSpin() para esta pieza
   * @param {number} ctx.combo        contador de combo ANTES de esta jugada (0 = sin cadena)
   * @param {number} ctx.b2b          contador de cadena B2B ANTES de esta jugada (0 = sin cadena)
   * @param {boolean} ctx.boardEmpty  true si el tablero quedó vacío tras limpiar
   * @returns {object} resultado — ver cabecera del archivo para la forma completa
   */
  function evaluateLock({ lines, level, spin, combo, b2b, boardEmpty }) {
    const badges = [];

    // 1. Puntaje base según líneas y si hubo T-Spin.
    let base;
    if (spin === 'full') base = TSPIN_SCORES[lines];
    else if (spin === 'mini') base = TSPIN_MINI_SCORES[lines];
    else base = BASE_SCORES[lines] ?? 0;

    // 2. ¿Esta jugada es "difícil" (alimenta la cadena Back-to-Back)?
    //    Un Tetris (4 líneas) o cualquier T-Spin que limpie al menos 1 línea.
    const difficult = lines === 4 || (spin !== null && lines > 0);

    // 3. Bonus de Back-to-Back: se aplica si la jugada es difícil y ya había
    //    una cadena B2B activa (b2b > 0 = la jugada anterior también lo fue).
    const b2bApplied = difficult && b2b > 0;
    if (b2bApplied) {
      base = Math.floor(base * B2B_MULT);
      badges.push('B2B');
    }

    // 4. Combo: se extiende si esta jugada limpió líneas, se rompe si no.
    const newCombo = lines > 0 ? combo + 1 : 0;
    const comboMult = Math.min(1 + newCombo, COMBO_MAX_MULT);
    if (lines > 0 && newCombo > 0) badges.push(`Combo x${comboMult}`);

    // 5. Puntaje de la jugada normal (líneas + spin + B2B + combo), escalado por nivel.
    let points = base * level * comboMult;

    // 6. Perfect Clear: bonus aparte, no se multiplica por el combo (se suma
    //    tras aplicar el multiplicador de nivel, como un extra fijo).
    let perfectClearBonus = 0;
    if (boardEmpty && lines > 0) {
      perfectClearBonus = (b2bApplied && lines === 4)
        ? PERFECT_CLEAR_B2B_TETRIS
        : (PERFECT_CLEAR_SCORES[lines] ?? 0);
      perfectClearBonus *= level;
      points += perfectClearBonus;
      badges.push('PERFECT CLEAR');
    }

    // 7. Nueva cadena B2B: se extiende con jugadas difíciles; una jugada sin
    //    líneas NO la rompe (da otra oportunidad), pero sí rompe el combo (paso 4).
    const newB2b = difficult ? b2b + 1 : (lines > 0 ? 0 : b2b);

    if (spin) badges.unshift(spin === 'full'
      ? `T-Spin ${['', 'Single', 'Double', 'Triple'][lines] || ''}`.trim()
      : `T-Spin Mini${lines ? ' ' + ['', 'Single', 'Double', 'Triple'][lines] : ''}`);

    return {
      points,
      combo: newCombo,
      comboMult,
      b2b: newB2b,
      b2bApplied,
      difficult,
      perfectClear: perfectClearBonus > 0,
      breakdown: {
        base,
        level,
        comboMult,
        perfectBonus: perfectClearBonus,
      },
      badges,
    };
  }

  return { BASE_SCORES, TSPIN_SCORES, TSPIN_MINI_SCORES, PERFECT_CLEAR_SCORES,
    PERFECT_CLEAR_B2B_TETRIS, B2B_MULT, COMBO_MAX_MULT, detectTSpin, evaluateLock };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
