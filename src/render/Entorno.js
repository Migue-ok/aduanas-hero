import * as THREE from 'three';

/**
 * Entorno — cómo se le da a un material su reflejo PBR de verdad.
 *
 * Aquí vive una trampa de three.js que costó una tarde entera y que conviene
 * dejar escrita, porque el código afectado *parecía* correcto:
 *
 * `material.envMapIntensity` NO se multiplica por `scene.environmentIntensity`.
 * Cuando un material Standard/Lambert/Phong **no tiene `envMap` propio** y la
 * escena sí tiene `environment`, el renderer SUSTITUYE el valor del material
 * por el de la escena en cada `setProgram` (`WebGLRenderer.js:2694-2696` en
 * r185), y lo hace fuera de la guarda de refresco, así que gana siempre.
 * `WebGLMaterials.refreshUniformsStandard` solo escribe el valor del material
 * dentro de un `if (material.envMap)`.
 *
 * Consecuencia: en un nivel iluminado por `scene.environment`, escribir
 * `envMapIntensity: 1.35` en un material es decorativo — no cambia un píxel.
 * El aeropuerto llevaba así dos materiales (el suelo pulido y el tablero del
 * mostrador) creyendo que reflejaban más que el resto.
 *
 * La única llave es colgarle al material el MISMO PMREM de la escena. Pero ojo:
 * a partir de ese momento el número pasa a ser ABSOLUTO, ya no relativo al
 * ambiente del nivel. Por eso esta función pide un `realce` — cuántas veces el
 * ambiente base, que es lo que uno tiene en la cabeza al escribirlo — y hace la
 * cuenta. Si alguien reilumina el nivel tocando `environmentIntensity`, todo lo
 * que pasó por aquí le sigue el paso solo.
 *
 * @param {THREE.Material} material
 * @param {THREE.Scene} scene
 * @param {number} realce  veces el ambiente del nivel (1 = igual que el resto)
 * @returns {THREE.Material} el mismo material, para poder encadenar
 */
export function colgarEntorno(material, scene, realce = 1) {
  const entorno = scene?.environment;
  if (!material || !entorno || realce <= 0) return material;
  material.envMap = entorno;
  material.envMapIntensity = (scene.environmentIntensity ?? 1) * realce;
  return material;
}

/**
 * Instala un HDRI recién cargado como entorno del nivel, horneando su PMREM
 * NOSOTROS en vez de dejar que lo haga el renderer.
 *
 * ── Por qué importa quién lo hornea ────────────────────────────────────────
 * Asignar la textura CRUDA del `RGBELoader` a `scene.environment` funciona: en
 * el primer render, three ve una textura equirectangular, se fabrica un
 * `PMREMGenerator` perezoso y la convierte (`WebGLEnvironments.js:111`). El
 * problema es TODO lo que ese generador se queda y dónde queda guardado.
 *
 * Con el HDRI del muelle (1024×512) la cuenta es exacta y comprobable:
 * `_setSize(1024/4)` deja `lodMax = 8`, y `_createPlanes` fabrica
 * `lodMax − LOD_MIN + 1 + EXTRA_LOD_SIGMA.length` = 8−4+1+6 = **11
 * BufferGeometry** de plano (`PMREMGenerator.js:703`), tres `ShaderMaterial` y
 * un render target de ping-pong de 768×1024 en RGBA16F: unos **6 MB**. El
 * generador vive en una variable de cierre de `WebGLEnvironments`, sin getter:
 * `disposeScene` no puede alcanzarlo ni aunque quiera. Eso, más la
 * `BoxGeometry` que `WebGLBackground` crea para pintar el cielo por la rama
 * CubeUV (`WebGLBackground.js:96`), son las 12 geometrías que sobrevivían a
 * cerrar el nivel.
 *
 * Y no basta con confiar en `renderer.dispose()`: cuando por fin llega a
 * `environments.dispose()`, ya ha pasado por `properties.dispose()` dos líneas
 * antes (`WebGLRenderer.js:1083-1084`), así que el ping-pong se «libera» sobre
 * un mapa de propiedades vacío y nunca alcanza `gl.deleteTexture`. Esos 6 MB no
 * son contabilidad: se quedan.
 *
 * Horneándolo aquí, el generador nace y muere dentro de esta función —con
 * `properties` intacto, así que su `dispose()` sí borra de verdad— y lo que
 * queda en la escena es un render target normal y corriente, apuntado en
 * `__pmremTarget`, que es justo lo que `disposeScene` sabe soltar. De paso, la
 * textura resultante ya viene en `CubeUVReflectionMapping`, y con ese mapping
 * `getPMREM` devuelve sin instanciar nada (`WebGLEnvironments.js:82`): el
 * generador perezoso no llega a existir.
 *
 * Es el mismo patrón que `world/Terminal.js` usa desde siempre para su
 * `RoomEnvironment`; aquí se extiende a los HDRI de archivo.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Texture} hdr  la textura cruda del `RGBELoader`
 * @param {object} [o]
 * @param {number}  [o.intensidad=1]  `environmentIntensity` del nivel
 * @param {boolean} [o.comoFondo]     usar además el HDRI como cielo
 * @param {number}  [o.desenfoque]    `backgroundBlurriness` (solo con `comoFondo`)
 * @param {number}  [o.brilloFondo]   `backgroundIntensity` (solo con `comoFondo`)
 * @returns {THREE.WebGLRenderTarget|null} el target horneado, ya en `__pmremTarget`
 */
export function hornearEntorno(scene, renderer, hdr, {
  intensidad = 1, comoFondo = false, desenfoque = 0, brilloFondo = 1,
} = {}) {
  if (!scene || !renderer || !hdr) { hdr?.dispose?.(); return null; }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(hdr);
  scene.environment = target.texture;
  scene.environmentIntensity = intensidad;
  scene.__pmremTarget = target; // `Disposal.disposeScene` lo busca por este nombre
  if (comoFondo) {
    scene.background = target.texture;
    scene.backgroundBlurriness = desenfoque;
    scene.backgroundIntensity = brilloFondo;
  }
  // El generador ha terminado su trabajo y la textura cruda ya está horneada:
  // ninguno de los dos vuelve a hacer falta, y este es el instante en que
  // liberarlos todavía sirve de algo.
  pmrem.dispose();
  hdr.dispose();
  return target;
}
