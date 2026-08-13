import { lienzo, px, PAL } from './Pixel.js';

/**
 * Fugitivo — el estibador que no quería que miraras ese bulto.
 *
 * ── Para qué existe ─────────────────────────────────────────────────────────
 * El dash estaba de adorno: servía para cruzar el patio antes, y poco más. Un
 * recurso con cooldown necesita algo que PERSEGUIR. Estos personajes merodean
 * junto a bultos sospechosos y, en cuanto te acercas, echan a correr hacia la
 * verja del sur. Alcanzarlos exige dash — y alcanzarlos revela su bulto de
 * inmediato, que es la recompensa que convierte la carrera en información.
 *
 * ── Los cuatro estados ─────────────────────────────────────────────────────
 *   merodea → alerta (medio segundo con «!» sobre la cabeza) → huye → atrapado
 *                                                                  └→ escapado
 *
 * El medio segundo de alerta es deliberado: es la ventana en la que decides si
 * sales detrás o dejas que se vaya. Sin ella, la huida sería un castigo por
 * caminar, no una decisión.
 *
 * Y no hay violencia: alcanzarlos es tocarlos. Se detienen, levantan las manos y
 * se acabó (Visión §22 y §28).
 */

const A = 16;
const H = 24;
const DIRS = ['abajo', 'arriba', 'izq', 'der'];

/** Ropa de faena, para que NUNCA se confunda con el oficial. */
const ROPA = ['#8a4a4a', '#4a6a3a', '#6a4a7a', '#8a6a3a'];

function pintar(g, dir, paso, ropa, manos) {
  const atras = dir === 'arriba';
  const lateral = dir === 'izq' || dir === 'der';
  const alza = paso === 1 || paso === 3 ? 1 : 0;
  const y0 = 2 - alza;

  g.fillStyle = PAL.sombra;
  g.beginPath();
  g.ellipse(A / 2, H - 2, 5, 2.2, 0, 0, Math.PI * 2);
  g.fill();

  // Piernas: al correr abren más que el oficial al caminar.
  const sep = paso === 1 ? 2 : paso === 3 ? -2 : 0;
  px(g, 5 + sep, y0 + 17, 3, 5, '#3a3f4a');
  px(g, 8 - sep, y0 + 17, 3, 5, '#3a3f4a');
  px(g, 5 + sep, y0 + 21, 3, 2, PAL.bota);
  px(g, 8 - sep, y0 + 21, 3, 2, PAL.bota);

  // Torso con mono de trabajo.
  px(g, 4, y0 + 9, 8, 9, ropa);
  px(g, 4, y0 + 9, 8, 2, 'rgba(255,255,255,0.12)');

  // Brazos. Atrapado = manos arriba, que es el final de la persecución.
  if (manos) {
    px(g, 2, y0 + 4, 2, 7, ropa);
    px(g, 12, y0 + 4, 2, 7, ropa);
    px(g, 2, y0 + 2, 2, 2, PAL.piel);
    px(g, 12, y0 + 2, 2, 2, PAL.piel);
  } else {
    const br = paso === 1 ? 2 : paso === 3 ? -2 : 0;
    px(g, 3, y0 + 10 + br, 2, 6, ropa);
    px(g, 11, y0 + 10 - br, 2, 6, ropa);
    px(g, 3, y0 + 15 + br, 2, 2, PAL.piel);
    px(g, 11, y0 + 15 - br, 2, 2, PAL.piel);
  }

  // Cabeza con gorro de faena.
  px(g, 4, y0 + 2, 8, 8, PAL.piel);
  px(g, 4, y0 + 8, 8, 1, PAL.pielSombra);
  px(g, 4, y0 + 1, 8, 3, '#2e3440');

  if (!atras) {
    px(g, 5, y0 + 6, 2, 2, '#ffffff');
    px(g, 9, y0 + 6, 2, 2, '#ffffff');
    px(g, 5, y0 + 7, 1, 1, '#141821');
    px(g, 9, y0 + 7, 1, 1, '#141821');
  }
  if (lateral) g.clearRect(dir === 'izq' ? 12 : 0, 0, 4, H);
}

export class Fugitivo {
  /**
   * @param {object} bulto  el bulto que estaba vigilando
   * @param {number} semilla  para variar la ropa
   */
  constructor(bulto, semilla = 0) {
    this.bulto = bulto;
    this.estado = 'merodea';
    this.dir = 'abajo';
    this.t = 0;
    this.alerta = 0;
    this.vagar = Math.random() * Math.PI * 2;
    this.ropa = ROPA[semilla % ROPA.length];
    this.frames = {};
    for (const d of DIRS) {
      this.frames[d] = [0, 1, 2, 3].map((p) => {
        const { c, g } = lienzo(A, H);
        pintar(g, d, p, this.ropa, false);
        return c;
      });
    }
    const { c, g } = lienzo(A, H);
    pintar(g, 'abajo', 0, this.ropa, true);
    this.frameManos = c;
  }

  /**
   * @returns {'nada'|'escapa'} si cruzó la verja este fotograma
   */
  update(dt, mapa, jugador, fuga, TILE) {
    this.t += dt * (this.estado === 'huye' ? 13 : 5);
    const dxJ = jugador.x - this.x;
    const dyJ = jugador.y - this.y;
    const dist = Math.hypot(dxJ, dyJ);

    if (this.estado === 'atrapado') return 'nada';

    if (this.estado === 'merodea') {
      // Ronda perezosa alrededor de su bulto: no se aleja, vigila.
      this.vagar += dt * 0.7;
      const bx = (this.bulto.cx + 0.5) * TILE;
      const by = (this.bulto.cy + 1.6) * TILE;
      const ox = Math.cos(this.vagar) * 12;
      const oy = Math.sin(this.vagar * 1.3) * 8;
      this.#irHacia(bx + ox, by + oy, 26, dt, mapa);
      // Te vio. Medio segundo de duda y sale corriendo.
      if (dist < TILE * 3.4) { this.estado = 'alerta'; this.alerta = 0.5; }
      return 'nada';
    }

    if (this.estado === 'alerta') {
      this.alerta -= dt;
      if (this.alerta <= 0) this.estado = 'huye';
      return 'nada';
    }

    // HUYE: hacia la verja, pero apartándose del oficial si lo tiene encima.
    const fx = (fuga.cx + 0.5) * TILE;
    const fy = (fuga.cy + 0.5) * TILE;
    let tx = fx;
    let ty = fy;
    if (dist < TILE * 5) {
      // Con el oficial pegado, prioriza quitárselo de encima: si no, corre en
      // línea recta hacia la salida y la persecución se vuelve trivial.
      tx = this.x - dxJ * 2;
      ty = this.y - dyJ * 2;
    }
    this.#irHacia(tx, ty, 74, dt, mapa);

    if (Math.hypot(fx - this.x, fy - this.y) < TILE * 1.4) {
      this.estado = 'escapado';
      return 'escapa';
    }
    return 'nada';
  }

  #irHacia(tx, ty, vel, dt, mapa) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const [nx, ny] = mapa.mover(this.x, this.y, (dx / d) * vel * dt, (dy / d) * vel * dt, 4);
    // Atascado contra una pared mientras huye: prueba a rodearla girando el
    // rumbo. Sin esto se quedan temblando en una esquina y dejan de dar miedo.
    if (this.estado === 'huye' && Math.abs(nx - this.x) < 0.01 && Math.abs(ny - this.y) < 0.01) {
      this.vagar += 1.2;
      const a = this.vagar;
      const [rx, ry] = mapa.mover(this.x, this.y, Math.cos(a) * vel * dt, Math.sin(a) * vel * dt, 4);
      this.x = rx; this.y = ry;
    } else {
      this.x = nx; this.y = ny;
    }
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'izq' : 'der') : (dy < 0 ? 'arriba' : 'abajo');
  }

  atrapar() {
    this.estado = 'atrapado';
    this.bulto.revelado = true;
  }

  dibujar(g) {
    if (this.estado === 'escapado') return;
    const img = this.estado === 'atrapado'
      ? this.frameManos
      : this.frames[this.dir][this.estado === 'merodea' && this.t % 4 < 2 ? 0 : Math.floor(this.t) % 4];
    g.drawImage(img, Math.round(this.x - A / 2), Math.round(this.y - H));

    // El «!» de la alerta: el aviso de que va a salir corriendo.
    if (this.estado === 'alerta') {
      const salto = Math.sin(this.alerta * 22) * 2;
      g.font = 'bold 12px system-ui';
      g.textAlign = 'center';
      g.fillStyle = PAL.mal;
      g.fillText('!', this.x, this.y - H - 3 + salto);
    } else if (this.estado === 'huye') {
      // Nubecillas de polvo tras los talones.
      g.fillStyle = 'rgba(220,220,210,0.35)';
      for (let i = 0; i < 3; i += 1) {
        const f = (this.t * 0.6 + i) % 3;
        g.beginPath();
        g.arc(this.x - Math.cos(this.t) * f * 2, this.y - 1 + i, 2.2 - f * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
