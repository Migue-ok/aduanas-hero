import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Juice — el departamento de impacto (ADR-009).
 *
 * El juego era geométricamente correcto y sensorialmente muerto: abrías un
 * contenedor de dos toneladas y la cámara ni se movía. Aquí vive todo lo que
 * hace que una acción se SIENTA.
 *
 * - `CameraShake`: sacudida basada en TRAUMA (Squirrel Eiserloh). El trauma
 *   decae solo y el desplazamiento va con trauma² — así los golpes pequeños se
 *   notan poco y los grandes revientan la pantalla. Nunca "vibra" de forma
 *   uniforme y barata.
 * - `hitStop`: micro-congelación del tiempo al impactar (lo que hace que un
 *   golpe en Smash o Hades se sienta sólido).
 * - `popIn` / `punch`: la UI deja de aparecer con un interruptor binario.
 */

export class CameraShake {
  constructor(camera) {
    this.camera = camera;
    this.trauma = 0;
    this.t = 0;
    this._offset = new THREE.Vector3();
    this._roll = 0;
  }

  /** Añade trauma 0..1. 0.25 = golpecito · 0.6 = impacto · 1 = catástrofe. */
  add(cantidad) {
    this.trauma = Math.min(1, this.trauma + cantidad);
  }

  /**
   * Aplica y retira el desplazamiento cada frame. Se llama JUSTO ANTES de
   * renderizar y deshace su efecto después, para no contaminar la posición
   * real de la cámara (que otros sistemas leen para raycasts y proximidad).
   */
  apply(dt) {
    if (this.trauma <= 0) return false;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4); // decaimiento
    const s = this.trauma * this.trauma;               // cuadrático: el truco
    const f = this.t * 28;
    // Ruido barato descorrelacionado por eje (senos de frecuencias primas).
    this._offset.set(
      Math.sin(f * 1.0) * Math.sin(f * 0.37) * s * 0.32,
      Math.sin(f * 1.31) * Math.sin(f * 0.53) * s * 0.32,
      0,
    );
    this._roll = Math.sin(f * 0.79) * s * 0.045;
    this.camera.position.add(this._offset);
    this.camera.rotation.z += this._roll;
    return true;
  }

  /** Deshace lo aplicado (llamar justo después de `renderer.render`). */
  revert() {
    if (this._offset.lengthSq() === 0 && this._roll === 0) return;
    this.camera.position.sub(this._offset);
    this.camera.rotation.z -= this._roll;
    this._offset.set(0, 0, 0);
    this._roll = 0;
  }
}

/**
 * Hit-stop: congela el tiempo del juego unos milisegundos. Devuelve un factor
 * multiplicador de `dt` que la escena aplica a su lógica. Es lo que convierte
 * un impacto en un GOLPE.
 */
export class HitStop {
  constructor() { this.restante = 0; }
  /** ms de congelación (60–120 ms es el rango que se siente bien). */
  golpe(ms = 90) { this.restante = Math.max(this.restante, ms / 1000); }
  /** Devuelve el dt corregido y consume la congelación. */
  escala(dt) {
    if (this.restante <= 0) return dt;
    this.restante -= dt;
    return dt * 0.06; // no 0 del todo: congelar en seco se ve como un cuelgue
  }
}

/** Entrada elástica para paneles/avisos de UI. Sustituye al `display:none`. */
export function popIn(el, { from = 18, duration = 0.42 } = {}) {
  if (!el) return;
  gsap.fromTo(el,
    { opacity: 0, y: from, scale: 0.92 },
    { opacity: 1, y: 0, scale: 1, duration, ease: 'elastic.out(1, 0.62)', overwrite: true });
}

/** Latigazo de escala: para confirmar un acierto o un botón pulsado. */
export function punch(el, { escala = 1.14, duration = 0.34 } = {}) {
  if (!el) return;
  gsap.fromTo(el, { scale: escala }, { scale: 1, duration, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
}

/** Destello a pantalla completa (impacto fuerte, hallazgo, decomiso). */
export function flash(color = '#ffffff', { opacidad = 0.55, duration = 0.42 } = {}) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;z-index:70;pointer-events:none;background:${color};opacity:${opacidad}`;
  document.body.appendChild(d);
  gsap.to(d, { opacity: 0, duration, ease: 'power2.out', onComplete: () => d.remove() });
}
