import { isTouch } from '../core/Device.js';
import { TouchControls } from '../ui/TouchControls.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { Viewport } from '../core/Viewport.js';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje } from '../core/Puntaje.js';
import { Marcador } from '../ui/Marcador.js';
import { progreso } from '../core/Progreso.js';
import { audio } from '../audio/AudioEngine.js';
import { coach } from '../ui/JustusCoach.js';
import { TileMap } from '../engine2d/TileMap.js';
import { Actor2D } from '../engine2d/Actor2D.js';
import { Fugitivo } from '../engine2d/Fugitivo.js';
import { Ambiente } from '../engine2d/Ambiente.js';
import { dibujarBulto } from '../engine2d/Bultos.js';
import { PAL, TILE } from '../engine2d/Pixel.js';
import { HUDRonda } from '../ui/HUDRonda.js';
import {
  MAPA, INICIO, FUGA, generarRonda, DURACION, RADIO_ESCANER, RECARGA_ESCANER, RECARGA_DASH,
} from '../gameplay/rondaPatio.js';

/**
 * RondaPatioScene — Nivel 5 · Ronda de Patio (2D top-down).
 *
 * Contrato de escena de siempre: `constructor({ onExit })`, `mount()`, `unmount()`.
 *
 * ── Qué es y por qué es 2D ─────────────────────────────────────────────────
 * Los cuatro niveles anteriores son 3D. Este no: es un RPG de sprites vista
 * cenital, del linaje de los juegos de consola portátil, y esa elección es
 * deliberada. En un teléfono, una cámara 3D obliga a resolver DOS problemas a la
 * vez —dónde estoy y a dónde miro— y la vista cenital elimina el segundo de
 * golpe. Se juega con un pulgar, se lee el mapa entero de un vistazo y el
 * rendimiento deja de ser un asunto: son estampas de lienzo, no geometría.
 *
 * ── El bucle, en una frase ─────────────────────────────────────────────────
 * Recorres el patio, disparas PULSOS DE ESCÁNER que revelan en un radio qué
 * bultos tienen anomalía, y MARCAS los que la tienen antes de que se cierre el
 * turno. El dash es lo que hace que el patio quepa en el cronómetro.
 *
 * Nada de disparos: el escáner es un pulso de ÁREA. Se toca un botón y una onda
 * se expande alrededor del oficial. Sin apuntar, sin puntería — que en un móvil,
 * con el pulgar tapando media pantalla, nunca es una decisión interesante.
 *
 * ── Lo que NO se reinventa ─────────────────────────────────────────────────
 * Puntaje, Marcador, EventBus, TouchControls, PauseMenu, Progreso, AudioEngine y
 * Justus son los mismos de todo el juego. Lo único nuevo es el motor de dibujo.
 */

/** Velocidad del oficial, en píxeles de diseño por segundo. */
const VEL = 62;
/** Empujón del dash y cuánto dura. */
const DASH_VEL = 235;
const DASH_DUR = 0.17;
/** Distancia a la que se puede marcar un bulto (en píxeles de diseño). */
const ALCANCE_MARCA = 26;

/** Puntuación del nivel. Se suma a la tabla compartida sin romper nada. */
const VALOR_RONDA = {
  bultoMarcado: 240,
  marcaInfundada: -150,
  bultoEscapado: -220,
  rondaLimpia: 500,
  fugitivoAtrapado: 320,
  fugitivoEscapado: -180,
};

export class RondaPatioScene {
  constructor({ onExit } = {}) {
    this.onExit = onExit ?? (() => {});
    this.keys = Object.create(null);
    this._bound = {};
    this._raf = null;
    this.pausado = false;
    this.fase = 'briefing';       // briefing · ronda · fin
    this.tiempo = DURACION;
    this.dashCd = 0;
    this.escanerCd = 0;
    this.dashT = 0;
    this.pulsos = [];
    this.avisos = [];
    this.aciertos = 0;
    this.fallos = 0;
    this.escapados = 0;
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  mount() {
    this.canvas = document.getElementById('gl');
    this.g = this.canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.mapa = new TileMap(MAPA);
    this.bultos = generarRonda(20);
    this.ambiente = new Ambiente(this.mapa);
    // Un vigilante por cada bulto marcado como vigilado, plantado a su lado.
    this.fugitivos = this.bultos.filter((b) => b.vigilado).map((b, i) => {
      const f = new Fugitivo(b, i);
      f.x = (b.cx + 0.5) * TILE;
      f.y = (b.cy + 1.8) * TILE;
      return f;
    });
    this.estela = [];
    this.polvo = [];
    this.actor = new Actor2D();
    this.actor.x = (INICIO.cx + 0.5) * TILE;
    this.actor.y = (INICIO.cy + 0.9) * TILE;

    this.hud = new HUDRonda({
      onSalir: () => this.onExit(),
      onIniciar: () => this.#empezar(),
      onReiniciar: () => window.location.reload(),
    }).mount();

    puntaje.reiniciarTurno();
    this.marcador = new Marcador();

    this.pausa = new PauseMenu({ onSalir: () => this.onExit() });
    this.pausa.mount?.();

    if (isTouch) {
      // Tres acciones y ninguna más. En un patio abierto con un pulgar, cada
      // botón extra es un botón que se pulsa sin querer.
      this.pad = new TouchControls({
        joystick: true,
        buttons: [
          { code: 'Space', label: 'ESCÁNER', hint: 'pulso' },
          { code: 'KeyE', label: 'MARCAR', small: true },
          { code: 'ShiftLeft', label: 'DASH', small: true },
        ],
      });
      this.pad.mount();
    }

    this.vp = new Viewport(this.canvas, (w, h) => this.#redimensionar(w, h));

    this._bound.keydown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') this.#escanear();
      if (e.code === 'KeyE') this.#marcar();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.#dash();
    };
    this._bound.keyup = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup', this._bound.keyup);

    this.hud.abrirBriefing();
    this.reloj = performance.now();
    this.#loop();
    return this;
  }

  unmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    this.vp?.destroy();
    this.pad?.destroy();
    this.pausa?.destroy?.();
    this.hud?.destroy();
    this.marcador?.destroy?.();
    coach.destroy();
    audio.setFocus?.('mundo');
  }

  #redimensionar(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.imageSmoothingEnabled = false;
    this.dpr = dpr;
    this.vw = w;
    this.vh = h;
    // ESCALA: cuántos píxeles de pantalla mide un píxel de diseño.
    //
    // Se calcula para que quepan ~19 tiles de ancho pase lo que pase, con suelo
    // de 2. Es lo que mantiene el juego legible tanto en un móvil apaisado como
    // en un monitor: en vez de ver más mundo, se ve MÁS GRANDE. Un RPG de
    // sprites que encoge en pantalla pequeña deja de leerse.
    this.esc = Math.max(1.8, Math.min(5, Math.round((w / (19 * TILE)) * 10) / 10));
  }

  #empezar() {
    this.fase = 'ronda';
    this.tiempo = DURACION;
    bus.emit?.(Señal.HERRAMIENTA_USADA ?? 'herramienta', { zona: 'ronda_patio' });
    audio.clic?.('firme');
    // Justus da la clase en dos frases. El resto lo enseña el propio patio.
    coach.guiar('ronda:intro', [
      { txt: 'Jefe, el patio es suyo. Toque ESCÁNER y el pulso le dice qué bultos cojean.',
        foco: isTouch ? '.tp-btn' : null },
      { txt: 'Los que canten, márquelos antes de que cierre el turno. Corra con DASH.' },
    ], { pos: 'abajo' });
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  /**
   * El pulso de escaneo: una onda que se expande y revela lo que toca.
   *
   * Es de ÁREA a propósito. Con apuntado, en un teléfono, el jugador pasa el rato
   * peleándose con la puntería en vez de decidiendo; con un pulso, la decisión
   * pasa a ser DÓNDE colocarse antes de soltarlo, que sí es una decisión.
   */
  #escanear() {
    if (this.fase !== 'ronda' || this.pausado || this.escanerCd > 0) return;
    this.escanerCd = RECARGA_ESCANER;
    this.pulsos.push({ x: this.actor.x, y: this.actor.y, r: 0, vida: 1 });
    audio.pulsoEscaner?.('nada');

    const R = RADIO_ESCANER * TILE;
    let revelados = 0;
    for (const b of this.bultos) {
      if (b.revelado) continue;
      const bx = (b.cx + 0.5) * TILE;
      const by = (b.cy + 0.5) * TILE;
      if (Math.hypot(bx - this.actor.x, by - this.actor.y) > R) continue;
      b.revelado = true;
      revelados += 1;
      if (b.anomalia) {
        this.#aviso(bx, by, b.anomalia.icono, PAL.alerta);
        audio.pulsoEscaner?.('acierto');
      }
    }
    if (revelados === 0) audio.beep?.(false);
    else audio.campanaOleada?.();
    this.hud.setPendientes(this.#pendientes());
  }

  /** Marca el bulto revelado que tengas al lado. */
  #marcar() {
    if (this.fase !== 'ronda' || this.pausado) return;
    let cerca = null;
    let mejor = ALCANCE_MARCA;
    for (const b of this.bultos) {
      if (b.marcado) continue;
      const d = Math.hypot((b.cx + 0.5) * TILE - this.actor.x, (b.cy + 0.5) * TILE - this.actor.y);
      if (d < mejor) { mejor = d; cerca = b; }
    }
    if (!cerca) return;

    cerca.marcado = true;
    const bx = (cerca.cx + 0.5) * TILE;
    const by = (cerca.cy + 0.5) * TILE;

    if (cerca.anomalia) {
      this.aciertos += 1;
      puntaje.sumar(VALOR_RONDA.bultoMarcado, cerca.anomalia.titular,
        { detalle: cerca.anomalia.leccion });
      this.#aviso(bx, by, '✔', PAL.ok);
      audio.golpeSello?.();
      this.hud.anotar(cerca, true);
    } else {
      this.fallos += 1;
      puntaje.sumar(VALOR_RONDA.marcaInfundada, 'MARCA SIN MOTIVO',
        { detalle: `${cerca.guia} estaba limpio. Marcar sin señal es una revisión `
          + 'que le cuesta horas a un transportista honesto.' });
      this.#aviso(bx, by, '✖', PAL.mal);
      audio.stinger?.('mal');
      this.hud.anotar(cerca, false);
    }
    this.hud.setPendientes(this.#pendientes());
    if (this.#pendientes() === 0) this.#cerrar('Patio despejado');
  }

  /**
   * Dash: el impulso que hace que el patio quepa en el cronómetro — y el único
   * modo de alcanzar a quien sale corriendo.
   *
   * Lo que se ve al soltarlo: una nube de polvo en el punto de arranque, un
   * rastro de imágenes fantasma del propio sprite mientras dura, y un tirón de
   * cámara. Sin nada de eso el dash era un cambio de número en una variable; con
   * ello se SIENTE, que es la diferencia entre un recurso y un botón.
   */
  #dash() {
    if (this.fase !== 'ronda' || this.pausado || this.dashCd > 0) return;
    this.dashCd = RECARGA_DASH;
    this.dashT = DASH_DUR;
    this.actor.dash = 1;
    audio.paso?.();
    // Polvo: se queda donde arrancaste, así que marca de dónde vienes.
    for (let i = 0; i < 9; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.polvo.push({
        x: this.actor.x + Math.cos(a) * 3,
        y: this.actor.y - 2 + Math.sin(a) * 2,
        vx: Math.cos(a) * 22, vy: Math.sin(a) * 11,
        r: 1.6 + Math.random() * 1.8, vida: 0.45 + Math.random() * 0.25,
      });
    }
    this.sacudida = 0.16;
  }

  #pendientes() {
    return this.bultos.filter((b) => b.anomalia && !b.marcado).length;
  }

  #aviso(x, y, txt, color) {
    this.avisos.push({ x, y, txt, color, vida: 1.3 });
  }

  #cerrar(motivo) {
    if (this.fase === 'fin') return;
    this.fase = 'fin';
    this.escapados = this.#pendientes();
    if (this.escapados > 0) {
      puntaje.sumar(VALOR_RONDA.bultoEscapado * this.escapados, 'SE FUERON SIN REVISAR',
        { detalle: `${this.escapados} con señal salieron del patio.` });
    } else if (this.fallos === 0) {
      puntaje.sumar(VALOR_RONDA.rondaLimpia, 'RONDA IMPECABLE',
        { detalle: 'Todos los sospechosos marcados y ni una revisión infundada.' });
    }
    progreso.cerrarOperativo('rondapatio', {
      aciertos: this.aciertos, errores: this.fallos + this.escapados,
      incautaciones: this.aciertos,
    });
    audio.setFocus?.('mundo');
    this.hud.abrirCierre({
      motivo,
      aciertos: this.aciertos,
      fallos: this.fallos,
      escapados: this.escapados,
      puntos: puntaje.total ?? 0,
    });
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────
  #loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.vp?.sincronizar();
      const ahora = performance.now();
      const dt = Math.min((ahora - this.reloj) / 1000, 0.05);
      this.reloj = ahora;
      this.pausado = this.pausa?.abierto ?? false;

      if (this.fase === 'ronda' && !this.pausado) {
        this.#actualizar(dt);
        this.tiempo -= dt;
        this.hud.setTiempo(this.tiempo, DURACION);
        if (this.tiempo <= 0) this.#cerrar('Se acabó el turno');
      }
      this.#dibujar(dt);
    };
    tick();
  }

  #actualizar(dt) {
    // Movimiento: el mismo código para teclado y para joystick, porque
    // `TouchControls` despacha KeyboardEvents reales (ADR-008).
    let dx = 0;
    let dy = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) dy -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) dy += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) dx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) dx += 1;
    // El joystick analógico manda si está fuera de su zona muerta: así el mando
    // da velocidad proporcional en vez de todo o nada.
    const ax = this.pad?.axis?.x ?? 0;
    const ay = this.pad?.axis?.y ?? 0;
    if (Math.hypot(ax, ay) > 0.22) { dx = ax; dy = ay; }

    const largo = Math.hypot(dx, dy);
    const moviendo = largo > 0.05;
    if (moviendo) { dx /= largo; dy /= largo; }

    this.dashT = Math.max(0, this.dashT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.escanerCd = Math.max(0, this.escanerCd - dt);
    this.hud.setRecargas(1 - this.escanerCd / RECARGA_ESCANER, 1 - this.dashCd / RECARGA_DASH);

    const vel = this.dashT > 0 ? DASH_VEL : VEL;
    if (moviendo) {
      const [nx, ny] = this.mapa.mover(this.actor.x, this.actor.y, dx * vel * dt, dy * vel * dt);
      this.actor.x = nx;
      this.actor.y = ny;
    }

    // Dirección del sprite: manda el eje dominante, como en cualquier RPG de
    // rejilla. Sin esto el personaje tiembla entre dos direcciones en diagonal.
    let dir = null;
    if (moviendo) {
      dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'izq' : 'der') : (dy < 0 ? 'arriba' : 'abajo');
    }
    this.actor.update(dt, moviendo, dir);

    // Ficha del bulto que tienes al lado: se lee sin pulsar nada.
    let cerca = null;
    let mejor = ALCANCE_MARCA;
    for (const b of this.bultos) {
      const d = Math.hypot((b.cx + 0.5) * TILE - this.actor.x, (b.cy + 0.5) * TILE - this.actor.y);
      if (d < mejor) { mejor = d; cerca = b; }
    }
    if (cerca !== this._cerca) {
      this._cerca = cerca;
      this.hud.setCercano(cerca);
    }

    for (const p of this.pulsos) { p.r += dt * RADIO_ESCANER * TILE * 3.4; p.vida -= dt * 1.5; }
    this.pulsos = this.pulsos.filter((p) => p.vida > 0);
    for (const a of this.avisos) { a.vida -= dt; a.y -= dt * 14; }
    this.avisos = this.avisos.filter((a) => a.vida > 0);

    // ── Estela del dash: fotogramas fantasma del sprite ──
    if (this.dashT > 0) {
      this.estela.push({ x: this.actor.x, y: this.actor.y, dir: this.actor.dir,
        ciclo: Math.floor(this.actor.t) % 4, vida: 0.3 });
    }
    for (const e of this.estela) e.vida -= dt;
    this.estela = this.estela.filter((e) => e.vida > 0);

    for (const p of this.polvo) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9; p.vida -= dt;
    }
    this.polvo = this.polvo.filter((p) => p.vida > 0);
    this.sacudida = Math.max(0, (this.sacudida ?? 0) - dt);

    // ── Fugitivos ──
    for (const f of this.fugitivos) {
      if (f.estado === 'escapado' || f.estado === 'atrapado') continue;
      const r = f.update(dt, this.mapa, this.actor, FUGA, TILE);
      if (r === 'escapa') {
        puntaje.sumar(VALOR_RONDA.fugitivoEscapado, 'SE ESCAPÓ POR LA VERJA',
          { detalle: 'Quien vigila un bulto sabe lo que lleva dentro. Ese testimonio se fue.' });
        this.#aviso(f.x, f.y, '✖', PAL.mal);
        continue;
      }
      // Alcanzarlo es TOCARLO: nada de violencia (Visión §22).
      if (f.estado === 'huye' && Math.hypot(f.x - this.actor.x, f.y - this.actor.y) < 13) {
        f.atrapar();
        this.aciertos += 1;
        puntaje.sumar(VALOR_RONDA.fugitivoAtrapado, 'INTERCEPTADO EN LA HUIDA',
          { detalle: `Vigilaba la guía ${f.bulto.guia}. Su bulto queda revelado en el acto.` });
        this.#aviso(f.x, f.y, '✔', PAL.ok);
        audio.golpeSello?.();
        this.hud.setPendientes(this.#pendientes());
        this.sacudida = 0.2;
      }
    }
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────
  #dibujar() {
    const g = this.g;
    const esc = this.esc;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a0e14';
    g.fillRect(0, 0, this.vw, this.vh);

    // Cámara: centrada en el oficial y sujeta a los bordes del mapa, para que
    // nunca se vea el vacío de fuera del recinto.
    const vistaW = this.vw / esc;
    const vistaH = this.vh / esc;
    let camX = this.actor.x - vistaW / 2;
    let camY = this.actor.y - vistaH / 2;
    camX = Math.max(0, Math.min(this.mapa.wpx - vistaW, camX));
    camY = Math.max(0, Math.min(this.mapa.hpx - vistaH, camY));
    if (this.mapa.wpx < vistaW) camX = (this.mapa.wpx - vistaW) / 2;
    if (this.mapa.hpx < vistaH) camY = (this.mapa.hpx - vistaH) / 2;
    // Sacudida del dash y de las intercepciones. Breve y pequeña: lo justo para
    // que el impulso golpee, no tanto como para marear en una pantalla pequeña.
    if (this.sacudida > 0) {
      camX += (Math.random() - 0.5) * this.sacudida * 26;
      camY += (Math.random() - 0.5) * this.sacudida * 26;
    }

    const t = performance.now() / 1000;
    g.save();
    g.scale(esc, esc);
    g.translate(-Math.round(camX * esc) / esc, -Math.round(camY * esc) / esc);

    // Suelo: una sola estampa del lienzo del mapa ya pintado.
    g.drawImage(this.mapa.lienzo, 0, 0);
    this.ambiente.dibujarFondo(g, t);
    this.ambiente.dibujarSuelo(g, t);

    // Polvo del dash: va pegado al suelo, debajo de todo lo que camina.
    for (const p of this.polvo) {
      g.globalAlpha = Math.max(0, p.vida) * 0.5;
      g.fillStyle = '#cfc9b8';
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Estela del dash: el propio sprite repetido y desvaneciéndose.
    for (const e of this.estela) {
      g.globalAlpha = Math.max(0, e.vida) * 1.5;
      const img = this.actor.frames[e.dir][e.ciclo];
      g.drawImage(img, Math.round(e.x - 8), Math.round(e.y - 24));
    }
    g.globalAlpha = 1;

    // ── TODO LO QUE PISA EL SUELO, ORDENADO POR Y ──
    // Bultos, fugitivos y oficial se ordenan juntos: es lo que hace que un
    // fugitivo pase POR DETRÁS de un contenedor y no flotando sobre él.
    const cosas = [
      ...this.bultos.map((b) => ({ y: (b.cy + 1) * TILE, pinta: () => this.#dibujarBulto(g, b) })),
      ...this.fugitivos.filter((f) => f.estado !== 'escapado')
        .map((f) => ({ y: f.y, pinta: () => f.dibujar(g) })),
      { y: this.actor.y, pinta: () => this.actor.dibujar(g, 1) },
    ].sort((a, b) => a.y - b.y);
    for (const c of cosas) c.pinta();

    // Ondas del escáner: anillos que se expanden.
    for (const p of this.pulsos) {
      g.strokeStyle = PAL.escaner;
      g.globalAlpha = Math.max(0, p.vida) * 0.7;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = Math.max(0, p.vida) * 0.16;
      g.fillStyle = PAL.escaner;
      g.fill();
      g.globalAlpha = 1;
    }

    // Avisos flotantes (✔ / ✖ / icono de anomalía).
    g.textAlign = 'center';
    for (const a of this.avisos) {
      g.globalAlpha = Math.min(1, a.vida);
      g.font = 'bold 11px system-ui';
      g.fillStyle = a.color;
      g.fillText(a.txt, a.x, a.y - 18);
      g.globalAlpha = 1;
    }

    // Charcos de luz de las farolas, al final y en aditivo: convierten el patio
    // plano en un sitio con zonas cálidas y zonas donde no se ve nada.
    this.ambiente.dibujarLuces(g, this.mapa, camX, camY, vistaW, vistaH);
    g.restore();
  }

  #dibujarBulto(g, b) {
    const x = b.cx * TILE;
    const y = b.cy * TILE;

    // La silueta la pone `Bultos.js`: contenedor, palé, bidones, sacos o huacal.
    dibujarBulto(g, b, x, y);

    if (b.marcado) {
      // Precinto de intervención: cinta cruzada. Se ve a distancia de mapa.
      g.strokeStyle = b.anomalia ? PAL.ok : PAL.mal;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + 2, y + 3); g.lineTo(x + 14, y + 12);
      g.moveTo(x + 14, y + 3); g.lineTo(x + 2, y + 12);
      g.stroke();
    } else if (b.revelado && b.anomalia) {
      // Revelado y sospechoso: late en ámbar y enseña su icono encima.
      const pulso = 0.55 + Math.sin(performance.now() / 240) * 0.3;
      g.strokeStyle = PAL.alerta;
      g.globalAlpha = pulso;
      g.lineWidth = 1.5;
      g.strokeRect(x + 0.5, y + 1.5, 15, 12);
      g.globalAlpha = 1;
      g.font = '9px system-ui';
      g.textAlign = 'center';
      g.fillStyle = PAL.alerta;
      g.fillText(b.anomalia.icono, x + 8, y - 1);
    } else if (b.revelado) {
      // Revelado y limpio: marca discreta de «ya mirado», que hace de mapa de
      // progreso sin abrir ningún panel.
      g.fillStyle = 'rgba(63,196,127,0.5)';
      g.fillRect(x + 6, y - 3, 4, 2);
    }
  }
}
