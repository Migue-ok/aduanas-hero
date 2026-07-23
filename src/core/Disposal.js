import * as THREE from 'three';

/**
 * Disposal — el basurero de GPU (ADR-009).
 *
 * Three.js NO libera memoria de vídeo al hacer `scene.remove(obj)`: eso solo lo
 * saca del grafo. Las geometrías, materiales, texturas y render targets siguen
 * ocupando VRAM hasta que alguien llama a `.dispose()`. El proyecto llevaba
 * cientos de partículas (polvo, confeti, cristales, lágrimas) creando geometría
 * propia y desapareciendo sin liberarla.
 *
 * Regla del proyecto: **todo lo que se quita de la escena pasa por aquí**.
 */

/** Libera un material y todas sus texturas. */
function disposeMaterial(mat) {
  if (!mat) return;
  for (const clave of Object.keys(mat)) {
    const v = mat[clave];
    if (v && v.isTexture) v.dispose();
  }
  mat.dispose();
}

/**
 * Quita un objeto de su padre y libera TODO su subárbol (geometrías,
 * materiales y texturas). Es el reemplazo directo de `scene.remove(obj)`.
 */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
    else if (o.material) disposeMaterial(o.material);
  });
  obj.parent?.remove(obj);
}

/** Vacía y libera una escena entera (para el `unmount()` de cada nivel). */
export function disposeScene(scene) {
  if (!scene) return;
  for (const hijo of [...scene.children]) disposeObject(hijo);
  scene.environment?.dispose?.();
  scene.background?.dispose?.();
  scene.environment = null;
  scene.background = null;
}

/**
 * Pool de partículas efímeras: reutiliza UNA geometría y UN material por tipo
 * en vez de crear cientos. Devuelve mallas que se sueltan con `soltar()`.
 * Así el polvo/confeti dejan de generar basura por completo.
 */
export class ParticlePool {
  constructor(scene, { geometry, material, max = 160 }) {
    this.scene = scene;
    this.geo = geometry;
    this.mat = material;
    this.max = max;
    this.libres = [];
    this.vivas = new Set();
  }

  tomar() {
    let m = this.libres.pop();
    if (!m) {
      if (this.vivas.size >= this.max) return null; // techo duro: nunca crece sin fin
      m = new THREE.Mesh(this.geo, this.mat.clone()); // clon para opacidad propia
    }
    m.visible = true;
    m.scale.setScalar(1);
    this.scene.add(m);
    this.vivas.add(m);
    return m;
  }

  soltar(m) {
    if (!m || !this.vivas.has(m)) return;
    this.vivas.delete(m);
    this.scene.remove(m);
    this.libres.push(m);
  }

  /** Libera de verdad al cerrar el nivel. */
  dispose() {
    for (const m of [...this.vivas, ...this.libres]) {
      this.scene.remove(m);
      disposeMaterial(m.material);
    }
    this.vivas.clear();
    this.libres.length = 0;
    this.geo.dispose();
    disposeMaterial(this.mat);
  }
}
