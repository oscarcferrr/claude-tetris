'use strict';

// ---- Temas visuales (skins) ----
// Cada skin agrupa una paleta de colores (`colors`, alineada índice a índice
// con el `COLORS` de game.js: null, I, O, T, S, Z, J, L, NUT, PLUS, PENTO_U,
// PENTO_Y, SINGLE) y una función de dibujo `drawCell` que decide el estilo
// visual del bloque (plano, con glow, con esquinas redondeadas, con textura).
// game.js no conoce estos detalles: sólo llama a getSkin().colors[...] desde
// cellColor() y a getSkin().drawCell(...) desde drawBlock().
//
// Contrato de drawCell(ctx, px, py, size, color, alpha):
//   - (px, py) son coordenadas en PÍXELES del lienzo (ya multiplicadas por el
//     tamaño de celda), no columna/fila de tablero.
//   - `color` ya viene resuelto por cellColor() antes de llamar.
//   - drawCell NO gestiona ctx.globalAlpha: quien llama (drawBlock() en
//     game.js) lo fija a `alpha` ANTES de invocar drawCell y lo restaura a 1
//     DESPUÉS de dibujar el glifo (cellGlyph). Así el glifo respeta el mismo
//     alpha que el bloque (p.ej. el ghost piece semitransparente), igual que
//     hacía el drawBlock() original de un único bloque "retro". El parámetro
//     `alpha` se pasa igualmente a drawCell por si una skin necesita un valor
//     distinto para alguna de sus capas internas (p.ej. el glow de neón).
//   - El highlight/acabado superior de cada bloque vive DENTRO de su propio
//     drawCell (cada skin decide su propio remate); drawBlock() sólo añade
//     encima el glifo de power-up/comodín, que es común a todas las skins.

let activeSkin = 'retro';

// Paleta clásica (idéntica a COLORS en game.js), compartida por las skins
// "retro" y "pixel" — esta última sólo cambia la TEXTURA del bloque, no el
// color, así que reutiliza la misma referencia en vez de duplicar el array:
// así ambas quedan sincronizadas automáticamente ante cualquier retoque futuro.
const CLASSIC_PALETTE = [
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

const SKINS = {
  // Reproduce EXACTAMENTE el dibujo de bloque de siempre: relleno plano +
  // highlight semitransparente en la franja superior. Usa los mismos colores
  // que COLORS en game.js, así que debe verse pixel-idéntica al comportamiento
  // previo a la introducción de skins.
  retro: {
    label: 'Retro',
    colors: CLASSIC_PALETTE,
    wildColor: '#ffffff',
    drawCell(ctx, px, py, size, color) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },

  // Fondo negro saturado bajo cada bloque + shadowBlur/shadowColor para el
  // efecto glow + borde brillante. El reset de shadowBlur/shadowColor al
  // final es obligatorio: si no se limpia, el glow "se filtra" y afecta a la
  // rejilla y a los elementos dibujados después en el mismo frame (el shadow
  // del canvas es estado global del contexto, no se acota al fillRect).
  neon: {
    label: 'Neón',
    colors: [
      null,
      '#00e5ff', // I
      '#ffea00', // O
      '#e040fb', // T
      '#00e676', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
      '#b0bec5', // NUT
      '#f50057', // PLUS
      '#1de9b6', // PENTO_U
      '#651fff', // PENTO_Y
      '#ffff00', // SINGLE
    ],
    wildColor: '#ffffff',
    drawCell(ctx, px, py, size, color) {
      ctx.fillStyle = '#050508';
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      ctx.shadowBlur = size * 0.6;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillRect(px + 3, py + 3, size - 6, size - 6);
      ctx.shadowBlur = 0; // el borde no lleva glow, sólo el relleno
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
      // Reset final: obligatorio para no contaminar el resto del frame.
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    },
  },

  // Paleta desaturada/aclarada + esquinas redondeadas simuladas. Usa
  // ctx.roundRect si el entorno lo soporta (Canvas moderno), con un fallback
  // manual con quadraticCurveTo para no romper en navegadores más antiguos.
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#b3e5fc', // I
      '#fff9c4', // O
      '#e1bee7', // T
      '#c8e6c9', // S
      '#ffcdd2', // Z
      '#bbdefb', // J
      '#ffe0b2', // L
      '#eceff1', // NUT
      '#f8bbd0', // PLUS
      '#b2dfdb', // PENTO_U
      '#c5cae9', // PENTO_Y
      '#fff59d', // SINGLE
    ],
    wildColor: '#fafafa',
    drawCell(ctx, px, py, size, color) {
      const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
      const r = Math.min(size * 0.25, w / 2, h / 2);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        // Fallback manual: mismo contorno redondeado vía quadraticCurveTo.
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill();
      // highlight suave en la mitad superior, respetando el borde redondeado
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, w, h * 0.4);
      ctx.restore();
    },
  },

  // Relleno plano + bisel simulando un sprite 8-bit: franja clara arriba-
  // izquierda (luz) y franja oscura abajo-derecha (sombra), con 2-3 fillRect.
  // Reutiliza CLASSIC_PALETTE (misma referencia que "retro"): el estilo
  // pixel-art viene de la textura, no de un cambio de color.
  pixel: {
    label: 'Pixel art',
    colors: CLASSIC_PALETTE,
    wildColor: '#ffffff',
    drawCell(ctx, px, py, size, color) {
      const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      const bevel = Math.max(2, Math.floor(size * 0.15));
      // bisel claro arriba-izquierda
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, w, bevel);
      ctx.fillRect(x, y, bevel, h);
      // bisel oscuro abajo-derecha
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + h - bevel, w, bevel);
      ctx.fillRect(x + w - bevel, y, bevel, h);
    },
  },
};

// Devuelve el objeto skin activo (nunca null: cae a 'retro' por robustez).
function getSkin() {
  return SKINS[activeSkin] || SKINS.retro;
}

// Devuelve la clave (id) de la skin activa, p.ej. para reflejarla en un <select>.
function getSkinId() {
  return activeSkin;
}

// Aplica la skin `id` si existe: actualiza el estado, la persiste en
// localStorage y refleja la clase `skin-<id>` en <body> (quitando cualquier
// otra clase skin-* previa). Devuelve true/false según si se aplicó.
function setSkin(id) {
  if (!SKINS[id]) return false;
  activeSkin = id;
  try {
    localStorage.setItem('tetris.skin', id);
  } catch (e) {
    // localStorage no disponible (modo privado, cuotas, etc.): se ignora.
  }
  if (document.body) {
    Array.from(document.body.classList)
      .filter(cls => cls.startsWith('skin-'))
      .forEach(cls => document.body.classList.remove(cls));
    document.body.classList.add(`skin-${id}`);
  }
  return true;
}

// Lee la skin guardada en localStorage (por defecto 'retro') y la aplica.
// game.js la invoca una vez al arrancar, antes del primer draw(), para que
// la skin correcta esté activa desde el primer frame.
function loadSkin() {
  let saved = 'retro';
  try {
    saved = localStorage.getItem('tetris.skin') || 'retro';
  } catch (e) {
    // localStorage no disponible: nos quedamos con el valor por defecto.
  }
  if (!SKINS[saved]) saved = 'retro';
  setSkin(saved);
}

// skins.js — temas visuales (retro/neón/pastel/pixel art): paleta de colores
// y estilo de dibujo de bloque por skin, persistidos en localStorage bajo la
// clave "tetris.skin". No depende de game.js; game.js lee getSkin()/llama a
// loadSkin() al arrancar y a setSkin() desde el selector del panel.
