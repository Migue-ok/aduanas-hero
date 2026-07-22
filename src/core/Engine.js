import * as THREE from 'three';

/**
 * Engine — reloj y bucle principal.
 * Los sistemas se registran con `add(system)` y reciben `update(dt, t)`.
 * dt viene limitado a 50 ms: una pestaña en segundo plano no rompe físicas ni tweens.
 */
export class Engine {
  #systems = [];
  #clock = new THREE.Clock();
  #running = false;
  elapsed = 0;

  add(system) {
    this.#systems.push(system);
    return system;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#clock.start();
    const loop = () => {
      if (!this.#running) return;
      const dt = Math.min(this.#clock.getDelta(), 0.05);
      this.elapsed += dt;
      for (const system of this.#systems) system.update?.(dt, this.elapsed);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.#running = false;
  }
}
