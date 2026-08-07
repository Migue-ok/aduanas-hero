import * as THREE from 'three';
import gsap from 'gsap';
import { bus, Señal } from '../core/EventBus.js';

/**
 * CinematicCamera — la cámara nunca es un trípode.
 * Estaciones fijas del puesto + respiración, deriva de mano, parallax de mouse
 * con masa e impulsos de shake. Las transiciones son tweens GSAP con overshoot leve.
 */

/** Estaciones de cámara del puesto de control. */
export const Vista = Object.freeze({
  PUESTO: 'puesto',       // plano general: el pasajero llega
  CLOSEUP: 'closeup',     // interrogatorio: 2/3 de pantalla para el rostro
  ESCRITORIO: 'escritorio', // documentos sobre el tablero
  SELLO: 'sello',         // el riel de sellos y el expediente
  NOTICIERO: 'noticiero', // el televisor CRT de la pared (cierre del turno)
  JUSTUS: 'justus',       // plano bajo del K-9 trabajando
});

const ESTACIONES = {
  [Vista.PUESTO]: { pos: [0, 1.62, 2.05], look: [0, 1.4, -1.6], fov: 55, focus: 3.6, aperture: 0.00018 },
  [Vista.CLOSEUP]: { pos: [0.18, 1.58, 0.55], look: [0, 1.55, -1.6], fov: 32, focus: 2.15, aperture: 0.00038 },
  [Vista.ESCRITORIO]: { pos: [0, 1.78, 1.42], look: [0, 1.02, 0.52], fov: 44, focus: 1.15, aperture: 0.0005 },
  [Vista.SELLO]: { pos: [0.32, 1.72, 1.5], look: [0.3, 1.04, 0.72], fov: 46, focus: 1.05, aperture: 0.0004 },
  [Vista.NOTICIERO]: { pos: [2.1, 1.75, -2.2], look: [4.15, 2.45, -5.8], fov: 34, focus: 4.2, aperture: 0.00028 },
  [Vista.JUSTUS]: { pos: [-3.0, 1.2, 0.35], look: [-0.65, 0.35, -1.4], fov: 38, focus: 2.9, aperture: 0.00042 },
};

export class CinematicCamera {
  constructor(renderer) {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 120);
    this.renderer = renderer; // se asigna después de crear el Renderer (focus pull)

    this.basePos = new THREE.Vector3(...ESTACIONES[Vista.PUESTO].pos);
    this.baseLook = new THREE.Vector3(...ESTACIONES[Vista.PUESTO].look);
    this.camera.position.copy(this.basePos);

    // Parallax de mouse con masa: el objetivo se persigue, nunca se copia.
    this.mouseTarget = new THREE.Vector2();
    this.mouseSmooth = new THREE.Vector2();
    window.addEventListener('pointermove', (e) => {
      this.mouseTarget.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      );
    });

    this.shakeAmp = 0;
    this.breathRate = 0.22; // respiraciones por segundo (sube con la tensión)
    this.vista = Vista.PUESTO;
    this.#lookVec = new THREE.Vector3();
  }

  #lookVec;

  /** Impulso de shake (golpe de sello, quiebre, hallazgo). Decae solo. */
  shake(strength = 1) {
    this.shakeAmp = Math.min(this.shakeAmp + strength * 0.02, 0.06);
  }

  /** Transición cinematográfica a una estación. */
  goTo(vista, { duration = 1.4 } = {}) {
    const st = ESTACIONES[vista];
    if (!st) return;
    this.vista = vista;
    bus.emit(Señal.VISTA_CAMBIADA, { vista });

    const ease = 'power3.inOut';
    gsap.to(this.basePos, { x: st.pos[0], y: st.pos[1], z: st.pos[2], duration, ease });
    gsap.to(this.baseLook, { x: st.look[0], y: st.look[1], z: st.look[2], duration, ease });
    gsap.to(this.camera, {
      fov: st.fov,
      duration,
      ease,
      onUpdate: () => this.camera.updateProjectionMatrix(),
    });
    if (this.renderer) {
      // Rack focus: el DOF llega medio segundo después que la cámara — como un foquista real.
      gsap.to(this.renderer.bokeh.uniforms.focus, { value: st.focus, duration: duration * 0.8, delay: duration * 0.25, ease });
      gsap.to(this.renderer.bokeh.uniforms.aperture, { value: st.aperture, duration, ease });
    }
  }

  /**
   * Estación LIBRE: una cámara calculada en tiempo de ejecución.
   *
   * Las estaciones fijas alcanzaban mientras todo pasaba sobre el mismo
   * mostrador. El Canal Rojo y la sala intrusiva mueven la acción a otra parte
   * de la terminal y necesitan encuadres que dependen de DÓNDE está la maleta
   * que el jugador acaba de tocar — imposible tabularlos de antemano.
   *
   * @param {THREE.Vector3|number[]} pos   posición de cámara
   * @param {THREE.Vector3|number[]} look  punto al que mira
   */
  enfocar(pos, look, { fov = 46, focus = 2.4, aperture = 0.00032, duration = 1.2, vista = 'libre' } = {}) {
    const p = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
    const l = Array.isArray(look) ? look : [look.x, look.y, look.z];
    this.vista = vista;
    bus.emit(Señal.VISTA_CAMBIADA, { vista });

    const ease = 'power3.inOut';
    gsap.to(this.basePos, { x: p[0], y: p[1], z: p[2], duration, ease });
    gsap.to(this.baseLook, { x: l[0], y: l[1], z: l[2], duration, ease });
    gsap.to(this.camera, { fov, duration, ease, onUpdate: () => this.camera.updateProjectionMatrix() });
    if (this.renderer) {
      gsap.to(this.renderer.bokeh.uniforms.focus, { value: focus, duration: duration * 0.8, delay: duration * 0.25, ease });
      gsap.to(this.renderer.bokeh.uniforms.aperture, { value: aperture, duration, ease });
    }
  }

  /** La respiración se acelera con la tensión dramática (0..1). */
  setTension(tension) {
    this.breathRate = 0.22 + tension * 0.24;
  }

  update(dt, t) {
    // Masa del mouse: aceleración limitada, jamás rotación instantánea.
    this.mouseSmooth.lerp(this.mouseTarget, Math.min(1, dt * 2.2));

    // Respiración: dos senos desfasados = inhalar corto, exhalar largo.
    const breath = Math.sin(t * Math.PI * 2 * this.breathRate) * 0.006 +
      Math.sin(t * Math.PI * 2 * this.breathRate * 2.1 + 1.3) * 0.002;

    // Deriva de mano: capas lentas e inconmensurables (nunca se repite el patrón).
    const driftX = Math.sin(t * 0.31) * 0.004 + Math.sin(t * 0.83 + 2.0) * 0.002;
    const driftY = Math.sin(t * 0.47 + 1.1) * 0.003 + Math.sin(t * 1.13) * 0.0015;

    // Shake muscular decreciente con ruido de alta frecuencia.
    const shakeX = (Math.random() - 0.5) * this.shakeAmp;
    const shakeY = (Math.random() - 0.5) * this.shakeAmp;
    this.shakeAmp *= Math.exp(-dt * 6);

    const px = this.mouseSmooth.x * 0.05;
    const py = -this.mouseSmooth.y * 0.035;

    this.camera.position.set(
      this.basePos.x + driftX + px + shakeX,
      this.basePos.y + breath + driftY + py + shakeY,
      this.basePos.z,
    );
    this.#lookVec.set(
      this.baseLook.x + this.mouseSmooth.x * 0.12 + shakeX * 2,
      this.baseLook.y - this.mouseSmooth.y * 0.08 + breath * 0.5 + shakeY * 2,
      this.baseLook.z,
    );
    this.camera.lookAt(this.#lookVec);
  }
}
