import * as THREE from 'three';
import gsap from 'gsap';
import { colgarEntorno } from '../render/Entorno.js';
import { disposeObject } from '../core/Disposal.js';

/**
 * ModuloInspeccion — el **Módulo de Inspección Secundaria** del canal rojo
 * (`02 - Diseño/12 - Canal Rojo y Sala Intrusiva.md`), construido dentro de la
 * misma terminal del Nivel 1 para que el traslado sea un movimiento de cámara y
 * no una carga de nivel: el jugador ve cómo lo llevan al canal rojo.
 *
 * Qué hay, y por qué está: franja roja pintada en el suelo y semáforo aduanero
 * (los dos íconos que cualquiera reconoce del aeropuerto), mesa de acero larga
 * con estante inferior, balanza digital con display vivo (la que convierte
 * «pesa raro» en un número), mampara con vinilo institucional y un cartel
 * colgante retroiluminado. La luz es dura y cenital: aquí no se dramatiza, se
 * inspecciona.
 *
 * El escalón siguiente —la sala de DIRANDRO— NO reutiliza este decorado: vive
 * en `world/SalaIntrusiva.js` con sus propias paredes y su propia luz. El canal
 * rojo es público y comercial; la sala intrusiva es un cuarto cerrado. Ese
 * contraste es la mitad de lo que el nivel quiere contar, y no sobrevive a un
 * decorado compartido.
 */

const ACERO = { color: 0x9aa3ac, roughness: 0.28, metalness: 0.9 };

export class ModuloInspeccion {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} base  esquina de referencia del módulo en el mundo
   */
  constructor(scene, base = new THREE.Vector3(9.2, 0, -4.2)) {
    this.scene = scene;
    this.base = base.clone();
    this.group = new THREE.Group();
    this.group.position.copy(base);
    scene.add(this.group);

    this.bultos = [];      // [{ id, group, tapa, datos, posMundo }]
    this.t = 0;

    this.#suelo();
    this.#mesa();
    this.#mampara();
    this.#cartel();
    this.#semaforo();
    this.#balanza();
    this.#props();
    this.#luz();
  }

  // ── Suelo del canal: la franja roja que todo el mundo reconoce ───────────
  #suelo() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#8d949c';
    g.fillRect(0, 0, 1024, 512);
    // La franja se pinta en una banda muy concreta del canvas, y no por gusto.
    // El plano se tumba con `rotation.x = -π/2`, de modo que la fila 0 del
    // canvas cae al FONDO de la sala y las filas altas quedan a los pies de la
    // cámara — fuera del encuadre. Estas filas (≈150–250) son la única franja
    // que aterriza JUSTO delante de la mesa, que es donde el rótulo se lee.
    g.fillStyle = '#ffffff'; g.fillRect(0, 142, 1024, 9);
    g.fillStyle = '#8e1f24'; g.fillRect(0, 151, 1024, 98);
    g.fillStyle = '#ffffff'; g.fillRect(0, 249, 1024, 9);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 56px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('CANAL ROJO', 512, 219);
    g.font = 'bold 20px monospace';
    g.fillStyle = 'rgba(48,52,58,0.45)';
    g.fillText('INSPECCIÓN  SECUNDARIA  ·  SUNAT  ·  ADUANAS', 512, 300);
    // Desgaste: manchas y ralladuras de ruedas.
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
      g.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 90, 1 + Math.random() * 3);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.pisoTex = tx;

    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.MeshStandardMaterial({ map: tx, roughness: 0.35, metalness: 0.1 }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(0, 0.012, 1.1); // ligeramente sobre el suelo: evita z-fighting
    piso.receiveShadow = true;
    this.group.add(piso);
  }

  // ── La mesa de acero ────────────────────────────────────────────────────
  #mesa() {
    const acero = colgarEntorno(new THREE.MeshStandardMaterial(ACERO), this.scene, 1.4);
    this.aceroMat = acero;

    // Tablero: 3,6 × 0,95 a 0,85 m. El borde levantado es real: impide que algo
    // ruede al suelo durante el aforo.
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.95), acero);
    top.position.set(0, 0.85, -0.55);
    top.castShadow = top.receiveShadow = true;
    this.group.add(top);
    this.mesaTopY = 0.88;
    this.mesaZ = -0.55;

    for (const sx of [-1.72, 1.72]) {
      const borde = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.95), acero);
      borde.position.set(sx, 0.9, -0.55);
      this.group.add(borde);
    }
    const bordeAtras = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.04), acero);
    bordeAtras.position.set(0, 0.91, -1.01);
    this.group.add(bordeAtras);

    // Patas + estante inferior con bandejas.
    for (const sx of [-1.6, 1.6]) {
      for (const sz of [-0.2, -0.9]) {
        const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), acero);
        pata.position.set(sx, 0.42, sz);
        pata.castShadow = true;
        this.group.add(pata);
      }
    }
    const estante = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.8), acero);
    estante.position.set(0, 0.2, -0.55);
    this.group.add(estante);
  }

  // ── Mampara trasera con vinilo institucional ────────────────────────────
  #mampara() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#16202c');
    grad.addColorStop(1, '#0d151f');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(224,149,42,0.35)'; g.lineWidth = 3;
    g.strokeRect(18, 18, 476, 220);
    g.fillStyle = '#e0952a';
    g.font = 'bold 34px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('SUNAT', 256, 92);
    g.fillStyle = '#8fa0b4';
    g.font = '17px monospace';
    g.fillText('SUPERINTENDENCIA NACIONAL DE ADUANAS', 256, 126);
    g.fillText('MÓDULO DE INSPECCIÓN SECUNDARIA', 256, 154);
    g.fillStyle = '#5c6a7c';
    g.font = '13px monospace';
    g.fillText('La revisión se realiza en presencia del viajero', 256, 194);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.viniloTex = tx;

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.5, 0.06),
      new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6, metalness: 0.15 }),
    );
    panel.position.set(0, 1.55, -1.25);
    this.group.add(panel);

    // Vidrio esmerilado por encima: se adivinan siluetas de la fila que espera.
    const vidrio = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xbcd4e6, transparent: true, opacity: 0.13, roughness: 0.35, metalness: 0.3 }),
    );
    vidrio.position.set(0, 2.85, -1.25);
    this.group.add(vidrio);

    for (const sx of [-2.1, 2.1]) {
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.35, metalness: 0.85 }));
      poste.position.set(sx, 1.7, -1.25);
      this.group.add(poste);
    }
  }

  // ── Cartel colgante retroiluminado ──────────────────────────────────────
  #cartel() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#8e1a1f'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ffffff';
    g.font = 'bold 46px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('CANAL ROJO', 256, 58);
    g.font = 'bold 20px monospace';
    g.fillText('BIENES A DECLARAR  ·  GOODS TO DECLARE', 256, 96);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.cartelTex = tx;

    this.cartel = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.65, 0.08),
      new THREE.MeshStandardMaterial({
        map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x000000,
      }),
    );
    this.cartel.position.set(0, 2.62, -0.15);
    this.group.add(this.cartel);
    for (const sx of [-0.9, 0.9]) {
      const tirante = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95),
        new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.3, metalness: 0.9 }));
      tirante.position.set(sx, 3.42, -0.15);
      this.group.add(tirante);
    }
  }

  // ── Semáforo aduanero: el objeto más didáctico del módulo ───────────────
  #semaforo() {
    const caja = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.62, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x1b222c, roughness: 0.7 }));
    caja.position.set(-2.35, 1.55, -1.0);
    this.group.add(caja);

    // Los cristales apagados son OSCUROS, no del color de la luz. Un semáforo
    // con las dos lámparas de color a la vez no comunica nada: aquí el estado se
    // lee por la emisión, y por eso el material base es casi negro.
    const mk = (color, y) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color).multiplyScalar(0.16),
          emissive: color, emissiveIntensity: 0.04, roughness: 0.35,
        }));
      m.position.set(-2.35, y, -0.89);
      this.group.add(m);
      return m;
    };
    this.luzVerde = mk(0x2fbf6a, 1.72);
    this.luzRoja = mk(0xd0342c, 1.4);
    // En el canal rojo, la roja manda: encendida y latiendo.
    this.luzRoja.material.emissiveIntensity = 2.4;
    this.faroRojo = new THREE.PointLight(0xff3a2a, 2.4, 3.2, 2);
    this.faroRojo.position.set(-2.35, 1.4, -0.7);
    this.group.add(this.faroRojo);

    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.25, 10),
      new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.4, metalness: 0.8 }));
    poste.position.set(-2.35, 0.62, -1.0);
    this.group.add(poste);
  }

  // ── Balanza digital: convierte "pesa raro" en un número ─────────────────
  #balanza() {
    const plato = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.62),
      colgarEntorno(new THREE.MeshStandardMaterial({ color: 0xb4bcc4, roughness: 0.2, metalness: 0.95 }), this.scene, 1.5));
    plato.position.set(1.42, 0.92, -0.55);
    plato.receiveShadow = true;
    this.group.add(plato);
    this.balanzaPos = new THREE.Vector3(1.42, 0.94, -0.55);

    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    this.balanzaCtx = c.getContext('2d');
    this.balanzaTex = new THREE.CanvasTexture(c);
    this.balanzaTex.colorSpace = THREE.SRGBColorSpace;
    this.pintarBalanza(null);

    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshStandardMaterial({
        map: this.balanzaTex, emissiveMap: this.balanzaTex, emissive: 0xffffff,
        emissiveIntensity: 1.0, color: 0x000000,
      }));
    display.position.set(1.42, 1.06, -0.95);
    display.rotation.x = -0.42;
    this.group.add(display);
    const soporte = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x22282f, roughness: 0.7 }));
    soporte.position.set(1.42, 1.05, -0.97);
    soporte.rotation.x = -0.42;
    this.group.add(soporte);
  }

  /** Repinta el display de la balanza. `null` = en espera. */
  pintarBalanza(kg, { etiqueta = '' } = {}) {
    const g = this.balanzaCtx;
    g.fillStyle = '#04140c';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1fdc82';
    g.font = '12px monospace';
    g.fillText('BALANZA · SUNAT', 10, 20);
    g.font = 'bold 46px monospace';
    g.textAlign = 'right';
    g.fillText(kg == null ? '--.-' : kg.toFixed(1), 196, 76);
    g.font = '20px monospace';
    g.fillText('kg', 240, 76);
    g.textAlign = 'left';
    g.font = '12px monospace';
    g.fillStyle = '#0d8a52';
    g.fillText(etiqueta.slice(0, 30), 10, 108);
    for (let y = 0; y < 128; y += 3) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 256, 1); }
    this.balanzaTex.needsUpdate = true;
  }

  // ── Utillaje sobre la mesa ──────────────────────────────────────────────
  #props() {
    // Bandeja de decomiso.
    const bandeja = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.75 }));
    bandeja.position.set(-1.42, 0.91, -0.55);
    this.group.add(bandeja);

    // Caja de guantes de nitrilo.
    const guantes = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x2f6ea8, roughness: 0.85 }));
    guantes.position.set(-1.42, 0.95, -0.92);
    this.group.add(guantes);

    // Linterna de inspección.
    const linterna = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.6 }));
    linterna.rotation.z = Math.PI / 2;
    linterna.position.set(-0.95, 0.91, -0.9);
    this.group.add(linterna);
  }

  // ── Luz de trabajo: dura, cenital, sin romanticismo ─────────────────────
  #luz() {
    // 42 dejaba el suelo del módulo quemado en blanco: el hall ya aporta su
    // ambiente y sus fluorescentes, así que el foco solo tiene que MARCAR la
    // mesa, no iluminar la sala entera.
    this.foco = new THREE.SpotLight(0xf2f7ff, 22, 7, Math.PI / 5, 0.55, 1.6);
    this.foco.position.set(0, 3.2, -0.35);
    this.foco.target.position.set(0, 0.85, -0.6);
    this.group.add(this.foco, this.foco.target);

    // Regleta emisiva que justifica el foco (barato: nada de RectAreaLight, el
    // presupuesto del nivel ya está gastado en los fluorescentes del hall).
    const regleta = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf3ff, emissiveIntensity: 2.6 }));
    regleta.position.set(0, 3.22, -0.35);
    this.group.add(regleta);
    this.regleta = regleta;
  }

  // ── Los bultos ──────────────────────────────────────────────────────────
  /**
   * Monta el set de bultos sobre la mesa. Los tamaños son los reales del
   * catálogo: la silueta de la fila ES información de juego.
   */
  montarBultos(operativo) {
    this.limpiarBultos();
    const n = operativo.bultos.length;
    const ancho = 3.15;
    const paso = ancho / n;
    const x0 = -ancho / 2 + paso / 2;

    operativo.bultos.forEach((datos, i) => {
      const [w, h, d] = datos.dims;
      const g = new THREE.Group();
      // Las maletas van de pie (como en la mesa real); los bultos blandos y las
      // cajas, tumbados.
      const dePie = datos.tipo === 'rigida' || datos.clave === 'mochila';
      const alto = dePie ? h : d;
      g.position.set(x0 + i * paso, this.mesaTopY + alto / 2 + 0.01, this.mesaZ - 0.02);
      g.rotation.y = (Math.random() - 0.5) * 0.28;

      const cuerpoMat = this.#materialBulto(datos);
      let cuerpo;
      if (datos.tipo === 'bolsa') {
        cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 11), cuerpoMat);
        cuerpo.scale.set(w, d * 0.95, h * 0.85);
      } else {
        cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, dePie ? h : d, dePie ? d : h), cuerpoMat);
      }
      cuerpo.castShadow = cuerpo.receiveShadow = true;
      g.add(cuerpo);

      // Detalles que dan lectura de tipo a un vistazo.
      if (datos.tipo === 'rigida') {
        // Estrías de policarbonato + cremallera perimetral + asa telescópica.
        for (let k = -2; k <= 2; k++) {
          const estria = new THREE.Mesh(new THREE.BoxGeometry(0.012, (dePie ? h : d) * 0.94, 0.004),
            new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.22, roughness: 1 }));
          estria.position.set(k * (w / 6), 0, (dePie ? d : h) / 2 + 0.002);
          g.add(estria);
        }
        const crem = new THREE.Mesh(new THREE.BoxGeometry(w * 1.005, 0.018, (dePie ? d : h) * 1.005),
          new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.6 }));
        crem.position.y = (dePie ? h : d) * 0.12;
        g.add(crem);
        if (dePie) {
          const asa = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.05, 0.035),
            new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.55 }));
          asa.position.set(0, h / 2 + 0.03, 0);
          g.add(asa);
          for (const sx of [-1, 1]) {
            const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 10),
              new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 0.7 }));
            rueda.rotation.z = Math.PI / 2;
            rueda.position.set(sx * (w / 2 - 0.05), -h / 2 - 0.02, d / 2 - 0.05);
            g.add(rueda);
          }
        }
      } else if (datos.tipo === 'caja') {
        // Precinto en cruz.
        const cinta = new THREE.MeshStandardMaterial({ color: 0xb99a5e, roughness: 0.9 });
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.004, 0.07), cinta);
        c1.position.y = d / 2 + 0.001;
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, h * 1.01), cinta);
        c2.position.y = d / 2 + 0.001;
        g.add(c1, c2);
      } else if (datos.tipo === 'bolsa') {
        // Pita cruzada.
        const pita = new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 1 });
        for (const rot of [0, Math.PI / 2]) {
          const aro = new THREE.Mesh(new THREE.TorusGeometry(w * 0.52, 0.008, 6, 20), pita);
          aro.rotation.set(Math.PI / 2, 0, 0);
          aro.rotateY(rot);
          g.add(aro);
        }
      } else {
        // Blanda: correas y bolsillo frontal.
        const correa = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, (dePie ? h : d) * 1.02, 0.012),
          new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.85 }));
        correa.position.z = (dePie ? d : h) / 2 + 0.004;
        g.add(correa);
      }

      // Etiqueta de facturación colgando: es donde vive el código de vuelo.
      const et = this.#etiquetaEquipaje(datos);
      et.position.set(w / 2 - 0.02, (dePie ? h : d) / 2 - 0.09, (dePie ? d : h) / 2 + 0.01);
      g.add(et);

      // Aro de selección (invisible hasta que el jugador apunta).
      const aro = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(w, d) * 0.62, Math.max(w, d) * 0.62 + 0.035, 32),
        new THREE.MeshBasicMaterial({ color: 0xe0952a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      );
      aro.rotation.x = -Math.PI / 2;
      aro.position.y = -alto / 2 + 0.012;
      g.add(aro);

      // Hitbox generosa: en móvil el dedo no tiene puntería de ratón (ADR-008).
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(w, 0.3) * 1.35, alto * 1.2, Math.max(d, h, 0.3) * 1.35),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.userData.bultoId = datos.id;
      g.add(hit);

      this.group.add(g);
      const posMundo = new THREE.Vector3().copy(g.position).add(this.base);
      this.bultos.push({ id: datos.id, datos, group: g, cuerpo, aro, hit, posMundo, alto, abierto: false });

      // Entrada escalonada: los bultos "caen" sobre la mesa uno tras otro.
      g.scale.setScalar(0.001);
      gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay: 0.12 * i, ease: 'back.out(1.8)' });
    });
    return this.bultos;
  }

  #materialBulto(datos) {
    const acabados = {
      rigida: { roughness: 0.28, realce: 1.3 },
      blanda: { roughness: 0.78, realce: 1.0 },
      caja: { roughness: 0.95, realce: 0 },
      bolsa: { roughness: 0.9, realce: 0 },
    };
    const a = acabados[datos.tipo] ?? acabados.blanda;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(datos.color).offsetHSL(0, 0.12, 0.04),
      roughness: a.roughness,
      metalness: 0,
    });
    return a.realce ? colgarEntorno(mat, this.scene, a.realce) : mat;
  }

  #etiquetaEquipaje(datos) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f2ede0'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#1a1a1a';
    g.font = 'bold 15px monospace';
    g.fillText(datos.codigo, 8, 22);
    g.font = '10px monospace';
    g.fillStyle = '#555';
    g.fillText('LIM · SUNAT', 8, 40);
    // Código de barras.
    for (let i = 0; i < 34; i++) {
      g.fillStyle = '#111';
      if (Math.random() > 0.4) g.fillRect(8 + i * 3.4, 46, 1 + Math.random() * 2, 12);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055),
      new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85, side: THREE.DoubleSide }));
    m.rotation.z = 0.12;
    return m;
  }

  /** Raycast: devuelve el id del bulto apuntado, o null. */
  hitTest(raycaster) {
    const hits = raycaster.intersectObjects(this.bultos.map((b) => b.hit), false);
    return hits.length ? hits[0].object.userData.bultoId : null;
  }

  /** Aro de selección encendido/apagado. */
  resaltar(id, on = true) {
    const b = this.bultos.find((x) => x.id === id);
    if (!b) return;
    gsap.to(b.aro.material, { opacity: on ? 0.85 : 0, duration: 0.22, overwrite: 'auto' });
  }

  /** Apaga todos los aros. */
  apagarResaltes() {
    for (const b of this.bultos) gsap.to(b.aro.material, { opacity: 0, duration: 0.22, overwrite: 'auto' });
  }

  /** Levanta el bulto y lo posa en la balanza; devuelve el peso a mostrar. */
  pesar(id) {
    const b = this.bultos.find((x) => x.id === id);
    if (!b) return null;
    const destino = { x: this.balanzaPos.x, y: this.balanzaPos.y + b.alto / 2 + 0.02, z: this.balanzaPos.z };
    if (!b.group.userData.origen) {
      b.group.userData.origen = { x: b.group.position.x, y: b.group.position.y, z: b.group.position.z };
    }
    const origen = b.group.userData.origen;
    const tl = gsap.timeline();
    tl.to(b.group.position, { y: origen.y + 0.28, duration: 0.34, ease: 'power2.out' });
    tl.to(b.group.position, { x: destino.x, z: destino.z, duration: 0.5, ease: 'power2.inOut' });
    tl.to(b.group.position, { y: destino.y, duration: 0.3, ease: 'bounce.out' });
    tl.to({}, { duration: 1.5 });
    tl.to(b.group.position, { y: destino.y + 0.28, duration: 0.3, ease: 'power2.out' });
    tl.to(b.group.position, { x: origen.x, z: origen.z, duration: 0.5, ease: 'power2.inOut' });
    tl.to(b.group.position, { y: origen.y, duration: 0.3, ease: 'bounce.out' });
    return b.datos.pesoReal;
  }

  /**
   * LA APERTURA. Una sola por operativo: la tapa se abre, sale una nube de polvo
   * y el contenido queda a la vista. El bulto se queda abierto para siempre —
   * es la marca visual de que ya gastaste tu única carta.
   */
  abrir(id, { hallazgo = false } = {}) {
    const b = this.bultos.find((x) => x.id === id);
    if (!b || b.abierto) return Promise.resolve();
    b.abierto = true;

    return new Promise((resolve) => {
      const [w, h, d] = b.datos.dims;
      const dePie = b.datos.tipo === 'rigida' || b.datos.clave === 'mochila';
      const tl = gsap.timeline({ onComplete: resolve });

      // 1) Se tumba sobre la mesa (nadie abre una maleta de pie).
      if (dePie) {
        tl.to(b.group.rotation, { x: -Math.PI / 2, duration: 0.55, ease: 'power2.inOut' });
        tl.to(b.group.position, { y: this.mesaTopY + d / 2 + 0.01, duration: 0.55, ease: 'power2.in' }, '<');
      }

      // 2) La tapa: se corta el cuerpo en dos y la mitad superior gira.
      tl.call(() => {
        const alturaCuerpo = dePie ? h : d;
        b.cuerpo.scale.y = 0.5;
        b.cuerpo.position.y = -alturaCuerpo * 0.25;
        const tapa = new THREE.Mesh(b.cuerpo.geometry, b.cuerpo.material);
        tapa.scale.y = 0.5;
        tapa.position.y = alturaCuerpo * 0.25;
        const pivote = new THREE.Group();
        pivote.position.set(0, 0, -(dePie ? d : h) / 2);
        tapa.position.z = (dePie ? d : h) / 2;
        pivote.add(tapa);
        b.group.add(pivote);
        b.pivoteTapa = pivote;
        gsap.to(pivote.rotation, { x: -2.0, duration: 0.85, ease: 'power2.out' });

        // 3) El interior: relleno gris y, si hay hallazgo, el bulto delator.
        const interior = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.9, alturaCuerpo * 0.42, (dePie ? d : h) * 0.9),
          new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.95 }),
        );
        interior.position.y = -alturaCuerpo * 0.2;
        b.group.add(interior);

        if (hallazgo) {
          const fajos = new THREE.Group();
          for (let i = 0; i < 9; i++) {
            const fajo = new THREE.Mesh(
              new THREE.BoxGeometry(0.13, 0.035, 0.065),
              new THREE.MeshStandardMaterial({ color: 0x9fae7a, roughness: 0.85 }),
            );
            fajo.position.set(
              (i % 3 - 1) * 0.145 + (Math.random() - 0.5) * 0.02,
              -alturaCuerpo * 0.06 + Math.floor(i / 3) * 0.038,
              (Math.random() - 0.5) * 0.12,
            );
            fajo.rotation.y = (Math.random() - 0.5) * 0.35;
            fajos.add(fajo);
          }
          fajos.scale.setScalar(0.001);
          b.group.add(fajos);
          gsap.to(fajos.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay: 0.5, ease: 'back.out(2)' });
          b.hallazgoMesh = fajos;
        }
      });
      tl.to({}, { duration: 1.1 });
    });
  }

  /** Semáforo: pasa a verde (operativo cerrado sin novedad). */
  semaforoVerde() {
    gsap.to(this.luzRoja.material, { emissiveIntensity: 0.08, duration: 0.6 });
    gsap.to(this.faroRojo, { intensity: 0, duration: 0.6 });
    gsap.to(this.luzVerde.material, { emissiveIntensity: 2.4, duration: 0.6 });
  }

  limpiarBultos() {
    for (const b of this.bultos) {
      gsap.killTweensOf(b.group.position);
      gsap.killTweensOf(b.group.rotation);
      gsap.killTweensOf(b.group.scale);
      disposeObject(b.group, true);
      this.group.remove(b.group);
    }
    this.bultos = [];
  }

  /** Cámara: plano general del módulo. */
  get vistaGeneral() {
    return {
      pos: [this.base.x, 2.42, this.base.z + 4.5],
      look: [this.base.x, 1.12, this.base.z - 0.55],
      fov: 46, focus: 5.0, aperture: 0.00016,
    };
  }

  /** Cámara: primer plano de un bulto concreto. */
  vistaBulto(id) {
    const b = this.bultos.find((x) => x.id === id);
    if (!b) return this.vistaGeneral;
    const p = new THREE.Vector3().copy(b.group.position).add(this.base);
    // A un metro, un maletón de 32" tapaba la pantalla entera y dejaba al
    // jugador sin poder tocar la maleta de al lado. Este plano medio deja el
    // bulto grande y legible pero conserva a sus vecinas al alcance del dedo.
    return {
      pos: [p.x + 0.2, p.y + 0.52, p.z + 1.95],
      look: [p.x, p.y - 0.04, p.z],
      fov: 36, focus: 2.0, aperture: 0.0004,
    };
  }

  update(dt, t) {
    this.t = t;
    // El semáforo rojo late: es lo primero que ve el pasajero al entrar aquí.
    if (this.faroRojo.intensity > 0.05) {
      const pulso = 0.72 + Math.sin(t * 2.6) * 0.28;
      this.faroRojo.intensity = 2.4 * pulso;
      this.luzRoja.material.emissiveIntensity = 2.4 * pulso;
    }
    // Zumbido de la regleta.
    this.regleta.material.emissiveIntensity = 2.6 * (0.97 + Math.sin(t * 13) * 0.03);
  }

  dispose() {
    this.limpiarBultos();
    disposeObject(this.group, true);
    this.scene.remove(this.group);
    this.pisoTex?.dispose();
    this.viniloTex?.dispose();
    this.cartelTex?.dispose();
    this.balanzaTex?.dispose();
  }
}
