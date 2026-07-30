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

/**
 * Libera un material y todas sus texturas.
 *
 * `uniformes` amplía el barrido a `mat.uniforms[*].value`, que es donde un
 * `ShaderMaterial` guarda las suyas: recorrer solo las propiedades directas
 * (`mat.map`, `mat.normalMap`…) dejaba escapar TODA la textura de cualquier
 * shader propio — y este proyecto tiene varios (rastro de olfato, rayos X,
 * pases de post-proceso).
 *
 * Solo se activa al cerrar un nivel. Un shader puede compartir su textura con
 * algo que siga vivo, y liberarla a mitad de partida rompería lo otro; en el
 * desmontaje se va todo junto, así que ahí no hay nada que compartir.
 */
function disposeMaterial(mat, uniformes = false) {
  if (!mat) return;
  for (const clave of Object.keys(mat)) {
    // `envMap` NUNCA es propiedad del material: es el PMREM de la escena,
    // compartido por todo el nivel (ver `render/Entorno.js`). Liberarlo aquí
    // significaría que el primer pasajero que sale del puesto deja al
    // aeropuerto ENTERO sin reflejos. Lo suelta `disposeScene`, una sola vez.
    if (clave === 'envMap') continue;
    const v = mat[clave];
    if (v && v.isTexture) v.dispose();
  }
  if (uniformes && mat.uniforms) {
    for (const u of Object.values(mat.uniforms)) {
      const v = u?.value;
      if (v?.isTexture) v.dispose();
      else if (Array.isArray(v)) for (const x of v) if (x?.isTexture) x.dispose();
    }
  }
  mat.dispose();
}

/**
 * Quita un objeto de su padre y libera TODO su subárbol (geometrías,
 * materiales y texturas). Es el reemplazo directo de `scene.remove(obj)`.
 * @param {boolean} [uniformes] libera también las texturas dentro de
 *   `ShaderMaterial.uniforms`. Solo en desmontaje de nivel (ver arriba).
 */
export function disposeObject(obj, uniformes = false) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (Array.isArray(o.material)) o.material.forEach((m) => disposeMaterial(m, uniformes));
    else if (o.material) disposeMaterial(o.material, uniformes);
    // Los `Sprite` y los objetos con textura suelta fuera del material.
    if (o.texture?.isTexture) o.texture.dispose();
    // El mapa de sombra de una luz es un render target grande (el sol de
    // Chimbote son 2048² = ~16 MB) colgado de `light.shadow.map`, y NO lo
    // libera nadie más: `renderer.dispose()` tampoco toca el `WebGLShadowMap`.
    // Era el residuo más gordo de todo el desmontaje.
    if (o.isLight) o.shadow?.dispose?.();
    // Cada esqueleto arrastra una `DataTexture` con las matrices de sus huesos
    // que el renderer fabrica solo, la primera vez que lo dibuja
    // (`WebGLRenderer.js:2654`), y que únicamente `skeleton.dispose()` suelta
    // (`Skeleton.js:300-304`). No cuelga de la malla ni del material, así que
    // el barrido de geometrías y materiales pasaba de largo por ella: una
    // textura huérfana por cada personaje riggeado — y `SkeletonUtils.clone`
    // crea un esqueleto NUEVO por clon, así que se pagaba por estibador y por
    // oficial, no una vez por modelo.
    //
    // Es seguro hacerlo siempre, incluso si el esqueleto se comparte con algo
    // que siga vivo: el renderer comprueba `boneTexture === null` antes de cada
    // dibujado y la recalcula si hace falta.
    if (o.isSkinnedMesh) o.skeleton?.dispose?.();
    // `InstancedMesh` tiene sus propios búferes de GPU (matrices, colores) y su
    // textura de morphs, fuera de `geometry` y de `material`.
    if (o.isInstancedMesh || o.isBatchedMesh) o.dispose?.();
  });
  obj.parent?.remove(obj);
}

/**
 * Vacía y libera una escena entera (para el `unmount()` de cada nivel).
 *
 * Lo del entorno tiene truco. `scene.environment?.dispose()` funciona cuando el
 * entorno es la textura CRUDA que cargó el `RGBELoader`: three engancha un
 * listener `'dispose'` a esa textura (`WebGLEnvironments.js:118`) y al soltarla
 * libera el render target PMREM que horneó por dentro. Pero si lo que se
 * asignó a `scene.environment` fue ya `pmrem.fromScene(...).texture`, ese
 * `.dispose()` no libera NADA: el listener vive en el render target, no en su
 * textura, así que hay que guardarse el target y soltarlo (ver `Terminal.js`).
 *
 * Y `environment` y `background` suelen ser EL MISMO objeto (Chimbote usa el
 * HDRI para las dos cosas): se deduplica para no llamar dos veces a `dispose`.
 */
export function disposeScene(scene) {
  if (!scene) return;
  for (const hijo of [...scene.children]) disposeObject(hijo, true);
  const entornos = new Set([scene.environment, scene.background, scene.__pmremTarget]);
  for (const e of entornos) e?.dispose?.();
  scene.fog = null;
  scene.environment = null;
  scene.background = null;
  scene.__pmremTarget = null;
  scene.clear?.();
}

/**
 * Cierra un renderer al salir de un nivel.
 *
 * `renderer.dispose()` es OBLIGATORIO y es seguro: no toca el contexto WebGL,
 * solo suelta cachés internas — y es el ÚNICO camino hasta el `PMREMGenerator`
 * perezoso que el renderer se fabrica al asignar un HDRI a `scene.environment`
 * (`WebGLEnvironments.js:111`). Ese generador es la fuga: se queda con 11
 * geometrías de plano, su render target de ping-pong (~6 MB) y tres
 * `ShaderMaterial`. No hay API pública para alcanzarlo de otra forma; three lo
 * guarda en una variable de cierre sin getter.
 *
 * Lo que NO se hace es `forceContextLoss()`. Todos los niveles comparten el
 * mismo `<canvas id="gl">`, así que matar el contexto ahí deja el lienzo
 * inservible para el nivel siguiente — una bomba de relojería que hoy no
 * explota solo porque salir del nivel recarga la página.
 *
 * ⚠️ ES EL ÚLTIMO PASO, SIEMPRE. Después de esta llamada, `texture.dispose()`
 * deja de liberar nada: `deallocateTexture` busca la textura en un mapa de
 * propiedades que `dispose()` acaba de vaciar, no la encuentra y **sale antes
 * de llamar a `_gl.deleteTexture`** (WebGLTextures.js:359-361). Y el contexto
 * WebGL sigue vivo, porque el canvas es compartido: esos objetos de GPU se
 * quedan huérfanos dentro de él, sin nadie que pueda volver a alcanzarlos.
 * Cualquier caché propia del nivel (rigs, atlas, render targets sueltos) se
 * vacía ANTES. Aquí, y solo aquí, «liberar tarde» equivale a no liberar.
 */
export function disposeRenderer(renderer) {
  renderer?.dispose?.();
}

/**
 * Cierra un nivel entero en el ORDEN correcto, y lo mide.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Los dos niveles con `unmount()` hacían los mismos cinco pasos en órdenes
 * distintos (el muelle cerraba el post-proceso antes que la escena; el raid,
 * después) y ambos tomaban su ÚNICA instantánea de VRAM antes de tocar nada.
 * Con eso no hay forma de responder a la pregunta que importa —«¿queda algo
 * sin liberar?»— porque falta el «después».
 *
 * ── Por qué la segunda instantánea va donde va ────────────────────────────
 * Esta es la parte que hay que entender antes de perseguir una fuga fantasma.
 *
 * Tras `renderer.dispose()` el contador de TEXTURAS deja de bajar, y no baja
 * más nunca. El motivo está en el orden interno de three: `dispose()` llama
 * `properties.dispose()` (WebGLRenderer.js:1083) ANTES que `environments.
 * dispose()` (:1084), y `properties.dispose()` sustituye el mapa entero por un
 * `WeakMap` vacío. A partir de ahí, cada textura que se libera entra en
 * `deallocateTexture`, lee `properties.get(texture)`, encuentra un objeto
 * vacío, ve `__webglInit === undefined` y **se va por el return temprano**
 * (WebGLTextures.js:359-361): jamás alcanza el `info.memory.textures--` de
 * `deleteTexture`. Las texturas SÍ se liberan; lo que se rompe es el contador.
 *
 * Las GEOMETRÍAS no comparten ese destino: `onGeometryDispose` decrementa
 * `info.memory.geometries` incondicionalmente (WebGLGeometries.js:44), sin
 * consultar `properties`. Esas cifras sí siguen siendo verdad después.
 *
 * De ahí la conclusión práctica, y es la que hay que recordar: **el residuo
 * de texturas que se ve tras cerrar un nivel es, en su mayor parte, contable y
 * no real.** Lo que el `PMREMGenerator` perezoso del renderer se guarda —sus
 * planos de LOD, su render target de ping-pong y sus tres `ShaderMaterial`— se
 * libera de verdad en `environments.dispose() → pmremGenerator.dispose()`
 * (WebGLEnvironments.js:212-217), solo que para entonces el marcador ya está
 * congelado y no lo refleja.
 *
 * Por eso la medición útil es la de AQUÍ: después de que el juego haya soltado
 * todo lo suyo y antes de que el renderer rompa el contador. Lo que aparezca
 * en ese delta sí es deuda del juego y hay que ir a buscarla al código.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} o
 * @param {THREE.Scene[]} [o.escenas]  todas las escenas del nivel (el raid tiene dos)
 * @param {{dispose?: Function}} [o.post]  la cadena de post-proceso, si la hay
 * @param {string} [o.etiqueta]
 */
export function cerrarNivel(renderer, { escenas = [], post = null, etiqueta = 'nivel' } = {}) {
  const antes = memoriaGPU(renderer, `${etiqueta} · antes de cerrar`);
  post?.dispose?.();
  for (const escena of escenas) disposeScene(escena);
  const despues = memoriaGPU(renderer, `${etiqueta} · tras liberar la escena`);
  if (antes && despues) {
    console.info(
      `[AduanasHero] VRAM ${etiqueta} · residuo del juego: `
      + `${despues.geometrias} geometrías · ${despues.texturas} texturas `
      + `(liberadas ${antes.geometrias - despues.geometrias} y ${antes.texturas - despues.texturas}). `
      + 'Lo que quede aquí es deuda REAL; lo que el renderer suelte después ya no se contabiliza.',
    );
  }
  // Siempre el último: es el único camino hasta el PMREM perezoso, y a partir
  // de aquí el contador de texturas miente.
  disposeRenderer(renderer);
  return { antes, despues };
}

/**
 * Instantánea de VRAM, para poder MEDIR una fuga en vez de intuirla.
 * Se llama desde la consola: `__AH_MANAGER.current.memoria()`.
 *
 * Importante: hay que tomarla ANTES de `renderer.dispose()`. Después, el
 * contador de texturas miente — `dispose()` vacía el mapa de propiedades antes
 * de liberar los render targets, y a partir de ahí `info.memory.textures` ya no
 * se decrementa (`WebGLTextures.js:359-361`). Las geometrías sí bajan de verdad
 * (`WebGLGeometries.js:44` no consulta ese mapa). El razonamiento completo, y
 * por qué eso convierte casi todo el «residuo» de texturas en un espejismo,
 * está en `cerrarNivel`.
 */
export function memoriaGPU(renderer, etiqueta = '') {
  const m = renderer?.info?.memory;
  if (!m) return null;
  console.info(`[AduanasHero] VRAM ${etiqueta}: ${m.geometries} geometrías · ${m.textures} texturas`);
  return { geometrias: m.geometries, texturas: m.textures };
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
