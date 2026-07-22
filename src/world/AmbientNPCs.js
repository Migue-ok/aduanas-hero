import * as THREE from 'three';
import { makeGooglyEyes } from './GooglyEyes.js';

/**
 * AmbientNPCs — la terminal nunca está vacía (y ahora es un desfile de colores).
 * Caminantes de fondo con rutas propias y una fila viva detrás del puesto,
 * todos con su par de ojos saltones (ADR-004): hasta los extras son cartoon.
 */

const PALETA_ROPA = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0x2ec4b6, 0xe76fa1];
const PALETA_PIEL = [0xe8b58a, 0xc79b76, 0xa9825e, 0x8a6244, 0xf0c8a0];

function makePerson(scale = 1) {
  const g = new THREE.Group();
  const ropa = new THREE.MeshStandardMaterial({
    color: PALETA_ROPA[Math.floor(Math.random() * PALETA_ROPA.length)], roughness: 0.85,
  });
  const piel = new THREE.MeshStandardMaterial({
    color: PALETA_PIEL[Math.floor(Math.random() * PALETA_PIEL.length)], roughness: 0.6,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.62, 4, 10), ropa);
  body.position.y = 0.85;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), piel);
  head.position.y = 1.54;
  head.castShadow = true;
  const ojitos = makeGooglyEyes({ radio: 0.038, separacion: 0.045, pupila: 0.01 });
  ojitos.group.position.set(0, 0.02, 0.11);
  head.add(ojitos.group);

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.9 }));
  legs.position.y = 0.28;

  g.add(body, head, legs);
  g.scale.setScalar(scale * (0.92 + Math.random() * 0.16));
  g.userData = { body, head, ojitos, phase: Math.random() * 10, speed: 0.5 + Math.random() * 0.5 };

  // La mitad arrastra una maleta con ruedas.
  if (Math.random() < 0.5) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.18),
      new THREE.MeshStandardMaterial({ color: PALETA_ROPA[Math.floor(Math.random() * PALETA_ROPA.length)], roughness: 0.6 }));
    bag.position.set(0.32, 0.25, -0.1);
    bag.castShadow = true;
    g.add(bag);
  }
  return g;
}

export class AmbientNPCs {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Caminantes de fondo: cada uno con una ruta lineal propia que recircula.
    this.walkers = [];
    for (let i = 0; i < 10; i++) {
      const p = makePerson();
      const lane = -9 - Math.random() * 6; // pasillos al fondo
      p.userData.route = {
        z: lane,
        from: -16 + Math.random() * 6,
        to: 14 - Math.random() * 6,
        dir: Math.random() < 0.5 ? 1 : -1,
        t: Math.random(),
      };
      this.group.add(p);
      this.walkers.push(p);
    }

    // La fila del puesto: 5 pasajeros esperando su turno.
    this.queue = [];
    for (let i = 0; i < 5; i++) {
      const p = makePerson();
      p.position.set((Math.random() - 0.5) * 0.5, 0, -3.4 - i * 1.15);
      p.userData.slot = i;
      p.userData.shuffleTimer = Math.random() * 6;
      this.group.add(p);
      this.queue.push(p);
    }
  }

  /**
   * La fila avanza un puesto. El primero NO se desliza hacia atrás a la vista
   * de todos (rompía la lógica): desaparece hacia el puesto y reaparece
   * llegando por el fondo, como un pasajero nuevo que se suma a la cola.
   */
  advanceQueue() {
    let primero = null;
    for (const p of this.queue) {
      if (p.userData.slot === 0) primero = p;
      else p.userData.slot -= 1;
    }
    if (primero) {
      primero.userData.slot = this.queue.length - 1;
      // Teletransporte fuera de cámara: al fondo del pasillo de la fila.
      primero.position.set((Math.random() - 0.5) * 0.5, 0, -3.4 - this.queue.length * 1.15 - 2.5);
    }
  }

  update(dt, t) {
    // Caminantes: avance con bob de paso y balanceo.
    for (const w of this.walkers) {
      const r = w.userData.route;
      r.t += dt * 0.018 * w.userData.speed * r.dir;
      if (r.t > 1 || r.t < 0) { r.dir *= -1; r.t = THREE.MathUtils.clamp(r.t, 0, 1); }
      const x = THREE.MathUtils.lerp(r.from, r.to, r.t);
      w.position.set(x, Math.abs(Math.sin(t * 6 * w.userData.speed + w.userData.phase)) * 0.03, r.z);
      w.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      w.rotation.z = Math.sin(t * 6 * w.userData.speed + w.userData.phase) * 0.03;
    }

    // Fila: micro-conducta de espera (peso de pie, mirar alrededor, acomodarse).
    for (const p of this.queue) {
      const targetZ = -3.4 - p.userData.slot * 1.15;
      p.position.z += (targetZ - p.position.z) * Math.min(1, dt * 1.5);
      const ph = p.userData.phase;
      p.position.x += (Math.sin(t * 0.3 + ph) * 0.06 - p.position.x) * dt;
      p.rotation.y = Math.sin(t * 0.22 + ph) * 0.25;                    // mira la fila, mira el panel
      p.userData.body.rotation.z = Math.sin(t * 0.5 + ph) * 0.035;      // cambia el peso de pie
      p.userData.head.rotation.y = Math.sin(t * 0.4 + ph * 2) * 0.5;    // la cabeza busca
      p.userData.head.position.y = 1.54 + Math.sin(t * 1.1 + ph) * 0.008; // respiración
      p.userData.ojitos?.update(dt, t + ph);
    }
    // Los ojitos de los caminantes también viven.
    for (const w of this.walkers) w.userData.ojitos?.update(dt, t + w.userData.phase);
  }
}
