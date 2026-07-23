import * as THREE from 'three';
import gsap from 'gsap';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { spawnRig, clearRigCache } from '../world/Rig.js';
import { quality, isTouch, tuneRaycaster } from '../core/Device.js';
import { TouchControls } from '../ui/TouchControls.js';
import { CameraShake, HitStop, popIn, punch, flash } from '../core/Juice.js';
import { PostFX } from '../render/PostFX.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { PerfGuard } from '../core/PerfGuard.js';
import { construirPuerto } from '../world/PuertoChimbote.js';
import { progreso } from '../core/Progreso.js';
import { disposeScene, disposeObject } from '../core/Disposal.js';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';
import { makeGooglyEyes } from '../world/GooglyEyes.js';

/**
 * ChimbotePortScene (ADR-006 · Fase 2 pulida) — Nivel 2: Puerto de Chimbote.
 *
 * Inspección como EXPLORACIÓN física en primera persona (no un formulario):
 *  - Física cannon-es con SALTO (espacio, sólo tocando el suelo).
 *  - Al abrir un contenedor [E], sus puertas baten con GSAP y se retira su
 *    colisión frontal: el oficial CAMINA dentro del contenedor hueco y oscuro.
 *  - Una LINTERNA (SpotLight atada a la cámara) se enciende sola al entrar.
 *  - Dentro hay cajas/barriles/palets 3D físicos; el contrabando es una CAJA que
 *    se ve sospechosa. Se apunta con la mira (Raycaster) y con [Clic] se abre con
 *    palanca, o con [X] se le pasa el rayos X portátil.
 *  - La decisión ([F] decomisar · [G] liberar) es una barra mínima, no tapa la
 *    pantalla. Estética Cartoon/Googly intacta (ADR-004).
 *
 * Contrato SceneManager: mount() / unmount().
 */

const DOCK_X = 32;
const DOCK_Z = 26;
const C_L = 8;       // largo interior (x)
const C_H = 2.8;     // alto
const C_W = 3.0;     // ancho (z) — algo más ancho para caber y explorar
const WALL = 0.12;
const P_R = 0.5;
const EYE_OFF = 1.15;
const SPEED = 6.5;
const JUMP_V = 7.2;

const PALETA = [
  0xd94f4f, 0xe0952a, 0x4f9dd9, 0x53b06a, 0xc0503f,
  0x3f7fb0, 0xd9c14f, 0x8a5cc0, 0x40b0a8, 0xd96f9d,
];

const CARGAS = [
  { producto: 'Harina de pescado', unidad: '40 sacos', peso: 1020, origen: 'Manta (Ecuador)' },
  { producto: 'Textiles', unidad: '22 fardos', peso: 640, origen: 'Iquique (Chile)' },
  { producto: 'Conservas de pescado', unidad: '30 cajas', peso: 900, origen: 'Guayaquil (Ecuador)' },
  { producto: 'Repuestos automotrices', unidad: '15 pallets', peso: 1250, origen: 'Panamá' },
  { producto: 'Café en grano', unidad: '50 sacos', peso: 1500, origen: 'Buenaventura (Colombia)' },
];

export class ChimbotePortScene {
  constructor({ onExit } = {}) {
    this.onExit = onExit ?? (() => {});
    this.keys = Object.create(null);
    this.inspectables = [];
    this.crateMeshes = [];
    this.animals = [];       // fauna viva a animar (aletea/salta dentro del cajón)
    this.activo = null;      // contenedor en el que estoy dentro
    this.aimCrate = null;    // caja bajo la mira
    this.grounded = false;
    this.touchPlaying = false;   // en móvil sustituye al PointerLock
    this._yaw = 0; this._pitch = 0;
    // La reputación YA NO nace en 50: viene de la carrera (ADR-011).
    this.reputacion = progreso.reputacion;
    this.repInicial = this.reputacion;
    this.ronda = 1; // el turno crece en rondas, no acaba en 5 cajas (ADR-011)
    this.aciertos = 0;
    this.errores = 0;
    this._raf = null;
    this._bound = {};
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  mount() {
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias });
    this.renderer.setPixelRatio(quality.pixelRatio); // ≤1.25 en móvil
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // evita que la linterna reviente
    this.renderer.toneMappingExposure = 0.88; // deja aire para el bloom
    this.renderer.setClearColor(0x9fb8cc);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb7c8d4, 30, 130);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.position.set(0, P_R + EYE_OFF, DOCK_Z - 5);
    this.controls = new PointerLockControls(this.camera, canvas);
    this.shake = new CameraShake(this.camera);
    this.hitStop = new HitStop();
    this.scene.add(this.camera); // para que la linterna (hija de la cámara) se renderice

    this.ray = tuneRaycaster(new THREE.Raycaster());
    this.ray.far = 5;

    this.#initPhysics();
    this.#buildLights();
    this.#buildFlashlight();
    this.#buildDock();
    this.#buildWater();
    this.#buildStacks();
    this.#buildPuertoReal(); // grúas, buques, Aduana, planta, fauna (ADR-011)
    this.#buildInspectables();
    this.#buildStevedores();
    this.#buildHUD();
    this.#bindInput();

    // Post-proceso: las alarmas rojas, el oro del contrabando y el destello del
    // sol en el agua ahora IRRADIAN en vez de ser píxeles de color.
    this.post = new PostFX(this.renderer, { scene: this.scene, camera: this.camera, bloom: 0.34 });

    // Pausa/ajustes: por fin se puede silenciar al narrador y salir sin recargar.
    this.pausa = new PauseMenu({
      onPausa: () => {
        this.pausado = true;
        this.pad?.setVisible(false);
        if (!isTouch) this.controls.unlock(); else this.touchPlaying = false;
      },
      onReanudar: () => {
        this.pausado = false;
        if (isTouch) { this.touchPlaying = true; this.pad?.setVisible(true); }
      },
      onSalir: () => this.onExit(),
    });
    this.pausa.mount();

    // Red de seguridad de FPS: recortes de un solo sentido, del más barato al
    // más doloroso (el muelle es la escena más pesada del juego).
    this.perf = new PerfGuard([
      { nombre: 'sombra de linterna off', aplicar: () => { this.flash.castShadow = false; } },
      { nombre: 'bloom off', aplicar: () => { if (this.post.bloom) this.post.bloom.enabled = false; } },
      { nombre: 'sombras del sol off', aplicar: () => {
        const sun = this.scene.children.find((o) => o.isDirectionalLight);
        if (sun) sun.castShadow = false;
      } },
      { nombre: 'pixelRatio 1', aplicar: () => {
        this.renderer.setPixelRatio(1);
        this.post.setSize(window.innerWidth, window.innerHeight);
      } },
    ]);

    this.clock = new THREE.Clock();
    this.#loop();
  }

  unmount() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._bound.resize);
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    document.removeEventListener('mousedown', this._bound.mousedown);
    this.controls?.disconnect?.();
    for (const t of this._voces ?? []) clearTimeout(t);
    narrator.callar();
    this.pausa?.destroy();
    this.pad?.destroy();
    this.overlay?.remove();
    this._styleEl?.remove();
    // Liberar VRAM de verdad: `scene.remove()` NO libera nada (ADR-009).
    this.post?.dispose();
    disposeScene(this.scene);
    clearRigCache();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.scene = null; this.world = null; this.inspectables.length = 0;
    this.crateMeshes.length = 0; this.animals.length = 0; this.npcs = [];
  }

  // ── Física (cannon-es) ────────────────────────────────────────────────────
  #initPhysics() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0;

    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    const muro = (px, pz, hx, hz) => {
      this.world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(hx, 2.5, hz)),
        position: new CANNON.Vec3(px, 2.5, pz),
      }));
    };
    muro(0, -DOCK_Z, DOCK_X, 0.3); muro(0, DOCK_Z, DOCK_X, 0.3);
    muro(-DOCK_X, 0, 0.3, DOCK_Z); muro(DOCK_X, 0, 0.3, DOCK_Z);

    this.playerBody = new CANNON.Body({
      mass: 6,
      shape: new CANNON.Sphere(P_R),
      position: new CANNON.Vec3(0, P_R, DOCK_Z - 5),
      fixedRotation: true,
      linearDamping: 0,
    });
    this.playerBody.updateMassProperties();
    this.world.addBody(this.playerBody);

    // NOTA (bug corregido): antes esto usaba el evento 'collide', pero cannon-es
    // NO lo emite en contactos PERSISTENTES — estando quieto sobre el suelo el
    // evento no volvía a dispararse y el salto era imposible (en móvil y en PC).
    // Ahora se deriva de los contactos reales del mundo, tras cada step.
  }

  /** ¿Hay suelo bajo los pies? Se recalcula leyendo los contactos del step. */
  #actualizarGrounded() {
    this.grounded = false;
    for (const c of this.world.contacts) {
      // `ni` va de bi hacia bj: si el jugador es bi, el suelo queda "debajo"
      // cuando la normal apunta hacia abajo (ni.y ≈ -1), y al revés si es bj.
      let n;
      if (c.bi === this.playerBody) n = -c.ni.y;
      else if (c.bj === this.playerBody) n = c.ni.y;
      else continue;
      if (n > 0.5) { this.grounded = true; return; }
    }
  }

  #addBoxBody(cx, cy, cz, hx, hy, hz) {
    const b = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
      position: new CANNON.Vec3(cx, cy, cz),
    });
    this.world.addBody(b);
    return b;
  }

  // ── Luces ─────────────────────────────────────────────────────────────────
  #buildLights() {
    // Hemisférica baja: el exterior lo lleva el sol; el interior queda en sombra.
    this.scene.add(new THREE.HemisphereLight(0xbcd2e2, 0x4a5a64, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(-30, 44, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    // Frustum APRETADO al muelle jugable: antes cubría 116 u con un mapa de 512
    // (¡23 cm por téxel!) y eso es shadow acne garantizado en móvil.
    const d = 38;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0005;
    // normalBias es LA cura del acne: desplaza el muestreo a lo largo de la
    // normal, así una superficie no se sombrea a sí misma por error de téxel.
    sun.shadow.normalBias = quality.mobile ? 0.08 : 0.03;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);

    this.alarmLight = new THREE.PointLight(0xff2a2a, 0, 14);
    this.scene.add(this.alarmLight);
  }

  #buildFlashlight() {
    // Linterna atada a la cámara: apunta a donde miras. Se enciende al entrar.
    // decay 2 (físico) + tone mapping ACES: cono cálido con caída, sin reventar.
    this.flash = new THREE.SpotLight(0xfff0cf, 0, 20, Math.PI / 5, 0.55, 2);
    this.flash.position.set(0.15, -0.1, 0.2);
    this.flash.castShadow = !quality.mobile; // la sombra del foco es cara en móvil
    this.flash.shadow.mapSize.set(quality.spotShadowMap, quality.spotShadowMap);
    this.flash.target.position.set(0, 0, -1);
    this.camera.add(this.flash);
    this.camera.add(this.flash.target);
    this.flashTarget = 0;
  }

  // ── Muelle y agua ─────────────────────────────────────────────────────────
  #buildDock() {
    // Concreto PBR real (ambientCG, CC0) + HDRI de puerto al atardecer (Poly Haven).
    new RGBELoader().load('/hdri/puerto.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = hdr;
      this.scene.environmentIntensity = 0.5;
    });
    const tl = new THREE.TextureLoader();
    const rep = (t, srgb = false) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(10, 8);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const concreto = new THREE.MeshStandardMaterial({
      map: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_Color.jpg'), true),
      normalMap: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_NormalGL.jpg')),
      roughnessMap: rep(tl.load('/textures/concrete/Concrete034_1K-JPG_Roughness.jpg')),
      roughness: 1,
    });
    const dock = new THREE.Mesh(new THREE.BoxGeometry(DOCK_X * 2, 1, DOCK_Z * 2), concreto);
    dock.position.set(0, -0.5, 0);
    dock.receiveShadow = true;
    this.scene.add(dock);

    const franja = new THREE.MeshStandardMaterial({ color: 0xd9c14f, roughness: 0.7 });
    for (const sx of [-1, 1]) {
      const linea = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, DOCK_Z * 2), franja);
      linea.position.set(sx * (DOCK_X - 0.6), 0.02, 0);
      this.scene.add(linea);
    }
    const bol = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 });
    for (let x = -DOCK_X + 4; x < DOCK_X; x += 8) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.9, 12), bol);
      b.position.set(x, 0.45, DOCK_Z - 1.2);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  #buildWater() {
    const seg = quality.aguaSegmentos; // 120 en PC · 64 en móvil
    const geo = new THREE.PlaneGeometry(600, 600, seg, seg);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0f3d54) },
        uShallow: { value: new THREE.Color(0x2f86a6) },
        uSky: { value: new THREE.Color(0xbcd2df) },
        uSun: { value: new THREE.Vector3(-30, 44, 24).normalize() },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorldPos; varying vec3 vNormal;
        float olas(vec2 p, out vec2 grad) {
          grad = vec2(0.0); float h = 0.0; const int N = 3;
          vec2 dirs[3]; float amp[3]; float len[3]; float spd[3];
          dirs[0]=vec2(1.0,0.35); amp[0]=0.32; len[0]=7.0; spd[0]=1.1;
          dirs[1]=vec2(-0.6,1.0); amp[1]=0.20; len[1]=4.2; spd[1]=1.7;
          dirs[2]=vec2(0.3,-0.8); amp[2]=0.11; len[2]=2.3; spd[2]=2.4;
          for (int i = 0; i < N; i++) {
            vec2 d = normalize(dirs[i]); float k = 6.2831853 / len[i];
            float ph = dot(d, p) * k + uTime * spd[i];
            h += sin(ph) * amp[i]; grad += d * (cos(ph) * amp[i] * k);
          } return h;
        }
        void main() {
          vec2 grad; float h = olas(position.xz, grad);
          vec3 pos = position; pos.y += h;
          vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun;
        varying vec3 vWorldPos; varying vec3 vNormal;
        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
          float band = smoothstep(-0.15, 0.25, vWorldPos.y);
          vec3 base = mix(uDeep, uShallow, clamp(band, 0.0, 1.0));
          vec3 col = mix(base, uSky, clamp(fres, 0.0, 0.85));
          vec3 H = normalize(uSun + V);
          float spec = pow(clamp(dot(N, H), 0.0, 1.0), 90.0);
          col += vec3(1.0, 0.95, 0.8) * spec * 0.9;
          gl_FragColor = vec4(col, 0.92);
        }`,
      transparent: true,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = -0.35;
    this.scene.add(this.water);
  }

  /**
   * Ambientación real del Puerto de Chimbote (ADR-011): grúas pórtico, buque
   * portacontenedores, bolicheras de la flota anchovetera, edificio de la
   * Aduana, planta de harina, Isla Blanca, lobos marinos y bandadas de
   * pelícanos y gaviotas. Antes el muelle era un rectángulo pelado.
   */
  #buildPuertoReal() {
    this.puerto = construirPuerto(this.scene, { DOCK_X, DOCK_Z });
    // Las estructuras sólidas (patas de grúa, Aduana) también estorban de verdad.
    for (const c of this.puerto.colisiones) {
      this.#addBoxBody(c.x, 3, c.z, c.hx, 3, c.hz);
    }
  }

  #buildStacks() {
    const filas = [-9, -16, -23];
    const columnas = [-24, -15, -6, 6, 15, 24];
    const transforms = [];
    for (const z of filas) {
      for (const x of columnas) {
        const altura = 1 + (((x + z) % 3) + 3) % 3;
        for (let n = 0; n < altura; n++) {
          const m = new THREE.Matrix4();
          const jitter = ((x * 7 + z * 3) % 5) * 0.04;
          m.compose(
            new THREE.Vector3(x, 1.3 + n * 2.64, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, jitter, 0)),
            new THREE.Vector3(1, 1, 1),
          );
          transforms.push(m);
        }
        this.#addBoxBody(x, altura * 1.3, z, 4, altura * 1.3, 1.3);
      }
    }
    const geo = new THREE.BoxGeometry(8, 2.6, 2.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    inst.castShadow = true; inst.receiveShadow = true;
    const color = new THREE.Color();
    for (let i = 0; i < transforms.length; i++) {
      inst.setMatrixAt(i, transforms[i]);
      inst.setColorAt(i, color.setHex(PALETA[i % PALETA.length]));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);
  }

  // ── Contenedores inspeccionables (huecos, se entra dentro) ────────────────
  /**
   * Genera un caso. La RONDA sube la apuesta (ADR-011): más proporción de
   * contrabando y, desde la ronda 2, los contrabandistas aprenden a disimular
   * (el cajón deja de llevar flejes delatores y hay que usar los rayos X).
   */
  #genCaso() {
    const ronda = this.ronda ?? 1;
    const carga = CARGAS[Math.floor(Math.random() * CARGAS.length)];
    const contrabando = Math.random() < Math.min(0.78, 0.45 + ronda * 0.1);
    // Tipo de contrabando: fauna viva ~40 %, oro, o billetes.
    let tipoContra = null;
    if (contrabando) {
      const r = Math.random();
      tipoContra = r < 0.4 ? 'animal' : r < 0.7 ? 'oro' : 'billetes';
    }
    // Disimulo: el cajón sospechoso ya no se delata a simple vista.
    const disimulado = contrabando && ronda >= 2 && Math.random() < Math.min(0.85, 0.35 + ronda * 0.18);
    return { carga, contrabando, tipoContra, disimulado, resuelto: false, hallado: false };
  }

  #buildInspectables() {
    const xs = [-20, -10, 0, 10, 20];
    xs.forEach((x, i) => {
      const caso = this.#genCaso();
      const pos = new THREE.Vector3(x, 0, 6);
      const grupo = new THREE.Group();
      grupo.position.copy(pos);
      const tono = PALETA[(i * 3 + 1) % PALETA.length];
      const extMat = new THREE.MeshStandardMaterial({ color: tono, roughness: 0.6, metalness: 0.15 });
      const intMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 });

      // Cascarón hueco: suelo, techo, fondo y dos costados. FRENTE ABIERTO (+z).
      const panel = (w, h, d, px, py, pz, mat) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(px, py, pz);
        m.castShadow = true; m.receiveShadow = true;
        grupo.add(m);
      };
      panel(C_L, WALL, C_W, 0, WALL / 2, 0, intMat);              // suelo interior
      panel(C_L, WALL, C_W, 0, C_H, 0, extMat);                   // techo
      panel(C_L, C_H, WALL, 0, C_H / 2, -C_W / 2, extMat);        // fondo
      panel(WALL, C_H, C_W, -C_L / 2, C_H / 2, 0, extMat);        // costado izq
      panel(WALL, C_H, C_W, C_L / 2, C_H / 2, 0, extMat);         // costado der
      // Forro interior oscuro. BUG CORREGIDO: antes era una CAJA CERRADA con
      // BackSide, así que su cara frontal tapaba el mundo exterior al entrar
      // («todo se ponía negro»). Ahora son 4 planos sueltos —fondo, laterales y
      // techo— y el frente queda LIBRE: desde dentro se ve el muelle.
      const forroMat = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 1 });
      const forro = (w, h, rx, ry, px, py, pz) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), forroMat);
        m.rotation.set(rx, ry, 0);
        m.position.set(px, py, pz);
        m.receiveShadow = true;
        grupo.add(m);
      };
      // OJO (bug corregido): con separación 0.06 el forro quedaba EXACTAMENTE
      // sobre la cara interior del panel (grosor WALL=0.12 → cara a ±0.06) y
      // producía Z-FIGHTING: el punteado negro que parpadeaba al mover la cámara.
      // Se separan 0.09 (3 cm de aire) para que no compitan por el mismo píxel.
      const SEP = 0.09;
      forro(C_L - 0.1, C_H - 0.1, 0, 0, 0, C_H / 2, -C_W / 2 + SEP);            // fondo
      forro(C_W - 0.1, C_H - 0.1, 0, Math.PI / 2, -C_L / 2 + SEP, C_H / 2, 0);  // lateral izq
      forro(C_W - 0.1, C_H - 0.1, 0, -Math.PI / 2, C_L / 2 - SEP, C_H / 2, 0);  // lateral der
      forro(C_L - 0.1, C_W - 0.1, Math.PI / 2, 0, 0, C_H - SEP, 0);             // techo

      // Puertas en la cara frontal (+z), bisagra en los cantos, baten hacia afuera.
      const puertaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tono).offsetHSL(0, 0, -0.14), roughness: 0.5, metalness: 0.25 });
      const mkPuerta = (lado) => {
        const pivot = new THREE.Group();
        pivot.position.set(lado * (C_L / 2), C_H / 2, C_W / 2);
        const hoja = new THREE.Mesh(new THREE.BoxGeometry(C_L / 2, C_H - 0.06, 0.08), puertaMat);
        hoja.position.x = -lado * (C_L / 4);
        hoja.castShadow = true;
        const manija = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, C_H - 0.5, 8),
          new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.6 }));
        manija.position.set(-lado * (C_L / 2 - 0.3), 0, 0.08);
        pivot.add(hoja, manija);
        grupo.add(pivot);
        return pivot;
      };
      const doorR = mkPuerta(1);
      const doorL = mkPuerta(-1);

      const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1 }));
      bulbo.position.set(0, C_H + 0.9, C_W / 2);
      grupo.add(bulbo);

      this.scene.add(grupo);

      // Colisión: fondo + 2 costados (siempre) + bloqueo frontal (se quita al abrir).
      this.#addBoxBody(pos.x, C_H / 2, pos.z - C_W / 2, C_L / 2, C_H / 2, WALL);
      this.#addBoxBody(pos.x - C_L / 2, C_H / 2, pos.z, WALL, C_H / 2, C_W / 2);
      this.#addBoxBody(pos.x + C_L / 2, C_H / 2, pos.z, WALL, C_H / 2, C_W / 2);
      const frontBody = this.#addBoxBody(pos.x, C_H / 2, pos.z + C_W / 2, C_L / 2, C_H / 2, WALL);

      const insp = { grupo, pos, doorL, doorR, bulbo, frontBody, opened: false, caso, crates: [], phase: i * 1.6 };
      this.#fillCargo(insp, tono);
      this.inspectables.push(insp);
    });
  }

  /** Cajas, barriles y palet dentro. En contrabando, una caja se ve sospechosa. */
  #fillCargo(insp, tono) {
    const maderaMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
    const barrilMat = new THREE.MeshStandardMaterial({ color: 0x3f6d55, roughness: 0.7, metalness: 0.3 });
    const sospMat = new THREE.MeshStandardMaterial({ color: 0x4a5138, roughness: 0.65, metalness: 0.35 });

    // Palet base al fondo.
    const palet = new THREE.Mesh(new THREE.BoxGeometry(C_L - 1.4, 0.16, C_W - 0.9),
      new THREE.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.95 }));
    palet.position.set(0, 0.16, -0.4);
    palet.castShadow = true; palet.receiveShadow = true;
    insp.grupo.add(palet);

    // Barriles decorativos.
    for (const bx of [-C_L / 2 + 1, C_L / 2 - 1]) {
      const barril = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16), barrilMat);
      barril.position.set(bx, 0.72, -C_W / 2 + 0.7);
      barril.castShadow = true;
      insp.grupo.add(barril);
    }

    // Cajas: 3–4, una es la sospechosa si hay contrabando. Cada caja es un CAJÓN
    // de boca abierta (4 paredes + fondo, SIN cara superior) tapado por una tapa;
    // al volar la tapa se ve el interior de verdad.
    const n = 3 + Math.floor(Math.random() * 2);
    const idxSosp = insp.caso.contrabando ? Math.floor(Math.random() * n) : -1;
    for (let i = 0; i < n; i++) {
      const esSosp = i === idxSosp;
      const s = 0.95 + Math.random() * 0.3;
      const mat = esSosp ? sospMat.clone() : maderaMat.clone();
      const caja = new THREE.Group();
      const cx = -C_L / 2 + 1.7 + i * ((C_L - 3.2) / Math.max(1, n - 1));
      caja.position.set(cx, 0.24, -0.35 + (i % 2 ? 0.55 : -0.3));

      const t = 0.07; const half = s / 2; const h = s * 0.85;
      const wall = (w, hh, d, px, py, pz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
        m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
        caja.add(m);
      };
      wall(s, t, s, 0, t / 2, 0);          // fondo
      wall(s, h, t, 0, h / 2, -half);      // pared trasera
      wall(s, h, t, 0, h / 2, half);       // pared frontal
      wall(t, h, s, -half, h / 2, 0);      // pared izquierda
      wall(t, h, s, half, h / 2, 0);       // pared derecha

      // Tapa que cubre la boca (vuela al abrir con palanca).
      const tapa = new THREE.Mesh(new THREE.BoxGeometry(s, t, s), mat);
      tapa.position.set(0, h, 0); tapa.castShadow = true;
      caja.add(tapa);

      // Detalle sospechoso: flejes metálicos. Si el caso está DISIMULADO
      // (rondas altas), no se ponen: hay que cazarlo con los rayos X.
      const flejes = [];
      if (esSosp && !insp.caso.disimulado) {
        const flejeMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 0.8 });
        for (const fx of [-s * 0.3, s * 0.3]) {
          const fleje = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, s * 1.03), flejeMat);
          fleje.position.set(fx, h / 2, 0);
          caja.add(fleje);
          flejes.push(fleje);
        }
      }

      // Evidencia física dentro del cajón (visible al quitar la tapa).
      // Sospechosa → contrabando del tipo del caso; legal → mercancía aburrida variada.
      const tipo = esSosp ? insp.caso.tipoContra
        : ['harina', 'zapatillas', 'repuestos'][Math.floor(Math.random() * 3)];
      const contenido = esSosp ? this.#makeContraband(s, tipo) : this.#makeLegal(s, tipo);
      contenido.position.y = h * 0.42;
      contenido.visible = false;
      caja.add(contenido);

      const crate = {
        insp, esSosp, abierta: false, tapa, contenido, mat, mesh: caja, tipo, flejes,
        tam: s,                                                   // para regenerar contenido
        tapaHome: { pos: tapa.position.clone(), rot: tapa.rotation.clone() }, // para reponerla
      };
      caja.userData.crate = crate;
      insp.grupo.add(caja);
      insp.crates.push(crate);
      this.crateMeshes.push(caja);
    }
  }

  /** Despacho de contrabando: oro, billetes o fauna viva. */
  #makeContraband(s, tipo) {
    if (tipo === 'animal') return this.#makeAnimalWrap(s);
    const g = new THREE.Group();
    const negro = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.1 });
    const banda = new THREE.MeshStandardMaterial({ color: 0x2ea86a, emissive: 0x0d5030, emissiveIntensity: 0.6, roughness: 0.6 });
    if (tipo === 'billetes') {
      // Torre de fajos forrados en negro con banda verde.
      for (let i = 0; i < 6; i++) {
        const fajo = new THREE.Mesh(new THREE.BoxGeometry(s * 0.3, 0.13, s * 0.5), negro);
        fajo.position.set((i % 2 ? 0.2 : -0.2) * s, -s * 0.22 + Math.floor(i / 2) * 0.15, 0);
        fajo.castShadow = true;
        const b = new THREE.Mesh(new THREE.BoxGeometry(s * 0.31, 0.14, s * 0.12), banda);
        b.position.copy(fajo.position);
        g.add(fajo, b);
      }
      return g;
    }
    // 'oro': lingotes brillantes + algún fajo + chip que brilla.
    const oro = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 1, roughness: 0.22, emissive: 0x3a2a00, emissiveIntensity: 0.55 });
    const filas = [[-0.24, 0], [0, 0], [0.24, 0], [-0.12, 1], [0.12, 1], [0, 2]];
    for (const [dx, fila] of filas) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(s * 0.42, 0.11, s * 0.2), oro);
      bar.position.set(dx * s, -s * 0.18 + fila * 0.12, -s * 0.18);
      bar.castShadow = true;
      g.add(bar);
    }
    for (let i = 0; i < 2; i++) {
      const fajo = new THREE.Mesh(new THREE.BoxGeometry(s * 0.28, 0.14, s * 0.5), negro);
      fajo.position.set(-s * 0.15 + i * s * 0.3, -s * 0.2, s * 0.24);
      fajo.castShadow = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s * 0.29, 0.15, s * 0.12), banda);
      b.position.copy(fajo.position);
      g.add(fajo, b);
    }
    const tech = new THREE.Mesh(new THREE.BoxGeometry(s * 0.2, 0.08, s * 0.2),
      new THREE.MeshStandardMaterial({ color: 0x10221a, emissive: 0x27e08a, emissiveIntensity: 1.3, roughness: 0.4 }));
    tech.position.set(s * 0.28, -s * 0.15, -0.03);
    g.add(tech);
    return g;
  }

  /** Envuelve un animal en un grupo aparte y lo registra para animarlo (salta/aletea). */
  #makeAnimalWrap(s) {
    const wrap = new THREE.Group();
    const { grp, googly, wings } = this.#makeAnimal(s);
    grp.position.y = -s * 0.12;
    wrap.add(grp);
    this.animals.push({ grp, googly, wings, phase: this.animals.length * 1.7, base: grp.position.y });
    return wrap;
  }

  /** Fauna silvestre de contrabando con primitivas: loro, mono o iguana + ojos saltones. */
  #makeAnimal(s) {
    const kind = ['loro', 'mono', 'iguana'][Math.floor(Math.random() * 3)];
    const g = new THREE.Group();
    const googly = makeGooglyEyes({ radio: 0.035 * (s / 1.1), separacion: 0.04 * (s / 1.1), pupila: 0.009 });
    let wings = null;

    if (kind === 'loro') {
      const verde = new THREE.MeshStandardMaterial({ color: 0x1faa2a, roughness: 0.6 });
      const rojo = new THREE.MeshStandardMaterial({ color: 0xe23327, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.13, s * 0.24, 6, 12), verde);
      body.position.y = s * 0.2; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.12, 14, 12), rojo);
      head.position.y = s * 0.42;
      const beak = new THREE.Mesh(new THREE.ConeGeometry(s * 0.05, s * 0.13, 8),
        new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5 }));
      beak.rotation.x = Math.PI / 2; beak.position.set(0, s * 0.4, s * 0.13);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.04, s * 0.3, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x1462d0, roughness: 0.6 }));
      tail.rotation.x = 0.5; tail.position.set(0, s * 0.12, -s * 0.22);
      wings = [];
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.05, s * 0.22, 4, 8), verde);
        w.position.set(side * s * 0.15, s * 0.22, 0);
        w.rotation.z = side * 0.5; w.userData.base = side * 0.5;
        g.add(w); wings.push(w);
      }
      googly.group.position.set(0, s * 0.44, s * 0.1);
      g.add(body, head, beak, tail);
    } else if (kind === 'mono') {
      const pelo = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
      const cara = new THREE.MeshStandardMaterial({ color: 0xcaa46a, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 14, 12), pelo);
      body.position.y = s * 0.2; body.scale.y = 1.15; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.13, 14, 12), pelo);
      head.position.y = s * 0.44;
      const hocico = new THREE.Mesh(new THREE.SphereGeometry(s * 0.08, 10, 8), cara);
      hocico.position.set(0, s * 0.4, s * 0.09); hocico.scale.z = 0.7;
      for (const side of [-1, 1]) {
        const oreja = new THREE.Mesh(new THREE.SphereGeometry(s * 0.05, 8, 6), pelo);
        oreja.position.set(side * s * 0.12, s * 0.48, 0);
        g.add(oreja);
      }
      const cola = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.03, s * 0.32, 4, 8), pelo);
      cola.rotation.x = -0.8; cola.position.set(0, s * 0.16, -s * 0.2);
      googly.group.position.set(0, s * 0.46, s * 0.09);
      g.add(body, head, hocico, cola);
    } else { // iguana
      const verde = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.1, s * 0.34, 6, 12), verde);
      body.rotation.z = Math.PI / 2; body.position.y = s * 0.16; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.08, s * 0.12, 4, 8), verde);
      head.rotation.z = Math.PI / 2; head.position.set(s * 0.28, s * 0.16, 0);
      const cola = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.05, s * 0.4, 4, 8), verde);
      cola.rotation.z = Math.PI / 2; cola.position.set(-s * 0.34, s * 0.14, 0);
      for (let i = 0; i < 4; i++) { // espinas dorsales
        const esp = new THREE.Mesh(new THREE.ConeGeometry(s * 0.03, s * 0.1, 5), verde);
        esp.position.set(-s * 0.15 + i * s * 0.12, s * 0.28, 0);
        g.add(esp);
      }
      for (const [lx, lz] of [[0.12, 0.1], [0.12, -0.1], [-0.12, 0.1], [-0.12, -0.1]]) {
        const pata = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.03, s * 0.08, 4, 6), verde);
        pata.position.set(lx * s, s * 0.06, lz * s);
        g.add(pata);
      }
      googly.group.position.set(s * 0.32, s * 0.2, s * 0.05);
      g.add(body, head, cola);
    }
    g.add(googly.group);
    return { grp: g, googly, wings };
  }

  /** Carga legal aburrida pero visible: harina, zapatillas o repuestos de motor. */
  #makeLegal(s, tipo) {
    const g = new THREE.Group();
    if (tipo === 'zapatillas') {
      const cols = [0xd94f4f, 0x4f9dd9, 0xe0c14a, 0xece7dc];
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(s * 0.52, s * 0.2, s * 0.34),
          new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7 }));
        b.position.set((i % 2 ? 0.18 : -0.18) * s, -s * 0.24 + Math.floor(i / 2) * s * 0.23, 0);
        b.castShadow = true; g.add(b);
      }
      return g;
    }
    if (tipo === 'repuestos') {
      const met = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.85 });
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.13, s * 0.13, s * 0.42, 14), met);
        c.rotation.z = Math.PI / 2;
        c.position.set((-0.2 + (i % 2) * 0.4) * s, -s * 0.26 + Math.floor(i / 2) * s * 0.3, (i % 2 ? 0.12 : -0.12) * s);
        c.castShadow = true; g.add(c);
      }
      return g;
    }
    // 'harina': sacos apilados.
    const saco = new THREE.MeshStandardMaterial({ color: 0xcbb488, roughness: 1 });
    for (const [dx, fila] of [[-0.2, 0], [0.2, 0], [0, 1]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s * 0.24, 10, 8), saco);
      m.scale.set(1, 0.75, 1.25);
      m.position.set(dx * s, -s * 0.22 + fila * s * 0.28, 0);
      m.castShadow = true; g.add(m);
    }
    return g;
  }

  /** Oficial de Aduanas procedural (googly + gorra + brazo de saludo) para la intervención. */
  #makeOficial(uniColor = 0x1b2740) {
    const g = new THREE.Group();
    const uni = new THREE.MeshStandardMaterial({ color: uniColor, roughness: 0.7 });
    const piel = new THREE.MeshStandardMaterial({ color: 0xb08b64, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.56, 6, 12), uni);
    body.position.y = 0.95; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), piel);
    head.position.y = 1.55; head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.09, 14), uni);
    cap.position.y = 1.67;
    const visera = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.13), uni);
    visera.position.set(0, 1.64, 0.17);
    const googly = makeGooglyEyes({ radio: 0.05, separacion: 0.056, pupila: 0.013 });
    googly.group.position.set(0, 1.56, 0.14);
    googly.setMirada(0, -0.1);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.9 }));
    legs.position.y = 0.27;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), uni);
    armL.position.set(-0.3, 1.0, 0); armL.rotation.z = 0.15;
    // Brazo derecho con pivote de hombro (para el saludo militar).
    const armR = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), uni);
    limb.position.y = -0.24;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), piel);
    hand.position.y = -0.46;
    armR.add(limb, hand);
    armR.position.set(0.3, 1.22, 0);
    armR.rotation.z = -0.15;
    g.add(body, head, cap, visera, legs, armL, armR, googly.group);
    return { g, googly, armR, armRBase: -0.15 };
  }

  /**
   * Cinemática de intervención: dos oficiales googly entran al contenedor,
   * caminan hasta la caja, incautan la mercancía (desaparece) y te saludan.
   */
  async #intervencion(insp, onDone) {
    const susp = insp.crates.find((c) => c.esSosp);
    const esAnimal = insp.caso.tipoContra === 'animal';
    const uni = esAnimal ? 0x2f5a2a : 0x1b2740; // Policía Ecológica (verde) vs Aduanas (azul)
    const target = new THREE.Vector3();
    (susp ? susp.mesh : insp.grupo).getWorldPosition(target);
    const frenteZ = insp.pos.z + C_W / 2 + 1.4;
    const squad = [];
    const tl = gsap.timeline({ onComplete: () => onDone && onDone() });

    // Escuadrón riggeado (Knight; teñido de verde si es rescate ecológico).
    const rigs = await Promise.all([0, 1].map(() =>
      spawnRig('/models/Oficial.glb', { targetHeight: 1.85, tint: esAnimal ? 0x5fae55 : null }).catch(() => null)));
    this.squadRigs = rigs.filter(Boolean);

    [-1, 1].forEach((side, idx) => {
      let o;
      if (rigs[idx]) {
        o = { g: new THREE.Group(), rig: rigs[idx] };
        o.g.add(rigs[idx].model);
        rigs[idx].play('Running_A');
      } else {
        o = this.#makeOficial(uni);
      }
      o.g.position.set(insp.pos.x + side * 1.0, 0, frenteZ);
      o.g.rotation.y = Math.PI; // mirando hacia dentro (-z)
      this.scene.add(o.g);
      squad.push(o);
      tl.to(o.g.position, { x: target.x + side * 0.7, z: target.z + 0.9, duration: 1.3, ease: 'power1.inOut' }, 0.1);
      if (!o.rig) tl.to(o.g.position, { y: 0.07, duration: 0.17, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0.1); // trote fallback
      else tl.add(() => o.rig.play('Idle'), 1.4); // llegó: en posición
    });

    // Incautar / rescatar: la mercancía (o el animal) se esfuma en sus manos.
    tl.add(() => {
      audio.contenedor();
      if (esAnimal) audio.chillido();
      this.#toast(esAnimal
        ? 'La Policía Ecológica asegura al animal para su rescate…'
        : 'Los oficiales incautan la mercancía. Operativo en curso…');
      if (susp) gsap.to(susp.contenido.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.5, onComplete: () => { susp.contenido.visible = false; } });
    }, '>');

    // Girar hacia el jugador y saludar (clip Cheer en el rig; brazo en el fallback).
    tl.add(() => {
      for (const o of squad) {
        o.g.rotation.y = Math.atan2(this.camera.position.x - o.g.position.x, this.camera.position.z - o.g.position.z);
        o.googly?.blink();
        o.rig?.play('Cheer');
      }
    }, '>');
    for (const o of squad) { if (o.armR) tl.to(o.armR.rotation, { z: -2.5, x: -0.35, duration: 0.35, ease: 'power2.out' }, '<'); }
    tl.add(() => {
      audio.stinger();
      this.#toast(esAnimal
        ? '¡Animal rescatado! El Escuadrón Ecológico te saluda.'
        : '¡Decomiso ejecutado! Tus colegas te saludan.');
    }, '>');
    tl.to({}, { duration: 1.2 }); // sostener el saludo

    // Bajar el brazo, salir del contenedor y despawn.
    for (const o of squad) {
      if (o.armR) tl.to(o.armR.rotation, { z: o.armRBase, x: 0, duration: 0.3 }, '>');
      else tl.add(() => o.rig?.play('Running_A'), '>');
      tl.to(o.g.position, { x: insp.pos.x, z: frenteZ + 2.6, duration: 1.1, ease: 'power1.in' }, '<');
    }
    tl.add(() => { for (const o of squad) this.scene.remove(o.g); this.squadRigs = null; });
    return tl;
  }

  #buildStevedores() {
    this.npcs = [];
    const spots = [
      { x: -14, z: 14, col: 0xe0952a }, { x: 15, z: 12, col: 0x4f9dd9 }, { x: 4, z: 18, col: 0x53b06a },
    ];
    for (const s of spots) {
      const g = new THREE.Group();
      const overol = new THREE.MeshStandardMaterial({ color: s.col, roughness: 0.85 });
      const piel = new THREE.MeshStandardMaterial({ color: 0xc79b76, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 14), overol);
      body.position.y = 0.95; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), piel);
      head.position.y = 1.62; head.castShadow = true;
      const cascoMat = new THREE.MeshStandardMaterial({ color: 0xf2c500, roughness: 0.5 });
      const casco = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cascoMat);
      casco.position.y = 1.72;
      const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16), cascoMat);
      ala.position.y = 1.72;
      const googly = makeGooglyEyes({ radio: 0.06, separacion: 0.066, pupila: 0.016 });
      googly.group.position.set(0, 1.63, 0.17);
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.55, 10),
        new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 }));
      legs.position.y = 0.3;
      g.add(body, head, casco, ala, legs, googly.group);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = Math.atan2(-s.x, DOCK_Z - s.z);
      this.scene.add(g);
      this.#addBoxBody(s.x, 0.95, s.z, 0.4, 1, 0.4);
      const npc = { g, googly, phase: (s.x + s.z) * 0.5, body };
      this.npcs.push(npc);
      // Migración a rig (KayKit Barbarian: el estibador fornido). Async; el
      // googly procedural queda de fallback hasta que llega el GLB.
      spawnRig('/models/Estibador.glb', { targetHeight: 1.9 }).then((rig) => {
        npc.g.clear();
        npc.googly = null;
        npc.body = null;
        npc.rig = rig;
        npc.g.add(rig.model);
        rig.play('Idle');
      }).catch(() => {});
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  #buildHUD() {
    const el = document.createElement('div');
    el.id = 'port-hud';
    el.innerHTML = `
      <div class="ph-crosshair"></div>
      <div class="ph-topbar">
        <span>PUERTO DE CHIMBOTE · MUELLE 7</span>
        <span class="ph-stats"></span>
        <button class="ph-exit">◄ MENÚ</button>
      </div>
      <div class="ph-prompt hidden"></div>
      <div class="ph-scan hidden"></div>
      <div class="ph-hint hidden"></div>
      <div class="ph-toast hidden"></div>
      <div class="ph-start">
        <div class="ph-start-inner">
          <div class="ph-start-title">MUELLE 7 · CARGA GENERAL</div>
          <p>Cinco contenedores marcados. Entra, alumbra con tu linterna y abre las cajas: el contrabando no se declara solo.</p>
          <button class="ph-start-btn">▶ ${isTouch ? 'TOCA PARA PATRULLAR' : 'CLIC PARA PATRULLAR'}</button>
          <p class="ph-keys">${isTouch
            ? '<b>Joystick</b> caminar · <b>arrastra</b> para mirar · <b>⤴</b> saltar · <b>🚪</b> abrir · <b>toca</b> una caja para abrirla'
            : '<b>WASD</b> caminar · <b>Espacio</b> saltar · <b>E</b> abrir contenedor · <b>Clic</b> abrir caja · <b>X</b> rayos X'}</p>
        </div>
      </div>
      <div class="ph-summary hidden"><div class="ph-summary-card"></div></div>`;
    document.body.appendChild(el);
    this.overlay = el;
    this.$stats = el.querySelector('.ph-stats');
    this.$prompt = el.querySelector('.ph-prompt');
    this.$scan = el.querySelector('.ph-scan');
    this.$hint = el.querySelector('.ph-hint');
    this.$toast = el.querySelector('.ph-toast');
    this.$start = el.querySelector('.ph-start');
    this.$summary = el.querySelector('.ph-summary');
    this.$summaryCard = el.querySelector('.ph-summary-card');

    // Mando virtual del muelle: joystick + las acciones que en PC son teclas.
    this.pad = new TouchControls({
      joystick: true,
      onLook: (dx, dy) => this.#look(dx, dy),
      buttons: [
        { code: 'KeyG', label: '✅', hint: 'LIBERAR', small: true },
        { code: 'KeyF', label: '🚫', hint: 'DECOMISAR', small: true },
        { code: 'KeyX', label: '📟', hint: 'RAYOS X', small: true },
        { code: 'KeyE', label: '🚪', hint: 'ABRIR' },
        { code: 'Space', label: '⤴', hint: 'SALTAR' },
      ],
    });
    this.pad.mount();
    this.pad.setVisible(false);

    el.querySelector('.ph-start-btn').addEventListener('click', () => {
      audio.startPort(); audio.cuernoBarco();
      if (isTouch) {
        // Sin PointerLock en móvil: entramos en juego con nuestro interruptor.
        this.touchPlaying = true;
        this.$start.classList.add('hidden');
        this.pad.setVisible(true);
      } else {
        this.controls.lock();
      }
      // El muelle deja de ser mudo: el narrador da la orden de servicio.
      this.#narrar('Muelle siete, Puerto de Chimbote. Cinco contenedores marcados para revisión. '
        + 'Entra, alumbra con tu linterna y abre las cajas: el contrabando no se declara solo.', 700);
    });
    el.querySelector('.ph-exit').addEventListener('click', () => this.onExit());
    this.controls.addEventListener('lock', () => this.$start.classList.add('hidden'));
    this.controls.addEventListener('unlock', () => {
      if (!isTouch && !this.#terminado()) this.$start.classList.remove('hidden');
    });
    this.#updateStats();
    this.#injectStyles();
  }

  #updateStats() {
    const done = this.inspectables.filter((c) => c.caso.resuelto).length;
    this.$stats.innerHTML = `INSPECCIONADOS ${done}/${this.inspectables.length} · ACIERTOS ${this.aciertos} · REPUTACIÓN ${this.reputacion}/100`;
    punch(this.$stats); // el marcador reacciona: latigazo al actualizarse
  }

  /**
   * Voz del operativo (Narrator). El Nivel 2 estaba mudo frente al 3: aquí el
   * texto que ya se muestra en pantalla se LEE, con el mismo motor de voz.
   * Se limpian los emojis y el marcado para que la voz no lea "asterisco b".
   */
  #narrar(texto, delayMs = 0) {
    const limpio = texto.replace(/<[^>]*>/g, '').replace(/[⚠✅🚫📟🚪⤴👃📱🔦]/gu, '').trim();
    if (!limpio) return;
    const t = setTimeout(() => narrator.decir(null, limpio, { esNarrador: true }), delayMs);
    this._voces = this._voces ?? [];
    this._voces.push(t);
  }

  #toast(msg, bad = false) {
    this.#narrar(msg); // todo aviso importante ahora también se escucha
    this.$toast.className = 'ph-toast ' + (bad ? 'bad' : 'ok');
    this.$toast.innerHTML = msg;
    this.$toast.classList.remove('hidden');
    popIn(this.$toast); // ya no aparece de la nada: entra con rebote elástico
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.$toast.classList.add('hidden'), 4200);
  }

  #injectStyles() {
    const css = `
      #port-hud { position: fixed; inset: 0; z-index: 40; pointer-events: none;
        font-family: 'Courier New', monospace; color: #eef4f8; }
      #port-hud .ph-crosshair { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px;
        margin: -3.5px 0 0 -3.5px; border: 2px solid rgba(255,255,255,.75); border-radius: 50%; }
      #port-hud .ph-topbar { position: absolute; top: 0; left: 0; right: 0; padding: 12px 18px;
        background: linear-gradient(180deg, rgba(6,12,18,.78), transparent);
        letter-spacing: .12em; font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      #port-hud .ph-stats { color: #e0c07a; flex: 1; text-align: center; }
      #port-hud .ph-exit { pointer-events: auto; cursor: pointer; background: transparent; color: #cdd8e2;
        border: 1px solid #3a4a5a; padding: 5px 12px; font-family: inherit; letter-spacing: .12em; font-size: 12px; border-radius: 3px; }
      #port-hud .ph-exit:hover { border-color: #e0952a; color: #e0952a; }
      #port-hud .ph-prompt { position: absolute; left: 50%; top: 58%; transform: translateX(-50%);
        background: rgba(8,14,20,.78); border: 1px solid #e0952a; padding: 8px 15px; border-radius: 4px; font-size: 14px; white-space: nowrap; }
      #port-hud .ph-prompt kbd, #port-hud .ph-hint kbd { background: #e0952a; color: #10151b; border-radius: 3px; padding: 1px 7px; font-weight: bold; }
      #port-hud .ph-scan { position: absolute; left: 50%; top: 40%; transform: translateX(-50%);
        background: rgba(8,26,20,.85); border: 1px solid #2f7d52; color: #b9f0d0; padding: 8px 14px;
        border-radius: 4px; font-size: 13px; max-width: 380px; text-align: center; }
      #port-hud .ph-scan b { color: #ffd76a; }
      #port-hud .ph-hint { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
        background: rgba(8,14,20,.8); padding: 9px 16px; border-radius: 4px; font-size: 13px; letter-spacing: .05em; }
      #port-hud .ph-hint b { color: #e0c07a; }
      #port-hud .ph-toast { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); max-width: 640px;
        padding: 12px 20px; border-radius: 4px; text-align: center; font-size: 14px; line-height: 1.5; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
      #port-hud .ph-toast.ok { background: #16412a; color: #b9f0d0; border: 1px solid #2f7d52; }
      #port-hud .ph-toast.bad { background: #4a1d1d; color: #f6c9c2; border: 1px solid #a03123; }
      #port-hud .hidden { display: none !important; }
      #port-hud .ph-start, #port-hud .ph-summary { position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; pointer-events: auto;
        background: radial-gradient(900px 600px at 50% 40%, rgba(20,32,44,.62), rgba(4,8,12,.88)); }
      #port-hud .ph-start-inner, #port-hud .ph-summary-card { text-align: center; max-width: 520px; }
      #port-hud .ph-start-title { letter-spacing: .3em; color: #e0952a; margin-bottom: 12px; font-size: 15px; }
      #port-hud .ph-start-inner p { color: #b7c3cf; line-height: 1.6; }
      #port-hud .ph-start-btn { pointer-events: auto; cursor: pointer; margin: 22px 0 14px; background: transparent;
        color: #eef4f8; border: 1px solid #e0952a; padding: 14px 30px; font-family: inherit; letter-spacing: .18em; font-size: 16px; border-radius: 4px; }
      #port-hud .ph-start-btn:hover { background: #e0952a; color: #10151b; }
      #port-hud .ph-keys { font-size: 12px; color: #7f8c99 !important; }
      #port-hud .ph-keys b { color: #cdd8e2; }
      #port-hud .ph-summary-card { color: #eef4f8; }
      #port-hud .ph-summary-card h2 { color: #e0952a; letter-spacing: .2em; }
      #port-hud .ph-summary-card p { color: #b7c3cf; line-height: 1.7; }
      #port-hud .ph-summary-card button { display: block; margin: 16px auto 0; cursor: pointer; background: #23262e;
        color: #eef4f8; border: none; padding: 11px 24px; border-radius: 3px; font-family: inherit; letter-spacing: .1em; pointer-events: auto; }

      /* ── TÁCTIL: anclado al dedo, no al ancho (un móvil apaisado mide 932px) */
      @media (pointer: coarse) {
        #port-hud .ph-start-inner, #port-hud .ph-summary-card {
          max-width: min(520px, 92vw); width: 100%; display: flex; flex-direction: column;
          align-items: center; gap: clamp(6px, 1.4vh, 14px); margin: auto; }
        #port-hud .ph-start, #port-hud .ph-summary { overflow-y: auto; padding: clamp(12px,3vh,30px) clamp(12px,4vw,36px); }
        #port-hud .ph-start-title { font-size: clamp(11px, 1.9vw, 15px); letter-spacing: .2em; margin: 0; }
        #port-hud .ph-start-inner p, #port-hud .ph-summary-card p {
          font-size: clamp(11px, 1.7vw, 14px); line-height: 1.5; margin: 0; max-width: 46ch; }
        #port-hud .ph-keys { font-size: clamp(9px, 1.4vw, 12px) !important; line-height: 1.5; }
        #port-hud .ph-start-btn { min-height: 48px; padding: clamp(12px,1.8vh,15px) clamp(18px,4vw,28px);
          font-size: clamp(12px, 1.9vw, 15px); }
        #port-hud .ph-summary-card h2 { font-size: clamp(15px, 2.5vw, 24px); }
        #port-hud .ph-toast, #port-hud .ph-prompt, #port-hud .ph-hint, #port-hud .ph-scan {
          font-size: clamp(10px, 1.6vw, 13px); line-height: 1.45; max-width: 90vw; }
      }

      /* ── Móvil (ADR-008): el HUD se aparta del mando ──────────────────── */
      @media (max-width: 900px), (pointer: coarse) and (max-width: 1100px) {
        #port-hud .ph-topbar { padding: 7px 9px; font-size: 9px; letter-spacing: .05em; gap: 6px; flex-wrap: wrap; }
        #port-hud .ph-stats { flex: 1 1 100%; order: 3; text-align: center; font-size: 10px; }
        #port-hud .ph-exit { min-height: 44px; padding: 8px 12px; }
        /* El prompt y la barra de decisión suben: abajo mandan joystick y botones */
        #port-hud .ph-prompt { top: 52%; font-size: 13px; padding: 8px 12px; max-width: 90vw; white-space: normal; text-align: center; }
        #port-hud .ph-hint { bottom: auto; top: 62px; font-size: 11px; max-width: 92vw; text-align: center; line-height: 1.6; }
        #port-hud .ph-scan { top: 34%; font-size: 12px; max-width: 88vw; padding: 7px 10px; }
        #port-hud .ph-toast { top: 58px; max-width: 92vw; font-size: 12px; padding: 10px 14px; }
        #port-hud .ph-start-inner, #port-hud .ph-summary-card { max-width: 92vw; padding: 0 14px; }
        #port-hud .ph-start-inner p, #port-hud .ph-summary-card p { font-size: 13px; }
        #port-hud .ph-start-btn { min-height: 54px; padding: 15px 26px; font-size: 15px; }
        #port-hud .ph-summary-card button { min-height: 50px; }
        #port-hud .ph-crosshair { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; }
      }
      @media (max-height: 460px) and (pointer: coarse) {
        #port-hud .ph-hint { top: 46px; font-size: 10px; }
        #port-hud .ph-prompt { top: 56%; font-size: 12px; }
        #port-hud .ph-toast { top: 44px; font-size: 11px; padding: 7px 12px; }
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this._styleEl = style;
  }

  // ── Entrada ───────────────────────────────────────────────────────────────
  #bindInput() {
    this._bound.keydown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && !e.repeat) this.#jump();
      if (e.code === 'KeyE') this.#tryOpenContainer();
      if (e.code === 'KeyX' && !e.repeat) this.#scanCrate();
      if (e.code === 'KeyF') this.#decidir(true);
      if (e.code === 'KeyG') this.#decidir(false);
    };
    this._bound.keyup = (e) => { this.keys[e.code] = false; };
    this._bound.mousedown = (e) => {
      // Ratón: clic = palanca. Táctil: solo un TAP corto y quieto abre la caja
      // (si no, mirar alrededor abriría cajas sin querer).
      if (e.button !== 0 || !this.#enJuego()) return;
      if (!isTouch) { this.#pryCrate(); return; }
      const t0 = performance.now();
      const p0 = { x: e.clientX, y: e.clientY };
      const fin = (ev) => {
        window.removeEventListener('pointerup', fin);
        const quieto = Math.hypot((ev.clientX ?? p0.x) - p0.x, (ev.clientY ?? p0.y) - p0.y) < 14;
        if (quieto && performance.now() - t0 < 320) this.#pryCrate();
      };
      window.addEventListener('pointerup', fin);
    };
    this._bound.resize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.post?.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup', this._bound.keyup);
    document.addEventListener('mousedown', this._bound.mousedown);
    window.addEventListener('resize', this._bound.resize);
  }

  #jump() {
    if (!this.#enJuego() || !this.grounded) return;
    this.playerBody.velocity.y = JUMP_V;
    this.grounded = false;
  }

  /**
   * ¿El jugador tiene el control? En escritorio lo dice el PointerLock; en
   * móvil no existe, así que manda nuestro propio interruptor (ADR-008).
   */
  #enJuego() { return isTouch ? this.touchPlaying : this.controls.isLocked; }

  /** Mirar arrastrando el dedo (sustituye al MouseLook del PointerLock). */
  #look(dx, dy) {
    if (!this.touchPlaying || this.inspecting) return;
    this._yaw -= dx * 0.0042;
    this._pitch = THREE.MathUtils.clamp(this._pitch - dy * 0.0042, -1.25, 1.25);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
  }

  #terminado() { return this.inspectables.every((c) => c.caso.resuelto); }

  #contenedorCercano() {
    const p = this.camera.position;
    let best = null; let bestD = 5;
    for (const c of this.inspectables) {
      if (c.opened) continue;
      const d = Math.hypot(p.x - c.pos.x, p.z - (c.pos.z + C_W / 2));
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** ¿Dentro de qué contenedor abierto estoy? */
  #dentro() {
    const p = this.camera.position;
    for (const c of this.inspectables) {
      if (!c.opened) continue;
      if (Math.abs(p.x - c.pos.x) < C_L / 2 - 0.2 &&
          p.z < c.pos.z + C_W / 2 && p.z > c.pos.z - C_W / 2) return c;
    }
    return null;
  }

  #tryOpenContainer() {
    if (!this.#enJuego()) return;
    const c = this.#contenedorCercano();
    if (!c || c.opened) return;
    c.opened = true;
    audio.contenedor();
    // JUICE: dos toneladas de acero cediendo — la cámara lo acusa.
    this.shake.add(0.5);
    this.hitStop.golpe(70);
    // Las puertas baten claramente hacia afuera (se ve en primera persona).
    gsap.to(c.doorR.rotation, { y: -Math.PI * 0.62, duration: 1.4, ease: 'power2.out' });
    gsap.to(c.doorL.rotation, { y: Math.PI * 0.62, duration: 1.4, ease: 'power2.out' });
    // Se retira la colisión frontal: ya se puede caminar dentro.
    if (c.frontBody) { this.world.removeBody(c.frontBody); c.frontBody = null; }
  }

  #pryCrate() {
    const cr = this.aimCrate;
    if (!cr || cr.abierta) return;
    cr.abierta = true;
    audio.contenedor();
    // La tapa SALE VOLANDO: se despega, sube girando en el aire y cae al suelo.
    const tapa = cr.tapa;
    cr.insp.grupo.attach(tapa); // reparent conservando la transform mundial
    const lado = Math.sin(cr.mesh.position.x * 12.9) < 0 ? -1 : 1;
    gsap.to(tapa.position, { y: '+=1.5', duration: 0.4, ease: 'power3.out' });
    gsap.to(tapa.position, { y: 0.16, duration: 0.85, delay: 0.4, ease: 'bounce.out' });
    gsap.to(tapa.position, { x: `+=${lado * 1.3}`, z: '+=1.2', duration: 1.25, ease: 'power1.out' });
    gsap.to(tapa.rotation, { x: Math.PI * 2.4, z: lado * Math.PI * 1.7, duration: 1.25, ease: 'power1.out' });
    // La evidencia se PRESENTA: sube sobre el borde del cajón y gira, imposible de no ver.
    cr.contenido.visible = true;
    const y0 = cr.contenido.position.y;
    gsap.fromTo(cr.contenido.position, { y: y0 }, { y: y0 + 0.6, duration: 0.55, delay: 0.15, ease: 'back.out(2.2)' });
    gsap.from(cr.contenido.rotation, { y: -0.6, duration: 0.8, delay: 0.15, ease: 'power2.out' });
    // JUICE: la palanca revienta la tapa — golpe seco + micro-congelación.
    this.shake.add(0.32);
    this.hitStop.golpe(80);
    if (cr.esSosp) {
      // Hallazgo: destello ámbar y sacudida fuerte. Esto tiene que sobresaltar.
      this.shake.add(0.5);
      flash('#ffe6a0', { opacidad: 0.38, duration: 0.5 });
      cr.insp.caso.hallado = true;
      if (cr.tipo === 'animal') {
        audio.chillido(); audio.aleteo();
        this.#toast('⚠ ¡FAUNA SILVESTRE VIVA! Tráfico de animales. <b>[F] Ordenar decomiso</b> (rescate).', false);
      } else {
        audio.stinger();
        const q = cr.tipo === 'billetes' ? 'fajos de billetes sin declarar' : 'lingotes de oro y fajos';
        this.#toast(`⚠ CONTRABANDO A LA VISTA: ${q}. <b>[F] Ordenar decomiso</b>.`, false);
      }
    } else {
      const q = { harina: 'sacos de harina', zapatillas: 'cajas de zapatillas', repuestos: 'repuestos de motor' }[cr.tipo] || 'mercancía en regla';
      this.#toast(`Caja abierta: ${q}. Nada oculto aquí.`);
    }
  }

  #scanCrate() {
    const cr = this.aimCrate;
    if (!cr) return;
    audio.beep(!cr.esSosp);
    this.$scan.innerHTML = cr.esSosp
      ? 'RAYOS X · <b>siluetas densas no orgánicas</b> bajo la carga declarada.'
      : 'RAYOS X · densidades uniformes, consistentes con la carga. Sin anomalías.';
    if (cr.esSosp) cr.insp.caso.hallado = true;
    this.$scan.classList.remove('hidden');
    clearTimeout(this._scanT);
    this._scanT = setTimeout(() => this.$scan.classList.add('hidden'), 3000);
  }

  #decidir(decomisar) {
    const c = this.activo;
    if (!c || c.caso.resuelto) return;
    c.caso.resuelto = true;
    const acierto = decomisar === c.caso.contrabando;
    // JUICE: el veredicto se SIENTE distinto según sea acierto o error.
    if (acierto) {
      this.aciertos++; this.reputacion = Math.min(100, this.reputacion + 8);
      this.shake.add(0.4); flash('#a8ffd0', { opacidad: 0.3, duration: 0.45 });
    } else {
      this.errores++; this.reputacion = Math.max(0, this.reputacion - 12); audio.beep(false);
      this.shake.add(0.72); this.hitStop.golpe(120); flash('#ff5a4a', { opacidad: 0.42, duration: 0.6 });
    }
    c.bulbo.material.emissiveIntensity = 0.1;
    this.$hint.classList.add('hidden');
    this.activo = null;
    this.#updateStats();

    const finalize = () => {
      if (!this.#terminado()) return;
      if (isTouch) { this.touchPlaying = false; this.pad?.setVisible(false); }
      else this.controls.unlock();
      this.#mostrarResumen();
    };

    if (decomisar && c.caso.contrabando) {
      // Decomiso real: se desata el operativo con dos oficiales.
      audio.stinger();
      this.#toast('DECOMISO ORDENADO. El operativo entra al contenedor…');
      this.#intervencion(c, finalize);
    } else {
      let msg;
      if (!decomisar && !c.caso.contrabando) msg = 'CARGA LIBERADA. Todo en regla. Trámite limpio.';
      else if (!decomisar && c.caso.contrabando) msg = 'LIBERASTE un contenedor con carga oculta. La Red respira tranquila.';
      else msg = 'DECOMISO INJUSTO: la carga era legal. El importador ya reclama. Tu reputación paga.';
      this.#toast(msg, !acierto);
      finalize();
    }
  }

  /**
   * Nueva ronda (ADR-011): el muelle no se acaba en 5 cajas. Llega otro camión,
   * los casos se regeneran más difíciles y el turno sigue. El bucle pasa de ser
   * "5 contenedores y fin" a una guardia con presión creciente.
   */
  #nuevaRonda() {
    this.ronda += 1;
    this.$summary.classList.add('hidden');
    for (const insp of this.inspectables) {
      insp.caso = this.#genCaso();
      insp.opened = false;
      insp.bulbo.material.emissiveIntensity = 1;
      // Puertas cerradas y bloqueo frontal restituido.
      insp.doorL.rotation.y = 0; insp.doorR.rotation.y = 0;
      if (!insp.frontBody) {
        insp.frontBody = this.#addBoxBody(insp.pos.x, C_H / 2, insp.pos.z + C_W / 2, C_L / 2, C_H / 2, WALL);
      }
      // Cajas: tapas repuestas y contenido nuevo según el caso.
      const idxSosp = insp.caso.contrabando ? Math.floor(Math.random() * insp.crates.length) : -1;
      insp.crates.forEach((cr, i) => {
        cr.abierta = false;
        cr.esSosp = i === idxSosp;
        cr.tipo = cr.esSosp ? insp.caso.tipoContra
          : ['harina', 'zapatillas', 'repuestos'][Math.floor(Math.random() * 3)];
        // Restituir la tapa (había salido volando y cambiado de padre).
        cr.mesh.attach(cr.tapa);
        cr.tapa.position.copy(cr.tapaHome.pos);
        cr.tapa.rotation.copy(cr.tapaHome.rot);
        cr.tapa.visible = true;
        // Contenido nuevo: fuera el viejo (liberando VRAM) y dentro el del caso.
        disposeObject(cr.contenido);
        const s = cr.tam;
        cr.contenido = cr.esSosp ? this.#makeContraband(s, cr.tipo) : this.#makeLegal(s, cr.tipo);
        cr.contenido.position.y = s * 0.85 * 0.42;
        cr.contenido.visible = false;
        cr.mesh.add(cr.contenido);
        cr.mat.emissive.setHex(0x000000);
      });
    }
    this.activo = null; this.aimCrate = null;
    this.#updateStats();
    this.#toast(`RONDA ${this.ronda}: llega otro camión. Los contrabandistas ya saben que estás aquí.`);
    if (isTouch) { this.touchPlaying = true; this.pad?.setVisible(true); } else this.controls.lock();
  }

  #mostrarResumen() {
    const n = this.inspectables.length;
    // Persistir la carrera: lo que pasa en el muelle te sigue al aeropuerto.
    progreso.ajustarReputacion(this.reputacion - this.repInicial);
    progreso.cerrarOperativo('chimbote', {
      aciertos: this.aciertos,
      errores: this.errores,
      incautaciones: this.inspectables.filter((c) => c.caso.resuelto && c.caso.contrabando && c.caso.tipoContra !== 'animal').length,
      rescates: this.inspectables.filter((c) => c.caso.resuelto && c.caso.tipoContra === 'animal').length,
    });
    const expulsado = this.reputacion <= 0;
    const veredicto = expulsado
      ? 'Reputación a cero. Te retiran la placa: el operativo se cierra sin ti.'
      : this.aciertos === n ? 'Ronda impecable. El muelle está limpio… por ahora.'
      : this.errores >= 3 ? 'Ronda dura. Demasiada carga pasó — o demasiada gente pagó sin deberlo.'
      : 'Ronda cerrada. Un oficial más del turno noche.';
    this.$summaryCard.innerHTML = `
      <h2>RONDA ${this.ronda} CERRADA · MUELLE 7</h2>
      <p>Contenedores: <b>${n}</b> · Aciertos: <b>${this.aciertos}</b> · Errores: <b>${this.errores}</b><br>
      Reputación de carrera: <b>${this.reputacion}/100</b> · Rango: <b>${progreso.rango}</b></p>
      <p>${veredicto}</p>`;
    // La guardia puede continuar: otra ronda, más difícil.
    if (!expulsado) {
      const seguir = document.createElement('button');
      seguir.textContent = `▶ SEGUIR LA GUARDIA · RONDA ${this.ronda + 1}`;
      seguir.addEventListener('click', () => this.#nuevaRonda());
      this.$summaryCard.appendChild(seguir);
    }
    const btn = document.createElement('button');
    btn.textContent = '◄ VOLVER AL MENÚ';
    btn.addEventListener('click', () => this.onExit());
    this.$summaryCard.appendChild(btn);
    this.$summary.classList.remove('hidden');
  }

  // ── Movimiento ────────────────────────────────────────────────────────────
  #move() {
    const b = this.playerBody;
    if (this.pausado || !this.#enJuego()) { b.velocity.x = 0; b.velocity.z = 0; return; }
    let fx = 0; let fz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) fz += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) fz -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) fx += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) fx -= 1;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const vx = fwd.x * fz + right.x * fx;
    const vz = fwd.z * fz + right.z * fx;
    const len = Math.hypot(vx, vz);
    if (len > 0.0001) { b.velocity.x = (vx / len) * SPEED; b.velocity.z = (vz / len) * SPEED; }
    else { b.velocity.x = 0; b.velocity.z = 0; }
  }

  // ── Raycast de cajas bajo la mira ─────────────────────────────────────────
  #updateAim() {
    if (!this.#enJuego() || !this.activo) { this.#setAim(null); return; }
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hits = this.ray.intersectObjects(this.activo.crates.map((c) => c.mesh), true);
    let o = hits.length ? hits[0].object : null;
    while (o && !o.userData.crate) o = o.parent; // subir hasta el cajón (grupo)
    this.#setAim(o ? o.userData.crate : null);
  }

  #setAim(cr) {
    if (this.aimCrate === cr) return;
    if (this.aimCrate) this.aimCrate.mat.emissive.setHex(0x000000);
    this.aimCrate = cr;
    if (cr && !cr.abierta) {
      cr.mat.emissive.setHex(0x554400); // resalte del cajón bajo la mira
      this.$prompt.innerHTML = isTouch
        ? '<kbd>TOCA</kbd> abrir con palanca · <kbd>📟</kbd> rayos X'
        : '<kbd>Clic</kbd> abrir con palanca · <kbd>X</kbd> rayos X';
      this.$prompt.classList.remove('hidden');
    } else {
      this.$prompt.classList.add('hidden');
    }
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────
  #loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      // El hit-stop escala el tiempo del juego: un impacto CONGELA el mundo
      // unos ms y por eso se siente sólido (la cámara sigue sacudiéndose).
      const dtReal = Math.min(this.clock.getDelta(), 0.05);
      this.perf.update(dtReal);
      // En pausa el mundo se congela pero se SIGUE renderizando (parar el rAF
      // deja una imagen muerta y rompe las transiciones de GSAP).
      const dt = this.pausado ? 0 : this.hitStop.escala(dtReal);
      const t = this.clock.elapsedTime;

      this.#move();
      this.world.step(1 / 60, dt, 3);
      this.#actualizarGrounded(); // tras el step: contactos reales, no eventos
      const p = this.playerBody.position;
      this.camera.position.set(p.x, p.y + EYE_OFF, p.z);

      this.waterMat.uniforms.uTime.value = t;
      if (!this.pausado) this.puerto?.update(t); // fauna, humo y bandera

      // ¿Dentro de un contenedor abierto? → linterna + barra de decisión.
      this.activo = this.#dentro();
      this.flashTarget = this.activo ? 14 : 0;
      this.flash.intensity += (this.flashTarget - this.flash.intensity) * Math.min(1, dt * 6);
      if (this.activo && !this.activo.caso.resuelto) {
        this.$hint.innerHTML = isTouch
          ? 'Abre las cajas y decide: <b>🚫 decomisar</b> · <b>✅ liberar</b>'
          : 'Abre las cajas y decide: <b><kbd>F</kbd> decomisar</b> · <b><kbd>G</kbd> liberar</b>';
        this.$hint.classList.remove('hidden');
      } else if (!this.activo) {
        this.$hint.classList.add('hidden');
      }

      this.#updateAim();

      // Alarmas (bulbos + point light compartida al pendiente más cercano).
      const flash = (Math.sin(t * 6) > 0) ? 1 : 0.25;
      let nearest = null; let nd = 1e9;
      for (const c of this.inspectables) {
        if (c.caso.resuelto) { c.bulbo.material.emissiveIntensity = 0.1; continue; }
        c.bulbo.material.emissiveIntensity = 0.3 + flash * 0.8;
        const d = Math.hypot(this.camera.position.x - c.pos.x, this.camera.position.z - c.pos.z);
        if (d < nd) { nd = d; nearest = c; }
      }
      if (nearest) { this.alarmLight.position.set(nearest.pos.x, C_H + 0.9, nearest.pos.z + C_W / 2); this.alarmLight.intensity = flash * 2.2; }
      else this.alarmLight.intensity = 0;

      // Prompt de "abrir contenedor" cuando estoy cerca de uno cerrado y sin apuntar caja.
      if (this.#enJuego() && !this.aimCrate && this.#contenedorCercano()) {
        this.$prompt.innerHTML = isTouch ? '<kbd>🚪</kbd> Abrir contenedor' : '<kbd>E</kbd> Abrir contenedor';
        this.$prompt.classList.remove('hidden');
      } else if (!this.aimCrate) {
        this.$prompt.classList.add('hidden');
      }

      for (const n of this.npcs) {
        if (n.body) n.body.scale.y = 1 + Math.sin(t * 1.6 + n.phase) * 0.02;
        n.googly?.update(dt, t + n.phase);
        n.rig?.update(dt);
      }
      this.squadRigs?.forEach((r) => r.update(dt));

      // Fauna viva: no está tiesa — salta, se gira nerviosa y aletea.
      for (const a of this.animals) {
        a.grp.position.y = a.base + Math.abs(Math.sin(t * 6 + a.phase)) * 0.07;
        a.grp.rotation.y = Math.sin(t * 2.4 + a.phase) * 0.45;
        if (a.wings) for (const w of a.wings) w.rotation.z = w.userData.base + Math.sin(t * 15 + a.phase) * 0.7;
        a.googly.update(dt, t + a.phase);
      }

      // Sacudida: se aplica, se renderiza y se DESHACE — así la posición real
      // de la cámara sigue limpia para raycasts y cálculos de proximidad.
      this.shake.apply(dtReal);
      this.post.render();
      this.shake.revert();
    };
    tick();
  }
}
