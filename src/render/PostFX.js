import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { quality } from '../core/Device.js';

/**
 * PostFX — la cadena de post-proceso del juego (ADR-009 fase 2).
 *
 * PROBLEMA QUE RESUELVE: el Nivel 3 tenía su propio post-proceso a mano (render
 * target + quad para el "modo olfato" en blanco y negro) y el humo neón se
 * pintaba encima en una tercera pasada. Meter bloom encima de eso a lo bruto
 * habría (a) desaturado el neón o (b) matado el modo detective. Aquí se
 * reconstruye el orden correcto:
 *
 *   1. RenderPass(escena)         — el mundo
 *   2. GradePass                  — corrección de color + viñeta + modo detective
 *   3. RenderPass(overlay)        — el humo neón, SIN desaturar (clear:false)
 *   4. UnrealBloomPass            — el neón, las alarmas y el oro IRRADIAN
 *   5. OutputPass                 — tone mapping + espacio de color
 *
 * El orden importa: el grade va ANTES del overlay (para no grisear el neón) y
 * el bloom DESPUÉS (para que el neón sí brille). En móvil se omite el bloom
 * (es el paso más caro con diferencia) pero se conserva el grade.
 */

/** Corrección de color + viñeta + desaturación "modo detective" en un solo paso. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMix: { value: 0 },          // 0 = color normal · 1 = modo detective (B/N frío)
    // Valores AFINADOS EN PANTALLA: con contraste alto el suelo blanco de la
    // galería saturaba a 1.0 y el bloom lo convertía en una plasta lechosa.
    uContraste: { value: 1.02 },
    uSaturacion: { value: 1.14 },
    uVineta: { value: 0.34 },
    uFrioCalido: { value: 0.06 }, // sombras al azul, luces al ámbar (teal & orange)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uMix, uContraste, uSaturacion, uVineta, uFrioCalido;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));

      // Grado cinematográfico: sombras hacia el azul, altas luces hacia el ámbar.
      vec3 frio = vec3(0.86, 0.95, 1.12);
      vec3 calido = vec3(1.10, 1.02, 0.88);
      c *= mix(frio, calido, smoothstep(0.25, 0.75, luma)) * uFrioCalido + (1.0 - uFrioCalido);

      c = (c - 0.5) * uContraste + 0.5;              // contraste
      c = mix(vec3(luma), c, uSaturacion);            // saturación

      // Modo detective: gris frío (el rastro de olor se pinta DESPUÉS, en color).
      vec3 detective = vec3(luma * 0.86, luma * 0.95, luma);
      c = mix(c, detective, uMix);

      // Viñeta: cierra el encuadre y empuja la mirada al centro.
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * uVineta * (1.0 + uMix);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class PostFX {
  /**
   * @param {object} o
   * @param {THREE.Scene}  o.scene    escena principal
   * @param {THREE.Camera} o.camera
   * @param {THREE.Scene}  [o.overlay] escena que se dibuja SIN desaturar (humo neón)
   * @param {number} [o.bloom]        fuerza del bloom (0 = sin bloom)
   */
  constructor(renderer, { scene, camera, overlay = null, bloom = 0.5 } = {}) {
    this.renderer = renderer;
    this.usaBloom = bloom > 0 && !quality.mobile; // el bloom es el paso más caro
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    if (overlay) {
      // El humo neón entra DESPUÉS del grade (no se grisea) y ANTES del bloom
      // (para que irradie de verdad).
      const overlayPass = new RenderPass(overlay, camera);
      overlayPass.clear = false;
      this.composer.addPass(overlayPass);
    }

    if (this.usaBloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloom,   // fuerza
        0.68,    // radio: halos más anchos y suaves, menos "aureola de sticker"
        // Umbral ALTO a propósito: con 0.72 el suelo de cerámica blanca de la
        // galería entraba entero en el bloom y lavaba la escena. Solo deben
        // irradiar los emisivos de verdad: neón, alarmas y oro.
        0.95,
      );
      // RODILLA SUAVE — la clave para el look Blade Runner sin quemar el suelo.
      // `UnrealBloomPass` filtra por LUMINANCIA con un `smoothstep(umbral,
      // umbral + smoothWidth, luma)`, y su `smoothWidth` por defecto es 0.01:
      // un corte prácticamente binario. Un píxel a 0.949 no brillaba nada y uno
      // a 0.951 brillaba entero — de ahí ese borde duro y sucio alrededor de las
      // luces. Con 0.35 la entrada es progresiva:
      //   · suelo de cerámica iluminado (luma ≈ 1.0) → ~5 % de aporte
      //   · neón/alarma/oro emisivos    (luma 2–5)   → aporte total
      // El resultado es exactamente el pedido: los neones irradian y los suelos
      // claros se quedan donde estaban.
      this.bloom.highPassUniforms.smoothWidth.value = 0.35;
      this.composer.addPass(this.bloom);
    }

    this.composer.addPass(new OutputPass());
  }

  /** 0..1 — cuánto modo detective se aplica (lo controla el olfato de Justus). */
  set detective(v) { this.grade.uniforms.uMix.value = v; }
  get detective() { return this.grade.uniforms.uMix.value; }

  setSize(w, h) {
    // `composer.setSize` ya reenvía el tamaño EFECTIVO (× pixelRatio) a cada
    // pasada, bloom incluido. El `this.bloom.setSize(w, h)` que había aquí lo
    // volvía a dimensionar con el tamaño LÓGICO, así que el halo acababa
    // trabajando a otra resolución que el resto de la cadena — más blando y
    // escalonado — después de cada resize.
    this.composer.setSize(w, h);
  }

  /**
   * Cambia el ratio de píxeles de TODA la cadena. Imprescindible: el composer
   * cachea el ratio del renderer en su constructor y `setSize` multiplica por
   * ese valor viejo, así que sin esto un `renderer.setPixelRatio(1)` no encoge
   * ni uno de los render targets (ver `core/PerfGuard.js`).
   */
  setPixelRatio(ratio) {
    this.composer.setPixelRatio?.(ratio);
  }

  render() { this.composer.render(); }

  /**
   * Cierra la cadena al desmontar el nivel.
   *
   * ── La mina del `FullScreenQuad` ──────────────────────────────────────────
   * Casi todas las pasadas de three dibujan sobre un `FullScreenQuad`, y TODOS
   * los `FullScreenQuad` de la aplicación comparten UNA misma geometría: un
   * triángulo a pantalla completa creado a nivel de módulo
   * (`postprocessing/Pass.js:123`, `const _geometry = new
   * FullscreenTriangleGeometry()`). Pero su `dispose()` hace
   * `this._mesh.geometry.dispose()` (Pass.js:157) — es decir, la primera pasada
   * que se cierre destruye el triángulo de TODA la aplicación, no el suyo.
   *
   * Hoy no explota solo porque salir de un nivel recarga la página. En cuanto
   * el `SceneManager` encadene dos niveles sin recargar, el composer del
   * segundo nacería sobre una geometría ya liberada: sus buffers de GPU
   * borrados y su entrada fuera del registro del renderer. Es exactamente la
   * "pérdida de contexto abrupta en medio de una transición" — y encima
   * descuadra `renderer.info.memory.geometries` hacia abajo, que es lo que hace
   * imposible fiarse de la medición de fugas.
   *
   * El triángulo son 3 vértices: no hay nada que ganar liberándolo y todo que
   * perder. Se le blinda el `dispose` durante el barrido y se le devuelve
   * después. Lo caro de verdad —render targets, materiales, texturas— sí se
   * suelta, que es de lo que va este método.
   */
  dispose() {
    // Se blindan TODAS las geometrías de quad de la cadena (en la práctica es
    // siempre la misma, la compartida) y se restauran al terminar.
    const blindadas = new Map();
    for (const geo of this.#geometriasDeQuads()) {
      blindadas.set(geo, geo.dispose);
      geo.dispose = () => {};
    }
    try {
      for (const pass of this.composer.passes) pass.dispose?.();
    } finally {
      for (const [geo, original] of blindadas) geo.dispose = original;
    }
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
  }

  /**
   * Las geometrías de los `FullScreenQuad` de la cadena.
   *
   * Se buscan por FORMA y no por nombre a propósito: la propiedad donde cada
   * pasada guarda su quad es privada y ya ha cambiado de nombre entre versiones
   * de three (`fsQuad` → `_fsQuad` en r185). Apuntar al nombre daba un
   * `undefined` silencioso — el blindaje parecía estar puesto y no protegía
   * nada, que es la peor variante posible de este bug. Recorrer las propiedades
   * buscando «algo que envuelve una malla» sobrevive al renombre y, si un día
   * deja de encontrar nada, lo peor que pasa es volver al comportamiento
   * anterior.
   */
  #geometriasDeQuads() {
    const geos = new Set();
    for (const pass of this.composer.passes) {
      for (const v of Object.values(pass)) {
        const malla = v?._mesh ?? v?.mesh;
        if (malla?.isMesh && malla.geometry?.isBufferGeometry) geos.add(malla.geometry);
      }
    }
    return geos;
  }
}
