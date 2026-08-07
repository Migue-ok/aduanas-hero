import * as THREE from 'three';
import gsap from 'gsap';
import { quality } from '../core/Device.js';
import { makeGooglyEyes } from './GooglyEyes.js';

/**
 * CentroPostal — la nave de clasificación del Nivel 4 (ADR-013).
 *
 * Todo lo que es DECORADO vive aquí; lo que es JUEGO vive en la escena. La
 * frontera está en una pregunta: ¿el jugador puede actuar sobre esto? Si no,
 * es de este archivo.
 *
 * ── Presupuesto ────────────────────────────────────────────────────────────
 * Una nave industrial es, visualmente, cientos de cajas repetidas. Eso se paga
 * en draw calls o no se paga en absoluto, así que:
 *
 *   · Anaqueles y su carga → DOS `InstancedMesh` (estructura y cajas). Son ~300
 *     bultos por 2 llamadas de dibujado.
 *   · Paquetes jugables    → mallas sueltas, pero como máximo una docena viva y
 *     con geometría y materiales COMPARTIDOS. Necesitan raycast individual,
 *     tween propio y color por estado; forzarlos a instancias habría costado un
 *     atlas de matrices y un raycast a mano para ahorrar diez llamadas.
 *   · Iluminación          → UNA sola luz con sombra. Los fluorescentes del
 *     techo son emisivos: dan la lectura de nave iluminada sin sumar un solo
 *     mapa de sombras (ADR-008/009/010).
 *
 * ── Ejes ───────────────────────────────────────────────────────────────────
 * X = a lo largo de las cintas (los paquetes viajan hacia +X, al camión).
 * Z = profundidad de pantalla; el oficial cruza de una cinta a otra por aquí.
 */

/** Medidas de la nave. La escena las importa: son el contrato del espacio. */
export const NAVE = Object.freeze({
  ancho: 48,        // X total
  fondo: 26,        // Z total
  /**
   * Los muros llegan a 12 y NO hay plano de techo.
   *
   * La cámara 3/4 del nivel vuela a y ≈ 12 y por detrás del oficial: con techo
   * sólido lo atravesaría cada vez que el jugador se acerca al frente de la
   * nave y la pantalla se llenaría de la cara interior de una losa. Ocultarlo
   * por distancia es el truco habitual, pero aquí sobra: a 33° de picado no se
   * ve hacia arriba, y lo poco que asoma —negro industrial entre vigas— es
   * exactamente lo que se ve en una nave real de techo alto en penumbra.
   */
  alto: 12,
  xEntrada: -20.5,  // donde nacen los paquetes
  xSalida: 19.5,    // boca del camión: pasado esto, se escapó
  xCamion: 24,
  /**
   * Z de cada cinta. Los tres carriles van JUNTOS y al fondo, y el oficial
   * patrulla por delante de los tres.
   *
   * Es la decisión de layout que sostiene el nivel entero. La alternativa
   * evidente —carriles alternados con pasillos entre medias, como en la nave
   * real— obliga a resolver cómo cruza un humano una cinta de 90 cm que va de
   * pared a pared: o se le deja atravesarla (y se ve fatal), o se abren huecos
   * por los que los paquetes tendrían que saltar, o se levantan tramos elevados
   * con geometría curva. Las tres cuestan mucho y ninguna añade una sola
   * decisión al jugador. Con los carriles al fondo, la colisión es un `clamp`
   * de una línea y el eje Z sigue significando algo: al carril lejano hay que
   * ACERCARSE, y la mesa de peritaje obliga a retroceder.
   */
  carriles: [-5.8, -2.6, 0.6],
  alturaCinta: 0.86,
  anchoCinta: 2.1,
  /** Rectángulo por el que puede caminar el oficial: siempre delante de las cintas. */
  limites: { xMin: -18.5, xMax: 18, zMin: 2.2, zMax: 9.4 },
  /**
   * Hasta dónde llega el pulso de escaneo (metros, en el plano XZ).
   *
   * 10 y no 8. Con 8 salían las cuentas sobre el papel y no en la nave: desde
   * la línea más adelantada por la que puede caminar el oficial (z = 2,2) hasta
   * el carril del fondo (z = −5,8) hay EXACTAMENTE 8 m, así que ese carril solo
   * era alcanzable estando clavado en el borde y con el paquete a cero grados.
   * Un tercio del nivel resultaba injugable por un empate de decimales.
   */
  alcance: 10,
  mesa: { x: 12.5, z: 8.6 },
});

// ── Texturas procedurales ───────────────────────────────────────────────────

/**
 * Cara de caja de cartón: grano kraft, cinta de embalaje cruzada y etiqueta.
 *
 * Se genera en un canvas en vez de cargarse porque una caja de cartón es cuatro
 * manchas y dos rectángulos: pedir un JPEG de 1K por eso sería pagar red y VRAM
 * por algo que el CPU dibuja en dos milisegundos. Y al ser procedural puede
 * teñirse por variante sin duplicar archivos.
 */
function texturaCarton(tono = '#c19a63') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = tono;
  g.fillRect(0, 0, 128, 128);

  // Grano: manchas translúcidas de dos tonos, sin patrón perceptible.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.055)' : 'rgba(255,255,255,.05)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  // Corrugado: rayas verticales muy suaves, lo que delata al cartón de verdad.
  g.fillStyle = 'rgba(0,0,0,.045)';
  for (let x = 0; x < 128; x += 4) g.fillRect(x, 0, 1, 128);

  // Cinta de embalaje: una banda vertical mate, ligeramente descentrada.
  g.fillStyle = 'rgba(214,196,160,.85)';
  g.fillRect(56, 0, 17, 128);
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.fillRect(58, 0, 4, 128);

  // Etiqueta: el papel blanco con sus renglones ilegibles y su código de barras.
  g.fillStyle = '#f4f1e8';
  g.fillRect(12, 78, 44, 34);
  g.fillStyle = '#3a3a3a';
  for (let i = 0; i < 4; i++) g.fillRect(16, 83 + i * 5, 28 - i * 4, 2);
  for (let x = 16; x < 52; x += 2 + Math.random() * 2) {
    g.fillRect(x, 101, 1 + Math.random(), 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = quality.mobile ? 2 : 4;
  return t;
}

/**
 * Superficie de cinta transportadora: listones de goma transversales.
 * Se anima desplazando `offset.x`, que es la forma más barata que existe de
 * hacer que algo se mueva (cero geometría, cero CPU por frame).
 */
function texturaCinta() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#22262c';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#31363e';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 5, 16);
  g.fillStyle = 'rgba(0,0,0,.5)';
  for (let x = 0; x < 64; x += 8) g.fillRect(x + 5, 0, 1, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Chapa industrial con junta horizontal: para muros y para el camión. */
function texturaChapa(base = '#3d4a5a', junta = 'rgba(0,0,0,.28)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = junta;
  g.fillRect(0, 30, 64, 2);
  g.fillRect(0, 62, 64, 2);
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(0, 32, 64, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── Geometrías y materiales compartidos por los paquetes jugables ───────────

/**
 * Fábrica de paquetes. Tres tamaños y cuatro tonos de cartón, todos apoyados en
 * las MISMAS geometrías y los MISMOS materiales: da variedad visual sin
 * multiplicar recursos de GPU.
 */
export class FabricaPaquetes {
  constructor() {
    // GRANDES y de tonos VIVOS, las dos cosas a propósito.
    //
    // La primera versión los hizo de 0,6–1,0 m con el mismo kraft que las cajas
    // del decorado… que miden 1,5 m. Resultado en pantalla: el objeto sobre el
    // que gira el nivel entero era más pequeño y más apagado que el atrezo que
    // tenía justo detrás, y el jugador no distinguía cuál de las cien cajas de
    // la nave era la que podía escanear. Lo jugable tiene que ganar siempre el
    // pulso de contraste contra lo decorativo.
    this.geos = [
      new THREE.BoxGeometry(1.12, 0.88, 0.98),
      new THREE.BoxGeometry(1.42, 1.08, 1.14),
      new THREE.BoxGeometry(0.92, 0.76, 0.8),
    ];
    this.texturas = ['#d9ab6d', '#cfa05e', '#e0bb86', '#c69455'].map(texturaCarton);
    this.mats = this.texturas.map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.88 }));
    // Halo de estado: un borde luminoso que envuelve el paquete. Es el que dice
    // «este tiene síntoma» a diez metros, y el que confirma la intercepción.
    this.geoHalo = new THREE.BoxGeometry(1, 1, 1);
    this.matHalo = new THREE.MeshBasicMaterial({
      color: 0xe0952a, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false,
    });
  }

  /** Devuelve `{ grupo, caja, halo, tamaño }` listo para colgar de la escena. */
  crear(idx = 0) {
    const i = idx % this.geos.length;
    const grupo = new THREE.Group();
    const caja = new THREE.Mesh(this.geos[i], this.mats[Math.floor(Math.random() * this.mats.length)]);
    caja.castShadow = !quality.mobile;   // en móvil la sombra de cada paquete no compensa
    caja.receiveShadow = true;
    caja.rotation.y = (Math.random() - 0.5) * 0.5;

    const p = this.geos[i].parameters;
    const halo = new THREE.Mesh(this.geoHalo, this.matHalo.clone());
    halo.scale.set(p.width + 0.26, p.height + 0.26, p.depth + 0.26);
    halo.rotation.y = caja.rotation.y;
    halo.visible = false;

    grupo.add(caja, halo);
    return { grupo, caja, halo, alto: p.height };
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texturas) t.dispose();
    this.geoHalo.dispose();
    this.matHalo.dispose();
  }
}

// ── La nave ─────────────────────────────────────────────────────────────────

/**
 * Levanta el centro postal completo.
 *
 * @param {THREE.Scene} scene
 * @returns {object} handle con `update(dt, t)`, referencias a las piezas vivas
 *   y las luces con sombra (que `PerfGuard` necesita poder recortar).
 */
export function construirCentroPostal(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const basura = [];                 // texturas propias: se liberan a mano
  const guardar = (t) => { basura.push(t); return t; };

  // ── Ambiente ──────────────────────────────────────────────────────────────
  // Interior industrial: frío arriba, cálido en el suelo por el sodio de las
  // luminarias viejas. La niebla cierra el fondo de la nave sin muro extra.
  scene.fog = new THREE.Fog(0x27313d, 46, 105);

  const tl = new THREE.TextureLoader();
  const rep = (t, u, v, srgb = false) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(u, v);
    t.anisotropy = quality.mobile ? 4 : 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // ── Suelo ─────────────────────────────────────────────────────────────────
  const matSuelo = new THREE.MeshStandardMaterial({
    map: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_Color.jpg'), 16, 9, true),
    normalMap: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_NormalGL.jpg'), 16, 9),
    roughnessMap: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_Roughness.jpg'), 16, 9),
    roughness: 1,
    color: 0x9aa3ad,
  });
  // Desborda la nave por los cuatro lados, y sobre todo hacia +Z: ahí es donde
  // se coloca la cámara, y sin ese margen la franja inferior de la pantalla
  // mostraría el vacío que hay más allá del borde del suelo.
  const suelo = new THREE.Mesh(new THREE.BoxGeometry(NAVE.ancho + 14, 0.6, NAVE.fondo + 22), matSuelo);
  suelo.position.set(0, -0.3, 7);
  suelo.receiveShadow = true;
  root.add(suelo);

  // Franjas de circulación pintadas: además de ambientar, son la referencia que
  // hace que el jugador perciba su propio desplazamiento en una nave vacía.
  const matPintura = new THREE.MeshStandardMaterial({ color: 0xd9c14f, roughness: 0.85 });
  const matPinturaRoja = new THREE.MeshStandardMaterial({ color: 0xc0503f, roughness: 0.85 });
  for (const z of [2.0, 9.6]) {
    const linea = new THREE.Mesh(new THREE.BoxGeometry(NAVE.ancho - 6, 0.02, 0.16), matPintura);
    linea.position.set(-1, 0.011, z);
    root.add(linea);
  }
  // Zona roja delante del camión: la última oportunidad, marcada en el suelo.
  const zonaRoja = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 10), matPinturaRoja);
  zonaRoja.position.set(NAVE.xSalida - 1.2, 0.012, -2.6);
  root.add(zonaRoja);

  // ── Muros y techo ─────────────────────────────────────────────────────────
  const matMuro = new THREE.MeshStandardMaterial({
    map: guardar(rep(texturaChapa('#41505f'), 18, 3, true)), roughness: 0.86, metalness: 0.15,
  });
  const matZocalo = new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: 0.8 });

  const muro = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matMuro);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  muro(NAVE.ancho, NAVE.alto, 0.5, 0, NAVE.alto / 2, -NAVE.fondo / 2);   // fondo
  muro(0.5, NAVE.alto, NAVE.fondo, -NAVE.ancho / 2, NAVE.alto / 2, 0);   // izquierda
  // Pared derecha con el portón por el que asoma el camión: el hueco (z −7…+3)
  // tiene que cubrir los TRES carriles, o el paquete del carril del fondo se
  // desvanecería contra un muro en vez de perderse en la boca de carga.
  muro(0.5, NAVE.alto, 6, NAVE.ancho / 2, NAVE.alto / 2, -10);
  muro(0.5, NAVE.alto, 10, NAVE.ancho / 2, NAVE.alto / 2, 8);
  // El lado +Z queda ABIERTO a propósito: es por donde entra la cámara.

  const zocalo = new THREE.Mesh(new THREE.BoxGeometry(NAVE.ancho, 1.1, 0.62), matZocalo);
  zocalo.position.set(0, 0.55, -NAVE.fondo / 2 + 0.05);
  root.add(zocalo);

  // Cerchas del techo: solo la estructura, sin losa. Cruzan la nave a 9,6 m, muy
  // por encima de la acción, y su función es cerrar el encuadre por arriba
  // cuando el jugador camina hacia el fondo.
  // Van a 13 m, POR ENCIMA de la cámara (que vuela a 10,4). Cuando estaban a
  // 9,6 la cámara pasaba por debajo de ellas y cada cercha entraba en el
  // encuadre como una banda negra atravesando media pantalla en diagonal.
  const matViga = new THREE.MeshStandardMaterial({ color: 0x2e3947, roughness: 0.7, metalness: 0.4 });
  const geoViga = new THREE.BoxGeometry(0.3, 0.42, NAVE.fondo);
  const geoTirante = new THREE.BoxGeometry(NAVE.ancho, 0.2, 0.2);
  for (let x = -20; x <= 20; x += 8) {
    const v = new THREE.Mesh(geoViga, matViga);
    v.position.set(x, 13, 0);
    root.add(v);
  }
  for (const z of [-9, 0, 9]) {
    const tr = new THREE.Mesh(geoTirante, matViga);
    tr.position.set(0, 13.3, z);
    root.add(tr);
  }

  // ── Luminarias fluorescentes ──────────────────────────────────────────────
  // Son EMISIVAS, no luces. Ocho tubos reales serían ocho mapas de sombra o, sin
  // sombra, ocho evaluaciones por fragmento en cada material de la nave. Con
  // emisivo + la direccional cenital la lectura es idéntica y el coste, ninguno.
  const matTubo = new THREE.MeshStandardMaterial({
    color: 0xf6fbff, emissive: 0xdfefff, emissiveIntensity: 2.6, roughness: 0.4,
  });
  const matCarcasa = new THREE.MeshStandardMaterial({ color: 0x39434f, roughness: 0.6, metalness: 0.3 });
  // Piezas CORTAS y bien separadas. Con tubos de 6,8 m cada cuatro se tocaban
  // por los extremos y, vistos casi de canto desde la cámara, dejaban de leerse
  // como luminarias: eran una raya blanca continua de borde a borde, más cerca
  // de un artefacto de render que de una nave iluminada.
  const geoTubo = new THREE.BoxGeometry(3.6, 0.16, 0.4);
  const geoCarcasa = new THREE.BoxGeometry(4, 0.3, 0.72);
  const tubos = [];
  const matTirante = new THREE.MeshStandardMaterial({ color: 0x333c47, roughness: 0.8 });
  const geoTirante2 = new THREE.BoxGeometry(0.05, 6.4, 0.05);
  for (const z of [-8.4, -2.4, 3.6, 9.4]) {
    for (const x of [-15, -5, 5, 15]) {
      const carcasa = new THREE.Mesh(geoCarcasa, matCarcasa);
      carcasa.position.set(x, 6.6, z);
      const tubo = new THREE.Mesh(geoTubo, matTubo.clone());
      tubo.position.set(x, 6.4, z);
      for (const dx of [-1.6, 1.6]) {
        const cuerda = new THREE.Mesh(geoTirante2, matTirante);
        cuerda.position.set(x + dx, 9.8, z);
        root.add(cuerda);
      }
      root.add(carcasa, tubo);
      tubos.push(tubo);
    }
  }

  // ── Anaqueles metálicos (InstancedMesh) ───────────────────────────────────
  // Dos llamadas de dibujado para toda la estantería de la nave.
  //
  // Van SOLO al fondo y al lateral izquierdo. La tentación era flanquear la
  // zona jugable con estanterías por los dos lados, y habría sido un error de
  // bulto: la cámara entra desde +Z, así que cualquier bastidor de 4,2 m
  // plantado ahí se coloca entre el ojo y el juego y tapa la partida entera.
  // Lo que sí va delante son bultos bajos (ver «primer plano»), que dan
  // profundidad al encuadre sin robar un pixel de acción.
  const bastidores = [
    ...[-18, -11, -4, 3, 10, 17].map((x) => ({ x, z: -11.4, eje: 'x' })),  // pared del fondo
    ...[-6, 2].map((z) => ({ x: -22.6, z, eje: 'z' })),                    // rincón izquierdo
  ];
  const nBastidores = bastidores.length;
  const postesPorBastidor = 4 + 3;   // 4 montantes + 3 baldas
  const matEstante = new THREE.MeshStandardMaterial({ color: 0x5a6a7d, roughness: 0.55, metalness: 0.6 });
  const geoBarra = new THREE.BoxGeometry(1, 1, 1);
  const estructura = new THREE.InstancedMesh(geoBarra, matEstante, nBastidores * postesPorBastidor);
  estructura.castShadow = false;
  estructura.receiveShadow = true;

  // Las cajas del anaquel van TEÑIDAS de gris azulado (el `color` multiplica la
  // textura). Con el kraft original eran idénticas a los paquetes de la cinta y
  // los camuflaban por completo: cien cajas de decorado ganándole el contraste
  // al único objeto con el que se juega. Ahora el fondo se hunde y lo jugable
  // sale hacia delante, que es el orden correcto.
  const matCajaEstante = new THREE.MeshStandardMaterial({
    map: guardar(texturaCarton('#b98a52')), roughness: 0.94, color: 0x78808e,
  });
  const CAJAS_POR_BASTIDOR = 9;
  const cajasEstante = new THREE.InstancedMesh(geoBarra, matCajaEstante, nBastidores * CAJAS_POR_BASTIDOR);
  cajasEstante.receiveShadow = true;

  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const esc = new THREE.Vector3();
  let iE = 0; let iC = 0;
  for (const b of bastidores) {
    // `a` recorre el bastidor a lo largo y `t` lo cruza. Cambiar de orientación
    // es intercambiar a qué eje del mundo van cada uno: sin quaternions, sin
    // duplicar el bucle, y las cajas siguen alineadas a los ejes.
    const largo = b.eje === 'x';
    const put = (dLargo, y, dAncho, sLargo, sAlto, sAncho, destino) => {
      pos.set(
        b.x + (largo ? dLargo : dAncho),
        y,
        b.z + (largo ? dAncho : dLargo),
      );
      esc.set(largo ? sLargo : sAncho, sAlto, largo ? sAncho : sLargo);
      destino.setMatrixAt(destino === estructura ? iE++ : iC++, m4.compose(pos, q0, esc));
    };

    for (const dl of [-3.2, 3.2]) {
      for (const da of [-0.8, 0.8]) put(dl, 2.1, da, 0.16, 4.2, 0.16, estructura);
    }
    for (const y of [1.05, 2.4, 3.75]) put(0, y, 0, 6.6, 0.1, 1.8, estructura);
    // Carga de las baldas: tres bultos por nivel, con algún hueco.
    for (const y of [1.05, 2.4, 3.75]) {
      for (const dl of [-2.1, 0, 2.1]) {
        const s = 0.9 + Math.random() * 0.5;
        const vacio = Math.random() < 0.18;
        put(dl + (Math.random() - 0.5) * 0.3, y + (vacio ? -50 : 0.05 + s * 0.42), 0,
          1.5 * s, s * 0.84, 1.25 * s, cajasEstante);
      }
    }
  }
  estructura.count = iE;
  cajasEstante.count = iC;
  estructura.instanceMatrix.needsUpdate = true;
  cajasEstante.instanceMatrix.needsUpdate = true;
  root.add(estructura, cajasEstante);

  // ── Primer plano ──────────────────────────────────────────────────────────
  // Palets cargados en la franja +Z, delante de la acción. Miden menos de 1,3 m
  // a propósito: dan el marco inferior del encuadre —esas cajas grandes que en
  // el concept art cierran la composición— sin tapar ni un carril.
  const matPalet = new THREE.MeshStandardMaterial({ color: 0x7c6242, roughness: 0.95 });
  const matBultoBajo = new THREE.MeshStandardMaterial({
    map: guardar(texturaCarton('#cba876')), roughness: 0.94, color: 0x9aa0a8,
  });
  const geoTabla = new THREE.BoxGeometry(1.5, 0.11, 1.2);
  for (const [px, pz] of [[-15, 12.2], [-6.5, 13.4], [3, 12.6], [11, 13.6], [17, 12.0], [-20, 13.0]]) {
    const palet = new THREE.Mesh(geoTabla, matPalet);
    palet.position.set(px, 0.06, pz);
    palet.rotation.y = (Math.random() - 0.5) * 0.6;
    root.add(palet);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = 0.8 + Math.random() * 0.45;
      const bulto = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 0.7 * s, 0.95 * s), matBultoBajo);
      bulto.position.set(
        px + (Math.random() - 0.5) * 0.35,
        0.12 + 0.35 * s + i * 0.72 * s,
        pz + (Math.random() - 0.5) * 0.3,
      );
      bulto.rotation.y = (Math.random() - 0.5) * 0.7;
      bulto.castShadow = !quality.mobile;
      root.add(bulto);
    }
  }

  // ── Cintas transportadoras ────────────────────────────────────────────────
  const texCinta = guardar(texturaCinta());
  texCinta.repeat.set(28, 1);
  const matBanda = new THREE.MeshStandardMaterial({ map: texCinta, roughness: 0.78, metalness: 0.1 });
  const matBastidor = new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.5, metalness: 0.65 });
  const matBaranda = new THREE.MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.6, metalness: 0.3 });
  const largoCinta = NAVE.xSalida - NAVE.xEntrada + 3;
  const cxCinta = (NAVE.xEntrada + NAVE.xSalida) / 2;

  for (const z of NAVE.carriles) {
    const banda = new THREE.Mesh(
      new THREE.BoxGeometry(largoCinta, 0.1, NAVE.anchoCinta), matBanda,
    );
    banda.position.set(cxCinta, NAVE.alturaCinta, z);
    banda.receiveShadow = true;
    root.add(banda);

    const bastidor = new THREE.Mesh(
      new THREE.BoxGeometry(largoCinta, 0.5, NAVE.anchoCinta + 0.24), matBastidor,
    );
    bastidor.position.set(cxCinta, NAVE.alturaCinta - 0.32, z);
    bastidor.castShadow = !quality.mobile;
    bastidor.receiveShadow = true;
    root.add(bastidor);

    // Barandas guía: dan volumen y ayudan a leer la profundidad del carril.
    for (const dz of [-1, 1]) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(largoCinta, 0.09, 0.09), matBaranda,
      );
      g.position.set(cxCinta, NAVE.alturaCinta + 0.2, z + dz * (NAVE.anchoCinta / 2 + 0.06));
      root.add(g);
    }

    // Patas cada 4 m.
    const geoPata = new THREE.BoxGeometry(0.16, NAVE.alturaCinta - 0.5, 0.16);
    for (let x = NAVE.xEntrada; x <= NAVE.xSalida; x += 4) {
      for (const dz of [-0.8, 0.8]) {
        const p = new THREE.Mesh(geoPata, matBastidor);
        p.position.set(x, (NAVE.alturaCinta - 0.5) / 2, z + dz);
        root.add(p);
      }
    }
  }

  // ── Arco de rayos X sobre el carril central ───────────────────────────────
  // PÓRTICO, no bloque. La primera versión era una caja maciza con un «hueco»
  // negro metido dentro: desde fuera el hueco quedaba tapado por las propias
  // paredes de la caja, así que en pantalla se veía un cubo gris sin lectura
  // por el que los paquetes se metían y salían por arte de magia. Dos pilares y
  // un dintel dejan el túnel ABIERTO de verdad y el paquete se ve cruzarlo.
  // Va sobre el carril del FONDO, no sobre el central. La cámara mira desde +Z,
  // así que un pórtico plantado en el carril de en medio pone su pilar delantero
  // justo entre el ojo y la cinta más transitada del nivel: tapaba paquetes y
  // convertía el arco en un estorbo. Al fondo cumple su papel de decorado (y los
  // bultos de ese carril lo cruzan de verdad) sin robar visibilidad.
  const arco = new THREE.Group();
  arco.position.set(-6, 0, NAVE.carriles[0]);
  const matArco = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.42, metalness: 0.5 });
  const geoPilar = new THREE.BoxGeometry(1.5, 2.7, 0.85);
  for (const dz of [-1.65, 1.65]) {
    const pilar = new THREE.Mesh(geoPilar, matArco);
    pilar.position.set(0, 1.35, dz);
    pilar.castShadow = !quality.mobile;
    arco.add(pilar);
  }
  const dintel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 4.2), matArco);
  dintel.position.y = 3.1;
  dintel.castShadow = !quality.mobile;
  arco.add(dintel);
  // Cortinas de tiras a la entrada y a la salida del túnel: es lo que dice «aquí
  // dentro se mira» sin necesidad de cerrar el hueco.
  const matCortina = new THREE.MeshStandardMaterial({
    color: 0x38404a, roughness: 0.95, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
  for (const dx of [-0.72, 0.72]) {
    const cortina = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.55), matCortina);
    cortina.position.set(dx, 1.72, 0);
    cortina.rotation.y = Math.PI / 2;
    arco.add(cortina);
  }
  // Baliza superior: el único emisivo que parpadea de toda la nave.
  const baliza = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 0.34, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0952a, emissive: 0xe0952a, emissiveIntensity: 1.4 }),
  );
  baliza.position.set(0, 3.7, 0);
  arco.add(baliza);
  const pantalla = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x0a2833, emissive: 0x1e6b7d, emissiveIntensity: 1.5 }),
  );
  pantalla.position.set(0, 2.1, 2.13);
  arco.add(pantalla);
  root.add(arco);

  // ── Camión de salida ──────────────────────────────────────────────────────
  const camion = new THREE.Group();
  camion.position.set(NAVE.xCamion, 0, -2.6); // alineado con el carril central
  const matCaja = new THREE.MeshStandardMaterial({
    map: guardar(rep(texturaChapa('#dfe4ea', 'rgba(0,0,0,.16)'), 6, 3, true)),
    roughness: 0.62, metalness: 0.2,
  });
  const cajaCamion = new THREE.Mesh(new THREE.BoxGeometry(9, 4.2, 7), matCaja);
  cajaCamion.position.set(2.5, 2.6, 0);
  cajaCamion.castShadow = !quality.mobile;
  camion.add(cajaCamion);
  const cabina = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3, 6.4),
    new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: 0.42, metalness: 0.3 }),
  );
  cabina.position.set(8.6, 2, 0);
  camion.add(cabina);
  const parabrisas = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.3, 5.4),
    new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.15, metalness: 0.6 }),
  );
  parabrisas.position.set(10.15, 2.6, 0);
  camion.add(parabrisas);
  const matRueda = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 });
  const geoRueda = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 14);
  for (const x of [-0.5, 1.4, 8.2]) {
    for (const z of [-3.3, 3.3]) {
      const r = new THREE.Mesh(geoRueda, matRueda);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, 0.85, z);
      camion.add(r);
    }
  }
  // Boca de carga: el agujero negro por el que se pierden los paquetes.
  const boca = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 3.6),
    new THREE.MeshBasicMaterial({ color: 0x05080c }),
  );
  boca.position.set(-1.98, 2.4, 0);
  boca.rotation.y = -Math.PI / 2;
  camion.add(boca);
  const pilotos = [];
  for (const z of [-2.6, 2.6]) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8c2a22, emissive: 0xff2a1a, emissiveIntensity: 1.2 }),
    );
    p.position.set(-1.96, 1.2, z);
    camion.add(p);
    pilotos.push(p);
  }
  root.add(camion);

  // ── Mesa de peritaje ──────────────────────────────────────────────────────
  // El «Taller del Artesano» del vídeo de referencia, traducido a un puesto de
  // aforo: tablero de madera, flexo encendido, expediente y sello. Tiene que
  // leerse como el ÚNICO sitio de la nave donde uno se sienta a pensar.
  const mesa = new THREE.Group();
  mesa.position.set(NAVE.mesa.x, 0, NAVE.mesa.z);
  const matMadera = new THREE.MeshStandardMaterial({ color: 0x6b563a, roughness: 0.8 });
  const matMetalOscuro = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.55, metalness: 0.6 });
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.7), matMadera);
  tablero.position.y = 0.94;
  tablero.castShadow = !quality.mobile;
  tablero.receiveShadow = true;
  mesa.add(tablero);
  for (const dx of [-1.5, 1.5]) {
    for (const dz of [-0.7, 0.7]) {
      const pata = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.94, 0.1), matMetalOscuro);
      pata.position.set(dx, 0.47, dz);
      mesa.add(pata);
    }
  }
  // Papeles y sello sobre el tablero.
  const matPapel = new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.44), matPapel);
    hoja.position.set(-0.7 + i * 0.16, 1.005 + i * 0.013, -0.1 + (Math.random() - 0.5) * 0.2);
    hoja.rotation.y = (Math.random() - 0.5) * 0.35;
    mesa.add(hoja);
  }
  const sello = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.24, 10), matMetalOscuro);
  sello.position.set(0.9, 1.12, 0.2);
  mesa.add(sello);
  // Flexo: brazo articulado y una pantalla emisiva. La luz cálida real la pone
  // un PointLight sin sombra, que es barato y aquí sí aporta (marca el sitio).
  const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), matMetalOscuro);
  brazo.position.set(1.45, 1.5, -0.55);
  brazo.rotation.z = 0.22;
  mesa.add(brazo);
  const pantallaFlexo = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.3, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xe0952a, emissive: 0xffcf7a, emissiveIntensity: 1.3, side: THREE.DoubleSide,
    }),
  );
  pantallaFlexo.position.set(1.2, 1.98, -0.55);
  pantallaFlexo.rotation.z = -0.5;
  mesa.add(pantallaFlexo);
  const luzMesa = new THREE.PointLight(0xffc978, 3.4, 7, 2);
  luzMesa.position.set(1.0, 1.75, -0.4);
  mesa.add(luzMesa);
  // Cartel: quien pase por delante sabe qué es esto sin abrir un menú.
  const cartel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.5),
    new THREE.MeshStandardMaterial({
      map: guardar(texturaCartel('MESA DE PERITAJE')), roughness: 0.9, transparent: true,
    }),
  );
  cartel.position.set(0, 2.5, -0.85);
  mesa.add(cartel);
  root.add(mesa);

  // ── Iluminación ───────────────────────────────────────────────────────────
  // UNA sola luz con sombra en toda la nave (ADR-008/009/010). Las demás son
  // acentos sin sombra: un PointLight sin sombra cuesta una evaluación por
  // fragmento, un mapa de sombra cuesta un render pass entero de la escena.
  // Los valores son ALTOS a propósito. Con 0,7 de hemisférica y 1,35 de
  // direccional la nave se veía de noche: cartón marrón sobre hormigón azul y
  // todo a media luz, justo lo contrario de un centro de clasificación, que es
  // un sitio sobreiluminado por norma. Aquí manda el concept art.
  const hemi = new THREE.HemisphereLight(0xbcd6ec, 0x4a4234, 1.15);
  scene.add(hemi);
  const cenital = new THREE.DirectionalLight(0xf2f7ff, 2.1);
  cenital.position.set(-8, 24, 12);
  cenital.target.position.set(0, 0, 0);
  cenital.castShadow = true;
  cenital.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  // Frustum apretado a la zona jugable: con la nave entera dentro, un mapa de
  // 512 en móvil daría 5 cm por téxel y todo serían dientes de sierra.
  const d = 24;
  cenital.shadow.camera.left = -d; cenital.shadow.camera.right = d;
  cenital.shadow.camera.top = 16; cenital.shadow.camera.bottom = -16;
  cenital.shadow.camera.near = 2;
  cenital.shadow.camera.far = 60;
  cenital.shadow.bias = -0.0006;
  cenital.shadow.normalBias = quality.mobile ? 0.06 : 0.025;
  cenital.shadow.camera.updateProjectionMatrix();
  scene.add(cenital, cenital.target);
  // Acento cian en el arco (el rayos X «respira») y ámbar en la boca del camión.
  const luzArco = new THREE.PointLight(0x4fd0e0, 4.5, 12, 2);
  luzArco.position.set(-6, 2.6, NAVE.carriles[0]);
  scene.add(luzArco);
  const luzCamion = new THREE.PointLight(0xffb463, 3.2, 14, 2);
  luzCamion.position.set(NAVE.xSalida + 1.5, 3, -2.6);
  scene.add(luzCamion);

  // ── Empleados figurantes ──────────────────────────────────────────────────
  // Cartoon con googly eyes (ADR-004). No son interactuables y NUNCA son
  // objetivo: en este nivel se le dispara a cajas, no a gente.
  const empleados = [];
  // Tres al fondo y uno solo delante: un figurante en primer plano cruza la
  // pantalla enorme y roba la atención justo cuando el jugador está leyendo un
  // síntoma. Uno da vida; cuatro tapan el juego.
  const RUTAS = [
    { z: -9.6, x0: -15, x1: 6 },
    { z: -10.4, x0: 2, x1: 17 },
    { z: -8.9, x0: -19, x1: -6 },
    { z: 12.4, x0: -12, x1: 8 },
  ];
  for (let i = 0; i < RUTAS.length; i++) {
    const e = crearEmpleado();
    e.grupo.userData.ruta = { ...RUTAS[i], t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1 };
    root.add(e.grupo);
    empleados.push(e);
  }

  // ── Carros de mano dispersos ──────────────────────────────────────────────
  const matCarro = new THREE.MeshStandardMaterial({ color: 0xc0503f, roughness: 0.6, metalness: 0.3 });
  for (const [cx, cz, rot] of [[-13, 9.2, 0.4], [8, -9.8, -0.8], [-3, 10.4, 1.9]]) {
    const carro = new THREE.Group();
    const plato = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.9), matCarro);
    plato.position.y = 0.34;
    const mango = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), matCarro);
    mango.position.set(-0.6, 0.9, 0);
    carro.add(plato, mango);
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.35, 0.35]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10), matRueda);
        r.rotation.x = Math.PI / 2;
        r.position.set(dx, 0.14, dz);
        carro.add(r);
      }
    }
    carro.position.set(cx, 0, cz);
    carro.rotation.y = rot;
    root.add(carro);
  }

  // ── Bucle de vida de la nave ──────────────────────────────────────────────
  let parpadeoT = 0;
  const handle = {
    root,
    tubos,
    arco,
    baliza,
    pantalla,
    camion,
    pilotos,
    mesa,
    empleados,
    luces: { hemi, cenital, luzArco, luzCamion, luzMesa },
    /** Luces con sombra: lo que `PerfGuard` puede recortar. */
    lucesConSombra: [cenital],
    /** Desplaza la cinta a la misma velocidad a la que viajan los paquetes. */
    velocidadCinta: 0,

    update(dt, t) {
      // La cinta se mueve porque su textura se mueve. Si la escena detiene el
      // flujo (oleada cerrada, mesa abierta), la cinta se para de verdad: es la
      // señal más honesta que tiene el jugador de que el reloj no corre.
      texCinta.offset.x -= handle.velocidadCinta * dt * 0.5;

      // Fluorescente cansado: uno de los tubos tiene un parpadeo irregular. Es
      // el detalle que convierte «nave iluminada» en «nave con años encima».
      parpadeoT += dt;
      if (parpadeoT > 0.06) {
        parpadeoT = 0;
        const t0 = tubos[3];
        if (t0) {
          const falla = Math.sin(t * 0.7) > 0.86;
          t0.material.emissiveIntensity = falla ? (Math.random() < 0.45 ? 0.25 : 2.6) : 2.6;
        }
      }

      // Baliza del arco: pulso lento continuo, más un latido cian en la pantalla.
      baliza.material.emissiveIntensity = 1.0 + Math.sin(t * 3.2) * 0.8;
      pantalla.material.emissiveIntensity = 1.2 + Math.sin(t * 1.7) * 0.5;
      luzArco.intensity = 3.8 + Math.sin(t * 3.2) * 1.4;
      for (const p of pilotos) p.material.emissiveIntensity = 0.9 + Math.sin(t * 2.1) * 0.4;

      for (const e of empleados) e.update(dt, t);
    },

    /**
     * Libera lo que `disposeScene` no puede alcanzar: las texturas de canvas.
     *
     * Las creadas aquí no cuelgan de ningún material como propiedad directa en
     * todos los casos (algunas viven dentro de clones), así que se guardan en
     * una lista y se sueltan a mano. El resto del subárbol lo barre `Disposal`.
     */
    dispose() {
      for (const t of basura) t.dispose?.();
      basura.length = 0;
    },
  };

  return handle;
}

/** Cartel serigrafiado sobre transparencia: texto blanco en placa ámbar. */
function texturaCartel(texto) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 116;
  const g = c.getContext('2d');
  g.fillStyle = '#12181f';
  g.fillRect(0, 0, 512, 116);
  g.strokeStyle = '#e0952a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 100);
  g.fillStyle = '#e8eef5';
  g.font = 'bold 46px "Bahnschrift", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 256, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PALETA_MONO = [0xf2a03d, 0xe07a4f, 0xd9c14f, 0x7fb069];
const PALETA_PIEL = [0xe8b58a, 0xc79b76, 0xa9825e, 0x8a6244, 0xf0c8a0];
const alAzar = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Empleado de la nave: cápsula, cabeza y un par de ojos saltones.
 *
 * Los googly eyes van AQUÍ y no en los paquetes, y la distinción no es
 * decorativa: en este juego los ojos son el canal por el que se lee un estado
 * psicológico. Ponérselos a una caja sería decir que la caja siente algo, y el
 * nivel entero depende de que el jugador tenga clarísimo que sus objetivos son
 * objetos (ADR-013 §1).
 */
function crearEmpleado() {
  const grupo = new THREE.Group();
  const mono = new THREE.MeshStandardMaterial({ color: alAzar(PALETA_MONO), roughness: 0.86 });
  const piel = new THREE.MeshStandardMaterial({ color: alAzar(PALETA_PIEL), roughness: 0.62 });

  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.66, 4, 10), mono);
  cuerpo.position.y = 0.92;
  cuerpo.castShadow = !quality.mobile;

  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), piel);
  cabeza.position.y = 1.62;
  cabeza.castShadow = !quality.mobile;
  const ojos = makeGooglyEyes({ radio: 0.052, separacion: 0.055, pupila: 0.013 });
  ojos.group.position.set(0, 0.02, 0.13);
  cabeza.add(ojos.group);

  const piernas = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.15, 0.58, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b313a, roughness: 0.9 }),
  );
  piernas.position.y = 0.3;

  // Gorra de faena: la marca de que trabaja aquí.
  const gorra = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2f4f7a, roughness: 0.75 }),
  );
  gorra.position.y = 0.06;
  cabeza.add(gorra);

  grupo.add(cuerpo, cabeza, piernas);

  // La mitad carga una caja: la nave tiene que parecer que trabaja.
  let bulto = null;
  if (Math.random() < 0.6) {
    bulto = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xb98a52, roughness: 0.94 }),
    );
    bulto.position.set(0, 1.06, 0.34);
    bulto.castShadow = !quality.mobile;
    grupo.add(bulto);
  }

  const fase = Math.random() * 10;
  const velocidad = 0.55 + Math.random() * 0.4;

  return {
    grupo,
    update(dt, t) {
      const r = grupo.userData.ruta;
      if (!r) return;
      r.t += dt * 0.035 * velocidad * r.dir;
      if (r.t > 1 || r.t < 0) { r.dir *= -1; r.t = THREE.MathUtils.clamp(r.t, 0, 1); }
      const x = THREE.MathUtils.lerp(r.x0, r.x1, r.t);
      const paso = Math.abs(Math.sin(t * 5.5 * velocidad + fase));
      grupo.position.set(x, paso * 0.045, r.z);
      grupo.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      cuerpo.rotation.z = Math.sin(t * 5.5 * velocidad + fase) * 0.045;
      cabeza.position.y = 1.62 + paso * 0.012;
      if (bulto) bulto.rotation.z = Math.sin(t * 5.5 * velocidad + fase) * 0.06;
      ojos.update(dt, t + fase);
      if (Math.random() < dt * 0.35) ojos.blink();
    },
  };
}

/**
 * El oficial que controla el jugador.
 *
 * Va aparte de `crearEmpleado` porque no comparte nada con él salvo la silueta:
 * necesita brazo animable (levanta el escáner al disparar), chaleco reflectante
 * y una mirada que la escena dirige hacia el paquete apuntado. Un solo
 * constructor con seis banderas habría sido peor que dos honestos.
 */
export function crearOficial() {
  const grupo = new THREE.Group();

  const piel = new THREE.MeshStandardMaterial({ color: 0xe8b58a, roughness: 0.6 });
  const camisa = new THREE.MeshStandardMaterial({ color: 0x2f5f8f, roughness: 0.8 });
  const chaleco = new THREE.MeshStandardMaterial({
    color: 0xd8e84a, roughness: 0.55, emissive: 0x3a4210, emissiveIntensity: 0.6,
  });
  const oscuro = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.9 });

  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.62, 4, 12), camisa);
  cuerpo.position.y = 0.98;
  cuerpo.castShadow = true;

  // Chaleco reflectante: dos bandas grises sobre un cilindro amarillo.
  const peto = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.56, 12), chaleco);
  peto.position.y = 1.02;
  peto.castShadow = true;
  const matBanda = new THREE.MeshStandardMaterial({
    color: 0xe8eef5, roughness: 0.3, metalness: 0.2, emissive: 0x556070, emissiveIntensity: 0.4,
  });
  for (const y of [0.9, 1.14]) {
    const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.3, 0.07, 12), matBanda);
    banda.position.y = y;
    grupo.add(banda);
  }

  const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 10), oscuro);
  piernas.position.y = 0.32;
  piernas.castShadow = true;

  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 14), piel);
  cabeza.position.y = 1.68;
  cabeza.castShadow = true;
  const ojos = makeGooglyEyes({ radio: 0.068, separacion: 0.062, pupila: 0.017, saltón: 0.65 });
  ojos.group.position.set(0, 0.03, 0.14);
  cabeza.add(ojos.group);

  // Gorra azul con visera: el uniforme del concept art.
  const gorra = new THREE.Mesh(
    new THREE.SphereGeometry(0.195, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1f3f6b, roughness: 0.68 }),
  );
  gorra.position.y = 0.055;
  cabeza.add(gorra);
  const visera = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x18325a, roughness: 0.7 }));
  visera.position.set(0, 0.05, 0.2);
  cabeza.add(visera);
  const insignia = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0952a, emissive: 0xe0952a, emissiveIntensity: 0.7 }));
  insignia.position.set(0, 0.14, 0.185);
  insignia.rotation.x = -0.35;
  cabeza.add(insignia);

  // Brazo derecho con el escáner de mano. El grupo pivota en el hombro, para
  // que el «disparo» sea una rotación y no un teletransporte del arma.
  const brazo = new THREE.Group();
  brazo.position.set(0.3, 1.22, 0);
  const antebrazo = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 3, 8), piel);
  antebrazo.position.set(0.04, -0.2, 0.12);
  antebrazo.rotation.x = -0.5;
  brazo.add(antebrazo);

  const escaner = new THREE.Group();
  escaner.position.set(0.06, -0.38, 0.36);
  const cuerpoEsc = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x37414d, roughness: 0.42, metalness: 0.55 }));
  const morro = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a6672, roughness: 0.35, metalness: 0.7 }));
  morro.rotation.x = Math.PI / 2;
  morro.position.z = 0.2;
  // Lente: el emisivo que cambia de color con la herramienta activa.
  const lente = new THREE.Mesh(new THREE.CircleGeometry(0.048, 12),
    new THREE.MeshBasicMaterial({ color: 0x4fd0e0 }));
  lente.position.z = 0.285;
  const culata = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.6 }));
  culata.position.set(0, -0.15, -0.05);
  culata.rotation.x = 0.25;
  escaner.add(cuerpoEsc, morro, lente, culata);

  /**
   * Cabezales intercambiables. Solo uno visible a la vez.
   *
   * El color de la lente no bastaba: en un plano 3/4 el escáner mide veinte
   * píxeles y un cambio de tinte ahí no se ve. Con una pieza distinta atornillada
   * en el morro —placa, aro, correa o platillo— la silueta cambia y se distingue
   * qué lleva el oficial en la mano sin mirar el HUD.
   */
  const cabezales = {};
  const matCab = (hex) => new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.5,
  });
  // Rayos X: placa emisora rectangular.
  cabezales.rayosx = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.04), matCab(0x4fd0e0));
  cabezales.rayosx.position.z = 0.31;
  // Lupa: un aro con su cristal.
  cabezales.lupa = new THREE.Group();
  const aroLupa = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 6, 16), matCab(0xe0952a));
  const cristalLupa = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe3ad, transparent: true, opacity: 0.4 }));
  cabezales.lupa.add(aroLupa, cristalLupa);
  cabezales.lupa.position.z = 0.32;
  // Justus: la correa corta que se engancha al arnés del can.
  cabezales.justus = new THREE.Group();
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14), matCab(0xd9784f));
  asa.rotation.y = Math.PI / 2;
  const tira = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.22), matCab(0xd9784f));
  tira.position.z = 0.12;
  cabezales.justus.add(asa, tira);
  cabezales.justus.position.z = 0.26;
  // Balanza: un platillo colgando del morro.
  cabezales.balanza = new THREE.Group();
  const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.022, 12), matCab(0x8ac926));
  plato.position.y = -0.11;
  const varilla = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), matCab(0x8ac926));
  varilla.position.y = -0.05;
  cabezales.balanza.add(plato, varilla);
  cabezales.balanza.position.z = 0.3;

  for (const c of Object.values(cabezales)) {
    c.visible = false;
    escaner.add(c);
  }
  brazo.add(escaner);

  const brazoIzq = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.4, 3, 8), piel);
  brazoIzq.position.set(-0.31, 1.05, 0);

  grupo.add(cuerpo, peto, piernas, cabeza, brazo, brazoIzq);

  let paso = 0;

  return {
    grupo, cabeza, ojos, brazo, escaner, lente, cuerpo,
    /**
     * Cambia el cabezal del escáner y la tinta de la lente.
     * @param {number} hex  color de la herramienta
     * @param {string} [id] identificador ('rayosx' | 'lupa' | 'justus' | 'balanza')
     */
    setColorHerramienta(hex, id) {
      lente.material.color.setHex(hex);
      if (!id) return;
      for (const [k, c] of Object.entries(cabezales)) c.visible = k === id;
      const activo = cabezales[id];
      if (activo) {
        gsap.fromTo(activo.scale, { x: 0.2, y: 0.2, z: 0.2 },
          { x: 1, y: 1, z: 1, duration: 0.32, ease: 'back.out(3)', overwrite: 'auto' });
      }
    },
    /** Retroceso del disparo: el brazo sube, el cuerpo acusa el impulso. */
    disparar() {
      gsap.killTweensOf(brazo.rotation);
      gsap.fromTo(brazo.rotation, { x: -0.55 }, {
        x: 0, duration: 0.42, ease: 'elastic.out(1, 0.45)', overwrite: 'auto',
      });
      gsap.fromTo(grupo.scale, { x: 1.06, y: 0.94 }, {
        x: 1, y: 1, duration: 0.3, ease: 'back.out(2.4)', overwrite: 'auto',
      });
      ojos.blink();
    },
    /**
     * @param {number} vel  módulo de la velocidad, para el ciclo de paso
     * @param {number} tension 0..1 — cuánto tiemblan las pupilas
     */
    update(dt, t, vel = 0, tension = 0) {
      paso += dt * (2 + vel * 2.4);
      const bob = Math.abs(Math.sin(paso * 2.6)) * Math.min(1, vel);
      grupo.position.y = bob * 0.055;
      cuerpo.rotation.z = Math.sin(paso * 2.6) * 0.03 * Math.min(1, vel);
      piernas.rotation.x = Math.sin(paso * 2.6) * 0.32 * Math.min(1, vel);
      brazoIzq.rotation.x = -Math.sin(paso * 2.6) * 0.5 * Math.min(1, vel);
      cabeza.position.y = 1.68 + Math.sin(t * 1.4) * 0.006 + bob * 0.01;
      ojos.setTemblor(tension);
      ojos.update(dt, t);
      if (Math.random() < dt * 0.4) ojos.blink();
    },
  };
}

