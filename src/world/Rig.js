import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Rig — el pipeline de personajes riggeados del proyecto (assets CC0/CC-BY,
 * ver `public/CREDITS.md`). Carga un GLB una sola vez (caché por URL), lo clona
 * con esqueleto (`SkeletonUtils.clone`: los SkinnedMesh no sobreviven a un
 * `.clone()` normal) y expone un reproductor de clips con crossfade.
 *
 * Uso: `const rig = await spawnRig('/models/X.glb', { targetHeight: 1.8 });`
 *       `grupo.add(rig.model); rig.play('Idle');` y `rig.update(dt)` en el loop.
 */

const loader = new GLTFLoader();
const cache = new Map();

function loadGltf(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject)));
  }
  return cache.get(url);
}

export async function spawnRig(url, {
  targetHeight = null,  // normaliza la altura del modelo (los packs vienen en escalas dispares)
  tint = null,          // multiplica el color base (p. ej. zorro → pastor marrón)
  hideWeapons = true,   // los packs de aventura vienen armados; un civil no
  hideNodes = [],       // regexes extra de nodos a ocultar (p. ej. el sombrero de bruja)
} = {}) {
  const gltf = await loadGltf(url);
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (hideWeapons && /knife|crossbow|sword|axe|staff|wand|shield|arrow|quiver|spellbook/i.test(o.name)) o.visible = false;
    if (hideNodes.some((rx) => rx.test(o.name))) o.visible = false;
    if (tint && o.material?.color) {
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(tint));
    }
  });
  if (targetHeight) {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    if (size.y > 0.0001) model.scale.multiplyScalar(targetHeight / size.y);
  }
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  let current = null;
  return {
    model, mixer, clips,
    play(nombre, { once = false, fade = 0.25 } = {}) {
      const clip = clips[nombre];
      if (!clip) return;
      const action = mixer.clipAction(clip);
      if (once) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
      if (current === action) return;
      action.reset().fadeIn(fade).play();
      current?.fadeOut(fade);
      current = action;
    },
    update(dt) { mixer.update(dt); },
  };
}

/** Carga simple de un GLB estático (sin esqueleto), cacheado. */
export function loadModel(url) {
  return loadGltf(url).then((g) => g.scene);
}

/**
 * Vacía la caché de GLBs. OBLIGATORIO al desmontar un nivel que haya liberado
 * la escena con `disposeScene()`: los clones comparten geometría con el modelo
 * cacheado, así que tras liberarla la caché queda apuntando a buffers muertos.
 */
export function clearRigCache() {
  cache.clear();
}
