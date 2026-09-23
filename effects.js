'use strict';

/**
 * effects.js — Bus de eventos + consumidores de feedback visual/sonoro.
 *
 * Este archivo NUNCA toca el estado del juego (board, score, piezas...).
 * Sólo escucha eventos que `game.js` emite después de aplicar los cálculos
 * de `scoring.js`, y reacciona pintando texto flotante o (en el futuro)
 * reproduciendo sonido. Si `game.js` dejara de emitir eventos, el juego
 * seguiría funcionando exactamente igual, sólo que en silencio.
 *
 * Contrato de eventos que emite game.js (payloads):
 *   'lock'          { x, y }                              — cualquier pieza se fija, incluso sin limpiar líneas
 *   'lineClear'     { lines, result }                      — result = objeto devuelto por Scoring.evaluateLock()
 *   'combo'         { combo, comboMult }                   — el combo avanzó (combo >= 1)
 *   'comboBreak'    { previousCombo }                       — el combo se rompió (venía de >= 1)
 *   'b2b'           { b2b }                                — la cadena Back-to-Back avanzó (b2b >= 1)
 *   'tspin'         { kind: 'mini'|'full', lines }          — se detectó un T-Spin al fijar la pieza
 *   'perfectClear'  { lines, bonus }                        — el tablero quedó vacío tras limpiar
 *   'levelUp'       { level }                               — subió de nivel
 *   'gameOver'      { score }                               — fin de partida
 */

const GameEvents = (() => {
  const listeners = new Map(); // nombre de evento -> Set<fn>

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => off(name, fn); // conveniencia: on() devuelve su propio unsubscribe
  }

  function off(name, fn) {
    listeners.get(name)?.delete(fn);
  }

  function emit(name, payload) {
    const fns = listeners.get(name);
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(payload);
      } catch (err) {
        // Un efecto roto nunca debe tumbar el bucle del juego.
        console.error(`[GameEvents] listener de "${name}" falló:`, err);
      }
    }
  }

  return { on, off, emit };
})();

/**
 * FloatingText — textos tipo "Combo x3!", "T-Spin Double!", "B2B!" que suben
 * y se desvanecen sobre el tablero. Vive en la capa DOM `#fx-layer`
 * (ver index.html / style.css), no en el canvas, para no interferir con
 * draw() ni con el ciclo de requestAnimationFrame.
 */
const FloatingText = (() => {
  let layer = null;
  let stackIndex = 0; // para escalonar varios textos que aparecen en el mismo instante

  function init() {
    layer = document.getElementById('fx-layer');
  }

  /**
   * @param {string} text  contenido a mostrar
   * @param {'combo'|'tspin'|'b2b'|'perfect'|'points'} tone  variante visual/color
   */
  function show(text, tone = 'points') {
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `fx-text fx-${tone}`;
    el.textContent = text;
    el.style.setProperty('--fx-stack', stackIndex % 4);
    stackIndex++;
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  }

  return { init, show };
})();

/**
 * SoundFX — hooks preparados para efectos de sonido, sin audio real todavía.
 * `enabled` queda en false a propósito: activarlo y cargar los archivos de
 * SOUND_MAP es trabajo de una fase posterior (no pedido en este alcance).
 */
const SoundFX = (() => {
  let enabled = false;

  // id de sonido -> nombre de archivo esperado (assets/sfx/<archivo>).
  const SOUND_MAP = {
    clear_1: 'clear-single.mp3',
    clear_2: 'clear-double.mp3',
    clear_3: 'clear-triple.mp3',
    clear_4: 'clear-tetris.mp3',
    tspin: 'tspin.mp3',
    b2b: 'back-to-back.mp3',
    perfect: 'perfect-clear.mp3',
    combo_low: 'combo-low.mp3',   // combo x2-x3
    combo_high: 'combo-high.mp3', // combo x4+
  };

  function play(id) {
    if (!enabled) return;
    const file = SOUND_MAP[id];
    if (!file) return;
    // Wiring real pendiente. Ejemplo de cómo se conectaría con <audio>/WebAudio:
    //
    //   const audio = new Audio(`assets/sfx/${file}`);
    //   audio.volume = 0.6;
    //   audio.play().catch(() => {}); // ignora bloqueos de autoplay del navegador
  }

  /**
   * Traduce el resultado de Scoring.evaluateLock() al id de sonido más
   * relevante para esta jugada (prioriza lo más espectacular).
   */
  function pick(result) {
    if (result.perfectClear) return 'perfect';
    if (result.badges.some(b => b.startsWith('T-Spin'))) return 'tspin';
    if (result.b2bApplied) return 'b2b';
    if (result.comboMult >= 4) return 'combo_high';
    if (result.comboMult >= 2) return 'combo_low';
    return null; // sin badges especiales: el listener de 'lineClear' cae al sonido clear_N
  }

  return { get enabled() { return enabled; }, set enabled(v) { enabled = v; }, play, pick, SOUND_MAP };
})();

// ---- Suscripciones por defecto ----
// Un texto flotante por cada "badge" que trae el resultado, más el sonido
// correspondiente. game.js sólo tiene que hacer:
//   GameEvents.emit('lineClear', { lines: cleared, result });
document.addEventListener('DOMContentLoaded', FloatingText.init);
// Por si el script se carga después de que el DOM ya esté listo.
if (document.readyState !== 'loading') FloatingText.init();

GameEvents.on('lineClear', ({ lines, result }) => {
  if (!result || !result.badges.length) return;
  const tones = { 'B2B': 'b2b', 'PERFECT CLEAR': 'perfect' };
  for (const badge of result.badges) {
    let tone = tones[badge] || (badge.startsWith('T-Spin') ? 'tspin' : 'combo');
    FloatingText.show(badge, tone);
  }
  const soundId = SoundFX.pick(result) || (lines ? `clear_${lines}` : null);
  if (soundId) SoundFX.play(soundId);
});

GameEvents.on('gameOver', () => {
  // Hook reservado para un efecto de fin de partida (sonido, flash, etc.).
});
