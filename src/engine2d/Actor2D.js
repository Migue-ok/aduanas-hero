import { lienzo, px, PAL } from './Pixel.js';

/**
 * Actor2D — el oficial y sus animaciones, al estilo de un RPG top-down clásico.
 *
 * ── La animación, que es lo que se pidió ────────────────────────────────────
 * Cuatro direcciones × cuatro fotogramas de ciclo (reposo · paso izquierdo ·
 * reposo · paso derecho). Es exactamente el esquema de los RPG de sprites de
 * consola portátil: el personaje NO desliza, camina, y esa es la diferencia
 * entre que el mundo se sienta vivo o parezca una maqueta.
 *
 * Añadidos propios del juego:
 *  · **Respiración en reposo**: quieto, el cuerpo sube y baja un píxel cada
 *    segundo. Un sprite completamente inmóvil parece un decorado.
 *  · **Dash**: el sprite se inclina y estira en el sentido de la marcha. No es
 *    un fotograma nuevo, es el mismo escalado — barato y se lee al instante.
 *  · **Chaleco reflectante** en color propio, para que el oficial NUNCA se
 *    confunda con un figurante a distancia de mapa.
 *
 * Todo se pinta una vez en lienzos fuera de pantalla al construir el actor.
 */

const A = 16;   // ancho del sprite en píxeles de diseño
const H = 24;   // alto

/** Orden de las filas del spritesheet. Coincide con `Actor2D.dir`. */
export const DIRS = ['abajo', 'arriba', 'izq', 'der'];

/**
 * Dibuja un fotograma del oficial.
 * @param {CanvasRenderingContext2D} g
 * @param {string} dir   abajo · arriba · izq · der
 * @param {number} paso  0 reposo · 1 pie izquierdo · 2 reposo · 3 pie derecho
 */
function pintarOficial(g, dir, paso) {
  const mirandoAtras = dir === 'arriba';
  const lateral = dir === 'izq' || dir === 'der';
  // Balanceo del ciclo de caminar: las piernas alternan, el cuerpo sube 1 px en
  // los fotogramas de paso. Es el truco de siempre y sigue funcionando.
  const alza = paso === 1 || paso === 3 ? 1 : 0;
  const y0 = 2 - alza;

  // Sombra en el suelo: ancla el sprite al mapa. Sin ella, todo flota.
  g.fillStyle = PAL.sombra;
  g.beginPath();
  g.ellipse(A / 2, H - 2, 5, 2.2, 0, 0, Math.PI * 2);
  g.fill();

  // ── Piernas ──
  const sepIzq = paso === 1 ? 1 : paso === 3 ? -1 : 0;
  px(g, 5 + sepIzq, y0 + 17, 3, 5, PAL.uniforme);
  px(g, 8 - sepIzq, y0 + 17, 3, 5, PAL.uniforme);
  px(g, 5 + sepIzq, y0 + 21, 3, 2, PAL.bota);
  px(g, 8 - sepIzq, y0 + 21, 3, 2, PAL.bota);

  // ── Torso con chaleco ──
  px(g, 4, y0 + 9, 8, 9, PAL.uniforme);
  px(g, 4, y0 + 9, 8, 2, PAL.uniformeAlto);       // hombros
  px(g, 5, y0 + 11, 6, 5, PAL.chaleco);           // chaleco reflectante
  px(g, 7, y0 + 11, 2, 5, PAL.uniforme);          // abertura del chaleco

  // ── Brazos, que también balancean ──
  const brazo = paso === 1 ? 1 : paso === 3 ? -1 : 0;
  px(g, 3, y0 + 10 + brazo, 2, 6, PAL.uniforme);
  px(g, 11, y0 + 10 - brazo, 2, 6, PAL.uniforme);
  px(g, 3, y0 + 15 + brazo, 2, 2, PAL.piel);
  px(g, 11, y0 + 15 - brazo, 2, 2, PAL.piel);

  // ── Cabeza ──
  px(g, 4, y0 + 2, 8, 8, PAL.piel);
  px(g, 4, y0 + 8, 8, 1, PAL.pielSombra);         // barbilla
  // Gorra: visera al frente salvo mirando de espaldas.
  px(g, 3, y0 + 1, 10, 4, PAL.gorra);
  if (!mirandoAtras) px(g, 3, y0 + 5, 10, 1, PAL.gorra);

  // ── Cara: ojos grandes, guiño a los googly eyes del 3D (ADR-004) ──
  if (!mirandoAtras) {
    const dx = dir === 'izq' ? -1 : dir === 'der' ? 1 : 0;
    px(g, 5, y0 + 6, 2, 2, '#ffffff');
    px(g, 9, y0 + 6, 2, 2, '#ffffff');
    px(g, 5 + (dx > 0 ? 1 : 0), y0 + 6 + 1, 1, 1, '#141821');
    px(g, 9 + (dx > 0 ? 1 : 0), y0 + 6 + 1, 1, 1, '#141821');
  }

  // De perfil se estrecha un píxel por lado: da volumen sin dibujar otra pose.
  if (lateral) {
    g.clearRect(dir === 'izq' ? 12 : 0, 0, 4, H);
    px(g, dir === 'izq' ? 2 : 11, y0 + 10, 3, 6, PAL.uniforme);
  }
}

export class Actor2D {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.dir = 'abajo';
    this.andando = false;
    this.t = 0;
    this.dash = 0;          // 0..1, intensidad visual del impulso
    this.frames = {};
    for (const d of DIRS) {
      this.frames[d] = [0, 1, 2, 3].map((p) => {
        const { c, g } = lienzo(A, H);
        pintarOficial(g, d, p);
        return c;
      });
    }
  }

  update(dt, moviendo, dir) {
    this.andando = moviendo;
    if (dir) this.dir = dir;
    // 8 fotogramas por segundo caminando: el ritmo de un RPG de sprites clásico.
    this.t = moviendo ? this.t + dt * 8 : 0;
    this.dash = Math.max(0, this.dash - dt * 3.2);
  }

  /**
   * @param {CanvasRenderingContext2D} g  contexto del mundo (ya trasladado)
   * @param {number} esc  escala de píxel de diseño a píxel de pantalla
   */
  dibujar(g, esc) {
    const ciclo = [0, 1, 2, 3][Math.floor(this.t) % 4];
    const img = this.frames[this.dir][this.andando ? ciclo : 0];
    // Respiración en reposo: 1 px arriba y abajo cada segundo.
    const resp = this.andando ? 0 : Math.round(Math.sin(performance.now() / 520) * 0.5);
    // El dash estira el sprite en el sentido de la marcha. Se lee como velocidad.
    const estX = 1 + this.dash * (this.dir === 'izq' || this.dir === 'der' ? 0.22 : -0.1);
    const estY = 1 + this.dash * (this.dir === 'izq' || this.dir === 'der' ? -0.1 : 0.2);
    const w = A * esc * estX;
    const h = H * esc * estY;
    g.drawImage(img, Math.round(this.x - w / 2), Math.round(this.y - h + resp * esc), w, h);
  }
}
