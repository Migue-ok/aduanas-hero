import * as THREE from 'three';
import gsap from 'gsap';
import { colgarEntorno } from '../render/Entorno.js';
import { disposeObject } from '../core/Disposal.js';

/**
 * SalaIntrusiva — la **Sala de Revisión Intrusiva / Módulo de Control
 * Antidrogas (DIRANDRO · PNP)**, `02 - Diseño/12 - Canal Rojo y Sala Intrusiva`.
 *
 * El salto de tono es deliberado y es la mitad del mensaje: el canal rojo es
 * público, ruidoso y comercial —ahí se discute un tributo—; esto es un cuarto
 * cerrado, sin ventanas, con acta, cámara y un policía en la puerta. Cuando el
 * jugador cruza esa puerta ya no está cobrando impuestos: está tocando la vida
 * de alguien. Por eso la sala está construida como está: paredes verdes de
 * institución, luz plana sin sombras bonitas, espejo de observación, y ni un
 * solo elemento decorativo que la haga "molona".
 *
 * Se construye lejos del hall (base ≈ x 26) y con paredes propias: así el
 * encierro es real —no se ve la terminal por ningún hueco— sin pagar una carga
 * de nivel. Y se construye **solo si el jugador llega hasta aquí**.
 */

// El verde institucional bajó de 0x7d8c82 a este tono al ver la sala montada: la
// terminal aporta su propia luz ambiental y, sumada a los plafones del techo,
// dejaba las paredes en un blanco lechoso sin material. Una sala de comisaría
// tiene que verse APAGADA — es el contraste con el hall lo que la hace incómoda.
const VERDE_INST = 0x5d6b62;
const VERDE_ZOCALO = 0x2e3a35;

export class SalaIntrusiva {
  constructor(scene, base = new THREE.Vector3(26, 0, -4)) {
    this.scene = scene;
    this.base = base.clone();
    this.group = new THREE.Group();
    this.group.position.copy(base);
    scene.add(this.group);

    this.ancho = 7;
    this.fondo = 6;
    this.alto = 3.1;

    this.#sala();
    this.#arco();
    this.#mesa();
    this.#carrito();
    this.#letreros();
    this.#luz();
  }

  // ── Caja de la sala ─────────────────────────────────────────────────────
  #sala() {
    const { ancho, fondo, alto } = this;
    const pared = new THREE.MeshStandardMaterial({ color: VERDE_INST, roughness: 0.92 });
    const zocalo = new THREE.MeshStandardMaterial({ color: VERDE_ZOCALO, roughness: 0.75 });

    const suelo = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, fondo),
      colgarEntorno(new THREE.MeshStandardMaterial({
        map: this.#texSuelo(), roughness: 0.34, metalness: 0.08,
      }), this.scene, 0.9),
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(0, 0.02, 0);
    suelo.receiveShadow = true;
    this.group.add(suelo);

    const techo = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo),
      new THREE.MeshStandardMaterial({ color: 0xd6dcd8, roughness: 0.95 }));
    techo.rotation.x = Math.PI / 2;
    techo.position.y = alto;
    this.group.add(techo);

    // Cuatro paredes. La frontal se queda a media altura: sin ella la cámara
    // vería el hall al fondo, y con ella entera no se podría encuadrar nada.
    const muros = [
      { w: ancho, pos: [0, alto / 2, -fondo / 2], rot: 0 },
      { w: fondo, pos: [-ancho / 2, alto / 2, 0], rot: Math.PI / 2 },
      { w: fondo, pos: [ancho / 2, alto / 2, 0], rot: -Math.PI / 2 },
      { w: ancho, pos: [0, alto / 2, fondo / 2], rot: Math.PI },
    ];
    for (const m of muros) {
      const malla = new THREE.Mesh(new THREE.PlaneGeometry(m.w, alto), pared);
      malla.position.set(...m.pos);
      malla.rotation.y = m.rot;
      malla.receiveShadow = true;
      this.group.add(malla);
      // Zócalo de 90 cm: el detalle que hace que una caja parezca una sala.
      const z = new THREE.Mesh(new THREE.PlaneGeometry(m.w, 0.9), zocalo);
      z.position.set(m.pos[0], 0.45, m.pos[2]);
      z.rotation.y = m.rot;
      z.position.add(new THREE.Vector3(Math.sin(m.rot) * 0.004, 0, Math.cos(m.rot) * 0.004));
      this.group.add(z);
    }

    // Espejo de observación: el objeto que dice «alguien está mirando».
    const espejo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.1),
      // Metalness 0.95 convertía el espejo en un rectángulo blanco: con el
      // entorno PMREM de la terminal detrás, un metal pulido devuelve el hall
      // entero. Un espejo de observación se ve OSCURO desde el lado del sujeto.
      new THREE.MeshStandardMaterial({ color: 0x101a1a, roughness: 0.12, metalness: 0.55 }),
    );
    espejo.position.set(-ancho / 2 + 0.03, 1.75, -0.4);
    espejo.rotation.y = Math.PI / 2;
    this.group.add(espejo);
    const marco = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.22, 2.52),
      new THREE.MeshStandardMaterial({ color: 0x2a3330, roughness: 0.6 }));
    marco.position.set(-ancho / 2 + 0.05, 1.75, -0.4);
    this.group.add(marco);

    // Cámara de techo con LED: la sala se graba, y eso también es protocolo.
    const domo = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x14181a, roughness: 0.06, metalness: 0.35 }),
    );
    domo.rotation.x = Math.PI;
    domo.position.set(ancho / 2 - 0.7, alto - 0.12, -fondo / 2 + 0.7);
    this.group.add(domo);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.016),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    this.led.position.copy(domo.position).add(new THREE.Vector3(0.05, -0.06, 0.05));
    this.group.add(this.led);

    // Silla metálica: la que espera al viajero.
    const silla = new THREE.Group();
    const asiento = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.55, metalness: 0.4 }));
    asiento.position.y = 0.45;
    const respaldo = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.05),
      asiento.material);
    respaldo.position.set(0, 0.68, -0.18);
    silla.add(asiento, respaldo);
    for (const [sx, sz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) {
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.35, metalness: 0.9 }));
      pata.position.set(sx, 0.22, sz);
      silla.add(pata);
    }
    silla.position.set(-1.9, 0, 1.4);
    silla.rotation.y = 0.6;
    this.group.add(silla);
  }

  #texSuelo() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#9aa39c';
    g.fillRect(0, 0, 256, 256);
    // Vinílico moteado de institución: puntos grises y verdosos.
    for (let i = 0; i < 2600; i++) {
      const v = 120 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v + 6},${v},${0.25 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    t.colorSpace = THREE.SRGBColorSpace;
    this.suelotex = t;
    return t;
  }

  // ── El arco del escáner corporal ────────────────────────────────────────
  #arco() {
    const carcasa = new THREE.MeshStandardMaterial({ color: 0x9fa9ae, roughness: 0.45, metalness: 0.25 });
    this.arco = new THREE.Group();
    for (const sx of [-0.72, 0.72]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.25, 0.6), carcasa);
      panel.position.set(sx, 1.13, 0);
      panel.castShadow = true;
      this.arco.add(panel);
    }
    const dintel = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.3, 0.6), carcasa);
    dintel.position.set(0, 2.38, 0);
    this.arco.add(dintel);

    // Barra de luz que baja: el gesto que hace legible «esto está escaneando».
    this.barraScan = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.035, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x4fd0e0, transparent: true, opacity: 0.9 }),
    );
    this.barraScan.position.set(0, 2.1, 0.28);
    this.barraScan.visible = false;
    this.arco.add(this.barraScan);
    this.luzScan = new THREE.PointLight(0x4fd0e0, 0, 3, 2);
    this.luzScan.position.set(0, 1.4, 0.4);
    this.arco.add(this.luzScan);

    // Huellas de pie en el suelo: dónde se para la persona.
    const pies = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({ map: this.#texPies(), transparent: true, roughness: 0.8 }));
    pies.rotation.x = -Math.PI / 2;
    pies.position.set(0, 0.03, 0);
    this.arco.add(pies);

    this.arco.position.set(1.9, 0, -1.5);
    this.arco.rotation.y = -0.5;
    this.group.add(this.arco);
  }

  #texPies() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 96);
    g.fillStyle = 'rgba(224,149,42,0.85)';
    for (const x of [34, 82]) {
      g.beginPath();
      g.ellipse(x, 44, 13, 30, 0, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.piestex = t;
    return t;
  }

  // ── Mesa de revisión profunda ───────────────────────────────────────────
  #mesa() {
    const acero = colgarEntorno(
      new THREE.MeshStandardMaterial({ color: 0x9aa3ac, roughness: 0.3, metalness: 0.88 }),
      this.scene, 1.2,
    );
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 1.0), acero);
    top.position.set(-0.6, 0.85, 0.4);
    top.castShadow = top.receiveShadow = true;
    this.group.add(top);
    this.mesaTop = new THREE.Vector3(-0.6, 0.88, 0.4);

    for (const sx of [-1.5, 0.3]) {
      for (const sz of [0.0, 0.8]) {
        const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), acero);
        pata.position.set(sx, 0.42, sz);
        this.group.add(pata);
      }
    }

    // El bulto bajo análisis, ya abierto y vacío de ropa: solo la carcasa.
    const maleta = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x33404e, roughness: 0.32 }));
    cuerpo.castShadow = true;
    // La tapa cuelga de un PIVOTE en el borde trasero. Con la tapa suelta y una
    // rotación pequeña, la maleta se leía como una tabla azul: hay que verla
    // abierta de par en par para que se entienda que se está trabajando dentro.
    const bisagra = new THREE.Group();
    bisagra.position.set(0, 0.09, -0.36);
    const tapa = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.72), cuerpo.material);
    tapa.position.set(0, 0, -0.36);
    tapa.castShadow = true;
    bisagra.add(tapa);
    bisagra.rotation.x = -1.9;
    maleta.add(cuerpo, bisagra);
    maleta.position.copy(this.mesaTop).add(new THREE.Vector3(0, 0.12, 0.05));
    this.group.add(maleta);
    this.maleta = maleta;

    // Rejilla de puntos de hisopado sobre la maleta (se enciende en su fase).
    this.puntosSwab = [];
    const posiciones = [
      [0, 0.11, 0.3], [-0.2, 0.11, -0.1], [0.2, 0.11, -0.1],
      [-0.26, -0.02, 0.2], [0.26, -0.02, 0.2], [0, -0.06, -0.32],
    ];
    for (const p of posiciones) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xe0952a, transparent: true, opacity: 0 }),
      );
      m.position.set(...p);
      maleta.add(m);
      this.puntosSwab.push(m);
    }
  }

  // ── Carrito del espectrómetro de trazas ─────────────────────────────────
  #carrito() {
    const gris = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.55, metalness: 0.35 });
    const carro = new THREE.Group();
    const bandeja = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.55), gris);
    bandeja.position.y = 0.82;
    const baja = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.55), gris);
    baja.position.y = 0.28;
    carro.add(bandeja, baja);
    for (const [sx, sz] of [[-0.33, -0.22], [0.33, -0.22], [-0.33, 0.22], [0.33, 0.22]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.82),
        new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.3, metalness: 0.9 }));
      p.position.set(sx, 0.41, sz);
      carro.add(p);
    }

    // El equipo: caja beige de laboratorio con pantalla verde y puerto de hisopo.
    const equipo = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.6 }));
    equipo.position.y = 1.01;
    equipo.castShadow = true;
    carro.add(equipo);

    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    this.espCtx = c.getContext('2d');
    this.espTex = new THREE.CanvasTexture(c);
    this.espTex.colorSpace = THREE.SRGBColorSpace;
    this.pintarEspectro(null);
    const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2),
      new THREE.MeshStandardMaterial({
        map: this.espTex, emissiveMap: this.espTex, emissive: 0xffffff,
        emissiveIntensity: 1.0, color: 0x000000,
      }));
    pantalla.position.set(0, 1.05, 0.221);
    carro.add(pantalla);

    const puerto = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.5 }));
    puerto.position.set(0, 0.87, 0.2);
    carro.add(puerto);

    carro.position.set(-2.4, 0, 0.1);
    carro.rotation.y = 0.42;
    this.group.add(carro);
    this.carrito = carro;
  }

  /** Repinta la pantalla del espectrómetro. `picos` = [{x, alto, etiqueta}]. */
  pintarEspectro(picos) {
    const g = this.espCtx;
    g.fillStyle = '#050d0a';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(31,220,130,0.18)';
    g.lineWidth = 1;
    for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
    for (let y = 0; y <= 128; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.fillStyle = '#1fdc82';
    g.font = '10px monospace';
    g.fillText('IMS · TRAZAS', 6, 13);
    if (!picos) {
      g.fillText('EN ESPERA DE MUESTRA', 6, 70);
    } else {
      g.strokeStyle = '#1fdc82';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 118);
      for (let x = 0; x < 256; x++) {
        let y = 118 - Math.random() * 2;
        for (const p of picos) {
          const d = (x - p.x) / 7;
          y -= p.alto * Math.exp(-d * d);
        }
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#7cffb8';
      g.font = '9px monospace';
      for (const p of picos) if (p.etiqueta) g.fillText(p.etiqueta, Math.min(p.x - 10, 190), 118 - p.alto - 6);
    }
    this.espTex.needsUpdate = true;
  }

  // ── Letreros de pared ───────────────────────────────────────────────────
  #letreros() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#0e1a2c'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = '#c8a23c'; g.lineWidth = 4; g.strokeRect(10, 10, 492, 172);
    g.textAlign = 'center';
    g.fillStyle = '#e8c46a';
    g.font = 'bold 30px "Arial Black", sans-serif';
    g.fillText('DIRANDRO · PNP', 256, 58);
    g.fillStyle = '#cfd8e4';
    g.font = '16px monospace';
    g.fillText('DIRECCIÓN ANTIDROGAS', 256, 88);
    g.fillStyle = '#ff6a5c';
    g.font = 'bold 21px monospace';
    g.fillText('ÁREA RESTRINGIDA', 256, 126);
    g.fillStyle = '#93a2b3';
    g.font = '13px monospace';
    g.fillText('Toda revisión se registra en acta y video', 256, 156);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.letreroTex = tx;

    const l = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.79),
      new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 }));
    l.position.set(0.4, 2.05, -this.fondo / 2 + 0.02);
    this.group.add(l);
  }

  // ── Luz clínica: plana, fría, sin gracia ────────────────────────────────
  #luz() {
    for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.55),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef6ff, emissiveIntensity: 1.35 }));
      panel.position.set(x, this.alto - 0.04, z);
      this.group.add(panel);
    }
    this.ambiente = new THREE.PointLight(0xdfeaf5, 4.2, 9, 1.6);
    this.ambiente.position.set(0, this.alto - 0.4, 0);
    this.group.add(this.ambiente);

    this.focoMesa = new THREE.SpotLight(0xffffff, 11, 5, Math.PI / 5.5, 0.5, 1.6);
    this.focoMesa.position.set(-0.6, this.alto - 0.2, 0.4);
    this.focoMesa.target.position.set(-0.6, 0.85, 0.4);
    this.group.add(this.focoMesa, this.focoMesa.target);
  }

  // ── Animaciones de fase ─────────────────────────────────────────────────
  /** Enciende la barra del arco y la hace bajar en bucle. */
  escanearArco(on) {
    this.barraScan.visible = on;
    gsap.killTweensOf(this.barraScan.position);
    gsap.killTweensOf(this.luzScan);
    if (!on) { this.luzScan.intensity = 0; return; }
    this.luzScan.intensity = 2.5;
    gsap.fromTo(this.barraScan.position, { y: 2.1 }, {
      y: 0.15, duration: 2.4, ease: 'none', repeat: -1,
      onUpdate: () => { this.luzScan.position.y = this.barraScan.position.y; },
    });
  }

  /** Enciende los puntos de hisopado sobre la maleta. */
  mostrarPuntosSwab(on) {
    this.puntosSwab.forEach((m, i) => {
      gsap.to(m.material, { opacity: on ? 0.9 : 0, duration: 0.35, delay: on ? i * 0.06 : 0 });
    });
  }

  /** Marca un punto como ya hisopado (verde) o positivo (rojo). */
  marcarSwab(i, positivo) {
    const m = this.puntosSwab[i];
    if (!m) return;
    m.material.color.setHex(positivo ? 0xe04a3c : 0x3fc47f);
    gsap.fromTo(m.scale, { x: 2.2, y: 2.2, z: 2.2 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.5)' });
  }

  /** El compartimento oculto aparece bajo el forro. */
  revelarCompartimento() {
    const geo = new THREE.BoxGeometry(0.44, 0.05, 0.6);
    const bloque = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0xb8ad8a, roughness: 0.85, emissive: 0x2a1f10, emissiveIntensity: 0.4,
    }));
    bloque.position.set(0, -0.02, 0.02);
    bloque.scale.setScalar(0.001);
    this.maleta.add(bloque);
    gsap.to(bloque.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(2)' });
    return bloque;
  }

  // ── Cámaras ─────────────────────────────────────────────────────────────
  get vistaGeneral() {
    return {
      pos: [this.base.x + 0.1, 2.0, this.base.z + 3.6],
      look: [this.base.x - 0.1, 1.15, this.base.z - 0.6],
      fov: 52, focus: 4.0, aperture: 0.00018,
    };
  }

  get vistaArco() {
    // Retirada: a 3 m el arco llenaba el cuadro y no se leía ni la sala ni las
    // huellas del suelo. Desde aquí entra el arco entero con contexto detrás.
    return {
      pos: [this.base.x - 0.45, 1.9, this.base.z + 2.7],
      look: [this.base.x + 1.75, 1.28, this.base.z - 1.35],
      fov: 46, focus: 4.4, aperture: 0.0002,
    };
  }

  // Los dos encuadres de trabajo estaban a metro y medio del objeto: la maleta
  // llenaba el cuadro como una tabla y el espectrómetro tapaba la sala entera.
  // A ~2,5 m se ve el aparato COMPLETO y con el cuarto detrás, que es lo que
  // sostiene la incomodidad de estar aquí dentro.
  get vistaMesa() {
    return {
      pos: [this.base.x - 0.35, 1.95, this.base.z + 2.5],
      look: [this.base.x - 0.6, 0.98, this.base.z + 0.35],
      fov: 42, focus: 2.4, aperture: 0.0003,
    };
  }

  get vistaCarrito() {
    return {
      pos: [this.base.x - 0.95, 1.78, this.base.z + 2.15],
      look: [this.base.x - 2.3, 1.0, this.base.z + 0.1],
      fov: 42, focus: 2.6, aperture: 0.0003,
    };
  }

  update(dt, t) {
    // El LED de la cámara late despacio: la sala está grabando siempre.
    this.led.material.color.setRGB(0.55 + Math.sin(t * 2.2) * 0.45, 0.1, 0.1);
  }

  dispose() {
    gsap.killTweensOf(this.barraScan.position);
    disposeObject(this.group, true);
    this.scene.remove(this.group);
    this.espTex?.dispose();
    this.letreroTex?.dispose();
    this.suelotex?.dispose();
    this.piestex?.dispose();
  }
}
