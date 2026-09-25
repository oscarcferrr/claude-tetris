'use strict';

/**
 * records.js — Tabla de récords local, persistida en localStorage.
 *
 * Sigue el mismo patrón que scoring.js: módulo puro (IIFE) sin DOM, sin
 * tocar `board`/`canvas` ni ninguna variable global del juego; todo entra
 * por parámetros y sale por el valor de retorno. Se puede probar con Node
 * (`node -e "const R = require('./records.js'); ..."`), donde `localStorage`
 * no existe: por eso TODO acceso a `localStorage` va envuelto en try/catch y
 * cae a un array/objeto en memoria si no está disponible (modo privado,
 * Node, storage lleno, etc.) — funciona igual, simplemente no persiste.
 *
 * Elección de orden de carga en index.html: records.js no depende de nada
 * (ni de Scoring ni de GameEvents), así que se carga el PRIMERO de los
 * cuatro scripts — deja a scoring.js/effects.js/game.js libres para usar
 * `Records` sin más orden que respetar que "antes de game.js".
 *
 * Uso desde game.js:
 *   if (Records.qualifies(score)) { ...mostrar formulario de nombre... }
 *   const idx = Records.add({ name, score, lines, maxCombo, level, mode });
 *   const { bestCombo, maxLines } = Records.bests();
 *   Records.updateBests({ maxCombo, lines });
 */

const Records = (() => {
  const RECORDS_KEY = 'tetris.records.v1';
  const BESTS_KEY = 'tetris.bests.v1';
  const MAX_RECORDS = 5;

  // Respaldo en memoria: se mantiene sincronizado en CADA escritura (no sólo
  // cuando localStorage falta), porque localStorage puede existir como API
  // pero lanzar al leer/escribir (Firefox sirviendo el archivo por file://,
  // Safari en navegación privada, iframes con sandbox...). Comprobar sólo
  // `typeof localStorage` no detecta ese caso, así que `load()`/`loadBests()`
  // sólo caen al respaldo cuando la propia llamada a getItem() lanza —
  // nunca cuando lanza únicamente al escribir.
  let memRecords = [];
  let memBests = { bestCombo: 0, maxLines: 0 };

  // Devuelve el string crudo, o `undefined` si el acceso a localStorage en sí
  // lanzó (distinto de `null`, que es "la clave no existe todavía").
  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return undefined;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }

  // Devuelve el array de records (top N por puntuación, orden descendente),
  // o [] si no hay nada guardado; cae al respaldo en memoria si localStorage
  // no se puede leer en absoluto.
  function load() {
    const raw = safeGet(RECORDS_KEY);
    if (raw === undefined) return memRecords.slice();
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    memRecords = records.slice(); // respaldo siempre al día, funcione o no localStorage
    safeSet(RECORDS_KEY, JSON.stringify(records));
  }

  // true si `score` entraría en el top actual (hueco libre, o supera al peor).
  function qualifies(score) {
    const records = load();
    if (records.length < MAX_RECORDS) return true;
    const min = records[records.length - 1].score;
    return score > min;
  }

  // Inserta ordenado descendente por score, recorta a MAX_RECORDS, persiste
  // y devuelve el índice donde quedó (o -1 si no entró en el top).
  function add({ name, score, lines, maxCombo, level, mode }) {
    const records = load();
    const entry = {
      name: (name || '---').toString().slice(0, 12),
      score: score || 0,
      lines: lines || 0,
      maxCombo: maxCombo || 0,
      level: level || 1,
      mode: mode || '',
      date: Date.now(),
    };
    records.push(entry);
    records.sort((a, b) => b.score - a.score);
    const idx = records.indexOf(entry);
    const trimmed = records.slice(0, MAX_RECORDS);
    saveRecords(trimmed);
    return idx < MAX_RECORDS ? idx : -1;
  }

  function loadBests() {
    const raw = safeGet(BESTS_KEY);
    if (raw === undefined) return { ...memBests };
    try {
      return raw ? JSON.parse(raw) : { bestCombo: 0, maxLines: 0 };
    } catch {
      return { bestCombo: 0, maxLines: 0 };
    }
  }

  // Mejor combo y máximo de líneas de TODA la historia (no sólo el top 5 de
  // puntuación), para que sobrevivan aunque esa partida no entre en el top.
  function bests() {
    const b = loadBests();
    return { bestCombo: b.bestCombo || 0, maxLines: b.maxLines || 0 };
  }

  function updateBests({ maxCombo, lines }) {
    const current = loadBests();
    const updated = {
      bestCombo: Math.max(current.bestCombo || 0, maxCombo || 0),
      maxLines: Math.max(current.maxLines || 0, lines || 0),
    };
    memBests = updated; // respaldo siempre al día, funcione o no localStorage
    safeSet(BESTS_KEY, JSON.stringify(updated));
    return updated;
  }

  function reset() {
    memRecords = [];
    memBests = { bestCombo: 0, maxLines: 0 };
    safeRemove(RECORDS_KEY);
    safeRemove(BESTS_KEY);
  }

  return { load, qualifies, add, bests, updateBests, reset };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Records;
