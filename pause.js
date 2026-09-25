'use strict';

/**
 * pause.js — Wiring de la UI del menú de pausa (botones, controles
 * desplegables, selector de nivel inicial).
 *
 * Se carga DESPUÉS de game.js (ver <script> en index.html): reutiliza los
 * bindings globales que game.js ya declaró en el mismo scope de <script>
 * clásico (sin módulos) — `pauseMenuEl`, `pauseControlsEl`, `overlay`,
 * `startLevel` (variable `let` de game.js: aquí sólo se REASIGNA, nunca se
 * vuelve a declarar con `let`/`const`), `gameMode`, `togglePause()` y
 * `startGame()`. Cargarlo antes rompería porque ninguno de esos nombres
 * existiría todavía en el momento en que este archivo se ejecuta.
 */

const START_LEVEL_KEY = 'tetris.startLevel';
const startLevelSelect = document.getElementById('start-level');

function clampStartLevel(value) {
  return Number.isInteger(value) && value >= 1 && value <= 15 ? value : null;
}

// Carga el nivel inicial guardado (si lo hay) antes de la primera partida.
// `startLevel` ya existe como `let` en game.js: aquí se reasigna sin `let`.
(function loadStartLevel() {
  try {
    const parsed = clampStartLevel(parseInt(localStorage.getItem(START_LEVEL_KEY), 10));
    if (parsed !== null) startLevel = parsed;
  } catch (err) {
    // localStorage bloqueado (modo privado, política del navegador...): se
    // sigue con el valor por defecto de game.js (startLevel = 1).
  }
  if (startLevelSelect) startLevelSelect.value = String(startLevel);
})();

if (startLevelSelect) {
  startLevelSelect.addEventListener('change', () => {
    const value = clampStartLevel(parseInt(startLevelSelect.value, 10));
    if (value === null) return;
    startLevel = value;
    try {
      localStorage.setItem(START_LEVEL_KEY, String(startLevel));
    } catch (err) {
      // Sin persistencia disponible: el nivel elegido sigue activo en esta
      // sesión, simplemente no sobrevive a un refresco de página.
    }
  });
}

// game.js dispara este evento desde togglePause() cada vez que el menú de
// pausa se abre; el selector debe reflejar `startLevel` en ese momento.
document.addEventListener('pausemenu:open', () => {
  if (startLevelSelect) startLevelSelect.value = String(startLevel);
});

// Delegación de clicks sobre los botones [data-action] del menú de pausa.
if (pauseMenuEl) {
  pauseMenuEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'resume':
        togglePause();
        break;
      case 'restart':
        startGame(gameMode); // repite el modo actual, sin pasar por Game Over
        break;
      case 'controls':
        pauseControlsEl.classList.toggle('hidden');
        break;
    }
    // Quita el foco del botón pulsado: si quedara enfocado, un Space/Enter
    // posterior (p.ej. el que cerró el menú) podría reactivarlo sin que el
    // jugador lo pretenda.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}
