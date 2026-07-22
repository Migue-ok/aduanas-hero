import * as THREE from 'three';
import gsap from 'gsap';
import { makeGooglyEyes } from './GooglyEyes.js';

/**
 * Police — la unidad de intervención de la terminal.
 * Dos oficiales de uniforme oscuro que viven fuera de cámara y entran SOLO
 * cuando alguien corre: convergen desde los flancos, flanquean al fugitivo y
 * lo acorralan. Sin violencia en cámara (Visión §28.3): el cerco basta.
 */

const UNIFORME = 0x181d28;   // azul noche institucional
const PIEL = 0xb08b64;

function makeOfficer() {
  const g = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({ color: UNIFORME, roughness: 0.8 });
  const piel = new THREE.MeshStandardMaterial({ color: PIEL, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.64, 6, 12), uni);
  body.position.y = 0.92;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), piel);
  head.position.y = 1.58;
  head.castShadow = true;

  // Ojos saltones con ceño de "aquí mando yo" (como el capitán rojo de la referencia).
  const googly = makeGooglyEyes({ radio: 0.042, separacion: 0.05, pupila: 0.011 });
  googly.group.position.set(0, 1.6, 0.105);
  googly.setMirada(0, -0.2);
  const cejaMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.9 });
  for (const sx of [-0.05, 0.05]) {
    const ceja = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.02), cejaMat);
    ceja.position.set(sx, 1.665, 0.135);
    ceja.rotation.z = sx > 0 ? 0.5 : -0.5; // ceño fruncido permanente
    head.add(ceja);
    ceja.position.y -= head.position.y; // (la ceja vive en la cabeza)
    ceja.position.x = sx;
    ceja.position.z = 0.115;
    ceja.position.y = 0.075;
  }

  // Gorra de plato: disco + visera.
  const gorra = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.135, 0.05, 14), uni);
  gorra.position.y = 1.7;
  const visera = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.09), uni);
  visera.position.set(0, 1.67, 0.14);

  // Chaleco reflectante: franja de alta visibilidad.
  const franja = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.09, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xd8d84a, emissive: 0x6a6a10, emissiveIntensity: 0.5, roughness: 0.5 }),
  );
  franja.position.y = 1.1;

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.58, 10),
    new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.9 }));
  legs.position.y = 0.29;

  g.add(body, head, gorra, visera, franja, legs, googly.group);
  g.userData = { corriendo: false, phase: Math.random() * 7, googly };
  return g;
}

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.officers = [];
  }

  /**
   * La intervención: dos oficiales entran por los flancos, interceptan el punto
   * de fuga y cierran el cerco. `onCornered` dispara el drama (llanto, diálogo);
   * `onDone` llega cuando el detenido ya fue escoltado fuera de cámara.
   */
  capturar(fugitivo, destino, { onCornered, onDone } = {}) {
    this.limpiar();
    const spawns = [new THREE.Vector3(-8.5, 0, -4.2), new THREE.Vector3(8.5, 0, -4.2)];
    // Posiciones de cerco: flanquean el punto de intercepción.
    const cerco = [
      new THREE.Vector3(destino.x - 0.65, 0, destino.z - 0.35),
      new THREE.Vector3(destino.x + 0.65, 0, destino.z - 0.35),
    ];

    const llegadas = spawns.map((spawn, i) => new Promise((resolve) => {
      const oficial = makeOfficer();
      oficial.position.copy(spawn);
      oficial.userData.corriendo = true;
      this.scene.add(oficial);
      this.officers.push(oficial);

      const meta = cerco[i];
      oficial.rotation.y = Math.atan2(meta.x - spawn.x, meta.z - spawn.z);
      gsap.to(oficial.position, {
        x: meta.x, z: meta.z, duration: 2.1 + i * 0.15, ease: 'power1.in',
        onComplete: () => {
          oficial.userData.corriendo = false;
          // Encara al detenido: el cerco se cierra.
          gsap.to(oficial.rotation, {
            y: Math.atan2(destino.x - meta.x, destino.z - meta.z),
            duration: 0.3,
          });
          resolve();
        },
      });
    }));

    Promise.all(llegadas).then(() => {
      onCornered?.();
      // El cerco se sostiene mientras dura el drama; luego, la escolta.
      setTimeout(() => {
        const salida = { x: -10, z: -5.5 };
        for (const oficial of this.officers) {
          oficial.userData.corriendo = true;
          gsap.to(oficial.rotation, { y: Math.atan2(salida.x - oficial.position.x, salida.z - oficial.position.z), duration: 0.4 });
          gsap.to(oficial.position, { x: salida.x, z: salida.z, duration: 3.2, ease: 'power1.inOut', delay: 0.3 });
        }
        // El detenido va en medio, cabizbajo.
        gsap.to(fugitivo.position, { x: salida.x, z: salida.z - 0.3, y: 0, duration: 3.2, ease: 'power1.inOut', delay: 0.35 });
        gsap.to(fugitivo.rotation, { y: Math.PI / 2 + 0.4, duration: 0.5, delay: 0.3 });
        setTimeout(() => {
          this.limpiar();
          onDone?.();
        }, 3800);
      }, 4600);
    });
  }

  limpiar() {
    for (const o of this.officers) {
      gsap.killTweensOf(o.position);
      this.scene.remove(o);
    }
    this.officers = [];
  }

  update(dt, t) {
    for (const o of this.officers) {
      const ph = o.userData.phase;
      if (o.userData.corriendo) {
        o.position.y = Math.abs(Math.sin(t * 10 + ph)) * 0.05; // zancada de carrera
        o.rotation.z = Math.sin(t * 10 + ph) * 0.04;
      } else {
        o.position.y = 0;
        o.rotation.z = Math.sin(t * 1.1 + ph) * 0.015; // respiración de guardia
      }
      o.userData.googly.update(dt, t + ph);
    }
  }
}
