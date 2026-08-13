/**
 * Viewport — que el lienzo mida SIEMPRE lo que mide la pantalla.
 *
 * ── El bug que existe para matar ────────────────────────────────────────────
 * En un iPhone, si el juego dimensionaba su lienzo en vertical (390 px de ancho)
 * y el jugador giraba el teléfono a apaisado (844 px), el canvas se quedaba
 * clavado en 390: **media pantalla en negro**, con el HUD encima ocupando el
 * ancho completo. El juego seguía corriendo, pero solo se veía la mitad.
 *
 * Dos causas sumadas, y ninguna se arregla sola:
 *
 * 1. `WebGLRenderer.setSize(w, h)` escribe `style.width/height` EN LÍNEA sobre
 *    el canvas, pisando el `#gl { position: fixed; inset: 0 }` de la hoja de
 *    estilos. Basta con pasarle el tercer argumento `false` para que el tamaño
 *    CSS lo mande el CSS: el lienzo cubre la pantalla pase lo que pase, y lo
 *    peor que puede verse mientras se corrige el buffer es un fotograma
 *    escalado, no medio juego a oscuras.
 * 2. El evento `resize` no es de fiar en móvil. En iOS, al girar el aparato,
 *    llega a veces con las medidas de ANTES de la rotación; y la barra de
 *    direcciones de Safari cambia el alto sin dispararlo siquiera.
 *
 * Por eso esto engancha cuatro fuentes —`resize`, `orientationchange`, el
 * `visualViewport` y un `ResizeObserver` sobre el propio lienzo— y además expone
 * `sincronizar()` para llamarlo UNA VEZ POR FOTOGRAMA desde el bucle de render.
 * Esa última es la red que no falla: cuesta dos comparaciones de enteros y
 * atrapa cualquier cambio que se escape a las otras cuatro.
 *
 * Uso:
 *   this.vp = new Viewport(canvas, (w, h) => {
 *     camara.aspect = w / h; camara.updateProjectionMatrix();
 *     renderer.setSize(w, h, false);
 *     post?.setSize(w, h);
 *   });
 *   // en el bucle:   this.vp.sincronizar();
 *   // al desmontar:  this.vp.destroy();
 */
export class Viewport {
  /**
   * @param {HTMLCanvasElement} canvas  el lienzo que tiene que cubrir la pantalla
   * @param {(w:number, h:number) => void} alCambiar  aplica el tamaño nuevo
   */
  constructor(canvas, alCambiar) {
    this.canvas = canvas;
    this.alCambiar = alCambiar;
    this.w = 0;
    this.h = 0;

    this._onResize = () => this.sincronizar();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    }
    // Y un repaso diferido: iOS termina de acomodar el viewport DESPUÉS de
    // notificar la rotación, así que la primera medida puede ser la vieja.
    this._tardio = setTimeout(this._onResize, 350);

    this.sincronizar();
  }

  /**
   * Aplica el tamaño real si cambió. Idempotente y barato: si no cambió nada,
   * sale sin tocar la GPU.
   * @returns {boolean} si hubo cambio
   */
  sincronizar() {
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    // Pestaña oculta o en pleno cambio de orientación: no se redimensiona a
    // cero, que además deja el buffer inservible hasta el siguiente aviso.
    if (w <= 0 || h <= 0) return false;
    if (w === this.w && h === this.h) return false;
    this.w = w;
    this.h = h;
    this.alCambiar(w, h);
    return true;
  }

  destroy() {
    clearTimeout(this._tardio);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.visualViewport?.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
    this._ro = null;
  }
}
