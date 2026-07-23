/**
 * PerfGuard — el guardián de los 60 FPS (ADR-010).
 *
 * Estaba implementado SOLO dentro del `Renderer` del aeropuerto, así que los
 * niveles 2 y 3 (los más pesados: agua con shader, física, bloom, rigs) no
 * tenían ninguna red de seguridad. Aquí se extrae para que cualquier escena lo
 * use.
 *
 * Filosofía heredada del aeropuerto: **60 FPS mandan sobre el caramelo visual**,
 * y la degradación es de un solo sentido — el yo-yo de calidad se nota más que
 * la calidad baja.
 */
export class PerfGuard {
  /**
   * @param {object[]} escalones  Lista ordenada de recortes a aplicar, del más
   *   barato de perder al más doloroso: `{ nombre, aplicar() }`.
   * @param {object} [o]
   * @param {number} [o.fpsMin=28]     Umbral de FPS bajo.
   * @param {number} [o.sostenido=2]   Segundos bajo el umbral antes de recortar.
   */
  constructor(escalones, { fpsMin = 28, sostenido = 2 } = {}) {
    this.escalones = escalones;
    this.fpsMin = fpsMin;
    this.sostenido = sostenido;
    this.nivel = 0;
    this._ema = 60;
    this._bajo = 0;
  }

  /** Llamar cada frame con el dt REAL (no el afectado por hit-stop). */
  update(dt) {
    if (dt <= 0 || this.nivel >= this.escalones.length) return;
    this._ema += (1 / dt - this._ema) * 0.05;
    this._bajo = this._ema < this.fpsMin ? this._bajo + dt : 0;
    if (this._bajo > this.sostenido) {
      const paso = this.escalones[this.nivel++];
      this._bajo = 0;
      try { paso.aplicar(); } catch { /* un recorte fallido no tumba el juego */ }
      console.info(`[AduanasHero] Calidad adaptativa → ${paso.nombre} (FPS ~${this._ema.toFixed(0)})`);
    }
  }

  get fps() { return this._ema; }
}
