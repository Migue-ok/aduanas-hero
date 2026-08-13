import { PAL, TILE } from './Pixel.js';

/**
 * Ambiente — el complejo aduanero en funcionamiento.
 *
 * Nada de esto se toca ni afecta al juego, y por eso mismo importa: un patio
 * donde solo se mueve el jugador es una maqueta. Con grúas que descargan,
 * carretillas cruzando y gaviotas sobre el agua, el mismo patio pasa a ser un
 * sitio donde uno ha entrado a trabajar.
 *
 * Todo es determinista y barato: funciones seno sobre el reloj, sin física ni
 * colisiones. Cuesta lo mismo que no tenerlo.
 */
export class Ambiente {
  constructor(mapa) {
    this.mapa = mapa;
    // Carretillas elevadoras: van y vienen por carriles fijos de la explanada.
    this.carretillas = [
      { y: 18.6, x0: 14, x1: 50, vel: 7.5, fase: 0, color: '#d8a12a' },
      { y: 25.6, x0: 20, x1: 52, vel: 5.5, fase: 2.4, color: '#d8a12a' },
      { y: 35.6, x0: 8, x1: 44, vel: 6.5, fase: 4.1, color: '#c07a2a' },
    ];
    // Gaviotas sobre el agua del norte.
    this.gaviotas = Array.from({ length: 7 }, (_, i) => ({
      x: 4 + i * 8.5, y: 0.6 + (i % 3) * 0.7, vel: 2.2 + (i % 4) * 0.6, fase: i * 1.3,
    }));
    // Grúas pórtico: el spreader sube y baja sobre el muelle.
    this.gruas = [4, 13, 24, 35, 46, 57].map((cx, i) => ({ cx, fase: i * 1.7 }));
  }

  /** @param {number} t  tiempo en segundos */
  dibujarFondo(g, t) {
    // Agua: franjas que se desplazan. Da profundidad al borde norte.
    for (let i = 0; i < 3; i += 1) {
      const y = i * TILE + (Math.sin(t * 0.6 + i) * 3);
      g.fillStyle = `rgba(90,150,190,${0.06 + i * 0.02})`;
      g.fillRect(0, y, this.mapa.wpx, 3);
    }

    // Grúas: brazo sobre el muelle y spreader colgando.
    for (const gr of this.gruas) {
      const x = gr.cx * TILE + 8;
      const baja = 10 + Math.abs(Math.sin(t * 0.5 + gr.fase)) * 26;
      g.fillStyle = '#4a525f';
      g.fillRect(x - 1, 3 * TILE, 2, baja);          // cable
      g.fillStyle = '#8a6a2a';
      g.fillRect(x - 5, 3 * TILE + baja, 10, 4);     // spreader
      g.fillStyle = '#d8c46a';
      g.fillRect(x - 5, 3 * TILE + baja, 10, 1);
    }

    // Gaviotas: puntitos que cruzan el agua.
    g.fillStyle = 'rgba(240,244,250,0.75)';
    for (const gv of this.gaviotas) {
      const x = ((gv.x + t * gv.vel) % (this.mapa.ancho + 6)) * TILE - 3 * TILE;
      const y = gv.y * TILE + Math.sin(t * 2 + gv.fase) * 3;
      const ala = Math.sin(t * 9 + gv.fase) > 0 ? 1 : -1;
      g.fillRect(x, y, 2, 1);
      g.fillRect(x - 2, y - ala, 2, 1);
      g.fillRect(x + 2, y - ala, 2, 1);
    }
  }

  /**
   * Lo que va POR DELANTE del suelo pero por detrás de los actores: las
   * carretillas cruzando la explanada.
   */
  dibujarSuelo(g, t) {
    for (const c of this.carretillas) {
      const rango = c.x1 - c.x0;
      // Vaivén: sube y baja por el carril sin teletransportarse en los extremos.
      const p = (Math.sin(t * c.vel / rango + c.fase) * 0.5 + 0.5) * rango + c.x0;
      const x = p * TILE;
      const y = c.y * TILE;
      const haciaDer = Math.cos(t * c.vel / rango + c.fase) > 0;

      g.fillStyle = PAL.sombra;
      g.fillRect(x - 5, y + 5, 14, 3);
      g.fillStyle = c.color;
      g.fillRect(x - 5, y - 4, 12, 9);              // chasis
      g.fillStyle = '#2e3440';
      g.fillRect(x - 4, y - 7, 7, 4);               // cabina
      g.fillRect(x - 4, y + 4, 4, 3);               // ruedas
      g.fillRect(x + 2, y + 4, 4, 3);
      // Horquillas, al lado hacia el que avanza.
      g.fillStyle = '#5a626e';
      g.fillRect(haciaDer ? x + 7 : x - 9, y - 1, 4, 2);
      g.fillRect(haciaDer ? x + 7 : x - 9, y + 2, 4, 2);
      // Baliza giratoria.
      if (Math.sin(t * 6 + c.fase) > 0.2) {
        g.fillStyle = 'rgba(255,190,60,0.8)';
        g.fillRect(x - 2, y - 9, 3, 2);
      }
    }
  }

  /**
   * Charcos de luz de las farolas. Va al final, en modo aditivo, para que el
   * patio nocturno tenga zonas cálidas y zonas donde uno no ve nada.
   */
  dibujarLuces(g, mapa, camX = 0, camY = 0, vistaW = 1e4, vistaH = 1e4) {
    g.globalCompositeOperation = 'lighter';
    // Solo las farolas que se ven: con 30 en un mapa de 64×44, pintarlas todas
    // era dibujar 30 degradados por fotograma para tirar 25 fuera de pantalla.
    const c0 = Math.max(0, Math.floor(camX / TILE) - 4);
    const c1 = Math.min(mapa.ancho, Math.ceil((camX + vistaW) / TILE) + 4);
    const f0 = Math.max(0, Math.floor(camY / TILE) - 4);
    const f1 = Math.min(mapa.alto, Math.ceil((camY + vistaH) / TILE) + 4);
    for (let cy = f0; cy < f1; cy += 1) {
      for (let cx = c0; cx < c1; cx += 1) {
        if (mapa.en(cx, cy) !== 'O') continue;
        const x = cx * TILE + 8;
        const y = cy * TILE + 8;
        const r = g.createRadialGradient(x, y, 2, x, y, 58);
        r.addColorStop(0, 'rgba(255,206,124,0.38)');
        r.addColorStop(0.45, 'rgba(255,196,110,0.14)');
        r.addColorStop(1, 'rgba(255,196,110,0)');
        g.fillStyle = r;
        g.fillRect(x - 58, y - 58, 116, 116);
      }
    }
    // Las ventanas de la oficina también derraman luz al patio.
    for (let cy = f0; cy < f1; cy += 1) {
      for (let cx = c0; cx < c1; cx += 1) {
        if (mapa.en(cx, cy) !== 'o') continue;
        const x = cx * TILE + 8;
        const y = cy * TILE + 14;
        const r = g.createRadialGradient(x, y, 2, x, y, 40);
        r.addColorStop(0, 'rgba(255,220,150,0.26)');
        r.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = r;
        g.fillRect(x - 40, y - 40, 80, 80);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}
