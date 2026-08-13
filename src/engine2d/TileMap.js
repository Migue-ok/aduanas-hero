import { lienzo, px, PAL, TILE } from './Pixel.js';

/**
 * TileMap — el complejo aduanero, en tiles.
 *
 * El mapa se define con una plantilla de texto, que es la forma en que se han
 * dibujado los mapas de los RPG de sprites desde siempre: se LEE como el mapa
 * que describe, así que moverle una pared a un almacén es mover un carácter.
 *
 *   .  asfalto del patio          #  pared de nave
 *   ,  suelo de almacén           =  muelle de carga (borde)
 *   |  línea pintada              O  poste de luz
 *   ~  agua (fuera del recinto)   T  caseta de control
 *
 * Todo el mapa se PINTA UNA VEZ en un lienzo grande al montarse y luego se
 * estampa recortado por la cámara. Con 60×40 tiles son 2400 celdas: dibujarlas
 * cada fotograma en un móvil es tirar el presupuesto por nada, porque el suelo
 * no cambia nunca.
 */

/** Los tiles que bloquean el paso. */
const SOLIDOS = new Set(['#', 'O', '~', '=']);

export class TileMap {
  /** @param {string[]} filas  plantilla de texto, una cadena por fila */
  constructor(filas) {
    this.filas = filas;
    this.alto = filas.length;
    this.ancho = Math.max(...filas.map((f) => f.length));
    this.wpx = this.ancho * TILE;
    this.hpx = this.alto * TILE;
    this.#pintar();
  }

  en(cx, cy) {
    if (cx < 0 || cy < 0 || cy >= this.alto) return '#';
    return this.filas[cy][cx] ?? '#';
  }

  /** ¿Se puede pisar este punto del mundo (en píxeles de diseño)? */
  libre(x, y) {
    return !SOLIDOS.has(this.en(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  /**
   * Colisión con deslizamiento por ejes: se prueba X y luego Y por separado.
   * Sin esto, rozar una pared en diagonal deja al jugador clavado — y en un
   * móvil con joystick analógico se roza una pared cada dos segundos.
   */
  mover(x, y, dx, dy, radio = 5) {
    let nx = x;
    let ny = y;
    if (dx !== 0) {
      const px2 = x + dx + Math.sign(dx) * radio;
      if (this.libre(px2, y - 2) && this.libre(px2, y - 10)) nx = x + dx;
    }
    if (dy !== 0) {
      const py2 = y + dy + Math.sign(dy) * 2;
      if (this.libre(nx - radio + 1, py2) && this.libre(nx + radio - 1, py2)) ny = y + dy;
    }
    return [nx, ny];
  }

  #pintar() {
    const { c, g } = lienzo(this.wpx, this.hpx);
    this.lienzo = c;

    for (let cy = 0; cy < this.alto; cy += 1) {
      for (let cx = 0; cx < this.ancho; cx += 1) {
        const t = this.en(cx, cy);
        const x = cx * TILE;
        const y = cy * TILE;
        // Damero sutil: da textura al suelo sin dibujar ni una textura.
        const alt = (cx + cy) % 2 === 0;

        if (t === '~') {
          px(g, x, y, TILE, TILE, '#1d3a52');
          px(g, x, y + ((cx * 5 + cy * 3) % TILE), TILE, 2, '#27506e');
        } else if (t === ',') {
          px(g, x, y, TILE, TILE, alt ? PAL.suelo : PAL.sueloAlt);
        } else if (t === '#') {
          px(g, x, y, TILE, TILE, PAL.pared);
          px(g, x, y, TILE, 4, PAL.paredAlta);          // canto superior iluminado
          px(g, x, y + TILE - 2, TILE, 2, '#3f4652');   // base en sombra
        } else if (t === '=') {
          px(g, x, y, TILE, TILE, '#6b5b45');
          px(g, x, y, TILE, 3, '#7d6a50');
          for (let i = 0; i < TILE; i += 4) px(g, x + i, y + 4, 1, TILE - 4, '#5a4d3b');
        } else if (t === 'O') {
          px(g, x, y, TILE, TILE, alt ? PAL.asfalto : PAL.asfaltoOscuro);
          px(g, x + 6, y + 2, 4, 12, '#5a6472');        // poste
          px(g, x + 3, y, 10, 4, '#d8c46a');            // farola
        } else if (t === 'T') {
          px(g, x, y, TILE, TILE, '#4d5568');
          px(g, x + 2, y + 2, 12, 10, '#6f7c93');
          px(g, x + 4, y + 4, 8, 5, '#a8c4dd');         // ventanal de la caseta
        } else if (t === '|') {
          px(g, x, y, TILE, TILE, alt ? PAL.asfalto : PAL.asfaltoOscuro);
          px(g, x + 6, y, 4, TILE, PAL.linea);          // línea pintada del patio
        } else {
          px(g, x, y, TILE, TILE, alt ? PAL.asfalto : PAL.asfaltoOscuro);
        }
      }
    }
    this.ctx = g;
  }
}
