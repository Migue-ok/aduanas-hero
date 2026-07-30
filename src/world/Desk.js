import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import gsap from 'gsap';
import { colgarEntorno } from '../render/Entorno.js';
import { disposeObject } from '../core/Disposal.js';

/**
 * Desk — el mostrador es un lugar físico, no un menú.
 * Papeles con curvatura real, un riel con los 4 sellos (verde·ámbar·rojo·azul,
 * mismo orden siempre: memoria muscular) y un mundo cannon-es: el golpe del sello
 * hace saltar el lapicero y el pasaporte cae, rebota y resbala hasta detenerse.
 *
 * El "juice de la duda" (`08 - Mecanica - Decision Final.md`): con evidencia débil,
 * la mano duda y tiembla antes de estampar. Nunca se bloquea: solo se siente.
 */

const SELLOS = [
  { id: 'PASE', color: 0x2e9e4f, tinta: '#2e9e4f' },
  { id: 'COBRO', color: 0xd08a1d, tinta: '#c07d12' },
  { id: 'RETENIDO', color: 0xb3262e, tinta: '#a31f27' },
  { id: 'DERIVADO', color: 0x2b5fb8, tinta: '#24549f' },
];

const DESK_Y = 1.055; // cara superior del tablero

export class Desk {
  constructor(scene, audio, camera) {
    this.scene = scene;
    this.audio = audio;
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.#buildPhysics();
    this.#buildExpediente();
    this.#buildStamps();
    this.#buildLoosePen();

    this.decals = [];
    this.stamping = false;
  }

  // ── Física del tablero ──────────────────────────────────────────────────
  #buildPhysics() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.25;

    const desk = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(1.3, 0.04, 0.58)) });
    desk.position.set(0, DESK_Y - 0.04, 0.35);
    this.world.addBody(desk);
    this.dynamic = []; // pares {mesh, body}
  }

  #addDynamic(mesh, halfExtents, mass, position) {
    const body = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(...halfExtents)) });
    body.position.set(...position);
    body.angularDamping = 0.6;
    body.linearDamping = 0.25;
    this.world.addBody(body);
    this.dynamic.push({ mesh, body });
    return body;
  }

  // ── El expediente (donde cae el sello) ──────────────────────────────────
  #buildExpediente() {
    const tex = this.#makeFolderTexture();
    // El expediente es lo ÚNICO del mostrador que no se pule: una cartulina que
    // refleje el techo deja de leerse como papel. Se queda mate a propósito.
    // El canto es un solo material compartido por las cinco caras restantes (el
    // `.map(m => m ?? new Material())` de antes creaba cinco idénticos).
    const canto = new THREE.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.9 });
    const cara = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    this.expediente = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.008, 0.46),
      [canto, canto, cara, canto, canto, canto], // +x −x +y(superior) −y +z −z
    );
    this.expediente.position.set(0.3, DESK_Y + 0.006, 0.62);
    this.expediente.rotation.y = -0.06;
    this.expediente.castShadow = this.expediente.receiveShadow = true;
    this.group.add(this.expediente);
  }

  #makeFolderTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 340;
    const g = c.getContext('2d');
    g.fillStyle = '#c8b489';
    g.fillRect(0, 0, 256, 340);
    g.strokeStyle = '#7a6a45';
    g.lineWidth = 3;
    g.strokeRect(10, 10, 236, 320);
    g.fillStyle = '#4a3f28';
    g.font = 'bold 22px Georgia';
    g.fillText('EXPEDIENTE', 52, 52);
    g.font = '13px Georgia';
    g.fillText('CONTROL DE LLEGADAS', 52, 76);
    g.fillText('PUESTO 07', 52, 96);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ── Los 4 sellos en su riel ─────────────────────────────────────────────
  #buildStamps() {
    this.stamps = new Map();
    // El riel y las bases de los sellos son el metal real del puesto: se les
    // cuelga el entorno de la terminal para que devuelvan los fluorescentes en
    // vez de ser dos manchas oscuras (ver `render/Entorno.js`).
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.02, 0.14),
      colgarEntorno(
        new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.32, metalness: 0.6 }),
        this.scene, 1.35,
      ),
    );
    rail.position.set(0.62, DESK_Y + 0.01, 0.28);
    this.group.add(rail);

    SELLOS.forEach((def, i) => {
      const stamp = new THREE.Group();
      // Mango de baquelita moldeada: plástico duro, brillo propio pero sin
      // metalness — el color del sello tiene que seguir leyéndose de un vistazo
      // (memoria muscular: verde·ámbar·rojo·azul), y un mango espejado lo mata.
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.03, 0.09, 12),
        colgarEntorno(
          new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.28, metalness: 0 }),
          this.scene, 1.35,
        ),
      );
      handle.position.y = 0.075;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.035, 0.075),
        colgarEntorno(
          new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.26, metalness: 0.5 }),
          this.scene, 1.35,
        ),
      );
      base.position.y = 0.018;
      // La sombra va en las MALLAS, no en el `Group`. Un Group nunca se
      // renderiza, así que `stamp.castShadow = true` no proyectaba nada: los
      // cuatro sellos flotaban sin contacto sobre el tablero justo en la vista
      // SELLO, que es el plano icónico del juego.
      handle.castShadow = base.castShadow = true;
      base.receiveShadow = true;
      stamp.add(handle, base);
      stamp.position.set(0.42 + i * 0.135, DESK_Y + 0.02, 0.28);
      stamp.userData = { def, home: stamp.position.clone() };
      this.group.add(stamp);
      this.stamps.set(def.id, stamp);
    });
  }

  #buildLoosePen() {
    // El lapicero suelto: la víctima favorita del golpe del sello.
    // Plástico lacado negro, y encima RODANDO justo bajo el foco del puesto: es
    // la pieza del mostrador donde un reflejo que se mueve más se nota. Sin el
    // entorno colgado su `roughness: 0.3` no tenía nada que reflejar y quedaba
    // como una línea negra plana rebotando por la mesa.
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8),
      colgarEntorno(
        new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.3, metalness: 0 }),
        this.scene, 1.35,
      ),
    );
    pen.rotation.z = Math.PI / 2;
    pen.castShadow = true;
    this.group.add(pen);
    this.#addDynamic(pen, [0.075, 0.007, 0.007], 0.02, [-0.25, DESK_Y + 0.02, 0.5]);
  }

  /** El pasaporte del pasajero cae sobre el mostrador con física real. */
  tossPassport() {
    if (this.passportPair) {
      this.world.removeBody(this.passportPair.body);
      // Mismo caso que los decals: el pasaporte del pasajero anterior sale del
      // grafo pero su geometría y su material se quedaban en VRAM. Es uno por
      // pasajero, así que crece al mismo ritmo que la cola.
      disposeObject(this.passportPair.mesh);
      this.dynamic = this.dynamic.filter((d) => d !== this.passportPair);
    }
    // Tapa de cuero granulado: mate al tacto pero con lustre de uso. Es lo
    // primero que el pasajero pone sobre el tablero, y cae justo bajo el foco.
    const pass = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.012, 0.125),
      colgarEntorno(
        new THREE.MeshStandardMaterial({ color: 0x7a1f24, roughness: 0.52, metalness: 0 }),
        this.scene, 1.35,
      ),
    );
    pass.castShadow = true;
    this.group.add(pass);
    const body = this.#addDynamic(pass, [0.045, 0.006, 0.062], 0.05, [-0.15, DESK_Y + 0.35, -0.1]);
    body.velocity.set(0.3 + Math.random() * 0.3, -0.5, 1.1);
    body.angularVelocity.set(Math.random() * 3, Math.random() * 4, Math.random() * 3);
    this.passportPair = this.dynamic[this.dynamic.length - 1];
    setTimeout(() => this.audio.papel(), 350);
  }

  /**
   * La interacción icónica: el sello elegido vuela al expediente y estampa.
   * `dudar=true` → la mano tiembla medio segundo antes de caer.
   */
  stamp(decisionId, dudar, onDone) {
    if (this.stamping) return;
    this.stamping = true;
    const stamp = this.stamps.get(decisionId);
    const target = this.expediente.position;
    const tl = gsap.timeline({
      onComplete: () => {
        this.stamping = false;
        onDone?.();
      },
    });

    // 1) Levantar el sello (peso: sale lento, con arco).
    tl.to(stamp.position, { y: DESK_Y + 0.28, duration: 0.45, ease: 'power2.out' });
    tl.to(stamp.position, { x: target.x, z: target.z, duration: 0.5, ease: 'power2.inOut' }, '<0.15');

    // 2) La duda (si el expediente está flojo, la mano lo sabe).
    if (dudar) {
      tl.to(stamp.position, {
        x: `+=${0.008}`, duration: 0.06, repeat: 7, yoyo: true, ease: 'sine.inOut',
      });
      tl.to({}, { duration: 0.25 }); // el medio segundo que pesa
    }

    // 3) El golpe: rápido, seco, irreversible.
    tl.to(stamp.position, {
      y: DESK_Y + 0.045, duration: 0.09, ease: 'power4.in',
      onComplete: () => {
        this.audio.golpeSello();
        this.camera.shake(dudar ? 1.6 : 2.2);
        this.#inkDecal(decisionId);
        this.#slamImpulse();
      },
    });
    // 4) Rebote mínimo del propio sello y vuelta al riel.
    tl.to(stamp.position, { y: DESK_Y + 0.09, duration: 0.12, ease: 'power2.out' });
    tl.to({}, { duration: 0.5 });
    tl.to(stamp.position, {
      x: stamp.userData.home.x, y: stamp.userData.home.y, z: stamp.userData.home.z,
      duration: 0.6, ease: 'power2.inOut',
    });
  }

  #inkDecal(decisionId) {
    const def = SELLOS.find((s) => s.id === decisionId);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.translate(128, 64);
    g.rotate((Math.random() - 0.5) * 0.16);
    g.strokeStyle = def.tinta;
    g.lineWidth = 6;
    g.globalAlpha = 0.85;
    g.strokeRect(-110, -42, 220, 84);
    g.font = 'bold 40px Georgia';
    g.fillStyle = def.tinta;
    g.textAlign = 'center';
    g.fillText(decisionId, 0, 14);
    // Tinta imperfecta: mordidas aleatorias del papel.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = Math.random() * 0.5;
      g.fillRect(-115 + Math.random() * 230, -50 + Math.random() * 100, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.copy(this.expediente.position).add(new THREE.Vector3(0, 0.006, 0));
    this.group.add(decal);
    this.decals.push(decal);
    // Aparece con un "sangrado" de tinta.
    decal.scale.setScalar(0.9);
    gsap.to(decal.scale, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
  }

  /** El golpe sacude lo que esté suelto sobre el tablero. */
  #slamImpulse() {
    for (const { body } of this.dynamic) {
      body.wakeUp();
      body.applyImpulse(new CANNON.Vec3(
        (Math.random() - 0.5) * 0.02,
        0.02 + Math.random() * 0.03,
        (Math.random() - 0.5) * 0.02,
      ));
    }
  }

  /**
   * Limpia el expediente para el siguiente pasajero.
   *
   * Cada sello estampado deja un decal con SU PROPIA `CanvasTexture` de 256×128
   * (la tinta es imperfecta y distinta cada vez: no se puede compartir) más su
   * `PlaneGeometry` y su material. Con `group.remove()` la tinta desaparecía de
   * la mesa y se quedaba entera en la tarjeta gráfica — un sello por pasajero,
   * turno tras turno, sin que nada en pantalla delatara la cuenta.
   */
  clearDecals() {
    for (const d of this.decals) {
      gsap.killTweensOf(d.scale); // el sangrado de tinta puede seguir en vuelo
      disposeObject(d);
    }
    this.decals = [];
  }

  update(dt) {
    this.world.step(1 / 60, dt, 3);
    for (const { mesh, body } of this.dynamic) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }
}
