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
 *
 * ── Por qué el umbral es 50 y no 28 ────────────────────────────────────────
 * Con 28 el guardián no se disparaba nunca en el rango que importa: un móvil de
 * gama media clavado a 35 FPS tiene la media MUY por encima de 28, así que el
 * contador de tiempo bajo umbral se reseteaba en cada fotograma y la partida
 * entera transcurría a 35 FPS con la red de seguridad "activa" sin recortar
 * nada. 50 deja margen para las bajadas normales de una transición pero coge
 * cualquier régimen sostenido por debajo de los 60.
 *
 * ── Por qué el dt lo mide él y no se lo cree ───────────────────────────────
 * Las escenas pasan un dt ya recortado (`Math.min(clock.getDelta(), 0.05)`)
 * para que la física no explote tras un cambio de pestaña. Ese recorte hace que
 * el guardián sea incapaz de ver por debajo de 20 FPS y que acumule tiempo
 * cuatro veces más despacio que el reloj de pared justo en el escenario más
 * grave. Aquí se usa `performance.now()` para el diagnóstico: el dt de la
 * simulación es del juego, el del guardián es del reloj.
 */
export class PerfGuard {
  /**
   * @param {object[]} escalones  Lista ordenada de recortes a aplicar, del más
   *   barato de perder al más doloroso: `{ nombre, aplicar() }`. Si `aplicar()`
   *   devuelve `false`, el escalón se considera inútil en este dispositivo (por
   *   ejemplo apagar un bloom que en móvil ni existe) y se pasa AL SIGUIENTE en
   *   el acto, sin gastar otra ventana de espera.
   * @param {object} [o]
   * @param {number} [o.fpsMin=50]     Umbral de FPS bajo.
   * @param {number} [o.sostenido=1.5] Segundos bajo el umbral antes de recortar.
   */
  constructor(escalones, { fpsMin = 50, sostenido = 1.5 } = {}) {
    this.escalones = escalones;
    this.fpsMin = fpsMin;
    this.sostenido = sostenido;
    this.nivel = 0;
    this._ema = 60;
    this._bajo = 0;
    this._ultimo = 0;
  }

  /** Llamar cada frame. El argumento sobra: el guardián se cronometra solo. */
  update() {
    const ahora = performance.now();
    const previo = this._ultimo;
    this._ultimo = ahora;
    if (!previo) return; // el primer fotograma no mide nada

    // Segundos reales entre fotogramas. El tope de 0.5 s descarta los saltos
    // que NO son culpa del rendimiento: pestaña en segundo plano, cambio de
    // aplicación, un `alert`. Contarlos dispararía recortes en un teléfono que
    // va perfecto y solo estuvo un rato sin pintar.
    const dt = (ahora - previo) / 1000;
    if (dt <= 0 || dt > 0.5) return;

    // Media móvil ponderada por TIEMPO (no por fotograma): así la constante de
    // reacción es ~0.6 s vaya el juego a 60 FPS o a 12.
    const k = Math.min(1, dt / 0.6);
    this._ema += (1 / dt - this._ema) * k;

    // Agotada la escalera ya no hay nada que recortar, pero el medidor SIGUE
    // corriendo: la salida anterior estaba antes de actualizar el EMA, así que
    // `perf.fps` se congelaba en el valor del instante del último recorte y
    // mentía para siempre. En móvil, donde la escalera se agota en segundos,
    // eso dejaba al único termómetro del juego marcando una cifra fósil justo
    // cuando más falta hace saber a cuánto va de verdad el teléfono.
    if (this.nivel >= this.escalones.length) return;

    this._bajo = this._ema < this.fpsMin ? this._bajo + dt : 0;
    if (this._bajo <= this.sostenido) return;
    this._bajo = 0;

    // Se baja de escalón hasta encontrar uno que de verdad recorte algo. El
    // bucle es la diferencia entre reaccionar en 1.5 s o en 6: en Chimbote los
    // dos primeros escalones eran no-ops en móvil (apagaban una sombra de
    // linterna que en móvil nace apagada y un bloom que en móvil no se crea),
    // y cada uno se comía su ventana entera de tartamudeo sin ganar un frame.
    while (this.nivel < this.escalones.length) {
      const paso = this.escalones[this.nivel++];
      let aplicado = true;
      try { aplicado = paso.aplicar() !== false; }
      catch { aplicado = false; } // un recorte fallido no tumba el juego
      if (aplicado) {
        console.info(`[AduanasHero] Calidad adaptativa → ${paso.nombre} (FPS ~${this._ema.toFixed(0)})`);
        return;
      }
      console.info(`[AduanasHero] Calidad adaptativa: «${paso.nombre}» no aplica aquí, siguiente.`);
    }
  }

  get fps() { return this._ema; }
}

/**
 * Los dos recortes que sirven en cualquier escena, para no reescribirlos en
 * cada nivel — y sobre todo para no volver a equivocarse en ellos.
 */

/**
 * Bajar el ratio de píxeles es, con diferencia, el recorte más rentable: a
 * dPR 1.25 se sombrea un 56 % más de píxeles que a 1.0.
 *
 * La trampa está en el composer. `EffectComposer` guarda el ratio del renderer
 * en su constructor (`this._pixelRatio`, EffectComposer.js:61) y su `setSize`
 * multiplica por ESE valor cacheado, no por el actual. Todos los sitios del
 * proyecto hacían `renderer.setPixelRatio(1)` + `composer.setSize(w, h)` y los
 * render targets se quedaban exactamente igual de grandes: seguía sombreándose
 * la misma cantidad de píxeles en el render, el grade, el humo y el bloom, y lo
 * único que encogía era el blit final. El recorte estrella no recortaba nada.
 * La llave es `composer.setPixelRatio()`.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {{setPixelRatio?: Function, setSize?: Function}} [composer] PostFX o EffectComposer
 */
export function recorteRatioPixel(renderer, composer) {
  return {
    nombre: 'pixelRatio 1.0',
    aplicar() {
      if (renderer.getPixelRatio() <= 1) return false; // ya estaba a 1: no gasta ventana
      renderer.setPixelRatio(1);
      composer?.setPixelRatio?.(1);
      composer?.setSize?.(window.innerWidth, window.innerHeight);
      return true;
    },
  };
}

/**
 * Sombras a media resolución.
 *
 * Es el recorte de sombras que NO congela. Apagar `castShadow` cambia el hash
 * de luces y la clave de programa de TODOS los materiales iluminados, lo que
 * fuerza una recompilación y relinkado síncronos en un solo fotograma —
 * cientos de milisegundos de parálisis en un móvil que ya iba ahogado, es
 * decir el remedio peor que la enfermedad. Tocar `shadowMap.type` es todavía
 * peor: three recorre la escena entera marcando `needsUpdate` y además recrea
 * el render target de cada sombra (WebGLShadowMap.js:130-154).
 *
 * Redimensionar el mapa, en cambio, solo realoja un render target: ni un
 * programa recompilado. Y de paso libera el mapa viejo, que si no se queda en
 * VRAM. (Nota para quien venga buscando "apagar sombras suaves": en three
 * r185 `PCFSoftShadowMap` está deprecado y el propio renderer lo degrada a
 * `PCFShadowMap` en el primer render, así que no hay nada suave que apagar.)
 *
 * @param {THREE.Light[]|Function} luces  las luces con sombra, o algo que las devuelva
 */
export function recorteSombras(luces) {
  return {
    nombre: 'sombras a media resolución',
    aplicar() {
      const lista = (typeof luces === 'function' ? luces() : luces) ?? [];
      let alguna = false;
      for (const luz of lista) {
        const s = luz?.shadow;
        if (!luz?.castShadow || !s || s.mapSize.width <= 256) continue;
        s.mapSize.setScalar(Math.max(256, Math.floor(s.mapSize.width / 2)));
        s.map?.dispose();
        s.map = null; // three lo recrea al tamaño nuevo en el próximo render
        alguna = true;
      }
      return alguna;
    },
  };
}
