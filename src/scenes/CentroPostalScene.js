import * as THREE from 'three';
import gsap from 'gsap';
import { quality, isTouch, tuneRaycaster } from '../core/Device.js';
import { TouchControls } from '../ui/TouchControls.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { PostFX } from '../render/PostFX.js';
import { PerfGuard, recorteRatioPixel, recorteSombras } from '../core/PerfGuard.js';
import { CameraShake, HitStop, flash } from '../core/Juice.js';
import { cerrarNivel } from '../core/Disposal.js';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje, VALOR } from '../core/Puntaje.js';
import { Marcador } from '../ui/Marcador.js';
import { progreso } from '../core/Progreso.js';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';
import { NAVE, construirCentroPostal, FabricaPaquetes, crearOficial } from '../world/CentroPostal.js';
import { EfectosHerramienta } from '../world/EfectosHerramienta.js';
import { HUDCentroPostal } from '../ui/HUDCentroPostal.js';
import { coach } from '../ui/JustusCoach.js';
import {
  HERRAMIENTAS, HERRAMIENTA_POR_ID, EXPEDIENTES, generarOleada, TOTAL_OLEADAS,
} from '../gameplay/encomiendas.js';

/**
 * La clase de Justus al entrar. Mismo mentor que en el muelle y en el raid.
 *
 * El nivel se probó sin ella y el resultado fue inequívoco: se entiende moverse
 * y se entiende disparar, pero NO para qué sirve cada herramienta ni que el
 * cartel del bulto es lo que hay que leer. El jugador acababa probando las
 * cuatro teclas por turnos. Esta lección enseña el bucle en el orden en que se
 * ejecuta, y la pieza central es el paso 4: cada herramienta lee UNA cosa.
 */
/**
 * Justus enseña el muelle en cuatro frases. Antes eran seis, y largas: 850
 * caracteres que repetían lo que el briefing acababa de decir con dibujos. Un
 * tutorial que se lee dos veces no se lee ninguna.
 *
 * Regla de escritura: cada paso es UNA frase, por debajo de 100 caracteres, y
 * SEÑALA la cosa de la que habla. Lo que se puede enseñar apuntando no se
 * escribe: para eso está `foco`.
 */
const leccionPostal = (touch) => [
  {
    txt: touch
      ? 'Camine con el joystick, jefe. Las cintas no esperan.'
      : 'Camine con W-A-S-D, jefe. Las cintas no esperan.',
    foco: touch ? '.tp-stick' : null,
  },
  {
    txt: 'El bulto más cercano se marca solo. Si lleva cartel ⚠, léalo: ahí pone qué le pasa.',
  },
  {
    txt: 'Cada herramienta lee UNA cosa: la forma, el papel, el olor o el peso.',
    foco: '.cp-hotbar',
  },
  {
    txt: touch
      ? 'Elija la que hable de eso y pulse ESCANEAR. Sin cartel, no se dispara.'
      : 'Elija la que hable de eso (teclas 1-4) y pulse Espacio. Sin cartel, no se dispara.',
    foco: touch ? '.tp-btn' : '.cp-hotbar',
  },
];

/**
 * CentroPostalScene — Nivel 4 · Centro Postal (ADR-013).
 *
 * Contrato con `SceneManager`: `constructor({ onExit })`, `mount()`, `unmount()`.
 *
 * ── Qué es este nivel ──────────────────────────────────────────────────────
 * El primero de cadencia alta del juego. Los paquetes cruzan la nave en tres
 * cintas hacia el camión de salida y el oficial tiene la ventana que dura ese
 * trayecto para leer el síntoma, elegir la herramienta correcta y disparar el
 * pulso. Nada de combate: los objetivos son cajas (Visión §22).
 *
 * ── La decisión estructural: una sola fuente de input ──────────────────────
 * Toda la lógica de juego lee `this.keys['KeyW']` y `e.code === 'Space'`. En
 * móvil, `TouchControls` despacha `KeyboardEvent`s reales sobre `window`, así
 * que el mando «escribe» por el jugador y NO hay una sola rama `if (isTouch)`
 * en el gameplay. Las dos consecuencias de diseño que eso impone:
 *
 *   1. **Cámara 3/4 de rotación fija.** Sin `PointerLock`. WASD y joystick
 *      empujan a las mismas direcciones del mundo, de modo que el vector de
 *      movimiento es idéntico en ambas plataformas.
 *   2. **Apuntado por `#objetivoActual()`.** Auto-target dentro de un cono
 *      frontal, el mismo método en PC y en móvil. En escritorio, si el ratón
 *      está encima de un paquete en rango, ese gana — pero es un ATAJO sobre el
 *      mismo camino, no un sistema paralelo.
 */

/** Velocidad del oficial (m/s). */
const VEL = 7.4;
/** Recarga del pulso: alta cadencia, pero no metralleta. */
const RECARGA = 0.4;
/** Velocidad base de las cintas (m/s), la de la oleada de aprendizaje. */
const VEL_CINTA = 1.55;

/**
 * Multiplicador de velocidad por oleada.
 *
 * La primera va lenta a propósito: es donde se aprende a leer el cartel y a
 * elegir herramienta, y con la cinta encima eso no se aprende, se adivina. A
 * partir de ahí sube. Probado a ritmo plano el nivel se sentía correcto los
 * primeros noventa segundos y perezoso después — una vez interiorizado el
 * bucle, el mismo ritmo deja de ser presión y pasa a ser espera.
 */
const RITMO_OLEADA = [1, 1.35, 1.7];
/** Cuánta integridad cuesta cada error. Nunca baja por otra cosa. */
const PENA = { infundado: 10, escapado: 18 };
/** Cuántos paquetes pueden estar vivos a la vez (techo del pool). */
const MAX_VIVOS = 14;

export class CentroPostalScene {
  constructor({ onExit } = {}) {
    this.onExit = onExit ?? (() => {});
    this.keys = Object.create(null);
    this.paquetes = [];
    this.pool = [];
    this.evidencias = [];
    this.evidenciasTotales = [];
    this.herramienta = 0;
    this.integridad = 100;
    this.oleadaIdx = 0;
    this.fase = 'briefing';      // briefing · oleada · peritaje · fin
    this.recarga = 0;
    this.interceptados = 0;
    this.escapados = 0;
    this.infundados = 0;
    this.actasSolidas = 0;
    this.actasCaidas = 0;
    this.mirada = new THREE.Vector2(0, -1);
    this._raf = null;
    this._bound = {};
    this._timers = [];
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  mount() {
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setClearColor(0x1a222c);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 12, 15);

    this.mundo = construirCentroPostal(this.scene);
    this.fabrica = new FabricaPaquetes();

    this.oficial = crearOficial();
    this.oficial.grupo.position.set(-2, 0, 5.5);
    this.scene.add(this.oficial.grupo);
    this.oficial.setColorHerramienta(HERRAMIENTAS[0].color, HERRAMIENTAS[0].id);

    this.#construirHaz();
    this.efectos = new EfectosHerramienta(this.scene);

    this.shake = new CameraShake(this.camera);
    this.hitStop = new HitStop();
    this.ray = tuneRaycaster(new THREE.Raycaster());
    this.puntero = new THREE.Vector2(-2, -2);   // fuera de pantalla hasta que se mueva

    // Marcador de puntos (ADR-012): mismo sistema que el resto del juego.
    puntaje.reiniciarTurno();
    this.marcador = new Marcador(document.getElementById('hud-root'));

    this.hud = new HUDCentroPostal({
      onSalir: () => this.onExit(),
      onReiniciar: () => window.location.reload(),
      onHerramienta: (i) => this.#elegirHerramienta(i),
      onIniciar: () => this.#arrancarOleada(),
      onActa: (r) => this.#resolverActa(r),
      onCerrarPeritaje: () => this.#trasPeritaje(),
      onNarrar: (txt) => this.#narrar(txt, 150),
    }).mount();
    this.hud.setIntegridad(100);

    this.pad = new TouchControls({
      joystick: true,
      buttons: [
        { code: 'Space', label: 'ESCANEAR', hint: 'toca' },
        { code: 'Digit1', label: 'RAYOS X', small: true },
        { code: 'Digit2', label: 'LUPA', small: true },
        { code: 'Digit3', label: 'JUSTUS', small: true },
        { code: 'Digit4', label: 'BALANZA', small: true },
        { code: 'KeyE', label: 'PERITAJE', small: true },
      ],
    });
    this.pad.mount();

    this.post = new PostFX(this.renderer, { scene: this.scene, camera: this.camera, bloom: 0.44 });

    this.pausa = new PauseMenu({
      onPausa: () => { this.pausado = true; this.pad?.setVisible(false); },
      onReanudar: () => { this.pausado = false; this.pad?.setVisible(true); },
      onSalir: () => this.onExit(),
      onReiniciar: () => window.location.reload(),
    });
    this.pausa.mount();

    // Red de seguridad de FPS. El ratio de píxeles primero: es el recorte que
    // más frames devuelve y el único que en móvil se nota de verdad.
    this.perf = new PerfGuard([
      recorteRatioPixel(this.renderer, this.post),
      { nombre: 'bloom off', aplicar: () => {
        if (!this.post.bloom?.enabled) return false;
        this.post.bloom.enabled = false;
        return true;
      } },
      { nombre: 'sombra de los paquetes off', aplicar: () => {
        // En móvil los paquetes nacen ya sin sombra, así que este escalón no
        // aplica y devuelve `false` para que el guardián salte al siguiente sin
        // gastar su ventana de espera (PerfGuard §escalones).
        if (this.sinSombraPaquetes || quality.mobile) return false;
        this.sinSombraPaquetes = true;
        for (const p of this.paquetes) p.caja.castShadow = false;
        return true;
      } },
      recorteSombras(() => this.mundo.lucesConSombra),
    ]);

    this.#bindInput();
    this.clock = new THREE.Clock();
    this.#loop();

    this.oleada = generarOleada(0);
    this.hud.abrirBriefing({
      nombre: this.oleada.nombre,
      briefing: this.oleada.briefing,
      indice: 0,
      total: TOTAL_OLEADAS,
      primera: true,
    });
  }

  unmount() {
    coach.destroy();
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const t of this._timers) clearTimeout(t);
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    window.removeEventListener('pointermove', this._bound.pointermove);
    window.removeEventListener('pointerdown', this._bound.pointerdown);
    window.removeEventListener('resize', this._bound.resize);
    gsap.killTweensOf(this.camera.position);
    for (const p of this.paquetes) gsap.killTweensOf([p.grupo.position, p.grupo.scale, p.grupo.rotation]);
    narrator.callar();
    audio.cinta(false);
    audio.escaner(false);
    this.hud?.destroy();
    this.marcador?.dispose();
    this.pausa?.destroy();
    this.pad?.destroy();
    // Las texturas de canvas del mundo se sueltan ANTES que el renderer: una
    // textura liberada después de `renderer.dispose()` ya no llega a
    // `_gl.deleteTexture` y se queda de verdad en la GPU (ver `Disposal`).
    this.mundo?.dispose();
    this.efectos?.dispose();
    this.fabrica?.dispose();
    cerrarNivel(this.renderer, { escenas: [this.scene], post: this.post, etiqueta: 'Centro Postal' });
    this.scene = null;
    this.paquetes.length = 0;
    this.pool.length = 0;
  }

  /** Instantánea de VRAM desde la consola: `__AH_MANAGER.current.memoria()`. */
  memoria() {
    const m = this.renderer?.info?.memory;
    console.info(`[AduanasHero] VRAM Centro Postal: ${m?.geometries} geometrías · ${m?.textures} texturas`);
    return m;
  }

  // ── Entrada ───────────────────────────────────────────────────────────────
  #bindInput() {
    this._bound.keydown = (e) => {
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); this.#disparar(); }
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= HERRAMIENTAS.length) this.#elegirHerramienta(n - 1);
      }
      if (e.code === 'KeyE') this.#intentarPeritaje();
      if (e.code === 'KeyM') this.hud.togglePanel('casos');
      if (e.code === 'KeyC') this.hud.togglePanel('codice');
      if (e.code === 'Escape') this.hud.cerrarPanel();
      // Atajo de QA, igual que el F9 del raid: cierra la oleada en curso.
      if (e.code === 'F9' && this.fase === 'oleada') this.#cerrarOleada();
    };
    this._bound.keyup = (e) => { this.keys[e.code] = false; };
    this._bound.pointermove = (e) => {
      this.puntero.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    };
    this._bound.pointerdown = (e) => {
      // El clic dispara, pero solo sobre el lienzo: si no, pulsar un botón del
      // HUD soltaría además un pulso de escaneo contra lo que hubiera detrás.
      if (e.button !== 0 || e.target?.id !== 'gl') return;
      this.#disparar();
    };
    this._bound.resize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.post?.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup', this._bound.keyup);
    window.addEventListener('pointermove', this._bound.pointermove);
    window.addEventListener('pointerdown', this._bound.pointerdown);
    window.addEventListener('resize', this._bound.resize);
  }

  #elegirHerramienta(i) {
    if (i === this.herramienta) return;
    this.herramienta = i;
    this.hud.setHerramienta(i);
    this.oficial.setColorHerramienta(HERRAMIENTAS[i].color, HERRAMIENTAS[i].id);
    this.haz.material.color.setHex(HERRAMIENTAS[i].color);
    audio.clic();
  }

  #jugando() { return this.fase === 'oleada' && !this.pausado && !this.hud.panelAbierto; }

  // ── El haz del pulso de escaneo ───────────────────────────────────────────
  /**
   * Una línea de dos vértices y un anillo de impacto. Nada más.
   *
   * La tentación era un sistema de partículas por disparo; con un pulso cada
   * 0,4 s eso sería crear y tirar geometría constantemente, justo lo que
   * `Disposal` existe para evitar. Aquí se reutilizan SIEMPRE los mismos dos
   * objetos: solo cambian sus vértices y su opacidad.
   */
  #construirHaz() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.haz = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: HERRAMIENTAS[0].color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.haz.frustumCulled = false;
    this.scene.add(this.haz);

    this.impacto = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 20),
      new THREE.MeshBasicMaterial({
        color: 0x4fd0e0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.impacto.visible = false;
    this.scene.add(this.impacto);
  }

  #dibujarHaz(destino, color) {
    const origen = new THREE.Vector3();
    this.oficial.escaner.getWorldPosition(origen);
    const pos = this.haz.geometry.attributes.position;
    pos.setXYZ(0, origen.x, origen.y, origen.z);
    pos.setXYZ(1, destino.x, destino.y, destino.z);
    pos.needsUpdate = true;
    this.haz.material.color.setHex(color);
    gsap.killTweensOf(this.haz.material);
    gsap.fromTo(this.haz.material, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'power2.in' });

    this.impacto.material.color.setHex(color);
    this.impacto.position.copy(destino);
    this.impacto.lookAt(this.camera.position);
    this.impacto.visible = true;
    gsap.killTweensOf([this.impacto.scale, this.impacto.material]);
    gsap.fromTo(this.impacto.scale, { x: 0.3, y: 0.3, z: 0.3 },
      { x: 2.1, y: 2.1, z: 2.1, duration: 0.42, ease: 'power2.out' });
    gsap.fromTo(this.impacto.material, { opacity: 0.95 },
      { opacity: 0, duration: 0.42, ease: 'power2.out',
        onComplete: () => { this.impacto.visible = false; } });
  }

  // ── Oleadas ───────────────────────────────────────────────────────────────
  #arrancarOleada() {
    audio.startPostal();
    audio.cinta(true);
    audio.campanaOleada();
    this.fase = 'oleada';
    this.tiempo = this.oleada.duracion;
    this.tSpawn = 0;
    this.porLanzar = [...this.oleada.encomiendas];
    this.evidencias = [];
    this.ritmo = RITMO_OLEADA[Math.min(this.oleadaIdx, RITMO_OLEADA.length - 1)];
    this.velCrucero = VEL_CINTA * this.ritmo;
    this.velocidadCinta = this.velCrucero;
    // Los lanzamientos se reparten en la ventana que deja el trayecto completo:
    // el último paquete debe tener tiempo de cruzar la nave antes del cierre, o
    // se «escaparía» por culpa del reloj y no del jugador. El trayecto se
    // calcula con la velocidad REAL de esta oleada, no con la base: si no, al
    // acelerar la cinta los bultos llegarían al camión antes de tiempo y la
    // oleada moriría con medio cronómetro por delante.
    const trayecto = (NAVE.xSalida - NAVE.xEntrada) / this.velCrucero;
    this.intervalo = Math.max(2.6, (this.oleada.duracion - trayecto - 3) / this.porLanzar.length);
    this.carrilSiguiente = 0;

    bus.emit(Señal.OLEADA_INICIADA, {
      indice: this.oleadaIdx, total: TOTAL_OLEADAS, sospechosos: this.oleada.sospechosos,
    });
    this.hud.anotar(`<b>${this.oleada.nombre}</b> · ${this.oleada.encomiendas.length} bultos en cinta`, '#e0952a');
    this.#narrar(this.oleada.briefing, 500);
    this.#refrescarCasos();

    // Justus da la clase en la primera oleada, no antes: sobre el briefing la
    // tarjeta se solapaba con el velo y el jugador leía dos textos a la vez.
    if (this.oleadaIdx === 0 && !this.tutorialLanzado) {
      this.tutorialLanzado = true;
      this._timers.push(setTimeout(() => {
        if (this.fase !== 'oleada') return;
        coach.guiar('centropostal', leccionPostal(isTouch), {
          pos: 'arriba',
          alFinal: () => { this.tutorialListo = true; },
        });
        // Si la lección ya estaba vista, `guiar` no abre nada y el callback no
        // llega nunca: sin esto, los consejos contextuales quedarían mudos para
        // siempre a partir de la segunda partida.
        //
        // Se comprueba EN EL ACTO en lugar de por temporizador. El respaldo
        // anterior era un `setTimeout` de 1,5 s que saltaba siempre —también con
        // la clase magistral en marcha— y ahí nacía el atasco de avisos del
        // nivel: a los 2,4 s de arrancar la oleada ya estaban habilitados los
        // consejos por dominio, que se disparaban con la lección a medias.
        if (!coach.ocupado) this.tutorialListo = true;
      }, 900));
    }
  }

  /**
   * El consejo que enseña de verdad: llega la PRIMERA vez que el jugador apunta
   * a un síntoma de un dominio que aún no ha visto, con la caja delante.
   *
   * Explicar las cuatro herramientas de golpe en el briefing no basta —se leen
   * y se olvidan—. Aquí el consejo aparece en el momento exacto en que hace
   * falta y se refiere a lo que el jugador tiene en pantalla, que es cuando una
   * regla se queda. Se recuerda en `localStorage`: solo se explica una vez.
   */
  #ensenarDominio(datos) {
    if (!this.tutorialListo || !datos?.sintoma) return;
    const h = HERRAMIENTA_POR_ID[datos.dominio];
    if (!h) return;
    const clave = datos.senuelo ? 'centropostal:senuelo' : `centropostal:dom:${h.id}`;
    if (this.dominiosVistos?.has(clave)) return;
    // Si Justus ya tiene algo entre manos, este consejo NO se encola: se deja
    // sin marcar y volverá a salir la próxima vez que el jugador apunte a un
    // bulto de este dominio. Recorrer el pasillo puede cruzar cuatro dominios en
    // pocos segundos, y cuatro avisos encadenados —aunque la cola los ordene—
    // siguen siendo cuatro avisos. Un consejo vale por llegar CON LA CAJA
    // DELANTE; si llega tarde y en fila, ya no enseña nada.
    if (coach.ocupado) return;
    (this.dominiosVistos ??= new Set()).add(clave);
    const txt = datos.senuelo
      ? 'Ojo con este, jefe: yo olfateo pero NO me siento. Eso suele ser comida. Verifíquelo conmigo '
        + 'igualmente —es el procedimiento— pero no espere un decomiso.'
      : h.leccion;
    coach.decir(clave, txt, { pos: 'arriba' });
  }

  #spawn(datos) {
    if (this.paquetes.length >= MAX_VIVOS) return false;
    const pieza = this.pool.pop() ?? this.fabrica.crear(Math.floor(Math.random() * 3));
    const carril = this.carrilSiguiente % NAVE.carriles.length;
    this.carrilSiguiente++;
    const z = NAVE.carriles[carril];
    pieza.grupo.position.set(NAVE.xEntrada, NAVE.alturaCinta + pieza.alto / 2 + 0.06, z);
    pieza.grupo.scale.setScalar(1);
    pieza.grupo.rotation.set(0, (Math.random() - 0.5) * 0.5, 0);
    pieza.grupo.visible = true;
    if (this.sinSombraPaquetes) pieza.caja.castShadow = false;
    this.scene.add(pieza.grupo);

    // El halo ámbar marca «este bulto lleva algo escrito en la cara». Es la
    // señal de largo alcance; el texto del chip es la señal que hay que leer.
    const sospechoso = !!datos.sintoma;
    pieza.halo.visible = sospechoso;
    pieza.halo.material.opacity = 0;
    if (sospechoso) {
      gsap.killTweensOf(pieza.halo.material);
      gsap.fromTo(pieza.halo.material, { opacity: 0.5 }, {
        opacity: 0.95, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut',
      });
      pieza.halo.material.color.setHex(datos.senuelo ? 0xd9784f : 0xe0952a);
    }

    const p = { datos, ...pieza, carril, estado: 'viaja', t: 0 };
    this.paquetes.push(p);
    return true;
  }

  #retirar(p) {
    const i = this.paquetes.indexOf(p);
    if (i >= 0) this.paquetes.splice(i, 1);
    gsap.killTweensOf([p.grupo.position, p.grupo.scale, p.grupo.rotation, p.halo.material]);
    p.grupo.visible = false;
    this.scene.remove(p.grupo);
    p.halo.visible = false;
    // Vuelve al pool: la geometría y el material son compartidos, así que
    // reciclar el grupo evita crear basura durante toda la partida.
    this.pool.push({ grupo: p.grupo, caja: p.caja, halo: p.halo, alto: p.alto });
  }

  // ── El pulso de escaneo ───────────────────────────────────────────────────
  /**
   * El objetivo del pulso. UN método para PC y para móvil (ADR-013 §6).
   *
   * Auto-target: de los paquetes en rango se queda con el que mejor combina
   * cercanía y alineación con la mirada del oficial. El cono es amplio a
   * propósito (±100°): este nivel se pierde por no leer la caja, nunca por
   * fallar la puntería.
   */
  #objetivoActual() {
    const p0 = this.oficial.grupo.position;

    // Atajo de escritorio: lo que está bajo el ratón manda, si está en rango.
    if (!isTouch && this.hover?.estado === 'viaja') {
      const d = Math.hypot(this.hover.grupo.position.x - p0.x, this.hover.grupo.position.z - p0.z);
      if (d <= NAVE.alcance) return this.hover;
    }

    let mejor = null;
    let mejorPunt = Infinity;
    for (const p of this.paquetes) {
      if (p.estado !== 'viaja') continue;
      const dx = p.grupo.position.x - p0.x;
      const dz = p.grupo.position.z - p0.z;
      const d = Math.hypot(dx, dz);
      if (d > NAVE.alcance || d < 0.001) continue;
      const cos = (dx * this.mirada.x + dz * this.mirada.y) / d;
      if (cos < -0.18) continue;
      const punt = d - cos * 2.4;
      if (punt < mejorPunt) { mejorPunt = punt; mejor = p; }
    }
    return mejor;
  }

  #disparar() {
    if (!this.#jugando() || this.recarga > 0) return;
    const p = this.objetivo;
    const h = HERRAMIENTAS[this.herramienta];
    this.recarga = RECARGA;
    this.oficial.disparar();

    if (!p) {
      audio.pulsoEscaner('nada');
      this.hud.aviso('Sin ningún bulto a tiro. <b>Acércate a la cinta.</b>', 'neutro');
      return;
    }

    const destino = p.grupo.position.clone();
    destino.y += p.alto * 0.3;
    this.#dibujarHaz(destino, h.color);
    this.shake.add(0.12);

    const d = p.datos;
    // El gesto propio de la herramienta. `revela` decide el REMATE del efecto
    // (núcleo denso, hoja desplegada, huella del can, balanza desequilibrada):
    // así el jugador lee el resultado en la escena, no solo en el HUD.
    const revela = !!d.sintoma && h.id === d.dominio && !d.senuelo;
    this.efectos.disparar(h.id, p.grupo.position, p.alto, revela);

    bus.emit(Señal.PAQUETE_ESCANEADO, { guia: d.guia, herramienta: h.id, dominio: d.dominio });

    // ── Caso 1 · el bulto no mostraba NADA: falso positivo ──────────────────
    if (!d.sintoma) {
      audio.pulsoEscaner('infundado');
      p.estado = 'verificado';
      this.infundados++;
      puntaje.sumar(VALOR.escaneoInfundado, 'ESCANEO INFUNDADO · el bulto no mostraba señal alguna', {
        detalle: `«${d.declarado}», guía ${d.guia}. Un envío sin síntoma es un envío que va bien: `
          + 'pararlo cuesta tiempo del turno y confianza del operador.',
      });
      this.#danio(PENA.infundado);
      flash('#e04a3c', { opacidad: 0.14, duration: 0.3 });
      this.hud.aviso('<b>FALSO POSITIVO.</b> Ese paquete no mostraba ninguna señal.', 'mal');
      this.hud.anotar(`Escaneo infundado sobre la guía ${d.guia}.`, '#e04a3c');
      gsap.to(p.grupo.rotation, { z: 0.4, duration: 0.12, yoyo: true, repeat: 1 });
      return;
    }

    // ── Caso 2 · herramienta que no lee ese dominio: sin novedad, sin castigo ─
    if (h.id !== d.dominio) {
      audio.pulsoEscaner('nada');
      this.hud.aviso(`<b>SIN NOVEDAD.</b> ${h.nombre} no lee lo que tiene ese bulto.`, 'neutro');
      gsap.fromTo(p.grupo.position, { y: p.grupo.position.y },
        { y: p.grupo.position.y + 0.1, duration: 0.1, yoyo: true, repeat: 1 });
      return;
    }

    // ── Caso 3 · el señuelo: el can marcó comida ────────────────────────────
    if (d.senuelo) {
      audio.pulsoEscaner('nada');
      audio.ladrido(0.35);
      p.estado = 'verificado';
      p.halo.material.color.setHex(0x3fc47f);
      gsap.killTweensOf(p.halo.material);
      gsap.to(p.halo.material, { opacity: 0.22, duration: 0.3 });
      this.hud.aviso('<b>COMIDA.</b> El can marcó el olor, no una sustancia. Verificado.', 'neutro');
      this.hud.anotar(`Guía ${d.guia}: marca del can descartada (alimentos).`, '#d9784f');
      this.#narrar('Justus marcó comida. Verificado y sigue.', 200);
      this.hud.desbloquear('justus');
      return;
    }

    // ── Caso 4 · intercepción ───────────────────────────────────────────────
    this.#interceptar(p, h);
  }

  #interceptar(p, h) {
    const d = p.datos;
    p.estado = 'interceptado';
    this.interceptados++;
    audio.pulsoEscaner('hallazgo');
    if (d.dominio === 'justus') audio.ladrido(1);
    audio.stinger();
    this.hitStop.golpe(80);
    this.shake.add(0.34);
    flash(h.css, { opacidad: 0.16, duration: 0.34 });

    puntaje.sumar(VALOR.encomiendaInterceptada, `ENCOMIENDA INTERCEPTADA · ${d.hallazgo}`, {
      detalle: d.detalle,
    });

    // La evidencia entra en la Mesa de Peritaje al cerrar la oleada.
    const exp = EXPEDIENTES[d.expediente];
    const pieza = {
      id: `${d.id}-ev`,
      titulo: d.evidencia,
      icono: h.icono,
      tono: h.css,
      dominio: d.dominio,
      // La familia viaja con la prueba hasta la Mesa de Peritaje: allí el
      // requisito «de distinta naturaleza» se comprueba a ojo comparando
      // «prueba de la forma» contra «prueba del papel», no dos ids internos.
      familia: h.familia,
      expediente: d.expediente,
      expedienteNombre: exp?.nombre ?? 'SIN EXPEDIENTE',
      guia: d.guia,
    };
    this.evidencias.push(pieza);
    this.evidenciasTotales.push(pieza);

    this.hud.aviso(`<b>${d.hallazgo.toUpperCase()}</b> · guía ${d.guia}`, 'ok');
    this.hud.anotar(`<b>${exp?.nombre ?? 'Hallazgo'}</b> — ${d.hallazgo} (guía ${d.guia}).`, h.css);
    this.hud.desbloquear(d.dominio);
    if (d.expediente) this.hud.desbloquear(d.expediente);
    this.#narrar(d.hallazgo, 260);

    // Coreografía de la intercepción: la caja salta de la cinta, gira y el
    // escáner se la lleva. Es el «juice» de Trafasport sin traer física: un
    // tween cuesta cero y aquí se ve exactamente igual de bien.
    const g = p.grupo;
    gsap.killTweensOf(p.halo.material);
    p.halo.material.color.setHex(0x3fc47f);
    gsap.to(p.halo.material, { opacity: 0.85, duration: 0.14 });
    const tl = gsap.timeline({ onComplete: () => this.#retirar(p) });
    tl.to(g.position, { y: g.position.y + 1.9, duration: 0.34, ease: 'power2.out' })
      .to(g.rotation, { y: g.rotation.y + Math.PI * 1.5, x: 0.7, duration: 0.62, ease: 'power1.out' }, 0)
      .to(g.position, { y: g.position.y + 1.2, duration: 0.3, ease: 'power2.in' })
      .to(g.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.26, ease: 'back.in(2)' }, '-=0.2');
  }

  #escapar(p) {
    const d = p.datos;
    p.estado = 'escapado';

    if (d.sintoma && !d.senuelo) {
      this.escapados++;
      puntaje.sumar(VALOR.encomiendaEscapada, `ENCOMIENDA ESCAPADA · ${d.sintoma.etiqueta}`, {
        detalle: `${d.hallazgo}. La señal estaba a la vista y el bulto se fue en el camión.`,
      });
      this.#danio(PENA.escapado);
      audio.beep(false);
      this.hud.aviso(`<b>SE FUE UNA.</b> ${d.sintoma.etiqueta}`, 'mal');
      this.hud.anotar(`Escapó la guía ${d.guia}: ${d.sintoma.etiqueta.toLowerCase()}.`, '#e04a3c');
      flash('#e04a3c', { opacidad: 0.1, duration: 0.4 });
    }

    // Se lo traga la boca de carga: entra en el camión y se apaga.
    const g = p.grupo;
    gsap.killTweensOf(p.halo.material);
    p.halo.visible = false;
    gsap.to(g.position, {
      x: NAVE.xCamion + 1, duration: 1.1, ease: 'none', onComplete: () => this.#retirar(p),
    });
    gsap.to(g.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 1.1, ease: 'power2.in' });
  }

  #danio(cantidad) {
    this.integridad = Math.max(0, this.integridad - cantidad);
    this.hud.setIntegridad(this.integridad);
    if (this.integridad <= 0 && this.fase === 'oleada') {
      this._timers.push(setTimeout(() => this.#finOperativo('quiebre'), 900));
    }
  }

  // ── Cierre de oleada y peritaje ───────────────────────────────────────────
  #cerrarOleada() {
    if (this.fase !== 'oleada') return;
    this.fase = 'peritaje';
    audio.cinta(false);
    this.velocidadCinta = 0;
    // Lo que quedara en la cinta al cerrar cuenta como escapado: es la misma
    // consecuencia que tendría si la hubiera cruzado entera.
    for (const p of [...this.paquetes]) {
      if (p.estado === 'viaja') this.#escapar(p);
    }
    this.#refrescarCasos();

    if (this.evidencias.length === 0) {
      this.hud.aviso('Oleada cerrada sin evidencia que peritar.', 'neutro');
      this._timers.push(setTimeout(() => this.#trasPeritaje(), 1400));
      return;
    }
    this._timers.push(setTimeout(() => {
      if (this.fase !== 'peritaje') return;
      this.#irALaMesa();
      this.hud.abrirPeritaje(this.evidencias, 3);
      // El narrador acompaña la entrada a la mesa: es el momento del turno con
      // más texto en pantalla y el que peor se entendía sin voz que lo guiara.
      this.#narrar('Oleada cerrada. A la mesa de peritaje: hay que convertir lo que encontraste '
        + 'en un acta que se sostenga.', 700);
      coach.decir('centropostal:peritaje',
        'Aquí se demuestra, jefe. Ponga dos pruebas del MISMO remitente pero de distinta clase: '
        + 'una del papel y otra de la forma, por ejemplo. Con una sola, el acta se le cae.',
        { pos: 'arriba' });
    }, 1100));
  }

  /** Zoom dramático hacia la mesa, mismo patrón que Chimbote al inspeccionar. */
  #irALaMesa() {
    this.mesaEnfocada = true;
    gsap.to(this.camera.position, {
      x: NAVE.mesa.x + 1.4, y: 4.6, z: NAVE.mesa.z + 6.2,
      duration: 1.2, ease: 'power3.inOut', overwrite: 'auto',
    });
  }

  #intentarPeritaje() {
    if (this.fase !== 'oleada') return;
    const p0 = this.oficial.grupo.position;
    const d = Math.hypot(p0.x - NAVE.mesa.x, p0.z - NAVE.mesa.z);
    if (d > 3.6) {
      this.hud.aviso('La <b>Mesa de Peritaje</b> está al fondo a la derecha, junto al camión.', 'neutro');
      return;
    }
    if (!this.evidencias.length) {
      this.hud.aviso('No llevas evidencia que peritar todavía.', 'neutro');
      return;
    }
    this.fase = 'peritaje';
    audio.cinta(false);
    this.#irALaMesa();
    this.hud.abrirPeritaje(this.evidencias, 3);
  }

  #resolverActa(r) {
    if (r.solida) {
      this.actasSolidas++;
      puntaje.sumar(VALOR.actaSolida, 'ACTA SÓLIDA · evidencia cruzada', { detalle: r.motivo });
      audio.golpeSello();
      flash('#3fc47f', { opacidad: 0.14, duration: 0.4 });
      this.hud.anotar(`Acta firmada y sostenida sobre ${EXPEDIENTES[r.expediente]?.nombre}.`, '#3fc47f');
      this.#narrar('Acta firmada. La evidencia cruza y sostiene.', 300);
      if (r.expediente) this.hud.desbloquear(r.expediente);
      progreso.ajustarReputacion(4);
    } else {
      this.actasCaidas++;
      puntaje.sumar(VALOR.actaCae, 'EL ACTA NO SOSTIENE', { detalle: r.motivo });
      audio.beep(false);
      this.hud.anotar('Un acta cayó en revisión: la evidencia no cruzaba.', '#e04a3c');
      this.#narrar('El acta no sostiene. Faltaba cruzar la evidencia.', 300);
      progreso.ajustarReputacion(-3);
    }
    this.hud.desbloquear('evidencia_cruzada');
    bus.emit(Señal.ACTA_ARMADA, { solida: r.solida, expediente: r.expediente });
    // Las piezas usadas se consumen: un acta no se firma dos veces con la misma
    // prueba, y dejarlas disponibles convertiría el panel en una tragaperras.
    this.evidencias = this.evidencias.filter((e) => !r.piezas.includes(e));
    this._timers.push(setTimeout(() => this.#trasPeritaje(), 700));
  }

  #trasPeritaje() {
    this.mesaEnfocada = false;
    this.oleadaIdx++;
    if (this.oleadaIdx >= TOTAL_OLEADAS) { this.#finOperativo('completo'); return; }
    this.oleada = generarOleada(this.oleadaIdx);
    this.fase = 'briefing';
    this.hud.abrirBriefing({
      nombre: this.oleada.nombre,
      briefing: this.oleada.briefing,
      indice: this.oleadaIdx,
      total: TOTAL_OLEADAS,
      primera: false,
    });
  }

  #finOperativo(motivo) {
    if (this.fase === 'fin') return;
    this.fase = 'fin';
    audio.cinta(false);
    this.velocidadCinta = 0;
    for (const p of [...this.paquetes]) this.#retirar(p);

    const completo = motivo === 'completo';
    const b = puntaje.balance();
    progreso.cerrarOperativo('centropostal', {
      aciertos: this.interceptados,
      errores: this.infundados + this.escapados,
      incautaciones: this.interceptados,
    });
    progreso.ajustarReputacion(completo ? Math.round(this.interceptados * 1.2 - this.escapados * 2) : -6);

    bus.emit(Señal.OPERATIVO_FINALIZADO, {
      motivo, interceptados: this.interceptados, escapados: this.escapados, total: b.total,
    });

    // El marcador y el botón de pausa NO viven dentro de `HUDCentroPostal` (uno
    // es de `hud-root`, el otro de `PauseMenu`), así que la clase modal del HUD
    // no los alcanza: hay que apartarlos a mano o se quedan flotando sobre la
    // hoja de servicio. El balance del turno ya va impreso dentro de la hoja.
    if (this.marcador?.el) this.marcador.el.style.display = 'none';
    if (this.pausa?.root) this.pausa.root.style.display = 'none';

    this.hud.abrirCierre({
      motivo: completo ? 'TURNO CERRADO · CENTRO POSTAL' : 'OPERATIVO INTERRUMPIDO',
      titulo: completo ? 'FIN DEL FLUJO' : 'SE CERRÓ TU VENTANA',
      texto: completo
        ? 'El último camión salió. Lo que interceptaste queda en el depósito con su acta; lo que pasó, '
          + 'ya está en la calle. Así se cierra un turno en el correo.'
        : 'La integridad del turno llegó a cero: el supervisor te releva del puesto. No perdiste por mala '
          + 'suerte — cada punto que bajó venía de una señal que estaba en pantalla.',
      filas: [
        { k: 'ENCOMIENDAS INTERCEPTADAS', v: this.interceptados, tipo: 'bien' },
        { k: 'SE FUERON EN EL CAMIÓN', v: this.escapados, tipo: this.escapados ? 'mal' : '' },
        { k: 'ESCANEOS INFUNDADOS', v: this.infundados, tipo: this.infundados ? 'mal' : '' },
        { k: 'ACTAS QUE SOSTIENEN', v: this.actasSolidas, tipo: this.actasSolidas ? 'bien' : '' },
        { k: 'ACTAS CAÍDAS EN REVISIÓN', v: this.actasCaidas, tipo: this.actasCaidas ? 'mal' : '' },
        { k: 'INTEGRIDAD FINAL', v: `${Math.round(this.integridad)}/100` },
        { k: 'REPUTACIÓN DE LA CARRERA', v: `${progreso.reputacion}/100` },
      ],
      balanceHTML: Marcador.balanceHTML(),
    });
    this.#narrar(completo
      ? 'Turno cerrado en el centro postal.'
      : 'Se acabó tu ventana de intervención.', 400);
  }

  // ── Utilidades ────────────────────────────────────────────────────────────
  #narrar(texto, delayMs = 0) {
    const limpio = String(texto).replace(/<[^>]*>/g, '').replace(/[⚠✅🚫📟🔍🐕⚖▚📖🗒✒↻◄▶]/gu, '').trim();
    if (!limpio) return;
    this._timers.push(setTimeout(() => narrator.decir(null, limpio, { esNarrador: true }), delayMs));
  }

  /** Sospechosos que siguen en juego: los que ruedan más los que no han salido. */
  #sospechososPendientes() {
    const enCinta = this.paquetes.filter(
      (p) => p.estado === 'viaja' && p.datos.sintoma && !p.datos.senuelo,
    ).length;
    const porSalir = (this.porLanzar ?? []).filter((d) => d.sintoma && !d.senuelo).length;
    return enCinta + porSalir;
  }

  #refrescarCasos() {
    this.hud.setContextoCasos({
      nombre: this.oleada?.nombre ?? 'CENTRO POSTAL',
      restantes: this.#sospechososPendientes(),
      interceptados: this.interceptados,
      escapados: this.escapados,
    });
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────
  #loop() {
    const proyectado = new THREE.Vector3();
    const camLook = new THREE.Vector3(0, 1.4, 0);
    const marcas = [];

    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dtReal = Math.min(this.clock.getDelta(), 0.05);
      this.perf.update();
      const dt = this.pausado ? 0 : this.hitStop.escala(dtReal);
      const t = this.clock.elapsedTime;

      const jugando = this.#jugando();
      this.#mover(dt, jugando);
      this.#avanzarOleada(dt, jugando);

      this.mundo.velocidadCinta = this.velocidadCinta ?? 0;
      if (!this.pausado) this.mundo.update(dt, t);

      // Objetivo y ficha: se recalculan siempre que se juega, porque el mundo se
      // mueve aunque el jugador esté quieto.
      this.objetivo = jugando ? this.#objetivoActual() : null;
      this.#pintarObjetivo();

      // Cámara: sigue al oficial con masa y encuadra la CINTA, no al oficial.
      //
      // El punto de mira va deliberadamente adelantado hacia el fondo. Centrado
      // en el oficial, la mitad inferior de la pantalla era suelo vacío del
      // pasillo y los tres carriles —que son el juego entero— quedaban
      // apretados contra el borde superior. Mirando al hueco entre el oficial y
      // el carril del medio, la acción cae en el centro del encuadre y el
      // oficial se apoya en el tercio inferior, como en el concept art.
      if (!this.mesaEnfocada) {
        const p0 = this.oficial.grupo.position;
        const k = 1 - Math.exp(-dtReal * 3.4);
        this.camera.position.x += (p0.x - this.camera.position.x) * k;
        this.camera.position.y += (9.6 - this.camera.position.y) * k;
        this.camera.position.z += (p0.z + 10 - this.camera.position.z) * k;
      }
      const kl = 1 - Math.exp(-dtReal * 4);
      camLook.x += (this.oficial.grupo.position.x - camLook.x) * kl;
      camLook.y += (2.2 - camLook.y) * kl;
      camLook.z += (this.oficial.grupo.position.z - 7.2 - camLook.z) * kl;
      this.camera.lookAt(camLook);

      // Marcas flotantes: proyección mundo → pantalla de cada paquete vivo.
      marcas.length = 0;
      if (this.fase === 'oleada') {
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const p of this.paquetes) {
          if (p.estado !== 'viaja' || !p.datos.sintoma) {
            if (p !== this.objetivo) continue;
          }
          proyectado.copy(p.grupo.position);
          proyectado.y += p.alto * 0.5 + 0.5;
          proyectado.project(this.camera);
          const fuera = proyectado.z > 1 || Math.abs(proyectado.x) > 1.15;
          marcas.push({
            id: p.datos.id,
            x: (proyectado.x * 0.5 + 0.5) * w,
            y: (-proyectado.y * 0.5 + 0.5) * h,
            texto: p.datos.sintoma ? p.datos.sintoma.etiqueta : `GUÍA ${p.datos.guia}`,
            icono: p.datos.sintoma ? p.datos.sintoma.icono : '□',
            tono: p.datos.sintoma ? '#e0952a' : '#8fa0b4',
            objetivo: p === this.objetivo,
            oculto: fuera,
          });
        }
      }
      this.hud.marcas(marcas);

      // Recarga del escáner: la hotbar la dibuja como una barrita bajo el slot.
      if (this.recarga > 0) {
        this.recarga = Math.max(0, this.recarga - dtReal);
        this.hud.setRecarga(this.recarga / RECARGA);
      }

      const vel = this._velActual ?? 0;
      this.oficial.update(dt, t, vel, this.integridad < 40 ? 0.7 : 0.15);

      this.shake.apply(dtReal);
      this.post.render();
      this.shake.revert();
    };
    tick();
  }

  #mover(dt, jugando) {
    const g = this.oficial.grupo;
    let vx = 0;
    let vz = 0;
    if (jugando) {
      if (this.keys.KeyW || this.keys.ArrowUp) vz -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) vz += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) vx -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) vx += 1;
    }
    const m = Math.hypot(vx, vz);
    this._velActual = m > 0 ? 1 : Math.max(0, (this._velActual ?? 0) - dt * 4);
    if (m > 0) {
      vx /= m; vz /= m;
      g.position.x += vx * VEL * dt;
      g.position.z += vz * VEL * dt;
      // La mirada se queda donde apuntó el último movimiento: sin ella, un
      // oficial parado no tendría cono y el auto-target se apagaría justo
      // cuando el jugador se detiene para apuntar con calma.
      this.mirada.set(vx, vz);
    }

    const L = NAVE.limites;
    g.position.x = THREE.MathUtils.clamp(g.position.x, L.xMin, L.xMax);
    g.position.z = THREE.MathUtils.clamp(g.position.z, L.zMin, L.zMax);

    // La mesa de peritaje es un obstáculo real: se rodea, no se atraviesa.
    const dxm = g.position.x - NAVE.mesa.x;
    const dzm = g.position.z - NAVE.mesa.z;
    const dm = Math.hypot(dxm, dzm);
    if (dm < 2.1 && dm > 0.001) {
      g.position.x = NAVE.mesa.x + (dxm / dm) * 2.1;
      g.position.z = NAVE.mesa.z + (dzm / dm) * 2.1;
    }

    // El oficial encara lo que va a escanear; si no hay nada, hacia donde anda.
    const objetivo = this.objetivo;
    const mx = objetivo ? objetivo.grupo.position.x - g.position.x : this.mirada.x;
    const mz = objetivo ? objetivo.grupo.position.z - g.position.z : this.mirada.y;
    const yaw = Math.atan2(mx, mz);
    let delta = yaw - g.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    g.rotation.y += delta * Math.min(1, dt * 9);
  }

  #avanzarOleada(dt, jugando) {
    if (this.fase !== 'oleada') return;
    if (!jugando) return;

    // Reloj de la oleada.
    this.tiempo -= dt;
    if (this.tiempo <= 0 && this.velocidadCinta === this.velCrucero) {
      // Se acabó el tiempo: el camión arranca y la cinta acelera. Nadie pierde
      // puntos por el reloj en sí — pierde quien no leyó a tiempo lo que ya
      // estaba en pantalla.
      this.velocidadCinta = this.velCrucero * 2.6;
      this.hud.aviso('<b>EL CAMIÓN ARRANCA.</b> La cinta acelera.', 'mal');
      audio.campanaOleada();
    }

    // Lanzamientos.
    this.tSpawn -= dt;
    if (this.porLanzar.length && this.tSpawn <= 0) {
      if (this.#spawn(this.porLanzar[0])) {
        this.porLanzar.shift();
        this.tSpawn = this.intervalo;
        this.#refrescarCasos();
      }
    }

    // Avance por la cinta.
    for (const p of [...this.paquetes]) {
      if (p.estado !== 'viaja' && p.estado !== 'verificado') continue;
      p.grupo.position.x += this.velocidadCinta * dt;
      // Micro-vibración del rodillo: lo que delata que la caja va sobre algo
      // que se mueve y no flotando por el aire.
      p.grupo.position.y = NAVE.alturaCinta + p.alto / 2 + 0.06
        + Math.sin(p.grupo.position.x * 7 + p.carril) * 0.012;
      if (p.grupo.position.x >= NAVE.xSalida) this.#escapar(p);
    }

    // Ratón sobre un paquete (solo escritorio): atajo de apuntado.
    if (!isTouch && this.paquetes.length) {
      this.ray.setFromCamera(this.puntero, this.camera);
      const golpes = this.ray.intersectObjects(
        this.paquetes.filter((p) => p.estado === 'viaja').map((p) => p.caja), false,
      );
      const caja = golpes[0]?.object;
      this.hover = caja ? this.paquetes.find((p) => p.caja === caja) : null;
    }

    // ¿Se acabó la oleada? Cuando no queda nada por lanzar ni nada vivo.
    const vivos = this.paquetes.some((p) => p.estado === 'viaja' || p.estado === 'verificado');
    if (!this.porLanzar.length && !vivos) this.#cerrarOleada();

    this.hud.setOleada({
      indice: this.oleadaIdx,
      total: TOTAL_OLEADAS,
      nombre: this.oleada.nombre,
      restantes: this.paquetes.filter((p) => p.estado === 'viaja' && p.datos.sintoma && !p.datos.senuelo).length,
      tiempo: Math.max(0, this.tiempo),
      duracion: this.oleada.duracion,
    });
  }

  #pintarObjetivo() {
    const p = this.objetivo;
    if (!p) {
      if (this.ultimoObjetivo) { this.hud.setObjetivo(null); this.ultimoObjetivo = null; }
      return;
    }
    const p0 = this.oficial.grupo.position;
    const dist = Math.hypot(p.grupo.position.x - p0.x, p.grupo.position.z - p0.z);
    if (this.ultimoObjetivo !== p) {
      this.ultimoObjetivo = p;
      audio.clic();
      this.hud.setObjetivo({ ...p.datos, dist });
      this.#ensenarDominio(p.datos);
    } else {
      this.hud.setDistancia(dist);
    }
  }
}
