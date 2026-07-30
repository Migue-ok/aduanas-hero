import * as THREE from 'three';
import gsap from 'gsap';
import { makeGooglyEyes } from './GooglyEyes.js';
import { colgarEntorno } from '../render/Entorno.js';
import { disposeObject } from '../core/Disposal.js';

/**
 * Acabado PBR del equipaje, por tipo. Una carcasa de policarbonato y unas
 * bolsas de rafia atadas con pita no devuelven la misma luz, y hasta ahora
 * compartían un único material a `roughness: 0.55` — el peor punto medio
 * posible: demasiado mate para que la maleta dura brille y demasiado pulido
 * para que la lona se lea como lona.
 *
 * **`metalness` se queda en 0 SIEMPRE.** Subirla es el atajo fácil para tener
 * reflejo y es justo lo que convierte una maleta en un espejo cromado: el
 * brillo de un dieléctrico sale de bajar la rugosidad, no de fingir que la
 * maleta es de metal.
 *
 * `realce` son las veces que el equipaje refleja por encima del ambiente del
 * nivel; `realce: 0` significa "sin reflejo propio, el ambiente y punto".
 * La razón de expresarlo así (y no como un `envMapIntensity` a pelo) está
 * explicada en `render/Entorno.js`: sin `envMap` propio, ese número no hace
 * absolutamente nada.
 */
const ACABADO_EQUIPAJE = {
  // Policarbonato/ABS moldeado: la superficie más pulida que pisa el puesto.
  // Es la única que se gana un reflejo nítido de los fluorescentes.
  maletas_rigidas: { roughness: 0.26, realce: 1.35 },
  // Cuero curtido de maletín de oficina: reflejo ancho y sucio, nunca espejo.
  maletin: { roughness: 0.46, realce: 1.35 },
  // Nylon balístico: teje, no refleja. Apenas un lustre en las costuras.
  mochila: { roughness: 0.74, realce: 1.1 },
  // Rafia y plástico fino, arrugados: mate. Y conviene que lo sean — es el
  // equipaje más claro del set (0xcfcabb) y el único candidato real a cruzar
  // el umbral de bloom si se le da brillo.
  bolsas: { roughness: 0.88, realce: 0 },
  // Cartón: el material más muerto del mostrador.
  caja: { roughness: 0.95, realce: 0 },
};

/**
 * PassengerActor — el pasajero frente al puesto no es un sprite: es un cuerpo
 * que respira, parpadea, cambia el peso, se toca el cuello y suda cuando el
 * estrés sube. Los medidores internos JAMÁS se muestran (regla 6 del
 * interrogatorio): el cuerpo es la única interfaz.
 *
 * Zonas de tell tocables: ojos · manos · boca/garganta · postura.
 */
export class PassengerActor {
  constructor(scene, perfil) {
    this.perfil = perfil;
    this.scene = scene; // el equipaje necesita el entorno PBR de la terminal
    this.group = new THREE.Group();
    scene.add(this.group);

    this.stress = perfil.lineaBase ?? 25; // el NaN aquí vuelve invisible al actor: jamás sin fallback
    this.tiembla = false;
    this.mirandoSalida = false;
    // Lo que vive FUERA del grupo del pasajero y por tanto no lo alcanza el
    // barrido de `dispose`: las lágrimas (hijas de la escena, tienen que caer al
    // suelo aunque el actor ya no esté) y los temporizadores que las siembran.
    this._gotas = new Set();
    this._olas = [];

    this.#buildBody(perfil);
    this.#buildLuggage(perfil);
    this.#buildHotspots();

    // Entra RODEANDO la fila por su derecha (el carril de "siguiente, por favor"):
    // nunca atraviesa a los que esperan (la fila ocupa x ≈ ±0.4).
    this.group.position.set(1.9, 0, -5.5);
    this.group.visible = true;
    const tlEntrada = gsap.timeline();
    tlEntrada.to(this.group.position, { x: 1.6, z: -2.6, duration: 1.4, ease: 'power1.inOut' });
    tlEntrada.to(this.group.position, { x: 0, z: -1.6, duration: 1.3, ease: 'power2.out' });
    // La marcha mira hacia donde camina y termina de frente al oficial.
    this.group.rotation.y = 0.5;
    tlEntrada.to(this.group.rotation, { y: -0.6, duration: 1.2, ease: 'power1.inOut' }, 0);
    tlEntrada.to(this.group.rotation, { y: 0, duration: 0.9, ease: 'power2.out' }, '>-0.6');

    this.blinkTimer = 1 + Math.random() * 3;
    this.fidgetTimer = 2 + Math.random() * 3;
    this.phase = Math.random() * 10;
  }

  #buildBody(perfil) {
    // Cartoon (ADR-004): el vestuario de los casos se satura y aclara — mismos
    // personajes del Vault, piel nueva.
    const colorVivo = new THREE.Color(perfil.colorRopa).offsetHSL(0, 0.24, 0.06);
    const ropa = new THREE.MeshStandardMaterial({ color: colorVivo, roughness: 0.8 });

    // Camisa estampada (ADR-005 / dirección de arte): si el perfil pide un patrón,
    // el color plano se cambia por una CanvasTexture procedural. CASO-101: hawaiana
    // (azul brillante + flores amarillas), emulando el modelo "Hawai" descartado.
    if (perfil.patronCamisa === 'hawaiana') {
      ropa.map = this.#makeHawaiianTexture(perfil.colorRopa);
      ropa.color.set(0xffffff); // el color base ya vive en la textura: no la tiñas
      ropa.roughness = 0.72;
    }
    const piel = new THREE.MeshStandardMaterial({ color: perfil.colorPiel, roughness: 0.55 });

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.66, 6, 14), ropa);
    this.body.position.y = 0.92;
    this.body.castShadow = true;

    this.head = new THREE.Group();
    // Cabeza cartoon: GRANDE (proporción bean-shaped de la referencia, ADR-004).
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18), piel);
    skull.scale.y = 1.08;
    skull.castShadow = true;
    this.head.position.y = 1.66;

    // EL ELEMENTO FIRMA: ojos saltones gigantes con pupilas que tiemblan de miedo.
    this.googly = makeGooglyEyes({ radio: 0.058, separacion: 0.062, pupila: 0.015 });
    this.googly.group.position.set(0, 0.015, 0.14);
    this.head.add(this.googly.group);

    // El rostro: casquete esférico frontal con textura canvas DINÁMICA.
    // Cejas, mirada, boca y brillo de sudor se repintan según la banda de estrés
    // (`03 - Mecanica - Interrogatorio` §tells): la cara ES la interfaz.
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceState = { banda: -1, blink: false, gaze: 0, frame: 0 };
    this.#paintFace();
    const face = new THREE.Mesh(
      // Casquete frontal: phi centrado en +z (π/2), 96° de ancho; theta 52°–120°.
      new THREE.SphereGeometry(0.158, 24, 18, Math.PI / 2 - 0.84, 1.68, 0.9, 1.2),
      new THREE.MeshStandardMaterial({ map: this.faceTexture, roughness: 0.7, transparent: true }),
    );
    face.scale.y = 1.08;
    this.head.add(face);

    // Cabello simple (casquete corto: la frente y las cejas quedan libres).
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.162, 16, 12, 0, Math.PI * 2, 0, 1.0),
      new THREE.MeshStandardMaterial({ color: perfil.colorPelo, roughness: 0.95 }),
    );
    hair.position.y = 0.015;
    this.head.add(skull, hair);
    this.blinking = false;

    // Brazos con manos: los protagonistas de los tells.
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), ropa);
      limb.position.y = -0.28;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), piel);
      hand.position.y = -0.56;
      arm.add(limb, hand);
      arm.position.set(side * 0.27, 1.35, 0);
      arm.rotation.z = side * 0.12;
      arm.userData = { side, baseRotZ: side * 0.12, hand };
      this.group.add(arm);
      this.arms.push(arm);
    }

    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.58, 10),
      new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.9 }));
    legs.position.y = 0.29;

    this.group.add(this.body, this.head, legs);

    // Gotas de sudor: pool de esferitas brillantes en la frente, invisibles en calma.
    this.sweat = [];
    for (let i = 0; i < 5; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 6),
        new THREE.MeshPhysicalMaterial({
          color: 0xdfefff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0,
        }),
      );
      drop.position.set((Math.random() - 0.5) * 0.18, 0.1 + Math.random() * 0.04, 0.15);
      drop.visible = false; // ver la nota sobre `renderTransmissionPass` en `update`
      this.head.add(drop);
      this.sweat.push(drop);
    }
  }

  /**
   * Textura procedural de camisa hawaiana: fondo azul brillante con flores
   * amarillas de 5 pétalos (centro naranja) y follaje verde disperso. Se pinta
   * en un canvas y se repite sobre la cápsula del cuerpo (wrap). Determinista en
   * la disposición (nada de Math.random en la malla): el estampado es estable.
   */
  #makeHawaiianTexture(colorBase) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');

    // Fondo: azul de la camisa, con un degradado suave para que no sea plano.
    const base = `#${colorBase.toString(16).padStart(6, '0')}`;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, base);
    grad.addColorStop(1, new THREE.Color(colorBase).offsetHSL(0, 0.05, -0.1).getStyle());
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);

    const flor = (cx, cy, r, girar) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(girar);
      // Follaje detrás de la flor.
      g.fillStyle = 'rgba(60,150,70,0.85)';
      for (let k = 0; k < 2; k++) {
        g.save();
        g.rotate((k ? 1 : -1) * 0.9);
        g.beginPath();
        g.ellipse(r * 1.1, r * 0.6, r * 0.7, r * 0.28, 0.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // 5 pétalos amarillos.
      g.fillStyle = '#ffd21a';
      for (let p = 0; p < 5; p++) {
        g.save();
        g.rotate((p / 5) * Math.PI * 2);
        g.beginPath();
        g.ellipse(0, -r * 0.62, r * 0.34, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // Centro naranja.
      g.fillStyle = '#f5811f';
      g.beginPath();
      g.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };

    // Rejilla al tresbolillo de flores (disposición fija, tamaños alternos).
    const paso = 82;
    for (let fila = 0, y = 10; y < 256 + paso; y += paso, fila++) {
      const offset = fila % 2 ? paso / 2 : 0;
      for (let x = 10; x < 256 + paso; x += paso) {
        const r = 20 + ((fila + x) % 3) * 4;
        flor(x + offset, y, r, ((fila * 3 + x) % 7) * 0.4);
      }
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2); // varias flores alrededor del torso
    return tex;
  }

  #buildLuggage(perfil) {
    // El equipaje del caso, a los pies del pasajero, con el acabado que le toca.
    const { roughness, realce } = ACABADO_EQUIPAJE[perfil.equipaje] ?? ACABADO_EQUIPAJE.caja;
    const mat = new THREE.MeshStandardMaterial({
      color: perfil.colorEquipaje,
      roughness,
      metalness: 0, // dieléctrico SIEMPRE: ver la nota de ACABADO_EQUIPAJE
    });
    // Solo el equipaje rígido paga el reflejo: se le cuelga el PMREM de la
    // terminal. La lona y el cartón se quedan con el ambiente del nivel, que es
    // exactamente lo que les corresponde.
    colgarEntorno(mat, this.scene, realce);
    let bag;
    switch (perfil.equipaje) {
      case 'maletas_rigidas':
        bag = new THREE.Group();
        for (const sx of [-0.55, 0.55]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.26), mat);
          m.position.set(sx, 0.34, 0.15);
          m.castShadow = true;
          bag.add(m);
        }
        break;
      case 'bolsas':
        bag = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
          m.scale.y = 1.3;
          m.position.set(-0.45 + i * 0.3, 0.18, 0.2);
          m.castShadow = true;
          bag.add(m);
        }
        break;
      case 'mochila':
        bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.18), mat);
        bag.position.set(0.4, 0.22, 0.1);
        bag.castShadow = true;
        break;
      case 'maletin':
        bag = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.32, 0.12), mat);
        bag.position.set(0.42, 0.16, 0.15);
        bag.castShadow = true;
        this.maletin = bag; // Linares no lo suelta: se anima en update.
        break;
      case 'caja':
        bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), mat);
        bag.position.set(-0.5, 0.2, 0.15);
        bag.castShadow = true;
        break;
      default:
        bag = new THREE.Group();
    }
    bag.position.z += 0;
    this.group.add(bag);
    this.luggage = bag;
  }

  /**
   * Pinta el rostro según el estado: banda de estrés, parpadeo y mirada.
   * El canvas cubre el casquete frontal: cejas arriba, ojos al 42 %, boca al 72 %.
   */
  #paintFace() {
    const g = this.faceCtx;
    const s = this.stress ?? 0;
    const banda = s >= 80 ? 3 : s >= 55 ? 2 : s >= 30 ? 1 : 0;
    const { blink, gaze } = this.faceState;

    // Base: el mismo tono de piel del cráneo (las costuras desaparecen).
    // Los OJOS ya no se pintan aquí: son esferas googly 3D (ADR-004).
    const skin = `#${this.perfil.colorPiel.toString(16).padStart(6, '0')}`;
    g.fillStyle = skin;
    g.fillRect(0, 0, 256, 256);

    // Arrugas de edad (Doña Rosa, Ferrand…).
    if (this.perfil.edad >= 55) {
      g.strokeStyle = 'rgba(60,35,20,0.28)';
      g.lineWidth = 2;
      for (const y of [52, 64, 76]) {
        g.beginPath(); g.moveTo(78, y); g.quadraticCurveTo(128, y - 8, 178, y); g.stroke();
      }
      g.beginPath(); g.moveTo(92, 150); g.quadraticCurveTo(84, 172, 96, 190); g.stroke();
      g.beginPath(); g.moveTo(164, 150); g.quadraticCurveTo(172, 172, 160, 190); g.stroke();
    }

    // Cejas: el ceño es el termómetro. Banda 0: neutras; 1: tensas;
    // 2: fruncidas; 3: arqueadas de miedo (interior arriba).
    g.strokeStyle = 'rgba(35,22,12,0.9)';
    g.lineWidth = 7;
    g.lineCap = 'round';
    const cejaInner = [0, 4, 12, -8][banda];  // + = interior baja (ceño) · − = sube (miedo)
    for (const [x0, x1] of [[70, 112], [186, 144]]) {
      g.beginPath();
      g.moveTo(x0, 90);
      g.lineTo(x1, 92 + cejaInner * 0.6);
      g.stroke();
    }

    // Nariz mínima.
    g.strokeStyle = 'rgba(50,30,18,0.35)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 122); g.quadraticCurveTo(124, 142, 128, 150); g.stroke();

    // Boca por banda: neutra → apretada → tensa hacia abajo → temblorosa.
    g.strokeStyle = 'rgba(90,40,35,0.9)';
    g.lineWidth = 5;
    g.beginPath();
    if (banda === 3) {
      // Temblor: polilínea con jitter — se repinta a ~8 fps y "vibra".
      g.moveTo(102, 186);
      for (let x = 102; x <= 154; x += 7) g.lineTo(x, 186 + (Math.random() - 0.5) * 5);
    } else {
      const curva = [4, 0, -5, 0][banda];
      g.moveTo(102, 186);
      g.quadraticCurveTo(128, 186 + curva, 154, 186);
    }
    g.stroke();

    // Brillo de sudor en la frente (banda ≥ 2): el shader-lite del close-up.
    if (banda >= 2) {
      g.fillStyle = 'rgba(235,245,255,0.35)';
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.ellipse(70 + ((i * 47) % 120), 40 + (i * 13) % 26, 5, 2.5, 0.4, 0, 7);
        g.fill();
      }
    }

    this.faceTexture.needsUpdate = true;
  }

  #buildHotspots() {
    // Zonas invisibles para registrar tells con un clic (raycast desde el HUD).
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const zonas = [
      { nombre: 'ojos', geo: new THREE.SphereGeometry(0.16), pos: [0, 1.65, 0.05] },
      { nombre: 'boca', geo: new THREE.SphereGeometry(0.1), pos: [0, 1.5, 0.1] },
      { nombre: 'manos', geo: new THREE.SphereGeometry(0.24), pos: [0, 0.85, 0.12] },
      { nombre: 'postura', geo: new THREE.CapsuleGeometry(0.28, 0.6), pos: [0, 1.0, 0] },
    ];
    this.hotspots = zonas.map((z) => {
      const m = new THREE.Mesh(z.geo, mat);
      m.position.set(...z.pos);
      m.userData.zona = z.nombre;
      this.group.add(m);
      return m;
    });
  }

  /** Devuelve la zona tocada ('ojos'|'boca'|'manos'|'postura') o null. */
  hitTest(raycaster) {
    const hits = raycaster.intersectObjects(this.hotspots, false);
    return hits.length ? hits[0].object.userData.zona : null;
  }

  setStress(stress) {
    this.stress = stress;
  }

  /** Gesto puntual: mano al cuello, secarse la frente, mirar la salida… */
  gesto(nombre) {
    const arm = this.arms[1];
    switch (nombre) {
      case 'mano_cuello':
        gsap.to(arm.rotation, { z: -2.4, x: 0.5, duration: 0.7, ease: 'power2.out' });
        gsap.to(arm.rotation, { z: arm.userData.baseRotZ, x: 0, duration: 0.9, delay: 1.4, ease: 'power2.inOut' });
        break;
      case 'secarse':
        gsap.to(arm.rotation, { z: -2.9, x: 0.3, duration: 0.5, ease: 'power3.out' });
        gsap.to(arm.rotation, { z: arm.userData.baseRotZ, x: 0, duration: 0.7, delay: 0.8, ease: 'power2.inOut' });
        break;
      case 'mirar_salida':
        this.mirandoSalida = true;
        gsap.to(this.head.rotation, { y: 1.1, duration: 0.6, ease: 'power2.out' });
        gsap.to(this.head.rotation, {
          y: 0, duration: 0.8, delay: 1.2, ease: 'power2.inOut',
          onComplete: () => { this.mirandoSalida = false; },
        });
        break;
      case 'tragar': // la garganta "traga en seco": la cabeza asiente mínimo y baja
        gsap.to(this.head.position, { y: 1.6, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' });
        break;
      case 'quiebre_colapso': // inocente que colapsa: se dobla, tiembla
        gsap.to(this.body.rotation, { x: 0.5, duration: 1.2, ease: 'power2.inOut' });
        gsap.to(this.head.rotation, { x: 0.7, duration: 1.2, ease: 'power2.inOut' });
        this.tiembla = true;
        break;
      case 'quiebre_confiesa': // culpable que confiesa: la cabeza cae, los hombros ceden
        gsap.to(this.head.rotation, { x: 0.55, duration: 1.6, ease: 'power3.inOut' });
        gsap.to(this.body.scale, { y: 0.96, duration: 1.6, ease: 'power3.inOut' });
        break;
    }
  }

  /**
   * Entrega el pasaporte: cadena de brazo estilo IK-lite (hombro → codo → mano)
   * interpolada con GSAP. En el vértice del gesto, `onRelease()` suelta el
   * pasaporte físico sobre el mostrador (Desk lo recibe con cannon-es).
   */
  entregarPasaporte(onRelease) {
    const arm = this.arms[1]; // brazo derecho
    const tl = gsap.timeline();
    // Alcance: el brazo sube y se extiende hacia el mostrador; el torso acompaña.
    tl.to(arm.rotation, { x: -1.75, z: 0.05, duration: 0.7, ease: 'power2.inOut' });
    tl.to(this.body.rotation, { x: 0.12, duration: 0.7, ease: 'power2.inOut' }, '<');
    tl.to(this.head.rotation, { x: 0.25, duration: 0.5 }, '<0.1'); // mira lo que entrega
    // La mano se abre (suelta): aquí nace el pasaporte físico.
    tl.call(() => onRelease?.());
    tl.to({}, { duration: 0.15 });
    // Retirada natural con un pelín de overshoot.
    tl.to(arm.rotation, { x: 0, z: arm.userData.baseRotZ, duration: 0.9, ease: 'back.out(1.4)' });
    tl.to(this.body.rotation, { x: 0, duration: 0.8, ease: 'power2.inOut' }, '<');
    tl.to(this.head.rotation, { x: 0, duration: 0.6 }, '<0.1');
    return tl;
  }

  /**
   * LA FUGA: giro brusco y carrera hacia el fondo de la terminal.
   * Devuelve el punto de intercepción para que la policía converja.
   */
  huir() {
    gsap.killTweensOf(this.group.position);
    gsap.killTweensOf(this.group.rotation);
    this.corriendo = true;
    const destino = { x: (Math.random() - 0.5) * 2.4, z: -7.2 };
    const tl = gsap.timeline();
    tl.to(this.group.rotation, { y: Math.PI, duration: 0.22, ease: 'power3.in' }); // giro en seco
    tl.to(this.body.rotation, { x: 0.4, duration: 0.3, ease: 'power2.out' }, '<'); // tronco lanzado
    tl.to(this.group.position, { x: destino.x, z: destino.z, duration: 2.4, ease: 'power1.in' });
    return destino;
  }

  /**
   * Acorralado: cae al suelo como MUÑECO DE TRAPO (ragdoll cartoon con rebote),
   * brazos despatarrados, y llora con lágrimas-partícula gigantes.
   */
  capturado() {
    this.corriendo = false;
    gsap.killTweensOf(this.group.position);
    // El desplome: saltito de sorpresa y caída de espaldas con rebote de goma.
    const tl = gsap.timeline();
    tl.to(this.group.position, { y: 0.35, duration: 0.22, ease: 'power2.out' });
    tl.to(this.group.position, { y: 0.14, duration: 0.7, ease: 'bounce.out' });
    tl.to(this.group.rotation, { x: -Math.PI / 2 + 0.12, duration: 0.55, ease: 'power2.in' }, '<');
    // Brazos de tubo despatarrados y cabeza que cuelga: trapo puro.
    tl.to(this.arms[0].rotation, { z: 2.4, x: 0.4, duration: 0.5, ease: 'bounce.out' }, '<0.2');
    tl.to(this.arms[1].rotation, { z: -2.4, x: -0.3, duration: 0.5, ease: 'bounce.out' }, '<');
    tl.to(this.head.rotation, { z: 0.35, x: 0.2, duration: 0.6, ease: 'bounce.out' }, '<');
    this.tiembla = true;
    this.stress = 100;
    // El temblor de manos vibra AL REDEDOR de la pose de trapo, no de la de pie.
    this.arms[0].userData.baseRotZ = 2.4;
    this.arms[1].userData.baseRotZ = -2.4;
    this.#lagrimones();
  }

  /**
   * Lágrimas gigantes: chorros de gotas azules que salen disparadas de los ojos.
   *
   * 24 gotas por captura, cada una con geometría propia (el radio es aleatorio,
   * así que no se puede compartir) y material clonado (cada una se desvanece a
   * su ritmo). Son hijas de la ESCENA, no del actor — tienen que sobrevivir al
   * pasajero para caer al suelo — así que nadie las recogía al desmontarlo:
   * salían del grafo con `scene.remove` y su VRAM se quedaba. Ahora cada gota se
   * apunta en `_gotas` y sale por `disposeObject`, tanto si termina su arco como
   * si el turno la corta a media caída.
   */
  #lagrimones() {
    const scene = this.group.parent;
    if (!scene) return;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6fd0ff, roughness: 0.1, transparent: true, opacity: 0.9, emissive: 0x1a5a8a, emissiveIntensity: 0.4,
    });
    const origen = new THREE.Vector3();
    const soltar = (gota) => {
      this._gotas.delete(gota);
      disposeObject(gota);
    };
    for (let ola = 0; ola < 4; ola++) {
      // El temporizador se guarda: si el pasajero se va antes de la cuarta ola,
      // `dispose` la cancela en vez de dejarla sembrar gotas sobre una escena
      // que ya cambió de pasajero.
      this._olas.push(setTimeout(() => {
        if (!this.group.parent) return;
        this.head.getWorldPosition(origen);
        for (let i = 0; i < 6; i++) {
          const gota = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.02, 8, 6), mat.clone());
          gota.scale.y = 1.4; // forma de lagrimón
          gota.position.set(origen.x + (Math.random() - 0.5) * 0.1, origen.y, origen.z);
          scene.add(gota);
          this._gotas.add(gota);
          const lado = i % 2 ? 1 : -1;
          const dx = lado * (0.25 + Math.random() * 0.45);
          const dz = (Math.random() - 0.5) * 0.5;
          // Arco de fuente: sube, cae al suelo, se aplasta y desaparece.
          gsap.to(gota.position, { y: origen.y + 0.25 + Math.random() * 0.2, duration: 0.28, ease: 'power2.out' });
          gsap.to(gota.position, { y: 0.03, duration: 0.5, ease: 'power2.in', delay: 0.28 });
          gsap.to(gota.position, { x: `+=${dx}`, z: `+=${dz}`, duration: 0.78, ease: 'none' });
          gsap.to(gota.scale, { x: 1.6, y: 0.3, z: 1.6, duration: 0.12, delay: 0.78 }); // splash
          gsap.to(gota.material, {
            opacity: 0, duration: 0.25, delay: 0.85,
            onComplete: () => soltar(gota),
          });
        }
      }, ola * 700));
    }
    // `mat` es solo el molde del que salen los clones: nunca se renderiza, así
    // que no tiene programa ni textura en GPU y no hay nada que liberar en él.
  }

  /** Sale del puesto (hacia la salida o escoltado, según el sello). */
  salir({ escoltado = false } = {}) {
    const dir = escoltado ? -1 : 1;
    gsap.to(this.group.position, {
      x: 5.5 * dir, z: -3.5, duration: 3.2, ease: 'power2.in', delay: 0.4,
    });
    gsap.to(this.group.rotation, { y: dir * Math.PI / 2.2, duration: 0.8, delay: 0.3 });
  }

  /**
   * Cierra al pasajero y le libera la VRAM (ADR-009).
   *
   * Era la fuga más grande del nivel 1 y la más fácil de pasar por alto, porque
   * el código *parecía* limpio: `scene.remove(this.group)` saca al pasajero de
   * la pantalla, y como desaparece de la pantalla uno da por hecho que
   * desapareció de la tarjeta gráfica. No: `remove` solo lo descuelga del grafo.
   * Cada pasajero deja detrás ~22 geometrías (cuerpo, cráneo, casquete de cara,
   * pelo, dos brazos con sus manos, piernas, cinco gotas de sudor, el equipaje,
   * los cuatro hotspots y los ojos googly) y DOS CanvasTexture de 256² — el
   * rostro dinámico y, en los casos que lo piden, la camisa estampada.
   *
   * Un turno son media docena de pasajeros y la guardia puede encadenar turnos
   * sin recargar: la cuenta no para de subir mientras el juego, visualmente,
   * está igual que al empezar.
   *
   * Los tweens se matan ANTES de soltar nada. Un tween vivo sobre un material ya
   * liberado sigue escribiéndole opacidad cada frame — y ese material ya no
   * tiene programa que actualizar.
   */
  dispose(scene) {
    for (const t of this._olas) clearTimeout(t);
    this._olas.length = 0;
    gsap.killTweensOf(this.group.position);
    gsap.killTweensOf(this.group.rotation);
    gsap.killTweensOf(this.group.scale);
    gsap.killTweensOf(this.body.rotation);
    gsap.killTweensOf(this.body.scale);
    gsap.killTweensOf(this.head.rotation);
    gsap.killTweensOf(this.head.position);
    for (const arm of this.arms) gsap.killTweensOf(arm.rotation);
    // Lágrimas todavía en vuelo: son hijas de la escena, no del actor, así que
    // el barrido del grupo no las alcanza.
    for (const gota of this._gotas) {
      gsap.killTweensOf(gota.position);
      gsap.killTweensOf(gota.scale);
      gsap.killTweensOf(gota.material);
      disposeObject(gota);
    }
    this._gotas.clear();
    // `uniformes: true` no es necesario aquí (el pasajero no tiene shaders
    // propios) pero tampoco estorba, y deja el barrido preparado si alguna vez
    // alguno de sus materiales pasa a serlo.
    disposeObject(this.group, true);
    scene.remove(this.group); // por si el grupo colgaba de otro padre
  }

  update(dt, t) {
    const s = this.stress;
    const ph = this.phase;

    // Respiración: la frecuencia y amplitud escalan con el estrés.
    const rate = 0.25 + (s / 100) * 0.75;
    const amp = 0.006 + (s / 100) * 0.012;
    this.body.scale.x = 1 + Math.sin(t * Math.PI * 2 * rate + ph) * amp;
    this.body.scale.z = 1 + Math.sin(t * Math.PI * 2 * rate + ph) * amp * 0.7;
    this.head.position.y = 1.62 + Math.sin(t * Math.PI * 2 * rate + ph) * 0.006;

    // Carrera de fuga: zancada frenética (brazos bombeando, rebote de paso).
    if (this.corriendo) {
      this.group.position.y = Math.abs(Math.sin(t * 11)) * 0.06;
      for (const [i, arm] of this.arms.entries()) {
        arm.rotation.x = Math.sin(t * 11 + i * Math.PI) * 1.1;
      }
      return; // el pánico anula los micro-gestos de mostrador
    }

    // Peso de un pie al otro (más rápido si está incómodo).
    this.group.rotation.z = Math.sin(t * (0.4 + s / 150) + ph) * 0.02;

    // Parpadeo googly: nervioso = parpadea más.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = (s > 55 ? 1.2 : 3) + Math.random() * 2.5;
      this.googly.blink();
    }

    // Los ojos saltones SON el medidor: mirada + temblor de pupilas por banda.
    const banda = s >= 80 ? 3 : s >= 55 ? 2 : s >= 30 ? 1 : 0;
    this.googly.setMirada(this.head.rotation.y * 2.2, banda >= 2 ? -0.25 : 0);
    this.googly.setTemblor([0, 0.12, 0.45, 1][banda]);
    this.googly.update(dt, t);

    // Repintado de cejas/boca cuando cambia la banda (o a ~8 fps en crítica: la boca tiembla).
    const frame = banda === 3 ? Math.floor(t * 8) : 0;
    const fs = this.faceState;
    if (banda !== fs.banda || frame !== fs.frame) {
      fs.banda = banda; fs.frame = frame;
      this.#paintFace();
    }

    // Micro-gestos espontáneos según banda de estrés (los tells ambientales).
    this.fidgetTimer -= dt;
    if (this.fidgetTimer <= 0) {
      this.fidgetTimer = 3.5 + Math.random() * 4 - (s / 100) * 2;
      if (s >= 80) this.gesto(Math.random() < 0.5 ? 'mirar_salida' : 'tragar');
      else if (s >= 55) this.gesto(Math.random() < 0.5 ? 'secarse' : 'mano_cuello');
      else if (s >= 30 && Math.random() < 0.6) this.gesto('mano_cuello');
    }

    // Mirada: en calma sostiene; incómodo, desvía.
    if (!this.mirandoSalida) {
      const aversion = s >= 30 ? Math.sin(t * 0.6 + ph) * 0.25 * (s / 100) : 0;
      this.head.rotation.y += (aversion - this.head.rotation.y) * dt * 2;
    }

    // Sudor progresivo a partir de 55 (shader-lite: gotas físicas que aparecen).
    //
    // El `visible` NO es cosmético: son `MeshPhysicalMaterial` con
    // `transmission`, y un solo objeto transmisivo en la lista de render obliga
    // al renderer a ejecutar `renderTransmissionPass` — una copia del framebuffer
    // y un redibujado de la escena— en TODOS los fotogramas. Las cinco gotas
    // nacían con `opacity: 0` pero visibles, así que el aeropuerto pagaba esa
    // pasada entera durante toda la partida para dibujar cinco esferas
    // transparentes que nadie veía. El filtro por `visible` ocurre antes de
    // clasificar transmisivos, así que apagarlas la evita del todo.
    const sweatAlpha = THREE.MathUtils.clamp((s - 55) / 30, 0, 1);
    this.sweat.forEach((drop, i) => {
      const target = sweatAlpha > i / this.sweat.length ? 0.85 : 0;
      drop.material.opacity += (target - drop.material.opacity) * dt * 2;
      drop.visible = drop.material.opacity > 0.01;
      if (drop.material.opacity > 0.1) drop.position.y -= dt * 0.004; // la gota resbala
      if (drop.position.y < 0.02) drop.position.y = 0.08 + Math.random() * 0.03;
    });

    // Temblor de manos en banda crítica.
    if (s >= 80 || this.tiembla) {
      for (const arm of this.arms) {
        arm.rotation.z = arm.userData.baseRotZ + (Math.random() - 0.5) * 0.06;
      }
    }

    // El maletín que no se suelta (tell de CASO-105): la mano lo sigue.
    if (this.maletin) {
      this.maletin.position.y = 0.16 + Math.sin(t * 2) * 0.005;
    }
  }
}
