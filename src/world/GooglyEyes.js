import * as THREE from 'three';
import gsap from 'gsap';

/**
 * GooglyEyes — el elemento firma de la nueva dirección de arte (ADR-004).
 * Dos esferas blancas ENORMES que sobresalen de la cara con pupilas negras
 * minúsculas. La psicología entera vive aquí: la mirada sigue objetivos, y
 * cuando el miedo aprieta las pupilas TIEMBLAN como locas.
 *
 * API: setMirada(x,y) [-1..1] · setTemblor(0..1) · blink() · update(dt,t)
 */
export function makeGooglyEyes({ radio = 0.05, separacion = 0.055, pupila = 0.013, saltón = 0.6 } = {}) {
  const group = new THREE.Group();
  const blanco = new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.15 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25 });

  const ojos = [];
  for (const sx of [-separacion, separacion]) {
    const ojo = new THREE.Group();
    const globo = new THREE.Mesh(new THREE.SphereGeometry(radio, 18, 14), blanco);
    globo.castShadow = true;
    const pup = new THREE.Mesh(new THREE.SphereGeometry(pupila, 10, 8), negro);
    pup.position.z = radio * 0.92;
    ojo.add(globo, pup);
    // Sobresalen de la cara: la mitad del globo queda fuera (saltón).
    ojo.position.set(sx, 0, radio * saltón);
    group.add(ojo);
    ojos.push({ ojo, pup, base: new THREE.Vector3(0, 0, radio * 0.92) });
  }

  const estado = { miradaX: 0, miradaY: 0, temblor: 0 };

  return {
    group,
    /** Hacia dónde miran las pupilas (−1..1 en X e Y). */
    setMirada(x, y) {
      estado.miradaX = THREE.MathUtils.clamp(x, -1, 1);
      estado.miradaY = THREE.MathUtils.clamp(y, -1, 1);
    },
    /** 0 = calma · 1 = pánico (las pupilas vibran como locas y se encogen). */
    setTemblor(nivel) {
      estado.temblor = THREE.MathUtils.clamp(nivel, 0, 1);
    },
    /** Parpadeo googly: el globo se aplasta un instante. */
    blink() {
      for (const { ojo } of ojos) {
        gsap.to(ojo.scale, { y: 0.12, duration: 0.07, yoyo: true, repeat: 1, ease: 'power2.inOut' });
      }
    },
    update(dt, t) {
      const alcance = radio * 0.55; // recorrido máximo de la pupila sobre el globo
      for (let i = 0; i < ojos.length; i++) {
        const { pup, base } = ojos[i];
        // Deriva viva: cada ojo tiene fase propia (googly de verdad: no van 100% sincronizados).
        const deriva = Math.sin(t * 0.9 + i * 2.4) * 0.08;
        const jx = (Math.random() - 0.5) * estado.temblor * radio * 0.9;
        const jy = (Math.random() - 0.5) * estado.temblor * radio * 0.9;
        pup.position.x = estado.miradaX * alcance + deriva * alcance + jx;
        pup.position.y = estado.miradaY * alcance + jy;
        pup.position.z = base.z;
        // El pánico encoge la pupila (pupila de punto).
        pup.scale.setScalar(1 - estado.temblor * 0.35);
      }
    },
  };
}
