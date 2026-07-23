import * as THREE from 'three';
import { quality } from '../core/Device.js';

/**
 * PuertoChimbote — la ambientación del puerto REAL (ADR-011).
 *
 * El muelle era un rectángulo de concreto con contenedores: no se parecía en
 * nada a Chimbote. Este módulo construye los elementos que hacen reconocible al
 * primer puerto pesquero del Perú:
 *
 *  · **Grúas pórtico** — la silueta inconfundible de cualquier terminal.
 *  · **Buque portacontenedores** atracado + **bolicheras** (los barcos de cerco
 *    de la flota anchovetera, con su cabina alta a popa y la pluma de red).
 *  · **Edificio de la Aduana / SUNAT** con letrero y bandera.
 *  · **Planta de harina de pescado** con silos y chimenea humeante — la postal
 *    (y el olor) de Chimbote.
 *  · **Isla Blanca** al fondo de la bahía El Ferrol.
 *  · **Fauna viva**: bandadas de pelícanos y gaviotas en vuelo, y **lobos
 *    marinos** tumbados en el muelle (están por todo el puerto, de verdad).
 *
 * Todo procedural: cero descargas, silueta bajo control y coste ajustado al
 * presupuesto móvil.
 */

const MAT = {
  concreto: () => new THREE.MeshStandardMaterial({ color: 0x9a978e, roughness: 0.95 }),
  acero: () => new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.5, metalness: 0.7 }),
  aceroPintado: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.25 }),
  casco: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.15 }),
  madera: () => new THREE.MeshStandardMaterial({ color: 0x7d5a33, roughness: 0.95 }),
};

/** Letrero con texto pintado en canvas (para Aduana y nombres de barco). */
function letrero(texto, { ancho = 6, alto = 1.2, fondo = '#0d3b73', tinta = '#ffffff', borde = null } = {}) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = Math.round(512 * (alto / ancho));
  const g = cv.getContext('2d');
  g.fillStyle = fondo; g.fillRect(0, 0, cv.width, cv.height);
  if (borde) { g.strokeStyle = borde; g.lineWidth = 10; g.strokeRect(5, 5, cv.width - 10, cv.height - 10); }
  g.fillStyle = tinta;
  g.font = `bold ${Math.round(cv.height * 0.52)}px Arial`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, cv.width / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

/** Grúa pórtico: patas, viga, carro y contrapeso. La firma visual de un puerto. */
function gruaPortico({ altura = 16, luz = 14, color = 0xd94f4f } = {}) {
  const g = new THREE.Group();
  const acero = MAT.aceroPintado(color);
  const oscuro = MAT.acero();
  const pata = (x, z) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, altura, 0.7), acero);
    p.position.set(x, altura / 2, z);
    p.castShadow = true;
    g.add(p);
    // Riostra diagonal: le da el aire de celosía sin coste de geometría real.
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.25, altura * 0.9, 0.25), oscuro);
    d.position.set(x, altura * 0.5, z);
    d.rotation.x = 0.12 * Math.sign(z || 1);
    g.add(d);
  };
  pata(-luz / 2, -2.4); pata(luz / 2, -2.4);
  pata(-luz / 2, 2.4); pata(luz / 2, 2.4);

  // Viga superior y voladizo hacia el agua.
  const viga = new THREE.Mesh(new THREE.BoxGeometry(luz + 12, 1.1, 1.6), acero);
  viga.position.set(3, altura + 0.5, 0);
  viga.castShadow = true;
  g.add(viga);
  // Tirantes desde la torre a la punta del voladizo.
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 0.16), oscuro);
    t.position.set(6.5, altura + 2.6, sx * 0.7);
    t.rotation.z = -0.28;
    g.add(t);
  }
  const torre = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), acero);
  torre.position.set(-1.5, altura + 2.2, 0);
  g.add(torre);
  // Carro y spreader colgando.
  const carro = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.2), oscuro);
  carro.position.set(5, altura - 0.4, 0);
  g.add(carro);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), oscuro);
  cable.position.set(5, altura - 3.6, 0);
  g.add(cable);
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 2.4), MAT.aceroPintado(0xe0c14a));
  spreader.position.set(5, altura - 6.6, 0);
  spreader.castShadow = true;
  g.add(spreader);
  // Cabina del gruero.
  const cabina = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5 }));
  cabina.position.set(3.6, altura - 1.4, 1.6);
  g.add(cabina);
  return g;
}

/** Buque portacontenedores atracado, con su carga apilada y superestructura. */
function buqueCarga({ largo = 46, manga = 9, color = 0x1f4e79 } = {}) {
  const g = new THREE.Group();
  const casco = new THREE.Mesh(new THREE.BoxGeometry(largo, 5.2, manga), MAT.casco(color));
  casco.position.y = 1.2;
  casco.castShadow = true;
  g.add(casco);
  // Franja roja de obra viva (la línea de flotación pintada).
  const franja = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.06, 1.1, manga + 0.06), MAT.casco(0x8e2b22));
  franja.position.y = -0.7;
  g.add(franja);
  // Proa achaflanada: dos cuñas que rompen la caja.
  for (const s of [-1, 1]) {
    const proa = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5.2, manga * 0.55), MAT.casco(color));
    proa.position.set(largo / 2 + 1.4, 1.2, s * manga * 0.22);
    proa.rotation.y = -s * 0.34;
    g.add(proa);
  }
  // Superestructura a popa + puente + chimenea.
  const sup = new THREE.Mesh(new THREE.BoxGeometry(7, 7, manga * 0.8),
    new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.7 }));
  sup.position.set(-largo / 2 + 5, 7.4, 0);
  sup.castShadow = true;
  g.add(sup);
  const puente = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.5, manga * 0.86),
    new THREE.MeshStandardMaterial({ color: 0x22303d, roughness: 0.35, metalness: 0.2 }));
  puente.position.set(-largo / 2 + 5, 10.4, 0);
  g.add(puente);
  const chimenea = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.4, 12), MAT.casco(0xc8562f));
  chimenea.position.set(-largo / 2 + 2.4, 12.4, 0);
  g.add(chimenea);
  // Carga: contenedores apilados en cubierta.
  const cols = [0xd94f4f, 0xe0952a, 0x4f9dd9, 0x53b06a, 0x8a5cc0, 0x40b0a8];
  const geo = new THREE.BoxGeometry(5.6, 2.4, 2.4);
  const cajas = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 42);
  cajas.castShadow = true;
  const m = new THREE.Matrix4(); const col = new THREE.Color();
  let i = 0;
  for (let fila = 0; fila < 7 && i < 42; fila++) {
    for (let z = -1; z <= 1 && i < 42; z++) {
      const alto = 1 + ((fila + z + 3) % 3);
      for (let n = 0; n < alto && i < 42; n++) {
        m.makeTranslation(largo / 2 - 8 - fila * 6, 4.2 + n * 2.5, z * 2.7);
        cajas.setMatrixAt(i, m);
        cajas.setColorAt(i, col.setHex(cols[(fila + n + z) % cols.length]));
        i++;
      }
    }
  }
  cajas.count = i;
  cajas.instanceMatrix.needsUpdate = true;
  if (cajas.instanceColor) cajas.instanceColor.needsUpdate = true;
  g.add(cajas);
  return g;
}

/**
 * Bolichera: el barco de cerco de la flota anchovetera. Casco de madera pintado,
 * caseta alta a popa, pluma de red y el aro del boliche. Son EL barco de Chimbote.
 */
function bolichera({ largo = 13, color = 0x2f6f8f, nombre = 'DON PEPE' } = {}) {
  const g = new THREE.Group();
  const casco = new THREE.Mesh(new THREE.BoxGeometry(largo, 2.4, 3.6), MAT.casco(color));
  casco.position.y = 0.5;
  casco.castShadow = true;
  g.add(casco);
  const franja = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.05, 0.45, 3.66), MAT.casco(0xe8e2d4));
  franja.position.y = 1.5;
  g.add(franja);
  for (const s of [-1, 1]) { // proa
    const proa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.1), MAT.casco(color));
    proa.position.set(largo / 2 + 0.7, 0.5, s * 0.75);
    proa.rotation.y = -s * 0.4;
    g.add(proa);
  }
  const caseta = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.9),
    new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.8 }));
  caseta.position.set(-largo / 2 + 3, 2.9, 0);
  caseta.castShadow = true;
  g.add(caseta);
  const techo = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.1), MAT.casco(0x2b3038));
  techo.position.set(-largo / 2 + 3, 4.2, 0);
  g.add(techo);
  // Mástil y pluma de red.
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 6, 8), MAT.madera());
  mastil.position.set(-largo / 2 + 5.4, 4.6, 0);
  g.add(mastil);
  const pluma = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.4, 8), MAT.madera());
  pluma.rotation.z = Math.PI / 2.5;
  pluma.position.set(-largo / 2 + 8, 5.4, 0);
  g.add(pluma);
  // El boliche: red recogida sobre cubierta.
  const red = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x2a4d3a, roughness: 1 }));
  red.position.set(-largo / 2 + 8.6, 1.9, 0);
  g.add(red);
  // Neumáticos de defensa colgando del costado.
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.95 }));
    n.position.set(-largo / 2 + 3 + i * 2.6, 0.9, 1.86);
    g.add(n);
  }
  const nom = letrero(nombre, { ancho: 3.2, alto: 0.55, fondo: '#0e2c3d', tinta: '#f3e6c8' });
  nom.position.set(largo / 2 - 2.2, 1.5, 1.83);
  g.add(nom);
  return g;
}

/** Edificio de la Aduana (SUNAT): bloque institucional con letrero y bandera. */
function edificioAduana() {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 10),
    new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.85 }));
  cuerpo.position.y = 3.5;
  cuerpo.castShadow = true; cuerpo.receiveShadow = true;
  g.add(cuerpo);
  const zocalo = new THREE.Mesh(new THREE.BoxGeometry(16.6, 1.2, 10.6), MAT.concreto());
  zocalo.position.y = 0.6;
  g.add(zocalo);
  const cornisa = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.5, 10.8),
    new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.9 }));
  cornisa.position.y = 7.2;
  g.add(cornisa);
  // Ventanales en dos plantas.
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x2b4a63, roughness: 0.15, metalness: 0.5 });
  for (let piso = 0; piso < 2; piso++) {
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 0.12), vidrio);
      v.position.set(-6.5 + i * 2.6, 2.4 + piso * 2.7, 5.05);
      g.add(v);
    }
  }
  // Entrada con marquesina.
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.16), vidrio);
  puerta.position.set(0, 1.6, 5.06);
  g.add(puerta);
  const marq = new THREE.Mesh(new THREE.BoxGeometry(5, 0.24, 2.2), MAT.aceroPintado(0x1f6b8f));
  marq.position.set(0, 3.3, 6);
  g.add(marq);
  // Letreros: SUNAT arriba y ADUANAS bajo la cornisa.
  const l1 = letrero('SUNAT', { ancho: 5.4, alto: 1.3, fondo: '#0b3d6b', tinta: '#ffffff' });
  l1.position.set(0, 6.2, 5.08);
  g.add(l1);
  const l2 = letrero('ADUANA MARÍTIMA · CHIMBOTE', { ancho: 11, alto: 1.0, fondo: '#123a1f', tinta: '#eef4e8' });
  l2.position.set(0, 4.6, 5.08);
  g.add(l2);
  // Asta con bandera peruana (rojo-blanco-rojo).
  const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), MAT.acero());
  asta.position.set(-9.2, 4.5, 4);
  g.add(asta);
  const bandera = new THREE.Group();
  for (const [i, c] of [0xd91023, 0xffffff, 0xd91023].entries()) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.5),
      new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.set(0.4 + i * 0.8, 0, 0);
    bandera.add(f);
  }
  bandera.position.set(-9.15, 8, 4);
  g.add(bandera);
  g.userData.bandera = bandera;
  return g;
}

/** Planta de harina de pescado: silos + nave + chimenea. La postal de Chimbote. */
function plantaHarina() {
  const g = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 12),
    new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.9 }));
  nave.position.y = 4.5;
  nave.castShadow = true;
  g.add(nave);
  // Techo a dos aguas.
  const techo = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 22, 3, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x7d8792, roughness: 0.7, metalness: 0.35 }));
  techo.rotation.z = Math.PI / 2;
  techo.position.y = 9;
  g.add(techo);
  // Silos cilíndricos.
  for (let i = 0; i < 4; i++) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 13, 16),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.75, metalness: 0.2 }));
    silo.position.set(13 + i * 5.1, 6.5, -1);
    silo.castShadow = true;
    g.add(silo);
    const tapa = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.6, 16), MAT.acero());
    tapa.position.set(13 + i * 5.1, 13.6, -1);
    g.add(tapa);
  }
  // Chimenea (con humo animado desde la escena).
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 17, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9c1b2, roughness: 0.9 }));
  chim.position.set(-8, 8.5, -2);
  chim.castShadow = true;
  g.add(chim);
  const banda = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 1.4, 12), MAT.casco(0x8e2b22));
  banda.position.set(-8, 15.2, -2);
  g.add(banda);
  g.userData.bocaChimenea = new THREE.Vector3(-8, 17.2, -2);
  return g;
}

/**
 * Tierra firme detrás del muelle. Sin esto el puerto flotaba en mitad del mar
 * como una plataforma petrolera: un puerto REAL tiene la ciudad a la espalda.
 * Incluye explanada, cerros áridos (la costa peruana es desierto) y el
 * caserío de Chimbote recortado al fondo.
 */
function tierraFirme(DOCK_X, DOCK_Z) {
  const g = new THREE.Group();
  // Explanada de tierra que continúa el muelle hacia el continente.
  // OJO: la cresta de las olas llega a +0.28, así que la tierra debe quedar POR
  // ENCIMA o el mar asoma entre las casas (pasó, y se veía fatal).
  const SUELO_Y = 0.4;
  const suelo = new THREE.Mesh(new THREE.BoxGeometry(DOCK_X * 6, 2, 240),
    new THREE.MeshStandardMaterial({ color: 0xa89b83, roughness: 1 }));
  suelo.position.set(0, SUELO_Y - 1, -DOCK_Z - 120);
  suelo.receiveShadow = true;
  g.add(suelo);

  // Cerros áridos: la costa de Áncash es desierto, no verde.
  const cerroMat = new THREE.MeshStandardMaterial({ color: 0x9c8f77, roughness: 1 });
  for (const [x, z, r, h] of [
    [-120, -180, 60, 34], [-30, -215, 75, 46], [90, -190, 55, 28], [170, -230, 70, 38],
  ]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6, 1), cerroMat);
    c.position.set(x, h / 2 + SUELO_Y - 1, z);
    c.rotation.y = x;
    g.add(c);
  }

  // El caserío: bloques bajos de colores tostados (la ciudad al fondo).
  const cols = [0xc9b79a, 0xbfa88c, 0xd6c3a6, 0xae9a80, 0xcfae8e];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const ciudad = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), 150);
  const m = new THREE.Matrix4(); const col = new THREE.Color();
  const q = new THREE.Quaternion(); const esc = new THREE.Vector3();
  for (let i = 0; i < 150; i++) {
    const x = (Math.random() - 0.5) * DOCK_X * 4.6;
    const z = -DOCK_Z - 24 - Math.random() * 130;
    const h = 3 + Math.random() * 7;
    esc.set(5 + Math.random() * 7, h, 5 + Math.random() * 7);
    m.compose(new THREE.Vector3(x, h / 2 + SUELO_Y - 0.2, z), q, esc);
    ciudad.setMatrixAt(i, m);
    ciudad.setColorAt(i, col.setHex(cols[i % cols.length]));
  }
  ciudad.instanceMatrix.needsUpdate = true;
  if (ciudad.instanceColor) ciudad.instanceColor.needsUpdate = true;
  ciudad.castShadow = false; ciudad.receiveShadow = true;
  g.add(ciudad);
  return g;
}

/** Isla Blanca: el cerro que cierra la bahía El Ferrol. */
function islaBlanca() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8f8d84, roughness: 1 });
  for (const [x, z, r, h] of [[0, 0, 26, 16], [30, -10, 18, 11], [-32, 6, 15, 8]]) {
    const cerro = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), mat);
    cerro.position.set(x, h / 2 - 1, z);
    cerro.rotation.y = x * 0.3;
    g.add(cerro);
  }
  return g;
}

/** Lobo marino tumbado en el muelle (los hay por todo el puerto, de verdad). */
function loboMarino(color = 0x6b5a4a) {
  const g = new THREE.Group();
  const piel = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 6, 12), piel);
  cuerpo.rotation.z = Math.PI / 2;
  cuerpo.position.y = 0.42;
  cuerpo.castShadow = true;
  g.add(cuerpo);
  const cuello = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 5, 10), piel);
  cuello.rotation.z = 0.7;
  cuello.position.set(1.0, 0.78, 0);
  g.add(cuello);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), piel);
  cabeza.position.set(1.32, 1.05, 0);
  cabeza.scale.set(1.25, 0.95, 0.95);
  g.add(cabeza);
  const hocico = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.16, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.6 }));
  hocico.rotation.z = Math.PI / 2;
  hocico.position.set(1.62, 0.99, 0);
  g.add(hocico);
  for (const s of [-1, 1]) { // ojos negros brillantes
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15 }));
    ojo.position.set(1.44, 1.12, s * 0.13);
    g.add(ojo);
    const aleta = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), piel);
    aleta.position.set(0.5, 0.22, s * 0.42);
    aleta.rotation.y = s * 0.4;
    g.add(aleta);
  }
  const cola = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.7), piel);
  cola.position.set(-1.15, 0.3, 0);
  g.add(cola);
  g.userData.cabeza = cabeza;
  g.userData.cuello = cuello;
  return g;
}

/**
 * Bandada en vuelo: pelícanos y gaviotas como siluetas de dos alas que baten.
 * Se animan con `actualizarAves(t)`. Coste: dos triángulos por ave.
 */
function bandada(n, { color = 0xf2f2f2, escala = 1, altura = 14, radio = 55 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  const alaGeo = new THREE.BufferGeometry();
  // Un ala = triángulo alargado; el cuerpo es el vértice común.
  alaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0, 1.0, 0.12, -0.28, 0.95, 0, 0.3,
  ]), 3));
  alaGeo.computeVertexNormals();
  const aves = [];
  for (let i = 0; i < n; i++) {
    const ave = new THREE.Group();
    for (const s of [-1, 1]) {
      const ala = new THREE.Mesh(alaGeo, mat);
      ala.scale.x = s;
      ave.add(ala);
    }
    ave.scale.setScalar(escala * (0.8 + Math.random() * 0.5));
    ave.userData = {
      radio: radio * (0.5 + Math.random() * 0.7),
      fase: Math.random() * Math.PI * 2,
      vel: 0.08 + Math.random() * 0.07,
      alturaBase: altura + Math.random() * 8,
      bateo: 5 + Math.random() * 4,
      alas: ave.children,
    };
    g.add(ave);
    aves.push(ave);
  }
  g.userData.aves = aves;
  return g;
}

/**
 * Monta TODA la ambientación en la escena y devuelve un actualizador.
 * @returns {{update:(t:number)=>void, colisiones:Array}}
 */
export function construirPuerto(scene, { DOCK_X, DOCK_Z }) {
  const grupo = new THREE.Group();
  scene.add(grupo);
  const colisiones = []; // AABBs que la escena convertirá en cuerpos estáticos

  // ── Tierra firme: la ciudad a la espalda (si no, el muelle es una isla) ──
  grupo.add(tierraFirme(DOCK_X, DOCK_Z));

  // ── Grúas pórtico sobre el borde del muelle ──────────────────────────────
  for (const [x, col] of [[-DOCK_X + 12, 0xd94f4f], [DOCK_X - 14, 0xe0952a]]) {
    const gr = gruaPortico({ altura: 15, luz: 13, color: col });
    gr.position.set(x, 0, DOCK_Z - 9);
    grupo.add(gr);
    colisiones.push({ x: x - 6.5, z: DOCK_Z - 11.4, hx: 0.6, hz: 0.6 });
    colisiones.push({ x: x + 6.5, z: DOCK_Z - 11.4, hx: 0.6, hz: 0.6 });
  }

  // ── Buque atracado, más allá del cantil ──────────────────────────────────
  const buque = buqueCarga({ largo: 46, manga: 9 });
  buque.position.set(4, 0, DOCK_Z + 12);
  buque.rotation.y = 0.02;
  grupo.add(buque);

  // ── Bolicheras de la flota anchovetera ───────────────────────────────────
  const nombres = ['DON PEPE', 'MI CHIMBOTE', 'SANTA ROSA', 'EL FERROL'];
  [[-26, DOCK_Z + 8, 0.06, 0x2f6f8f], [-40, DOCK_Z + 15, -0.12, 0x8f3f2f],
   [26, DOCK_Z + 26, 0.2, 0x2f8f5f], [-8, DOCK_Z + 30, -0.05, 0x8f7f2f]]
    .forEach(([x, z, rot, col], i) => {
      const b = bolichera({ color: col, nombre: nombres[i] });
      b.position.set(x, 0, z);
      b.rotation.y = rot;
      grupo.add(b);
    });

  // ── Edificio de la Aduana, al fondo del muelle ───────────────────────────
  const aduana = edificioAduana();
  aduana.position.set(-DOCK_X + 16, 0, -DOCK_Z + 7);
  aduana.rotation.y = 0.06;
  grupo.add(aduana);
  colisiones.push({ x: -DOCK_X + 16, z: -DOCK_Z + 7, hx: 8, hz: 5 });

  // ── Planta de harina de pescado, detrás ──────────────────────────────────
  const planta = plantaHarina();
  planta.position.set(DOCK_X - 4, 0, -DOCK_Z - 14);
  grupo.add(planta);

  // ── Isla Blanca cerrando la bahía ────────────────────────────────────────
  const isla = islaBlanca();
  isla.position.set(-20, 0, DOCK_Z + 150);
  grupo.add(isla);

  // ── Lobos marinos tumbados junto al cantil ───────────────────────────────
  const lobos = [];
  for (const [x, z, rot, col] of [
    [-14, DOCK_Z - 2.6, 0.5, 0x6b5a4a], [-11.4, DOCK_Z - 3.4, -0.9, 0x574a3c],
    [17, DOCK_Z - 2.8, 2.4, 0x7a6752], [20.5, DOCK_Z - 3.6, 1.6, 0x60513f],
  ]) {
    const l = loboMarino(col);
    l.position.set(x, 0, z);
    l.rotation.y = rot;
    l.userData.fase = Math.random() * 6;
    grupo.add(l);
    lobos.push(l);
  }

  // ── Fauna en vuelo: pelícanos (grandes, planeando) y gaviotas ────────────
  const pelicanos = bandada(quality.mobile ? 7 : 12,
    { color: 0xe8e2d2, escala: 1.5, altura: 17, radio: 46 });
  const gaviotas = bandada(quality.mobile ? 10 : 20,
    { color: 0xfbfbfb, escala: 0.75, altura: 11, radio: 34 });
  pelicanos.position.set(0, 0, DOCK_Z + 6);
  gaviotas.position.set(-6, 0, DOCK_Z - 4);
  grupo.add(pelicanos, gaviotas);

  // ── Humo de la chimenea de la planta ─────────────────────────────────────
  const humoN = quality.mobile ? 26 : 48;
  const humoPos = new Float32Array(humoN * 3);
  const boca = planta.position.clone().add(planta.userData.bocaChimenea);
  for (let i = 0; i < humoN; i++) {
    humoPos[i * 3] = boca.x; humoPos[i * 3 + 1] = boca.y + i * 0.9; humoPos[i * 3 + 2] = boca.z;
  }
  const humoGeo = new THREE.BufferGeometry();
  humoGeo.setAttribute('position', new THREE.BufferAttribute(humoPos, 3));
  const humo = new THREE.Points(humoGeo, new THREE.PointsMaterial({
    color: 0xd8d4cc, size: 3.4, transparent: true, opacity: 0.28, depthWrite: false,
  }));
  grupo.add(humo);

  // ── Cabos de amarre entre bolardos y buque ───────────────────────────────
  const cabo = new THREE.MeshStandardMaterial({ color: 0xd8cba8, roughness: 1 });
  for (const [x, z] of [[-2, DOCK_Z - 1.2], [12, DOCK_Z - 1.2]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 13, 6), cabo);
    c.position.set(x + 2, 1.4, z + 6);
    c.rotation.set(1.15, 0.2, 0.25);
    grupo.add(c);
  }

  return {
    grupo,
    colisiones,
    /** Anima fauna, humo y bandera. */
    update(t) {
      for (const g of [pelicanos, gaviotas]) {
        for (const ave of g.userData.aves) {
          const u = ave.userData;
          const a = t * u.vel + u.fase;
          ave.position.set(Math.cos(a) * u.radio, u.alturaBase + Math.sin(a * 1.7) * 2.2, Math.sin(a) * u.radio * 0.55);
          ave.rotation.y = -a + Math.PI / 2;
          ave.rotation.z = Math.sin(a * 1.7) * 0.22;
          const bat = Math.sin(t * u.bateo + u.fase) * 0.55;
          u.alas[0].rotation.z = bat;
          u.alas[1].rotation.z = -bat;
        }
      }
      // Lobos marinos: respiran y levantan la cabeza de vez en cuando.
      for (const l of lobos) {
        const f = l.userData.fase;
        l.userData.cabeza.position.y = 1.05 + Math.sin(t * 0.9 + f) * 0.045;
        l.userData.cuello.rotation.z = 0.7 + Math.sin(t * 0.45 + f) * 0.16;
      }
      // Humo: asciende y se dispersa.
      const hp = humo.geometry.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        hp.array[i * 3 + 1] += 0.035 + (i % 3) * 0.012;
        hp.array[i * 3] = boca.x + Math.sin(t * 0.4 + i) * (1.2 + i * 0.16);
        hp.array[i * 3 + 2] = boca.z + Math.cos(t * 0.3 + i) * (0.8 + i * 0.1);
        if (hp.array[i * 3 + 1] > boca.y + 26) hp.array[i * 3 + 1] = boca.y;
      }
      hp.needsUpdate = true;
      // La bandera ondea.
      aduana.userData.bandera.rotation.y = Math.sin(t * 1.6) * 0.28;
    },
  };
}
