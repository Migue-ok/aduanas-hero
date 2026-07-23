import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { spawnRig, loadModel, clearRigCache } from '../world/Rig.js';
import { quality, isTouch, tuneRaycaster } from '../core/Device.js';
import { TouchControls } from '../ui/TouchControls.js';
import { CameraShake, HitStop, popIn, punch, flash } from '../core/Juice.js';
import { PostFX } from '../render/PostFX.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { PerfGuard } from '../core/PerfGuard.js';
import { disposeScene, disposeObject } from '../core/Disposal.js';
import { bus, Señal } from '../core/EventBus.js';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';
import { makeGooglyEyes } from '../world/GooglyEyes.js';

/**
 * TrafasportRaidScene (ADR-007) — Nivel 3: "Operativo Trafasport".
 *
 * Raid narrativo en 5 fases sobre la historia SUNAT "Mateo y las Zapatillas",
 * narrado por voz (Narrator) de principio a fin, con el jugador interviniendo
 * en todo momento:
 *
 *  1. INFILTRACIÓN K-9 — juegas como Justus (3.ª persona a ras de suelo, WASD).
 *     Mantener [Espacio] activa el MODO OLFATO: post-proceso a blanco y negro
 *     (render target + quad de desaturación) con el rastro de pegamento como
 *     humo de partículas verde neón. Al llegar a la puerta: clics para rascarla.
 *  2. ALLANAMIENTO — el vendedor sepulta la evidencia bajo una lluvia de cajas.
 *     15 s para arrastrarlas VIOLENTAMENTE con el ratón (raycast + física ligera).
 *     Las cajas lanzadas fuerte rompen los vidrios del escaparate.
 *  3. PERSECUCIÓN — auto-runner por la galería: agarra los obstáculos EN PLENO
 *     VUELO con el ratón y lánzalos a los costados antes de que te aplasten.
 *  4. ARRESTO — tug-of-war: clic sostenido y arrastre hacia abajo contra los
 *     tirones del vendedor hasta meterlo en el círculo de esposado.
 *  5. LA LECCIÓN — lupa (viewport inset con cámara zoom) sobre la zapatilla
 *     giratoria: encuentra etiqueta falsa, pegamento tóxico y el cartel
 *     "No damos boleta". Final: sello gigante "CLAUSURADO POR CONTRABANDO".
 *
 * Contrato SceneManager: mount() / unmount().
 */

const PASILLO = 60;    // largo de la galería (z)
const ANCHO = 10;      // ancho del pasillo

export class TrafasportRaidScene {
  constructor({ onExit } = {}) {
    this.onExit = onExit ?? (() => {});
    this.fase = 0;             // 0 = intro; 1..5 fases; 6 = final
    this.keys = Object.create(null);
    this.sniff = false;
    this.clicksPuerta = 0;
    this.cajas = [];
    this.obstaculos = [];
    this.evidencias = { etiqueta: false, pegamento: false, cartel: false };
    this.integridad = 3;
    this.arrastre = null;
    this.tugProgress = 0;
    this.tugHold = false;
    this._raf = null;
    this._bound = {};
    this._timers = [];
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  mount() {
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias });
    this.renderer.setPixelRatio(quality.pixelRatio); // móvil ≤1.25: sin sobrecalentar
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82; // afinado: el suelo blanco ya no revienta

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb8c4cc);
    this.scene.fog = new THREE.Fog(0xb8c4cc, 22, 70);

    this.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.05, 200);
    this.shake = new CameraShake(this.camera);
    this.hitStop = new HitStop();
    this.ray = tuneRaycaster(new THREE.Raycaster()); // umbral "dedo gordo"
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane();

    this.#buildLights();
    this.#buildGaleria();
    this.#buildPolvoAmbiental();
    this.#buildTrail();
    this.#buildPostFX(); // tras el rastro: la cadena necesita su escena overlay
    this.#buildJustus();
    this.#buildPersonajes();
    this.#loadAssets();
    this.#buildHUD();
    this.#bindInput();

    this.pausa = new PauseMenu({
      onPausa: () => { this.pausado = true; this.pad?.setVisible(false); },
      onReanudar: () => { this.pausado = false; if (this.fase === 1) this.pad?.setVisible(true); },
      onSalir: () => this.onExit(),
    });
    this.pausa.mount();

    this.perf = new PerfGuard([
      { nombre: 'bloom off', aplicar: () => { if (this.post.bloom) this.post.bloom.enabled = false; } },
      { nombre: 'polvo ambiental off', aplicar: () => { if (this.motas) this.motas.visible = false; } },
      { nombre: 'sombras off', aplicar: () => {
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
    this.#startFase1();
  }

  unmount() {
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const t of this._timers) clearTimeout(t);
    narrator.callar();
    audio.musica(null);
    window.removeEventListener('resize', this._bound.resize);
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    const c = this.renderer?.domElement;
    c?.removeEventListener('pointerdown', this._bound.pdown);
    window.removeEventListener('pointermove', this._bound.pmove);
    window.removeEventListener('pointerup', this._bound.pup);
    this.pausa?.destroy();
    this.pad?.destroy();
    this.overlay?.remove();
    this._styleEl?.remove();
    // Liberación real de VRAM (ADR-009): escena + render target + caché de rigs.
    disposeScene(this.scene);
    disposeScene(this.trailScene);
    this.post?.dispose();
    clearRigCache();
    this.renderer?.dispose();
  }

  #later(fn, ms) { this._timers.push(setTimeout(fn, ms)); }

  /**
   * Post-proceso (ADR-009 fase 2). Antes esto era un render target + un quad a
   * mano y el humo neón se pintaba en una tercera pasada suelta. Ahora lo lleva
   * `PostFX`, que ordena bien las pasadas: grade → humo → bloom. Resultado: el
   * modo detective sigue funcionando Y el neón, las alarmas y el oro irradian.
   * Se construye DESPUÉS del rastro, porque necesita la escena del humo.
   */
  #buildPostFX() {
    this.post = new PostFX(this.renderer, {
      scene: this.scene,
      camera: this.camera,
      overlay: this.trailScene,
      bloom: 0.32, // afinado en pantalla
    });
  }

  // ── Mundo: la galería comercial ───────────────────────────────────────────
  #buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xe8eef4, 0x777066, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.0);
    sun.position.set(-8, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap); // 512 en móvil
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = quality.mobile ? 0.08 : 0.03; // cura del shadow acne
    const d = 40;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
  }

  #buildGaleria() {
    this.pisoMat = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.85 });
    const piso = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 8, 0.2, PASILLO + 30), this.pisoMat);
    piso.position.set(0, -0.1, -PASILLO / 2);
    piso.receiveShadow = true;
    this.scene.add(piso);

    // Tiendas a los costados: cajones de colores con "escaparates".
    const cols = [0xd94f4f, 0x4f9dd9, 0x53b06a, 0xe0952a, 0x8a5cc0, 0x40b0a8];
    this.vidrios = [];
    for (let i = 0; i < 12; i++) {
      for (const side of [-1, 1]) {
        const z = -4 - i * 5;
        const tienda = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 4.6),
          new THREE.MeshStandardMaterial({ color: cols[(i + (side > 0 ? 3 : 0)) % cols.length], roughness: 0.8 }));
        tienda.position.set(side * (ANCHO / 2 + 1.5), 1.7, z);
        tienda.castShadow = true;
        this.scene.add(tienda);
        const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4),
          new THREE.MeshPhysicalMaterial({
            color: 0xbfe0ee, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide,
          }));
        vidrio.position.set(side * (ANCHO / 2 - 0.05), 1.5, z);
        vidrio.rotation.y = -side * Math.PI / 2;
        this.scene.add(vidrio);
        this.vidrios.push({ mesh: vidrio, roto: false, side });
      }
    }

    // TRAFASPORT: la tienda del fondo con su trastienda y su puerta.
    const frente = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 6, 4.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x33415c, roughness: 0.7 }));
    frente.position.set(0, 2.2, -PASILLO - 2);
    this.scene.add(frente);
    // Letrero canvas.
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#d8262c'; g2.fillRect(0, 0, 512, 96);
    g2.fillStyle = '#fff'; g2.font = 'bold 58px Arial'; g2.textAlign = 'center';
    g2.fillText('TRAFASPORT', 256, 66);
    const letTex = new THREE.CanvasTexture(cv);
    const letrero = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1),
      new THREE.MeshBasicMaterial({ map: letTex }));
    letrero.position.set(0, 3.4, -PASILLO - 1.75);
    this.scene.add(letrero);

    // La puerta de la trastienda (objetivo de la fase 1).
    this.puerta = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.9 }));
    this.puerta.position.set(0, 1.3, -PASILLO - 1.7);
    this.puerta.castShadow = true;
    this.scene.add(this.puerta);

    // Cartel "No damos boleta" (evidencia 3) en la pared de la tienda.
    const cv2 = document.createElement('canvas');
    cv2.width = 256; cv2.height = 128;
    const g3 = cv2.getContext('2d');
    g3.fillStyle = '#f2e8c8'; g3.fillRect(0, 0, 256, 128);
    g3.strokeStyle = '#7a4a1a'; g3.lineWidth = 6; g3.strokeRect(4, 4, 248, 120);
    g3.fillStyle = '#5a2a12'; g3.font = 'bold 30px Georgia'; g3.textAlign = 'center';
    g3.fillText('NO DAMOS', 128, 56);
    g3.fillText('BOLETA', 128, 94);
    this.cartel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv2) }));
    this.cartel.position.set(2.6, 2.1, -PASILLO - 1.75);
    this.cartel.userData.evidencia = 'cartel';
    this.scene.add(this.cartel);
  }

  /**
   * Motas de polvo suspendidas en los haces de luz de la galería. Un solo
   * BufferGeometry + un material: coste casi nulo, pero el espacio deja de
   * parecer una maqueta de arquitecto y empieza a tener AIRE.
   */
  #buildPolvoAmbiental() {
    const N = quality.mobile ? 180 : 420;
    const pos = new Float32Array(N * 3);
    this._motasBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * (ANCHO + 4);
      const y = 0.2 + Math.random() * 3.6;
      const z = -Math.random() * (PASILLO + 4);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this._motasBase[i * 3] = x; this._motasBase[i * 3 + 1] = y; this._motasBase[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motas = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xfff0d8, size: 0.035, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.scene.add(this.motas);
  }

  /** Deriva lenta del polvo: sube, ondula y reaparece por abajo. */
  #updatePolvo(t) {
    if (!this.motas) return;
    const a = this.motas.geometry.attributes.position;
    const base = this._motasBase;
    for (let i = 0; i < a.count; i++) {
      const bx = base[i * 3]; const by = base[i * 3 + 1]; const bz = base[i * 3 + 2];
      a.array[i * 3] = bx + Math.sin(t * 0.25 + bz) * 0.34;
      a.array[i * 3 + 1] = 0.2 + ((by - 0.2 + t * 0.11) % 3.6); // ascenso continuo
      a.array[i * 3 + 2] = bz + Math.cos(t * 0.2 + bx) * 0.26;
    }
    a.needsUpdate = true;
  }

  /** Rastro de pegamento: humo de partículas verde neón animado con ruido. */
  #buildTrail() {
    // Trayecto en S desde la entrada hasta la puerta de Trafasport.
    this.trailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2, 0.25, -2),
      new THREE.Vector3(-2.5, 0.3, -14),
      new THREE.Vector3(2.5, 0.25, -28),
      new THREE.Vector3(-1.5, 0.35, -42),
      new THREE.Vector3(0, 0.4, -PASILLO - 1.2),
    ]);
    const N = quality.particulasOlfato; // 900 en PC · 350 en móvil
    const pos = new Float32Array(N * 3);
    this.trailSeed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const p = this.trailCurve.getPoint(i / N);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      this.trailSeed[i * 2] = Math.random() * 10;
      this.trailSeed[i * 2 + 1] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailBase = pos.slice();
    // El humo vive en una ESCENA APARTE: se dibuja ENCIMA del filtro gris para
    // que el verde neón arda mientras el mundo está en blanco y negro.
    this.trailScene = new THREE.Scene();
    // Sprite de halo: un punto plano de 3 px es invisible en un móvil. Con un
    // degradado radial cada mota se convierte en una bocanada de humo con brillo.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g2 = cv.getContext('2d');
    const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(120,255,150,0.95)');
    grd.addColorStop(0.6, 'rgba(57,255,106,0.35)');
    grd.addColorStop(1.0, 'rgba(57,255,106,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 64, 64);
    const halo = new THREE.CanvasTexture(cv);
    halo.colorSpace = THREE.SRGBColorSpace;

    this.trail = new THREE.Points(geo, new THREE.PointsMaterial({
      // Nace APAGADO: la cadena de post-proceso compone el humo siempre, así que
      // su visibilidad la manda la opacidad (atada al modo olfato).
      // BUG CORREGIDO: con size 0.14 el rastro medía ~3 px en pantalla de móvil
      // y el verde aditivo desaparecía sobre el suelo claro. Ahora es grande,
      // texturado y con un tamaño MÍNIMO garantizado en pantalla.
      map: halo,
      color: 0x8dffb0,
      size: quality.mobile ? 0.62 : 0.42,
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      sizeAttenuation: true,
    }));
    this.trailScene.add(this.trail);
  }

  /** Justus versión héroe cartoon: perro pastor procedural con googly eyes. */
  #buildJustus() {
    const g = new THREE.Group();
    const pelo = new THREE.MeshStandardMaterial({ color: 0x6e4f2a, roughness: 0.9 });
    const oscuro = new THREE.MeshStandardMaterial({ color: 0x2e2318, roughness: 0.9 });
    const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), pelo);
    cuerpo.rotation.z = Math.PI / 2;
    cuerpo.position.y = 0.34;
    cuerpo.castShadow = true;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), pelo);
    cabeza.position.set(0.42, 0.52, 0);
    const hocico = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 8), oscuro);
    hocico.rotation.z = Math.PI / 2;
    hocico.position.set(0.6, 0.46, 0);
    for (const sz of [-1, 1]) {
      const oreja = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), oscuro);
      oreja.position.set(0.38, 0.7, sz * 0.1);
      g.add(oreja);
    }
    const cola = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 8), pelo);
    cola.rotation.z = 0.9;
    cola.position.set(-0.42, 0.5, 0);
    this.colaJustus = cola;
    this.patasJustus = [];
    for (const [px, pz] of [[0.25, 0.12], [0.25, -0.12], [-0.25, 0.12], [-0.25, -0.12]]) {
      const pata = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 6), oscuro);
      pata.position.set(px, 0.14, pz);
      g.add(pata);
      this.patasJustus.push(pata);
    }
    // Chaleco K-9 (verde SUNAT del cerco cartoon).
    const chaleco = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.7 }));
    chaleco.position.set(0.05, 0.42, 0);
    this.googlyJustus = makeGooglyEyes({ radio: 0.05, separacion: 0.055, pupila: 0.013 });
    this.googlyJustus.group.position.set(0.52, 0.58, 0);
    this.googlyJustus.group.rotation.y = Math.PI / 2;
    g.add(cuerpo, cabeza, hocico, cola, chaleco, this.googlyJustus.group);
    g.position.set(0, 0, -1);
    this.justus = g;
    this.scene.add(g);
  }

  /** Elenco: vendedor (cubo rojo que tiembla), Mateo, mamá. */
  #buildPersonajes() {
    // EL VENDEDOR: cubo rojo con googly de pánico — la forma estilizada del prompt.
    const v = new THREE.Group();
    const cubo = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd8262c, roughness: 0.6 }));
    cubo.position.y = 0.95;
    cubo.castShadow = true;
    this.googlyVendedor = makeGooglyEyes({ radio: 0.09, separacion: 0.11, pupila: 0.02 });
    this.googlyVendedor.group.position.set(0, 1.42, 0.3);
    this.googlyVendedor.setTemblor(0.5);
    v.add(cubo, this.googlyVendedor.group);
    v.position.set(1.4, 0, -PASILLO - 1);
    v.visible = false;
    this.vendedor = v;
    this.scene.add(v);

    const persona = (color, alto, x, z) => {
      const p = new THREE.Group();
      const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * alto, 0.4 * alto, 6, 10),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      cuerpo.position.y = 0.62 * alto;
      cuerpo.castShadow = true;
      const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14 * alto, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xc79b76, roughness: 0.6 }));
      cabeza.position.y = 1.12 * alto;
      const googly = makeGooglyEyes({ radio: 0.045 * alto, separacion: 0.05 * alto, pupila: 0.011 });
      googly.group.position.set(0, 1.14 * alto, 0.11 * alto);
      p.add(cuerpo, cabeza, googly.group);
      p.position.set(x, 0, z);
      p.visible = false;
      p.userData.googly = googly;
      this.scene.add(p);
      return p;
    };
    this.mateo = persona(0xffd21a, 0.72, -1.3, -PASILLO + 1.5);  // niño de polo amarillo
    this.mama = persona(0x8a5cc0, 1.0, -1.9, -PASILLO + 1.8);
  }

  /**
   * Assets gratuitos CC0/MIT (ver `public/CREDITS.md`): HDRI de entorno, piso
   * PBR y el VENDEDOR de verdad — pícaro encapuchado riggeado de KayKit con 76
   * clips. Todo carga async y mejora la escena en cuanto llega.
   */
  #loadAssets() {
    // 1) Iluminación de imagen real (Poly Haven): mejora TODOS los materiales.
    new RGBELoader().load('/hdri/galeria.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = hdr;
      this.scene.environmentIntensity = 0.6;
    });
    // 2) Piso PBR de galería (baldosas ambientCG con normal y roughness).
    const tl = new THREE.TextureLoader();
    const rep = (t, srgb = false) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 34);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    this.pisoMat.map = rep(tl.load('/textures/tiles/Tiles101_1K-JPG_Color.jpg'), true);
    this.pisoMat.normalMap = rep(tl.load('/textures/tiles/Tiles101_1K-JPG_NormalGL.jpg'));
    this.pisoMat.roughnessMap = rep(tl.load('/textures/tiles/Tiles101_1K-JPG_Roughness.jpg'));
    this.pisoMat.color.set(0xffffff);
    this.pisoMat.needsUpdate = true;
    // 3) EL VENDEDOR riggeado (sustituye al cubo placeholder del prompt).
    new GLTFLoader().load('/models/Vendedor.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
        // Un vendedor no va armado: fuera cuchillos y ballestas del pack.
        if (/knife|crossbow/i.test(o.name)) o.visible = false;
      });
      this.vendedor.clear();
      this.googlyVendedor = null; // el modelo trae su propia cara cartoon
      model.scale.setScalar(0.95);
      this.vendedor.add(model);
      this.vendedorMixer = new THREE.AnimationMixer(model);
      this.vendedorClips = {};
      for (const clip of gltf.animations) this.vendedorClips[clip.name] = clip;
      this.#vendAnim(this.fase === 3 ? 'Running_A' : 'Idle');
    });
    // 4) El resto del elenco riggeado (KayKit) + Justus (zorro Khronos teñido
    //    de pastor) + la zapatilla real. Async: el googly procedural queda de
    //    fallback hasta que cada GLB llega.
    // La mamá: la maga SIN sombrero ni varita — una señora de túnica.
    spawnRig('/models/Mama.glb', { targetHeight: 1.55, hideNodes: [/hat/i, /cape/i] })
      .then((rig) => this.#swapRig('mama', rig));
    spawnRig('/models/Mateo.glb', { targetHeight: 1.05 }).then((rig) => this.#swapRig('mateo', rig));
    spawnRig('/models/Justus.glb', { targetHeight: 0.8, tint: 0xcf9a5f }).then((rig) => {
      this.justus.clear();
      this.googlyJustus = null;
      this.colaJustus = null;
      this.patasJustus = [];
      this.justusRig = rig;
      this.justus.add(rig.model, this.#makeChalecoK9());
      rig.play('Survey');
    });
    this.zapatillaGlb = null;
    loadModel('/models/Zapatilla.glb').then((shoe) => { this.zapatillaGlb = shoe; });
  }

  /** Chaleco K-9 para el lomo del zorro: verde SUNAT con placa "K-9" a los lados. */
  #makeChalecoK9() {
    const g = new THREE.Group();
    const verde = new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.75 });
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.34), verde);
    const franja = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.028, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd9c14f, emissive: 0x5a4c10, emissiveIntensity: 0.4, roughness: 0.5 }));
    franja.position.y = 0.02;
    g.add(cuerpo, franja);
    // Placa "K-9" en ambos costados (canvas).
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#14361f'; c2.fillRect(0, 0, 128, 64);
    c2.fillStyle = '#ffd21a'; c2.font = 'bold 40px Arial'; c2.textAlign = 'center';
    c2.fillText('K-9', 64, 46);
    const tex = new THREE.CanvasTexture(cv);
    for (const sx of [-1, 1]) {
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08),
        new THREE.MeshBasicMaterial({ map: tex }));
      placa.position.set(sx * 0.125, 0, 0);
      placa.rotation.y = sx * Math.PI / 2;
      g.add(placa);
    }
    g.position.set(0, 0.52, -0.02); // sobre el lomo (el zorro mide 0.8)
    return g;
  }

  /** Sustituye un personaje googly por su rig (conserva grupo/posición). */
  #swapRig(key, rig, anim = 'Idle') {
    const grupo = this[key];
    grupo.clear();
    grupo.userData.googly = null;
    grupo.add(rig.model);
    this[`${key}Rig`] = rig;
    rig.play(anim);
  }

  /** Cambia el clip del vendedor con crossfade (noop hasta que cargue el GLB). */
  #vendAnim(nombre, { once = false } = {}) {
    if (!this.vendedorMixer || !this.vendedorClips?.[nombre]) return;
    const action = this.vendedorMixer.clipAction(this.vendedorClips[nombre]);
    if (once) { action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; }
    if (this._vendAction === action) return;
    action.reset().fadeIn(0.25).play();
    this._vendAction?.fadeOut(0.25);
    this._vendAction = action;
  }

  // ── HUD y subtítulos ──────────────────────────────────────────────────────
  #buildHUD() {
    const el = document.createElement('div');
    el.id = 'raid-hud';
    el.innerHTML = `
      <div class="rh-topbar"><span>OPERATIVO TRAFASPORT · NIVEL 3</span>
        <span class="rh-fase"></span>
        <button class="rh-exit">◄ MENÚ</button></div>
      <div class="rh-sub hidden"></div>
      <div class="rh-obj hidden"></div>
      <div class="rh-timer hidden"></div>
      <div class="rh-meter hidden"><div class="rh-meter-fill"></div><span>¡ARRÁSTRALO HACIA ABAJO!</span></div>
      <div class="rh-check hidden">
        <div data-ev="etiqueta">🔍 Etiqueta falsificada</div>
        <div data-ev="pegamento">🔍 Pegamento tóxico</div>
        <div data-ev="cartel">🔍 Cartel "No damos boleta"</div>
      </div>
      <div class="rh-lupa hidden"></div>
      <div class="rh-start">
        <div class="rh-start-inner">
          <div class="rh-badge">HISTORIA SUNAT · MATEO Y LAS ZAPATILLAS</div>
          <h1>OPERATIVO<br>TRAFASPORT</h1>
          <p>Una denuncia. Una tienda de la galería. Un perro que nunca se equivoca.<br>Cinco fases. Tú intervienes en todas.</p>
          <button class="rh-start-btn">▶ INICIAR OPERATIVO</button>
          <p class="rh-keys">${isTouch
            ? '🎧 Narrado por voz · joystick para mover · arrastra para interactuar'
            : '🎧 Narrado por voz · WASD mover · ratón interactuar'}</p>
        </div>
      </div>
      <div class="rh-final hidden"><div class="rh-final-card"></div></div>`;
    document.body.appendChild(el);
    this.overlay = el;
    this.$fase = el.querySelector('.rh-fase');
    this.$sub = el.querySelector('.rh-sub');
    this.$obj = el.querySelector('.rh-obj');
    this.$timer = el.querySelector('.rh-timer');
    this.$meter = el.querySelector('.rh-meter');
    this.$meterFill = el.querySelector('.rh-meter-fill');
    this.$check = el.querySelector('.rh-check');
    this.$lupa = el.querySelector('.rh-lupa');
    this.$start = el.querySelector('.rh-start');
    this.$final = el.querySelector('.rh-final');
    this.$finalCard = el.querySelector('.rh-final-card');

    // Mando virtual: solo en táctil. El joystick mueve a Justus y el botón
    // OLFATO "mantiene el espacio" — el gameplay no se entera de la diferencia.
    this.pad = new TouchControls({
      joystick: true,
      buttons: [{ code: 'Space', label: '👃', hint: 'OLFATO' }],
    });
    this.pad.mount();
    this.pad.setVisible(false); // aparece al empezar la fase 1

    el.querySelector('.rh-exit').addEventListener('click', () => this.onExit());
    el.querySelector('.rh-start-btn').addEventListener('click', () => {
      audio.startRaid();
      audio.musica('tienda');
      this.$start.classList.add('hidden');
      this.arrancado = true;
      this.pad?.setVisible(true);
      this.#narra('Galería comercial "El Progreso", mediodía. Mateo quiere zapatillas nuevas. Su mamá encontró una oferta… demasiado buena. Justus ya olió el problema.', 0);
      this.#objetivo(isTouch
        ? 'FASE 1 · Eres JUSTUS. Mantén 👃 para OLER el rastro verde y guíalo con el joystick hasta la trastienda.'
        : 'FASE 1 · Eres JUSTUS. Mantén [ESPACIO] para OLER el rastro verde y síguelo con WASD hasta la trastienda.');
    });
    this.#injectStyles();
  }

  /** Subtítulo llamativo sincronizado con la voz. */
  #narra(texto, delayMs = 0, hablante = null) {
    this.#later(() => {
      narrator.decir(hablante, texto, { esNarrador: !hablante });
      this.$sub.innerHTML = hablante ? `<b>${hablante}:</b> ${texto}` : texto;
      this.$sub.classList.remove('hidden');
      popIn(this.$sub, { from: 24 });
      clearTimeout(this._subT);
      this._subT = setTimeout(() => this.$sub.classList.add('hidden'), Math.max(3200, texto.length * 65));
    }, delayMs);
  }

  #objetivo(texto) {
    this.$obj.innerHTML = texto;
    this.$obj.classList.remove('hidden');
    popIn(this.$obj, { from: -14 }); // baja desde arriba con rebote
  }

  /** El narrador tose y comenta cuando el jugador mete la pata. */
  #tosNarrador(comentario) {
    audio.tos();
    this.#narra(`*coff coff* … ${comentario}`, 250);
  }

  #injectStyles() {
    const css = `
      #raid-hud { position: fixed; inset: 0; z-index: 40; pointer-events: none;
        font-family: 'Courier New', monospace; color: #eef4f8; }
      #raid-hud .hidden { display: none !important; }
      #raid-hud .rh-topbar { position: absolute; top: 0; left: 0; right: 0; padding: 12px 18px;
        background: linear-gradient(180deg, rgba(6,12,18,.8), transparent); letter-spacing: .14em;
        font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
      #raid-hud .rh-fase { color: #e0c07a; }
      #raid-hud .rh-exit { pointer-events: auto; cursor: pointer; background: transparent; color: #cdd8e2;
        border: 1px solid #3a4a5a; padding: 5px 12px; font-family: inherit; font-size: 12px; border-radius: 3px; }
      #raid-hud .rh-exit:hover { border-color: #e0952a; color: #e0952a; }
      #raid-hud .rh-sub { position: absolute; left: 50%; bottom: 9%; transform: translateX(-50%);
        max-width: 760px; width: max-content; background: rgba(6,10,16,.85); border-left: 4px solid #e0952a;
        padding: 14px 22px; font-family: Georgia, serif; font-size: 19px; font-style: italic; line-height: 1.5;
        border-radius: 4px; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
      #raid-hud .rh-sub b { color: #e0c07a; font-style: normal; }
      #raid-hud .rh-obj { position: absolute; left: 50%; top: 58px; transform: translateX(-50%);
        background: rgba(8,14,20,.8); border: 1px solid #e0952a; padding: 9px 16px; border-radius: 4px;
        font-size: 13px; letter-spacing: .06em; max-width: 720px; text-align: center; }
      #raid-hud .rh-timer { position: absolute; left: 50%; top: 110px; transform: translateX(-50%);
        font-size: 44px; font-weight: bold; color: #ff5a4a; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
      #raid-hud .rh-meter { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%);
        width: 320px; text-align: center; font-size: 13px; letter-spacing: .1em; }
      #raid-hud .rh-meter-fill { height: 18px; width: 0%; background: linear-gradient(90deg, #d8262c, #e0952a);
        border-radius: 9px; margin-bottom: 6px; transition: width .12s; box-shadow: 0 0 18px rgba(216,38,44,.6); }
      #raid-hud .rh-meter { background: rgba(8,14,20,.7); padding: 12px; border-radius: 6px; }
      #raid-hud .rh-check { position: absolute; right: 20px; top: 90px; background: rgba(8,14,20,.82);
        border: 1px solid #2f3d52; border-radius: 6px; padding: 12px 16px; font-size: 13px; line-height: 2; }
      #raid-hud .rh-check .ok { color: #64d6a0; text-decoration: line-through; }
      #raid-hud .rh-lupa { position: absolute; width: 230px; height: 230px; border: 5px solid #caa14a;
        border-radius: 50%; box-shadow: 0 0 0 3px #6a5322, 0 14px 40px rgba(0,0,0,.5); margin: -115px 0 0 -115px; }
      #raid-hud .rh-lupa::after { content: ''; position: absolute; right: -46px; bottom: -34px; width: 70px;
        height: 16px; background: #6a5322; border-radius: 8px; transform: rotate(38deg); }
      /* Overlays: FLEX real + scroll propio. Nada de tamaños fijos que se
         amontonen en un móvil (ADR-008/009). Todo escala con clamp(). */
      #raid-hud .rh-start, #raid-hud .rh-final { position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center; pointer-events: auto;
        overflow-y: auto; padding: clamp(12px, 3vh, 32px) clamp(12px, 4vw, 40px);
        background: radial-gradient(900px 600px at 50% 40%, rgba(24,30,44,.7), rgba(4,8,12,.92)); }
      #raid-hud .rh-start-inner, #raid-hud .rh-final-card {
        text-align: center; max-width: min(560px, 92vw); width: 100%;
        display: flex; flex-direction: column; align-items: center;
        gap: clamp(6px, 1.4vh, 14px); margin: auto; }
      #raid-hud .rh-badge { font-size: clamp(8px, 1.6vw, 11px); letter-spacing: .22em; color: #7d8ba0;
        border: 1px solid #2b3648; padding: 6px 12px; margin: 0; max-width: 100%; }
      #raid-hud .rh-start-inner h1 { font-size: clamp(24px, 5.4vw, 50px); line-height: 1.04; margin: 0;
        color: #fff; letter-spacing: .02em; }
      #raid-hud .rh-start-inner p { color: #b7c3cf; line-height: 1.55; margin: 0;
        font-size: clamp(11px, 1.7vw, 15px); max-width: 46ch; }
      #raid-hud .rh-start-btn { pointer-events: auto; cursor: pointer; margin: clamp(6px,1.6vh,16px) 0 4px;
        background: #d8262c; color: #fff; border: none; padding: clamp(12px,1.8vh,16px) clamp(20px,4vw,34px);
        font-family: inherit; letter-spacing: .16em; font-size: clamp(13px, 2vw, 16px);
        border-radius: 4px; min-height: 48px; }
      #raid-hud .rh-start-btn:hover { filter: brightness(1.15); }
      #raid-hud .rh-keys { font-size: clamp(9px, 1.4vw, 12px) !important; color: #7f8c99 !important;
        line-height: 1.5; }
      #raid-hud .rh-final-card { color: #eef4f8; }
      #raid-hud .rh-final-card h2 { color: #e0952a; letter-spacing: .18em; font-size: 26px; }
      #raid-hud .rh-final-card p { color: #b7c3cf; line-height: 1.8; }
      #raid-hud .rh-final-card button { display: block; margin: 18px auto 0; cursor: pointer; background: #23262e;
        color: #eef4f8; border: none; padding: 12px 26px; border-radius: 3px; font-family: inherit; letter-spacing: .1em; }

      /* ── Móvil (ADR-008): subtítulos a ancho completo, HUD compacto ───── */
      @media (max-width: 900px), (pointer: coarse) and (max-width: 1100px) {
        #raid-hud .rh-topbar { padding: 8px 10px; font-size: 9px; letter-spacing: .06em; gap: 6px; }
        #raid-hud .rh-exit { min-height: 44px; padding: 8px 12px; }
        /* El subtítulo ocupa el ancho inferior sin tapar la acción ni el mando */
        #raid-hud .rh-sub { width: 94vw; max-width: 94vw; bottom: auto; top: 74px;
          font-size: 15px; padding: 10px 14px; line-height: 1.4; }
        #raid-hud .rh-obj { top: 46px; font-size: 11px; padding: 7px 10px; max-width: 94vw; width: max-content; }
        #raid-hud .rh-timer { top: 92px; font-size: 34px; }
        #raid-hud .rh-scan { top: 34%; font-size: 12px; max-width: 88vw; }
        /* La barra de decisión sube: abajo vive el joystick */
        #raid-hud .rh-hint { bottom: auto; top: 50%; font-size: 12px; max-width: 92vw; text-align: center; }
        #raid-hud .rh-check { right: 8px; top: 76px; font-size: 11px; line-height: 1.7; padding: 8px 10px; }
        #raid-hud .rh-toast { max-width: 92vw; font-size: 12px; top: 76px; }
        #raid-hud .rh-lupa { width: 150px; height: 150px; margin: -75px 0 0 -75px; border-width: 4px; }
        /* Las tipografías ya son fluidas en la regla base (clamp): aquí solo
           layout. Duplicar font-size aquí solo creaba conflictos. */
        #raid-hud .rh-final-card button { min-height: 50px; }
      }
      /* Apaisado bajo: el subtítulo vuelve abajo pero encima del mando */
      @media (max-height: 460px) and (pointer: coarse) {
        #raid-hud .rh-sub { top: auto; bottom: 8px; left: 50%; width: 62vw; max-width: 62vw; font-size: 13px; }
        #raid-hud .rh-obj { font-size: 10px; padding: 5px 8px; }
        #raid-hud .rh-timer { top: 76px; font-size: 28px; }
        #raid-hud .rh-check { top: 62px; font-size: 10px; line-height: 1.5; }
        #raid-hud .rh-hint { top: 46%; }
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
      if (e.code === 'Space') { this.sniffHeld = true; e.preventDefault(); }
      if (e.code === 'F9') this.#debugSkip(); // QA: saltar a la siguiente fase
    };
    this._bound.keyup = (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') this.sniffHeld = false;
    };
    this._bound.resize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.post?.setSize(window.innerWidth, window.innerHeight);
    };
    this._bound.pdown = (e) => this.#pointerDown(e);
    this._bound.pmove = (e) => this.#pointerMove(e);
    this._bound.pup = (e) => this.#pointerUp(e);
    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup', this._bound.keyup);
    window.addEventListener('resize', this._bound.resize);
    this.renderer.domElement.addEventListener('pointerdown', this._bound.pdown);
    window.addEventListener('pointermove', this._bound.pmove);
    window.addEventListener('pointerup', this._bound.pup);
  }

  /** QA (F9): completa la fase actual al instante para probar la siguiente. */
  #debugSkip() {
    if (!this.arrancado) return;
    if (this.fase === 1) { this.puertaCaida = true; this.#startFase2(); }
    else if (this.fase === 2) {
      for (const c of this.cajas) disposeObject(c);
      this.cajas.length = 0;
      this.fase2T = 99; // el chequeo de "libre" resuelve en el próximo frame
    } else if (this.fase === 3) { this.camera.position.z = -5.9; }
    else if (this.fase === 4) { this.tugProgress = 1; }
    else if (this.fase === 5) {
      this.evidencias = { etiqueta: true, pegamento: true, cartel: true };
      this.#granFinal();
    }
  }

  #setPointer(e) {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.mouseX = e.clientX; this.mouseY = e.clientY;
  }

  #pointerDown(e) {
    if (!this.arrancado) return;
    this.#setPointer(e);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (this.fase === 1) this.#clickPuerta();
    else if (this.fase === 2) { this.sweep = true; this._sweepLast = { x: e.clientX, y: e.clientY, t: performance.now() }; this.#sweepFling(); }
    else if (this.fase === 3) this.#grabObstaculo(e);
    else if (this.fase === 4) this.#tugStart(e);
    else if (this.fase === 5) this.#clickEvidencia(e);
  }

  #pointerMove(e) {
    this.#setPointer(e);
    if (this.fase === 5) {
      // En táctil la lupa sube 90 px: el dedo tapa lo que intentas mirar.
      this.$lupa.style.left = `${e.clientX}px`;
      this.$lupa.style.top = `${e.clientY - (isTouch ? 90 : 0)}px`;
    }
    if (this.fase === 2 && this.sweep) this.#sweepFling(e);
    if (this.arrastre) this.#dragUpdate(e);
    if (this.tugHold && this.fase === 4) this.#tugDrag(e);
  }

  #pointerUp() {
    if (this.arrastre) this.#dragRelease();
    this.tugHold = false;
    this.sweep = false;
    this._zapDrag = null;
  }

  // ══ FASE 1 · Infiltración K-9 ═════════════════════════════════════════════
  #startFase1() {
    this.fase = 1;
    this.$fase.textContent = 'FASE 1 · INFILTRACIÓN K-9';
    // Cámara de perro: baja, pegada al lomo de Justus.
    this.camera.position.set(0, 0.9, 1.6);
    this.camera.lookAt(0, 0.4, -4);
  }

  #updateFase1(dt, t) {
    // WASD mueve a Justus por la galería.
    const sp = 5.2;
    let dx = 0; let dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    if (dx || dz) {
      const l = Math.hypot(dx, dz);
      this.justus.position.x = THREE.MathUtils.clamp(this.justus.position.x + (dx / l) * sp * dt, -ANCHO / 2 + 0.5, ANCHO / 2 - 0.5);
      this.justus.position.z = Math.max(this.justus.position.z + (dz / l) * sp * dt, -PASILLO - 1.2);
      // El rig glTF mira +z; el procedural miraba +x (de ahí el offset).
      this.justus.rotation.y = this.justusRig
        ? Math.atan2(dx / l, dz / l)
        : Math.atan2(-(dx / l), -(dz / l)) + Math.PI / 2;
      this.justusRig?.play('Run');
      // Trote procedural (solo fallback): patas y cola.
      for (const [i, pata] of this.patasJustus.entries()) {
        pata.position.y = 0.14 + Math.abs(Math.sin(t * 12 + i * Math.PI * 0.5)) * 0.07;
      }
    } else {
      this.justusRig?.play('Survey'); // olfatea el aire cuando está quieto
    }
    if (this.colaJustus) this.colaJustus.rotation.x = Math.sin(t * 9) * 0.45;
    this.googlyJustus?.update(dt, t);

    // Modo olfato: transición del filtro + respiración del humo.
    const target = this.sniffHeld ? 1 : 0;
    this.post.detective += (target - this.post.detective) * Math.min(1, dt * 5);
    // El humo SOLO existe para el olfato: su opacidad sigue al modo detective
    // (la cadena lo compone siempre, así que se apaga por material).
    this.trail.material.opacity = this.post.detective * 0.9;
    if (this.sniffHeld) {
      const posAttr = this.trail.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const sx = this.trailSeed[i * 2]; const sy = this.trailSeed[i * 2 + 1];
        // Ruido barato tipo Perlin: capas de senos desincronizados.
        posAttr.array[i * 3] = this.trailBase[i * 3] + Math.sin(t * 1.7 + sx) * 0.16 + Math.sin(t * 3.1 + sy) * 0.07;
        posAttr.array[i * 3 + 1] = this.trailBase[i * 3 + 1] + 0.12 + Math.sin(t * 2.3 + sx * 2) * 0.12 + Math.sin(sy + t) * 0.05;
        posAttr.array[i * 3 + 2] = this.trailBase[i * 3 + 2] + Math.cos(t * 1.3 + sy) * 0.1;
      }
      posAttr.needsUpdate = true;
    }

    // Cámara de perro: sigue a Justus desde atrás, a ras del suelo.
    const jp = this.justus.position;
    this.camera.position.lerp(new THREE.Vector3(jp.x, 0.85, jp.z + 2.4), Math.min(1, dt * 4));
    this.camera.lookAt(jp.x, 0.45, jp.z - 3);

    // ¿Llegó a la puerta?
    if (!this.enPuerta && jp.distanceTo(this.puerta.position.clone().setY(0)) < 2.2) {
      this.enPuerta = true;
      this.#narra('¡Aquí es! El rastro muere en esta puerta. ¡Rasca, Justus, RASCA!', 0);
      this.#objetivo('¡CLIC RÁPIDO x6 para rascar la puerta hasta tumbarla!');
    }
  }

  #clickPuerta() {
    if (!this.enPuerta || this.puertaCaida) return;
    this.clicksPuerta++;
    audio.beep(true);
    this.shake.add(0.16); // cada zarpazo se nota en la cámara del perro
    // Zarpazo: la puerta tiembla, Justus se lanza y salta polvo de la madera.
    gsap.fromTo(this.puerta.rotation, { z: -0.05 }, { z: 0.05, duration: 0.07, yoyo: true, repeat: 3 });
    gsap.fromTo(this.justus.position, { z: this.justus.position.z }, { z: this.justus.position.z - 0.25, duration: 0.09, yoyo: true, repeat: 1 });
    gsap.fromTo(this.justus.position, { y: 0 }, { y: 0.22, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.out' });
    this.#polvo(this.puerta.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.3) * 1.2, 0.2)), 4);
    // Astillas de progreso: la puerta se inclina un poco más con cada zarpazo.
    this.puerta.rotation.x = -this.clicksPuerta * 0.035;
    if (this.clicksPuerta >= 6) {
      this.puertaCaida = true;
      bus.emit(Señal.QTE_SUCCESS, { fase: 1, qte: 'puerta' });
      // El DERRUMBE: la puerta cae con nube de polvo y la cámara acusa el golpe.
      gsap.to(this.puerta.rotation, { x: -Math.PI / 2 + 0.06, duration: 0.55, ease: 'bounce.out' });
      gsap.to(this.puerta.position, { y: 0.1, z: this.puerta.position.z - 1.2, duration: 0.55, ease: 'power2.in' });
      this.#later(() => {
        this.#polvo(this.puerta.position.clone().setY(0.2), 16);
        audio.golpeSello();
        this.shake.add(0.85);       // la puerta cae: catástrofe controlada
        this.hitStop.golpe(110);
        flash('#ffffff', { opacidad: 0.3, duration: 0.35 });
      }, 480);
      audio.contenedor();
      this.#later(() => this.#startFase2(), 1100);
    }
  }

  /** Nube de polvo cartoon: esferitas grises que se expanden y desvanecen. */
  #polvo(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xcfc4b2, transparent: true, opacity: 0.75 }),
      );
      p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, Math.random() * 0.4, (Math.random() - 0.5) * 0.5));
      this.scene.add(p);
      gsap.to(p.scale, { x: 3, y: 3, z: 3, duration: 0.7 + Math.random() * 0.4, ease: 'power2.out' });
      gsap.to(p.position, { y: `+=${0.3 + Math.random() * 0.5}`, duration: 0.9 });
      gsap.to(p.material, { opacity: 0, duration: 0.8, delay: 0.15, onComplete: () => disposeObject(p) });
    }
  }

  // ══ FASE 2 · Allanamiento (cajas caóticas) ════════════════════════════════
  #startFase2() {
    this.fase = 2;
    bus.emit(Señal.FASE_COMPLETADA, { fase: 1 });
    this.$fase.textContent = 'FASE 2 · ALLANAMIENTO';
    this.sniffHeld = false;
    this.post.detective = 0;
    this.trail.material.opacity = 0; // fin del olfato: el rastro se apaga
    audio.musica(null);
    audio.stinger();
    this.#narra('¡ADUANAS! ¡Nadie se mueve! …El vendedor jala una palanca. Doscientas cajas de zapatos sepultan la evidencia. Quince segundos antes de que llegue su abogado. ¡DESENTIÉRRALA!', 200);
    this.pad?.setVisible(false); // de aquí en adelante todo se juega con el dedo
    this.#objetivo(isTouch
      ? 'MANOTAZO: arrastra el DEDO por la pila — todo lo que toques sale volando. ¡Desentierra el CONTRABANDO!'
      : 'MANOTAZO: mantén el CLIC y BARRE la pila con el ratón — todo lo que toques sale volando. ¡Desentierra el CONTRABANDO! (Los vidrios… mejor ni te cuento.)');

    // La cámara salta al plano del oficial: cerca y baja; el encuadre se
    // re-aplica CADA FRAME en updateFase2 (aguanta resize y aspect ratios raros).
    gsap.to(this.camera.position, { x: 0, y: 2.1, z: -PASILLO + 3.1, duration: 0.8, ease: 'power2.inOut' });
    this.vendedor.visible = true;

    // El paquete de contrabando, en el piso de la trastienda.
    const paqTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#7a5a2a'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#d8262c'; g.lineWidth = 8; g.strokeRect(8, 8, 112, 112);
      g.fillStyle = '#d8262c'; g.font = 'bold 26px Arial'; g.textAlign = 'center';
      g.fillText('FRÁGIL', 64, 72);
      return new THREE.CanvasTexture(cv);
    })();
    this.paquete = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.8),
      new THREE.MeshStandardMaterial({ map: paqTex, roughness: 0.8 }));
    this.paquete.position.set(0, 0.28, -PASILLO - 1);
    this.scene.add(this.paquete);

    // Lluvia de cajas de zapatos sobre la evidencia: pocas pero GRANDES —
    // se apartan a MANOTAZOS de barrido, no de una en una.
    const colores = [0xece7dc, 0xd9c14f, 0x4f9dd9, 0xd94f4f];
    for (let i = 0; i < quality.cajasAllanamiento; i++) {
      const caja = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.6),
        new THREE.MeshStandardMaterial({ color: colores[i % colores.length], roughness: 0.8 }),
      );
      caja.position.set(
        (Math.random() - 0.5) * 3.2,
        1.2 + Math.random() * 4,
        -PASILLO - 1 + (Math.random() - 0.5) * 2.4,
      );
      caja.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      caja.castShadow = true;
      caja.userData.v = new THREE.Vector3(0, -0.5, 0);
      caja.userData.w = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0);
      this.scene.add(caja);
      this.cajas.push(caja);
    }

    // El reloj de los 15 segundos.
    this.fase2Left = 15;
    this.$timer.classList.remove('hidden');
  }

  /**
   * MANOTAZO: con el clic sostenido, todo lo que el puntero barre sale volando
   * en la dirección del gesto. Nada de agarrar caja por caja.
   */
  #sweepFling(e) {
    // Velocidad del gesto en pantalla (px/ms) → dirección y violencia del manotazo.
    let dx = 4; let dy = -2; let speed = 1;
    if (e && this._sweepLast) {
      const now = performance.now();
      const dt = Math.max(8, now - this._sweepLast.t);
      dx = e.clientX - this._sweepLast.x;
      dy = e.clientY - this._sweepLast.y;
      speed = Math.hypot(dx, dy) / dt; // px por ms
      this._sweepLast = { x: e.clientX, y: e.clientY, t: now };
      if (speed < 0.08) return; // el manotazo pide movimiento, no un cursor quieto
    }
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.cajas, false);
    if (!hits.length) return;
    // Dirección en mundo: derecha/arriba de cámara según el gesto + empuje al frente.
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const fuerza = THREE.MathUtils.clamp(6 + speed * 9, 7, 24);
    const nx = Math.hypot(dx, dy) || 1;
    for (const h of hits) { // TODAS las cajas del rayo vuelan (satisfacción)
      const caja = h.object;
      caja.userData.v.copy(right).multiplyScalar((dx / nx) * fuerza)
        .addScaledVector(up, Math.max(2.5, (-dy / nx) * fuerza * 0.7 + 3));
      caja.userData.w.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0);
    }
    audio.papel();
  }

  #dragUpdate() {
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.dragPlane, hit)) return;
    const a = this.arrastre;
    const now = performance.now();
    const dt = Math.max(0.008, (now - a.lastT) / 1000);
    a.vel.copy(hit).sub(a.last).divideScalar(dt);
    a.last.copy(hit);
    a.lastT = now;
    a.obj.position.copy(hit);
  }

  #dragRelease() {
    const a = this.arrastre;
    this.arrastre = null;
    if (!a) return;
    // La caja sale disparada con la velocidad del gesto (violencia = distancia).
    a.obj.userData.v.copy(a.vel.clampLength(0, 26));
    if (this.fase === 3) a.obj.userData.thrown = true;
  }

  #updateFase2(dt) {
    // Encuadre estable CADA frame (aguanta resize y cualquier aspect).
    this.camera.lookAt(0, 1.0, -PASILLO - 1);

    // Física ligera: gravedad + rebote de suelo (el caos no necesita cannon).
    for (let i = this.cajas.length - 1; i >= 0; i--) {
      const caja = this.cajas[i];
      const v = caja.userData.v;
      v.y -= 14 * dt;
      caja.position.addScaledVector(v, dt);
      caja.rotation.x += caja.userData.w.x * dt;
      caja.rotation.z += caja.userData.w.y * dt;
      if (caja.position.y < 0.16) {
        caja.position.y = 0.16;
        v.y = Math.abs(v.y) > 1.4 ? -v.y * 0.35 : 0;
        v.x *= 0.9; v.z *= 0.9;
      }
      // ¿Choque violento contra un escaparate? CRISTALES.
      if (Math.abs(caja.position.x) > ANCHO / 2 - 0.2 && v.length() > 6) {
        const vid = this.vidrios.find((w) => !w.roto &&
          Math.sign(w.side) === Math.sign(caja.position.x) && Math.abs(w.mesh.position.z - caja.position.z) < 2.4);
        if (vid) this.#romperVidrio(vid, caja.position);
        v.x = -v.x * 0.4;
      }
      // Caja apartada lejos de la evidencia: DESPAWN (jamás vuelve a estorbar
      // ni queda invisible contando como "encima").
      const dPaq = Math.hypot(caja.position.x - this.paquete.position.x, caja.position.z - this.paquete.position.z);
      if (dPaq > 3.6 || Math.abs(caja.position.x) > 6 || caja.position.y < -0.5) {
        disposeObject(caja);
        this.cajas.splice(i, 1);
      }
    }

    // Cuenta atrás + contador de cajas restantes sobre la evidencia.
    this.fase2Left -= dt;
    const encima = this.cajas.filter((c) =>
      Math.hypot(c.position.x - this.paquete.position.x, c.position.z - this.paquete.position.z) < 0.95).length;
    this.$timer.innerHTML = `${Math.max(0, this.fase2Left).toFixed(1)}<div style="font-size:15px;color:#e0c07a">cajas sobre la evidencia: ${encima}</div>`;
    if (this.fase2Left <= 0) {
      this.fase2Left = 15; // el narrador se apiada, pero tose.
      this.#tosNarrador('El abogado se retrasó en el tráfico. Tienes QUINCE segundos más. No me hagas toser de nuevo.');
    }

    // ¿Evidencia desenterrada? Tras el derrumbe (2 s) y midiendo en PLANTA.
    this.fase2T = (this.fase2T ?? 0) + dt;
    const libre = this.fase2T > 2 && encima === 0;
    if (libre) {
      this.$timer.classList.add('hidden');
      bus.emit(Señal.QTE_SUCCESS, { fase: 2, qte: 'evidencia' });
      gsap.to(this.paquete.position, { y: 1.4, duration: 0.7, ease: 'back.out(2)' });
      gsap.to(this.paquete.rotation, { y: Math.PI * 2, duration: 0.9 });
      audio.stinger();
      this.#narra('¡Ahí está! Cajas sin marca, sin factura, sin origen. El vendedor lo sabe… y por eso ECHA A CORRER.', 300);
      this.fase = 0; // pausa técnica durante la transición
      this.#later(() => this.#startFase3(), 2600);
    }
  }

  #romperVidrio(vid, donde) {
    vid.roto = true;
    audio.vidrios();
    this.shake.add(0.45);
    this.hitStop.golpe(70);
    flash('#dff4ff', { opacidad: 0.26, duration: 0.3 });
    vid.mesh.visible = false;
    // Esquirlas: quads mínimos que caen girando.
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8f0fa, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + Math.random() * 0.2, 0.12 + Math.random() * 0.25), mat);
      sh.position.copy(vid.mesh.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 3));
      this.scene.add(sh);
      gsap.to(sh.position, { y: 0.05, x: `+=${(Math.random() - 0.5) * 1.2}`, duration: 0.7 + Math.random() * 0.5, ease: 'power2.in' });
      gsap.to(sh.rotation, { x: Math.random() * 6, y: Math.random() * 6, duration: 1.1 });
      gsap.to(sh.material, { opacity: 0, delay: 1.1, duration: 0.4, onComplete: () => disposeObject(sh) });
    }
    this.#tosNarrador('…Eso era vidrio templado. Va al acta, oficial. Al acta.');
    // El vendedor se encoge del susto con cada cristal.
    this.#vendAnim('Hit_A', { once: true });
    this.#later(() => { if (this.fase === 2) this.#vendAnim('Idle'); }, 700);
  }

  // ══ FASE 3 · Persecución auto-runner ══════════════════════════════════════
  #startFase3() {
    this.fase = 3;
    bus.emit(Señal.FASE_COMPLETADA, { fase: 2 });
    this.$fase.textContent = 'FASE 3 · PERSECUCIÓN';
    audio.musica('persecucion');
    this.#narra('¡SE FUGA POR LA GALERÍA! Empujó a Mateo, tiró un maniquí, ¡corre como si no hubiera pagado impuestos EN SU VIDA!', 0);
    this.#objetivo(isTouch
      ? '¡AGARRA los obstáculos EN PLENO VUELO con el DEDO y LÁNZALOS a los costados!'
      : '¡AGARRA los obstáculos EN PLENO VUELO con el ratón y LÁNZALOS a los costados!');

    // Reset del corredor: la cámara corre de vuelta hacia la salida (+z).
    this.camera.position.set(0, 1.5, -PASILLO - 1);
    this.camera.lookAt(0, 1.2, 0);
    this.runnerZ = -PASILLO - 1;
    this.runnerT = 0;
    // Motion blur fake: FOV abierto + líneas de velocidad aditivas.
    gsap.to(this.camera, { fov: 84, duration: 0.8, onUpdate: () => this.camera.updateProjectionMatrix() });
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * ANCHO * 1.4;
      pos[i * 3 + 1] = Math.random() * 3.4;
      pos[i * 3 + 2] = -Math.random() * PASILLO;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.speedLines = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.05, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.speedLines);
    // El vendedor corre delante, siempre fuera de alcance… hasta la salida.
    this.vendedor.visible = true;
    this.vendedor.position.set(0, 0, this.runnerZ + 10);
    this.#vendAnim('Running_A');
  }

  #spawnObstaculo() {
    // Maniquí (cápsula pálida), carrito (caja con ruedas) o caja al azar.
    const tipo = ['maniqui', 'carrito', 'caja'][Math.floor(Math.random() * 3)];
    let m;
    if (tipo === 'maniqui') {
      m = new THREE.Group();
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.6 }));
      c.position.y = 0;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.6 }));
      h.position.y = 0.62;
      m.add(c, h);
    } else if (tipo === 'carrito') {
      m = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x8a94a0, roughness: 0.5, metalness: 0.5 }));
      for (const [wx, wz] of [[-0.35, 0.25], [0.35, 0.25], [-0.35, -0.25], [0.35, -0.25]]) {
        const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10),
          new THREE.MeshStandardMaterial({ color: 0x22252b }));
        rueda.rotation.x = Math.PI / 2;
        rueda.position.set(wx, -0.42, wz);
        m.add(rueda);
      }
      m.add(c);
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xd9c14f, roughness: 0.8 }));
    }
    // El obstáculo nace EN LAS MANOS del vendedor (gesto Throw incluido) y
    // vuela en arco hacia la cara del oficial.
    m.position.set(this.vendedor.position.x, 1.3, this.vendedor.position.z);
    m.userData.v = new THREE.Vector3(
      (this.camera.position.x - this.vendedor.position.x) * 0.4 + (Math.random() - 0.5) * 1.6,
      2.2 + Math.random() * 1.2,
      -13 - Math.random() * 5,
    );
    m.userData.obst = true;
    this.scene.add(m);
    this.obstaculos.push(m);
    this.#vendAnim('Throw', { once: true });
    this.#later(() => { if (this.fase === 3) this.#vendAnim('Running_A'); }, 550);
  }

  #grabObstaculo() {
    const hits = this.ray.intersectObjects(this.obstaculos, true);
    if (!hits.length) return;
    let o = hits[0].object;
    while (o && !o.userData.obst) o = o.parent;
    if (!o) return;
    bus.emit(Señal.QTE_SUCCESS, { fase: 3, qte: 'agarre' });
    this.dragPlane.setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(new THREE.Vector3()).negate(), o.position);
    this.arrastre = { obj: o, last: o.position.clone(), lastT: performance.now(), vel: new THREE.Vector3() };
    o.userData.v.set(0, 0, 0); // en la mano: deja de volar hacia ti
  }

  #updateFase3(dt, t) {
    // La cámara corre sola hacia la salida.
    const SPEED = 7.5;
    this.camera.position.z += SPEED * dt;
    this.camera.position.x = Math.sin(t * 1.7) * 0.25; // trote de carrera
    this.camera.position.y = 1.5 + Math.abs(Math.sin(t * 8)) * 0.05;
    this.vendedor.position.z = this.camera.position.z + 10;
    this.vendedor.position.x = Math.sin(t * 2.2) * 1.2;
    this.googlyVendedor?.update(dt, t);

    this.runnerT += dt;
    if (!this._nextObst || this.runnerT > this._nextObst) {
      this._nextObst = this.runnerT + 0.75 + Math.random() * 0.6;
      this.#spawnObstaculo();
    }

    for (let i = this.obstaculos.length - 1; i >= 0; i--) {
      const o = this.obstaculos[i];
      if (this.arrastre?.obj !== o) {
        o.position.addScaledVector(o.userData.v, dt);
        o.rotation.x += dt * 2.2; o.rotation.y += dt * 1.4;
        // Arco balístico: lo lanzado (por el vendedor o por ti) cae.
        o.userData.v.y -= (o.userData.thrown ? 9 : 4.5) * dt;
      }
      // Impacto contra la cámara: si llega vivo y centrado, DUELE.
      const rel = o.position.z - this.camera.position.z;
      if (rel < 0.6 && rel > -0.8 && Math.abs(o.position.x - this.camera.position.x) < 1.3 &&
          o.position.y < 2.4 && this.arrastre?.obj !== o && !o.userData.golpeado) {
        o.userData.golpeado = true;
        this.integridad--;
        audio.beep(false);
        // Recibes un maniquí en la cara: golpe duro con congelación y destello rojo.
        this.shake.add(0.7);
        this.hitStop.golpe(100);
        flash('#ff4a3c', { opacidad: 0.34, duration: 0.45 });
        this.#tosNarrador(this.integridad > 0
          ? 'Un maniquí en la cara. Muy digno, oficial, muy digno.'
          : 'Reporte médico: orgullo, fracturado. Pero la placa no se suelta.');
      }
      // Fuera de escena: adiós.
      if (rel < -3 || Math.abs(o.position.x) > 9 || o.position.y < -1) {
        disposeObject(o);
        this.obstaculos.splice(i, 1);
      }
    }

    if (this.speedLines) {
      this.speedLines.material.opacity = 0.35 + Math.sin(t * 24) * 0.12;
    }

    // Meta: la salida de la galería.
    if (this.camera.position.z > -6) this.#startFase4();
  }

  // ══ FASE 4 · El arresto (tug-of-war) ══════════════════════════════════════
  #startFase4() {
    this.fase = 4;
    bus.emit(Señal.FASE_COMPLETADA, { fase: 3 });
    this.$fase.textContent = 'FASE 4 · EL ARRESTO';
    disposeObject(this.speedLines);
    for (const o of this.obstaculos) disposeObject(o);
    this.obstaculos.length = 0;
    audio.silbato();
    this.#narra('¡Lo alcanzaste en la salida! Pero el tipo forcejea como pulpo en fiesta patronal. ¡NO LO SUELTES!', 0);
    this.#objetivo(isTouch
      ? 'APOYA el DEDO sobre el vendedor y ARRÁSTRALO hacia ABAJO, resistiendo sus tirones, hasta el círculo policial.'
      : 'MANTÉN el clic sobre el vendedor y ARRASTRA hacia ABAJO, resistiendo sus tirones, hasta el círculo policial.');

    // Zoom dramático.
    gsap.to(this.camera, { fov: 58, duration: 0.6, onUpdate: () => this.camera.updateProjectionMatrix() });
    this.camera.position.set(0, 1.7, 1.5);
    this.camera.lookAt(0, 1, -3.5);
    this.vendedor.position.set(0, 0, -3.5);
    this.vendedor.rotation.y = 0; // encara al oficial
    this.#vendAnim('Unarmed_Idle'); // en guardia: el forcejeo
    this.tugStartZ = -3.5;

    // El círculo de esposado, en el piso frente a la cámara.
    const anillo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 40),
      new THREE.MeshBasicMaterial({ color: 0x3f7fb0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.set(0, 0.02, -1.4);
    this.anillo = anillo;
    this.scene.add(anillo);
    this.$meter.classList.remove('hidden');
    this.tugProgress = 0;

    // Los tirones del vendedor: empujes programados hacia adelante.
    this._tugInterval = setInterval(() => {
      if (this.fase !== 4) return;
      this.tugProgress = Math.max(0, this.tugProgress - (0.09 + Math.random() * 0.08));
      gsap.fromTo(this.vendedor.position, { x: -0.18 }, { x: 0.18, duration: 0.08, yoyo: true, repeat: 3 });
      this.#vendAnim('Hit_A', { once: true }); // el tirón: se revuelve entero
      this.#later(() => { if (this.fase === 4 && !this.arrestado) this.#vendAnim('Unarmed_Idle'); }, 600);
      audio.beep(false);
    }, 900);
    this._timers.push(this._tugInterval);
  }

  #tugStart() {
    const hits = this.ray.intersectObjects([this.vendedor], true);
    if (hits.length) { this.tugHold = true; this._lastTugY = this.mouseY; }
  }

  #tugDrag() {
    const dy = this.mouseY - this._lastTugY;
    this._lastTugY = this.mouseY;
    if (dy > 0) this.tugProgress = Math.min(1, this.tugProgress + dy * 0.0012); // arrastrar hacia abajo = fuerza
  }

  #updateFase4(dt, t) {
    this.googlyVendedor?.update(dt, t);
    // El pánico: el placeholder tiembla; el modelo riggeado ya actúa solo.
    if (this.googlyVendedor) this.vendedor.children[0].rotation.z = Math.sin(t * 31) * 0.05;
    this.vendedor.position.z = THREE.MathUtils.lerp(this.tugStartZ, this.anillo.position.z, this.tugProgress);
    this.$meterFill.style.width = `${(this.tugProgress * 100).toFixed(0)}%`;
    this.anillo.material.opacity = 0.6 + Math.sin(t * 6) * 0.25;

    if (this.tugProgress >= 1 && !this.arrestado) {
      this.arrestado = true;
      clearInterval(this._tugInterval);
      this.$meter.classList.add('hidden');
      bus.emit(Señal.QTE_SUCCESS, { fase: 4, qte: 'arresto' });
      audio.musica(null);
      audio.stinger();
      // Esposado: el modelo se sienta en el suelo; el placeholder cae de nalgas.
      if (this.vendedorMixer) {
        this.#vendAnim('Sit_Floor_Down', { once: true });
        this.#later(() => this.#vendAnim('Sit_Floor_Idle'), 1100);
      } else {
        gsap.to(this.vendedor.rotation, { x: -0.4, duration: 0.5, ease: 'bounce.out' });
        gsap.to(this.vendedor.position, { y: -0.35, duration: 0.5, ease: 'bounce.out' });
      }
      this.googlyVendedor?.setTemblor(1);
      // Refuerzos: dos oficiales entran corriendo a flanquear al detenido.
      this.knightRigs = [];
      [-1, 1].forEach((side) => {
        spawnRig('/models/Oficial.glb', { targetHeight: 1.8 }).then((rig) => {
          const g = new THREE.Group();
          g.add(rig.model);
          g.position.set(side * 3.2, 0, 3.5);
          g.rotation.y = Math.PI; // vienen desde detrás de la cámara
          this.scene.add(g);
          rig.play('Running_A');
          this.knightRigs.push({ rig, g });
          gsap.to(g.position, {
            x: this.vendedor.position.x + side * 0.9, z: this.vendedor.position.z + 0.4,
            duration: 1.2, ease: 'power1.inOut',
            onComplete: () => rig.play('Idle'),
          });
        });
      });
      this.#narra('Esposado. Se acabó la función. Ahora falta lo más importante: que Mateo entienda POR QUÉ.', 400);
      this.#later(() => this.#startFase5(), 3200);
    }
  }

  // ══ FASE 5 · La lección (lupa) ════════════════════════════════════════════
  #startFase5() {
    this.fase = 5;
    bus.emit(Señal.FASE_COMPLETADA, { fase: 4 });
    this.$fase.textContent = 'FASE 5 · LA LECCIÓN';
    audio.musica('tienda');
    this.#narra('De vuelta en Trafasport. Mateo y su mamá esperan, asustados. Justus llega con su chaleco de héroe. Demuéstrales por qué esta zapatilla es contrabando.', 0);
    this.#objetivo(isTouch
      ? 'Tu DEDO lleva la lupa (mira por encima de él). ARRASTRA para girar la zapatilla y TOCA las 3 evidencias.'
      : 'Tu cursor ES una lupa. ARRASTRA para girar la zapatilla y haz CLIC en las 3 evidencias.');
    this.$check.classList.remove('hidden');
    this.$lupa.classList.remove('hidden');

    // La escena de la lección: pedestal frente a la tienda.
    this.camera.position.set(0, 1.5, -PASILLO + 4.2);
    this.camera.lookAt(0, 1.3, -PASILLO - 1);
    gsap.to(this.camera, { fov: 50, duration: 0.7, onUpdate: () => this.camera.updateProjectionMatrix() });

    // El elenco toma su lugar (los refuerzos se retiran con el detenido).
    // OJO: los rigs son clones de `SkeletonUtils` que COMPARTEN geometría y
    // materiales con el GLB cacheado. Aquí se quitan pero NO se liberan: hacerlo
    // rompería a los demás clones vivos. La liberación real ocurre en unmount().
    for (const k of this.knightRigs ?? []) this.scene.remove(k.g);
    this.knightRigs = null;
    this.mateo.visible = true;
    this.mama.visible = true;
    this.vendedor.visible = false;
    this.justus.position.set(1.6, 0, -PASILLO + 2);
    this.justus.rotation.y = -0.8;
    this.justusRig?.play('Survey'); // olfatea orgulloso junto a la evidencia

    // LA ZAPATILLA sospechosa, girando sobre un pedestal: el modelo REAL de
    // Khronos si ya cargó; el mock de primitivas como fallback.
    const zap = new THREE.Group();
    if (this.zapatillaGlb) {
      const shoe = this.zapatillaGlb;
      const size = new THREE.Box3().setFromObject(shoe).getSize(new THREE.Vector3());
      shoe.scale.multiplyScalar(1.05 / Math.max(size.x, size.y, size.z));
      const centro = new THREE.Box3().setFromObject(shoe).getCenter(new THREE.Vector3());
      shoe.position.sub(centro);
      shoe.position.y += 0.07; // deja aire bajo la suela: el pegamento asoma
      shoe.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      zap.add(shoe);
    } else {
      const suelaMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.7 });
      const suela = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.4), suelaMat);
      const cuerpoMat = new THREE.MeshStandardMaterial({ color: 0x2a6ad9, roughness: 0.55 });
      const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 6, 12), cuerpoMat);
      cuerpo.rotation.z = Math.PI / 2;
      cuerpo.position.set(-0.05, 0.22, 0);
      const talon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), cuerpoMat);
      talon.position.set(-0.42, 0.24, 0);
      zap.add(suela, cuerpo, talon);
    }
    // Evidencia 1: etiqueta falsificada (se despinta al pasarle la lupa).
    this.etiquetaCv = document.createElement('canvas');
    this.etiquetaCv.width = 128; this.etiquetaCv.height = 64;
    this.#pintarEtiqueta(1);
    this.etiquetaTex = new THREE.CanvasTexture(this.etiquetaCv);
    const etiqueta = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshBasicMaterial({ map: this.etiquetaTex }));
    etiqueta.position.set(0.1, 0.3, 0.21);
    etiqueta.userData.evidencia = 'etiqueta';
    // Evidencia 2: pegamento tóxico (goterones verdosos bajo la suela).
    const pegamento = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x9ab52a, emissive: 0x4a6a10, emissiveIntensity: 0.7, roughness: 0.3 }));
    pegamento.scale.set(1.6, 0.5, 1);
    pegamento.position.set(0.22, -0.08, 0);
    pegamento.userData.evidencia = 'pegamento';
    if (this.zapatillaGlb) {
      // Reanclar las evidencias a la geometría del modelo real: la etiqueta
      // flota pegada al lateral y el pegamento SOBRESALE bajo la suela (visible
      // y clicable — fix del bug reportado por el Director).
      etiqueta.position.set(0.12, 0.1, 0.23);
      pegamento.scale.set(2.1, 0.7, 1.5);
      pegamento.position.set(0.26, -0.24, 0.07);
    }
    zap.add(etiqueta, pegamento);

    // Hitboxes invisibles: en táctil el dedo es mucho más gordo que un cursor,
    // así que cada evidencia recibe una esfera de captura generosa (el material
    // invisible sigue siendo raycasteable — mismo truco que los hotspots del
    // pasajero en el Nivel 1).
    const rHit = isTouch ? 0.3 : 0.17;
    for (const src of [etiqueta, pegamento]) {
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(rHit, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.copy(src.position);
      hit.userData.evidencia = src.userData.evidencia;
      zap.add(hit);
    }
    if (this.cartel && isTouch) this.cartel.scale.setScalar(1.35); // el cartel también engorda
    zap.position.set(0, 1.35, -PASILLO + 1.2);
    this.zapatilla = zap;
    this.scene.add(zap);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 14),
      new THREE.MeshStandardMaterial({ color: 0x33415c, roughness: 0.6 }));
    pedestal.position.set(0, 0.5, -PASILLO + 1.2);
    this.scene.add(pedestal);

    // Girar la zapatilla arrastrando fuera de evidencias.
    this._zapDrag = null;
  }

  #pintarEtiqueta(alpha) {
    const g = this.etiquetaCv.getContext('2d');
    g.fillStyle = '#f2ede2';
    g.fillRect(0, 0, 128, 64);
    g.globalAlpha = alpha;
    g.fillStyle = '#1a1a1a';
    g.font = 'bold 22px Arial';
    g.textAlign = 'center';
    g.fillText('N1KE', 64, 28);        // la falsificación clásica de galería
    g.font = '13px Arial';
    g.fillText('MADE IN ???', 64, 50);
    g.globalAlpha = 1;
  }

  #clickEvidencia() {
    const objetos = [this.zapatilla, this.cartel].filter(Boolean);
    const hits = this.ray.intersectObjects(objetos, true);
    if (!hits.length) { this._zapDrag = { x: this.mouseX }; return; } // arrastre = rotación
    // La evidencia puede quedar DETRÁS de la malla de la zapatilla real: se
    // busca en TODOS los impactos del rayo, no solo el primero (fix del bug
    // "el pegamento no se puede clicar").
    let ev = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.evidencia) o = o.parent;
      if (o?.userData.evidencia) { ev = o.userData.evidencia; break; }
    }
    if (!ev) { this._zapDrag = { x: this.mouseX }; return; }
    if (this.evidencias[ev]) return;
    this.evidencias[ev] = true;
    bus.emit(Señal.QTE_SUCCESS, { fase: 5, qte: ev });
    const item = this.$check.querySelector(`[data-ev="${ev}"]`);
    item.classList.add('ok');
    item.textContent = '✔ ' + item.textContent.slice(2);
    if (ev === 'etiqueta') {
      // La etiqueta se DESPINTA bajo la lupa: la tinta barata no aguanta.
      const st = { a: 1 };
      gsap.to(st, { a: 0.12, duration: 1.1, onUpdate: () => { this.#pintarEtiqueta(st.a); this.etiquetaTex.needsUpdate = true; } });
      audio.beep(true);
      this.#narra('¿Ves, Mateo? La marca se despinta con solo frotarla. Una original no hace eso ni en diez años.', 100);
    } else if (ev === 'pegamento') {
      audio.quimico();
      this.#narra('Y esto de aquí es pegamento industrial tóxico. Huélelo… no, mejor NO lo huelas. Eso va pegado al pie de un niño.', 100);
    } else {
      audio.beep(true);
      this.#narra('«No damos boleta.» Sin comprobante no hay garantía, no hay impuestos, no hay país. TODO estaba a la vista.', 100);
    }
    if (this.evidencias.etiqueta && this.evidencias.pegamento && this.evidencias.cartel) {
      this.#later(() => this.#granFinal(), 2800);
    }
  }

  #updateFase5(dt, t) {
    if (this._zapDrag && this.zapatilla) {
      const dx = this.mouseX - this._zapDrag.x;
      this.zapatilla.rotation.y += dx * 0.012;
      this._zapDrag.x = this.mouseX;
    }
    if (!this.tugHold && !this._zapDrag) this.zapatilla.rotation.y += dt * 0.25; // giro de vitrina
    if (this.pointerUpFlag) this._zapDrag = null;
    this.googlyJustus?.update(dt, t);
    this.mateo.userData.googly?.update(dt, t);
    this.mama.userData.googly?.update(dt, t + 3);
    if (this.colaJustus) this.colaJustus.rotation.x = Math.sin(t * 10) * 0.5; // la cola no miente
  }

  // ══ GRAN FINAL ════════════════════════════════════════════════════════════
  #granFinal() {
    this.fase = 6;
    bus.emit(Señal.FASE_COMPLETADA, { fase: 5 });
    this.$lupa.classList.add('hidden');
    this.$check.classList.add('hidden');
    audio.musica(null);
    audio.ladridoFeliz();
    this.#narra('¡GUAU, GUAU! Justus lo celebra. La mamá de Mateo respira. Y sobre Trafasport cae todo el peso de la ley… LITERALMENTE.', 200);

    // Justus salta feliz (zoomies); Mateo y mamá celebran con su clip.
    gsap.to(this.justus.position, { y: 0.5, duration: 0.28, yoyo: true, repeat: 5, ease: 'power1.out' });
    this.justusRig?.play('Run');
    this.mateoRig?.play('Cheer');
    this.mamaRig?.play('Cheer');
    gsap.to(this.mateo.position, { y: 0.4, duration: 0.3, yoyo: true, repeat: 3, ease: 'power1.out' });
    if (!this.mateoRig) gsap.to(this.mateo.rotation, { z: 0.15, duration: 0.3, yoyo: true, repeat: 3 });

    // EL SELLO GIGANTE cae del cielo sobre la tienda.
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#a3122a';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(14, 14, 484, 228);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 56px Arial';
    g.fillText('CLAUSURADO', 256, 110);
    g.font = 'bold 40px Arial';
    g.fillText('POR CONTRABANDO', 256, 175);
    const sello = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.7),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.5 }));
    sello.position.set(0, 16, -PASILLO - 1.7);
    this.scene.add(sello);
    gsap.to(sello.position, {
      y: 2.4, duration: 0.65, ease: 'power3.in', delay: 1.2,
      onComplete: () => {
        audio.golpeSello();
        gsap.fromTo(this.camera.position, { y: this.camera.position.y + 0.16 }, { y: 1.5, duration: 0.7, ease: 'elastic.out(1.4, 0.25)' });
        this.#polvo(new THREE.Vector3(0, 1.2, -PASILLO - 1.5), 14);
        this.#confeti(); // ¡fiesta!
      },
    });

    bus.emit(Señal.RAID_FINALIZADO, { integridad: this.integridad, vidriosRotos: this.vidrios.filter((v) => v.roto).length });
    this.#later(() => {
      const rotos = this.vidrios.filter((v) => v.roto).length;
      this.$finalCard.innerHTML = `
        <h2>OPERATIVO CERRADO</h2>
        <p>Contrabando incautado · Vendedor detenido · Tienda clausurada.<br>
        Mateo aprendió a exigir boleta. Justus recibió doble ración.<br><br>
        Integridad del oficial: <b>${'❤'.repeat(Math.max(0, this.integridad))}${'🖤'.repeat(3 - Math.max(0, this.integridad))}</b>
        · Vidrios rotos en el acta: <b>${rotos}</b></p>
        <p style="font-style:italic">«La oferta más cara es la que no da boleta.»</p>`;
      const btn = document.createElement('button');
      btn.textContent = '◄ VOLVER AL MENÚ';
      btn.addEventListener('click', () => this.onExit());
      this.$finalCard.appendChild(btn);
      this.$final.classList.remove('hidden');
    }, 4200);
  }

  /** Lluvia de confeti: cuadraditos de colores que caen girando sobre la escena. */
  #confeti() {
    const cols = [0xd94f4f, 0xe0952a, 0x4f9dd9, 0x53b06a, 0xffd21a, 0x8a5cc0];
    for (let i = 0; i < quality.confeti; i++) {
      const c = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07, 0.05),
        new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }),
      );
      c.position.set((Math.random() - 0.5) * 8, 4 + Math.random() * 3, -PASILLO + 0.5 + (Math.random() - 0.5) * 4);
      c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(c);
      const dur = 2.2 + Math.random() * 1.6;
      gsap.to(c.position, { y: 0.03, x: `+=${(Math.random() - 0.5) * 1.6}`, duration: dur, ease: 'power1.in', delay: Math.random() * 0.8 });
      gsap.to(c.rotation, { x: `+=${6 + Math.random() * 6}`, z: `+=${5 + Math.random() * 5}`, duration: dur + 0.8 });
      gsap.to(c.material, { opacity: 0, duration: 0.5, delay: dur + 0.5, onComplete: () => disposeObject(c) });
    }
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────
  #loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dtReal = Math.min(this.clock.getDelta(), 0.05);
      this.perf.update(dtReal);
      // En pausa el mundo se congela pero se sigue renderizando.
      const dt = this.pausado ? 0 : this.hitStop.escala(dtReal);
      const t = this.clock.elapsedTime;

      this.#updatePolvo(t);           // el aire de la galería
      this.vendedorMixer?.update(dt); // clips del vendedor riggeado
      this.justusRig?.update(dt);
      this.mateoRig?.update(dt);
      this.mamaRig?.update(dt);
      this.knightRigs?.forEach((k) => k.rig.update(dt));

      if (this.arrancado) {
        if (this.fase === 1) this.#updateFase1(dt, t);
        else if (this.fase === 2) this.#updateFase2(dt, t);
        else if (this.fase === 3) this.#updateFase3(dt, t);
        else if (this.fase === 4) this.#updateFase4(dt, t);
        else if (this.fase === 5) this.#updateFase5(dt, t);
      }

      // Una sola cadena para todo: grade → humo neón → bloom → salida.
      // El humo se compone SIEMPRE (fuera del olfato es casi invisible porque
      // sus partículas viven pegadas al suelo y el bloom apenas las toca).
      this.shake.apply(dtReal);
      this.post.render();
      this.shake.revert(); // la posición real de la cámara queda limpia
    };
    tick();
  }
}
