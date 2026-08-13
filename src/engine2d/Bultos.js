import { PAL } from './Pixel.js';

/**
 * Bultos — cinco siluetas distintas para que el patio se LEA.
 *
 * Con un solo dibujo de contenedor repetido, el patio era un campo de rectángulos
 * y localizar «el que estaba junto a las grúas» exigía leer etiquetas. Con
 * siluetas propias, cada bulto es un hito: «el de los bidones», «el palé del
 * fondo». Es la misma razón por la que en un mapa de verdad no todos los
 * edificios son cubos.
 *
 * Todos caben en la misma celda de 16×16 y se dibujan con el mismo contrato, así
 * que la escena no sabe ni le importa cuál está pintando.
 */

/** Tipos disponibles. El `alto` es cuánto sobresale hacia arriba de su celda. */
export const TIPOS = ['contenedor', 'pale', 'bidones', 'sacos', 'huacal'];

/**
 * @param {CanvasRenderingContext2D} g
 * @param {object} b   bulto: { cx, cy, color, tipo }
 * @param {number} x   esquina de la celda en píxeles de diseño
 */
export function dibujarBulto(g, b, x, y) {
  const col = PAL.cont[b.color % PAL.cont.length];

  // Sombra proyectada común: los apoya en el suelo.
  g.fillStyle = PAL.contSombra;
  g.fillRect(x + 1, y + 11, 15, 4);

  switch (b.tipo) {
    case 'pale': {
      // Palé de cajas: torre de tres cartones sobre tarima de madera.
      g.fillStyle = '#7a6142';
      g.fillRect(x + 1, y + 11, 14, 3);
      g.fillStyle = '#c49a5e';
      g.fillRect(x + 2, y + 6, 6, 5);
      g.fillRect(x + 9, y + 7, 5, 4);
      g.fillRect(x + 4, y + 2, 6, 4);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 2, y + 6, 6, 1);
      g.fillRect(x + 4, y + 2, 6, 1);
      g.fillStyle = 'rgba(0,0,0,0.22)';   // cinta de embalar
      g.fillRect(x + 5, y + 2, 1, 9);
      break;
    }
    case 'bidones': {
      // Tres tambores. El más reconocible del patio a distancia.
      for (const [dx, dy] of [[1, 5], [6, 3], [10, 6]]) {
        g.fillStyle = col;
        g.fillRect(x + dx, y + dy, 5, 8);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(x + dx, y + dy, 5, 1);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x + dx, y + dy + 3, 5, 1);
        g.fillRect(x + dx, y + dy + 6, 5, 1);
      }
      break;
    }
    case 'sacos': {
      // Montón de sacos: bultos redondeados, sin aristas.
      g.fillStyle = '#b9a888';
      for (const [dx, dy, w, h] of [[1, 7, 7, 6], [8, 8, 6, 5], [4, 3, 7, 5]]) {
        g.beginPath();
        g.ellipse(x + dx + w / 2, y + dy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 5, y + 4, 5, 1);
      break;
    }
    case 'huacal': {
      // Huacal de madera: listones cruzados, la jaula de exportación.
      g.fillStyle = '#9c7c4f';
      g.fillRect(x + 1, y + 3, 14, 10);
      g.fillStyle = '#7a6142';
      g.fillRect(x + 1, y + 3, 14, 2);
      g.fillRect(x + 1, y + 11, 14, 2);
      g.strokeStyle = '#6a5438';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 2, y + 5); g.lineTo(x + 14, y + 11);
      g.moveTo(x + 14, y + 5); g.lineTo(x + 2, y + 11);
      g.stroke();
      break;
    }
    default: {
      // Contenedor marítimo, el de siempre: corrugado y canto claro.
      g.fillStyle = col;
      g.fillRect(x + 1, y + 2, 14, 11);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x + 1, y + 2, 14, 2);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 3; i < 14; i += 3) g.fillRect(x + i, y + 4, 1, 9);
      g.fillStyle = 'rgba(0,0,0,0.3)';   // puertas del fondo
      g.fillRect(x + 7, y + 4, 1, 9);
    }
  }
}
