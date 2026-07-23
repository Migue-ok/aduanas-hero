import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CinematicPass } from './CinematicPass.js';
import { quality } from '../core/Device.js';

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
    this.gl.setSize(window.innerWidth, window.innerHeight);
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
      0.18, // fuerza: los fluorescentes y pantallas florecen, nada más
      0.5,
      0.92,
    );
    this.composer.addPass(this.bloom);

    this.cinematic = new CinematicPass();
    this.composer.addPass(this.cinematic);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.#resize());
  }

  /** Focus pull: el DOF persigue esta distancia (rack focus con GSAP desde la cámara). */
  setFocusDistance(distance) {
    this.bokeh.uniforms.focus.value = distance;
  }

  setAperture(aperture) {
    this.bokeh.uniforms.aperture.value = aperture;
  }

  #resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
    this.composer.setSize(w, h);
  }

  update(dt) {
    this.#adaptQuality(dt);
    this.cinematic.update(dt, this.tension);
    this.composer.render();
  }

  /**
   * Calidad adaptativa: 60 FPS manda sobre el caramelo visual.
   * Si el promedio cae bajo 28 FPS sostenidos, se apaga el DOF (el pase más
   * caro) y se baja el pixel ratio a 1. Nunca se re-sube en la sesión: el
   * yo-yo de calidad se nota más que la calidad baja.
   */
  #fpsEma = 60;
  #lowTime = 0;
  #degraded = false;

  #adaptQuality(dt) {
    if (this.#degraded || dt <= 0) return;
    const fps = 1 / dt;
    this.#fpsEma += (fps - this.#fpsEma) * 0.05;
    this.#lowTime = this.#fpsEma < 28 ? this.#lowTime + dt : 0;
    if (this.#lowTime > 2) {
      this.#degraded = true;
      this.bokeh.enabled = false;
      this.gl.setPixelRatio(1);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      console.info('[AduanasHero] Calidad adaptativa: DOF apagado, pixelRatio 1 (FPS bajo sostenido).');
    }
  }
}
