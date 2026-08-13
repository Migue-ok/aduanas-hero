import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CinematicPass } from './CinematicPass.js';
import { quality } from '../core/Device.js';
import { PerfGuard, recorteRatioPixel, recorteSombras } from '../core/PerfGuard.js';

/**
 * Renderer — la sala de proyección.
 * WebGLRenderer físico (ACES) + cadena de postprocesado:
 * render → bokeh (DOF real) → bloom físico → lente cinematográfica → salida sRGB.
 */
export class Renderer {
  constructor(canvas, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    /** Tensión dramática global 0..1 — la lee CinematicPass. */
    this.tension = 0;

    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    // El aeropuerto ignoraba el presupuesto móvil (ADR-008): pixelRatio 1.5 fijo
    // y sombras suaves aunque fuera un teléfono. Ahora respeta el mismo techo
    // que los demás niveles.
    this.gl.setPixelRatio(quality.pixelRatio);
    // `updateStyle = false`: que el TAMAÑO CSS del lienzo lo mande la hoja de
    // estilos (`#gl { position: fixed; inset: 0 }`) y no Three.js.
    //
    // Con el valor por defecto, `setSize` escribe `style.width/height` en línea
    // sobre el canvas y pisa ese `inset: 0`. Ahí nacía el peor bug que ha tenido
    // el juego en móvil: si el lienzo se dimensionaba en vertical (390 px) y el
    // jugador giraba el teléfono a apaisado (844 px), el canvas se quedaba
    // clavado en 390 px de ancho y MEDIA PANTALLA SE VEÍA NEGRA, con el HUD
    // encima ocupando el ancho completo. Dejando el tamaño al CSS, el lienzo
    // cubre la pantalla pase lo que pase; lo peor que puede ocurrir mientras se
    // corrige el buffer es un fotograma escalado, no medio juego a oscuras.
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this._tam = { w: window.innerWidth, h: window.innerHeight };
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = quality.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.2; // cartoon luminoso (ADR-004): el mundo sonríe

    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bokeh = new BokehPass(scene, camera, {
      focus: 3.2,
      aperture: 0.00022,
      maxblur: 0.008,
    });
    // El DOF es la pasada más cara de la cadena: en móvil nace apagada.
    this.bokeh.enabled = !quality.mobile;
    this.composer.addPass(this.bokeh);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42, // fuerza: fluorescentes, monitores y el ámbar del sello IRRADIAN
      0.68, // radio: halo ancho y suave, no un contorno duro
      0.95, // umbral por luminancia
    );
    // Rodilla suave (ver la nota larga en PostFX.js): con el `smoothWidth` por
    // defecto de 0.01 el corte es binario y aparecen bordes sucios alrededor de
    // cada luz. Con 0.35 el mostrador blanco del puesto aporta ~5 % y solo los
    // emisivos de verdad florecen — se puede subir la fuerza sin lavar la sala.
    this.bloom.highPassUniforms.smoothWidth.value = 0.35;
    // En móvil nace apagado, igual que en los niveles 2 y 3 (`PostFX` lo omite
    // por ser «el paso más caro con diferencia»). El aeropuerto era el único
    // que lo ejecutaba en teléfono sin preguntar: una pirámide de mips con blur
    // separable, ~10 pasadas a pantalla completa, encima del DOF y con el
    // presupuesto de un móvil de gama media. Era el mayor gasto de relleno del
    // nivel y estaba fuera de todo control de calidad.
    //
    // Efecto secundario bueno: el escalón «bloom off» del guardián (más abajo)
    // pasa a devolver `false` en móvil, así que en vez de gastar su ventana de
    // 1,5 s apagando algo que ya estaba apagado, salta al siguiente recorte.
    this.bloom.enabled = !quality.mobile;
    this.composer.addPass(this.bloom);

    this.cinematic = new CinematicPass();
    this.composer.addPass(this.cinematic);
    this.composer.addPass(new OutputPass());

    // El aeropuerto tenía su propio guardián de FPS copiado a mano (umbral 28 y
    // un único escalón todo-o-nada) mientras los otros dos niveles usaban
    // `PerfGuard`. Ahora los tres comparten el mismo, con el mismo umbral de 50
    // y la misma escalera: un solo sitio que tocar y ningún umbral divergente.
    this.perf = new PerfGuard([
      { nombre: 'DOF off', aplicar: () => {
        if (!this.bokeh.enabled) return false; // en móvil ya nace apagado
        this.bokeh.enabled = false;
        return true;
      } },
      recorteRatioPixel(this.gl, this),
      { nombre: 'bloom off', aplicar: () => {
        if (!this.bloom.enabled) return false;
        this.bloom.enabled = false;
        return true;
      } },
      recorteSombras(() => {
        const luces = [];
        scene.traverse((o) => { if (o.isLight && o.castShadow) luces.push(o); });
        return luces;
      }),
    ]);

    // TRES REDES para el mismo fallo, porque en un teléfono ninguna basta sola:
    //
    //  1. `resize` — el evento de siempre. En iOS, al girar el aparato, llega a
    //     veces con las medidas ANTERIORES a la rotación: por eso no se puede
    //     confiar en él como única fuente.
    //  2. `orientationchange` + `visualViewport` — cubren el giro y la barra de
    //     direcciones de Safari, que cambia el alto sin disparar `resize`.
    //  3. La comprobación por fotograma de `update()` — la red definitiva.
    //     Cuesta dos comparaciones de enteros y atrapa cualquier cambio que se
    //     escape a las otras dos, venga de donde venga.
    this._onResize = () => this.#resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    // El lienzo también avisa por su cuenta si su caja CSS cambia de tamaño.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.#resize());
      this._ro.observe(canvas);
    }
  }

  /** Lo necesita `recorteRatioPixel`: el composer cachea el ratio (ver PerfGuard). */
  setPixelRatio(ratio) { this.composer.setPixelRatio?.(ratio); }

  setSize(w, h) { this.composer.setSize(w, h); }

  /** Focus pull: el DOF persigue esta distancia (rack focus con GSAP desde la cámara). */
  setFocusDistance(distance) {
    this.bokeh.uniforms.focus.value = distance;
  }

  setAperture(aperture) {
    this.bokeh.uniforms.aperture.value = aperture;
  }

  /**
   * Ajusta el buffer al tamaño real de la ventana. Idempotente y barato: si no
   * cambió nada, sale sin tocar la GPU. Por eso se puede llamar cada fotograma.
   */
  #resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this._tam.w && h === this._tam.h) return;
    if (w === 0 || h === 0) return;   // pestaña oculta: no se redimensiona a cero
    this._tam = { w, h };
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h, false);     // el CSS manda el tamaño del lienzo
    this.composer.setSize(w, h);
  }

  update(dt) {
    this.#resize(); // red definitiva: ningún cambio de tamaño sobrevive un frame
    this.vigilar();
    this.cinematic.update(dt, this.tension);
    this.composer.render();
  }

  /**
   * Un latido del guardián de FPS, sin renderizar.
   *
   * Existe porque el minijuego de rayos X renderiza por su cuenta
   * (`XRayView.update`) y durante todo ese modo de juego `update()` no se
   * llamaba: el aeropuerto se quedaba literalmente ciego a los FPS justo en su
   * pantalla más cargada. La escena lo invoca en las dos ramas.
   */
  vigilar() {
    this.perf.update();
  }
}
