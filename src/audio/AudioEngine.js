/**
 * AudioEngine — el aeropuerto se escucha antes de verse.
 * Todo se sintetiza en vivo con Web Audio API: no hay archivos.
 *
 * Capas continuas: aire acondicionado · zumbido fluorescente · murmullo de gente ·
 * jets lejanos · megafonía (chime + voz filtrada ininteligible) · latido por tensión.
 * One-shots: papel · sello · beep · escáner · gruñido K-9 · pasos de fila.
 *
 * El "foco" acústico cambia con la cámara: al acercarse a un rostro o al monitor,
 * el mundo se apaga detrás de un lowpass — solo queda lo que importa.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  /** Buses base (master + foco de mundo + bus dramático + ruido). Idempotente. */
  #initBuses() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -18;
    this.master.connect(ctx.destination);

    // Bus de mundo con filtro de foco (ducking espectral).
    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 18000;
    this.worldGain = ctx.createGain();
    this.worldGain.gain.value = 1;
    this.worldFilter.connect(this.worldGain).connect(this.master);

    // Bus dramático (latido, stingers) — nunca se filtra.
    this.dramaGain = ctx.createGain();
    this.dramaGain.gain.value = 1;
    this.dramaGain.connect(this.master);

    this.#noiseBuffer = this.#makeNoise();
  }

  /** Debe llamarse desde un gesto del usuario (clic de INICIAR TURNO). Aeropuerto. */
  start() {
    if (this.started) return;
    this.started = true;
    this.#initBuses();
    this.#startHVAC();
    this.#startFluorescents();
    this.#startCrowd();
    this.#scheduleJets();
    this.#schedulePA();
    this.#startHeartbeat();
  }

  /**
   * Ambiente del Puerto de Chimbote (ADR-006): lavado de mar continuo + gaviotas
   * y cuernos de carguero esporádicos. Sin las capas de terminal (HVAC, megafonía).
   */
  startPort() {
    if (this.started) return;
    this.started = true;
    this.#initBuses();
    this.#startSeaWash();
    this.#scheduleGaviotas();
    this.#scheduleCuernos();
    this.#startHeartbeat();
  }

  #noiseBuffer;

  #makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #loopNoise(filterType, freq, q, gainValue) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    src.connect(f).connect(g).connect(this.worldFilter);
    src.start();
    return { src, filter: f, gain: g };
  }

  // ── Capas continuas ─────────────────────────────────────────────────────
  #startHVAC() {
    this.hvac = this.#loopNoise('lowpass', 170, 0.5, 0.055);
  }

  #startFluorescents() {
    // 100 Hz + armónico: el zumbido eléctrico casi subliminal de los tubos.
    const g = this.ctx.createGain();
    g.gain.value = 0.004;
    for (const [freq, amp] of [[100, 1], [200, 0.35], [300, 0.12]]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = freq;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start();
    }
    g.connect(this.worldFilter);
  }

  #startCrowd() {
    // Murmullo: banda de voz filtrada, con oleadas lentas (LFO sobre la ganancia).
    this.crowd = this.#loopNoise('bandpass', 500, 0.8, 0.03);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(this.crowd.gain.gain);
    lfo.start();
  }

  #scheduleJets() {
    const jet = () => {
      if (this.ctx.state === 'closed') return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(90, t);
      f.frequency.linearRampToValueAtTime(260, t + 9);
      f.frequency.linearRampToValueAtTime(70, t + 20);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 8);
      g.gain.linearRampToValueAtTime(0, t + 20);
      src.connect(f).connect(g).connect(this.worldFilter);
      src.start(t);
      src.stop(t + 21);
      setTimeout(jet, 45000 + Math.random() * 50000);
    };
    setTimeout(jet, 12000);
  }

  #schedulePA() {
    const announce = () => {
      if (this.ctx.state === 'closed') return;
      const t = this.ctx.currentTime;
      // Chime de tres notas.
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const o = this.ctx.createOscillator();
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.45);
        g.gain.linearRampToValueAtTime(0.05, t + i * 0.45 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.45 + 1.4);
        o.connect(g).connect(this.worldFilter);
        o.start(t + i * 0.45);
        o.stop(t + i * 0.45 + 1.5);
      });
      // "Voz" de megafonía: sawtooth con formante móvil, lejana e ininteligible.
      const dur = 4 + Math.random() * 3;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 115;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 4;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.worldFilter);
      o.start(t + 1.6);
      o.stop(t + 1.6 + dur);
      // Sílabas: pulsos de ganancia y saltos de formante.
      let st = t + 1.6;
      while (st < t + 1.6 + dur) {
        const syl = 0.09 + Math.random() * 0.14;
        g.gain.setValueAtTime(0.016, st);
        g.gain.setValueAtTime(0.0, st + syl);
        f.frequency.setValueAtTime(400 + Math.random() * 900, st);
        o.frequency.setValueAtTime(105 + Math.random() * 30, st);
        st += syl + (Math.random() < 0.25 ? 0.3 : 0.04);
      }
      setTimeout(announce, 35000 + Math.random() * 45000);
    };
    setTimeout(announce, 8000);
  }

  #startHeartbeat() {
    // Latido: dos golpes graves. La tensión controla frecuencia y volumen.
    this.heartGain = this.ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.dramaGain);
    this.heartRate = 60; // BPM
    const beat = () => {
      if (this.ctx.state === 'closed') return;
      const t = this.ctx.currentTime;
      for (const [dt, amp] of [[0, 1], [0.18, 0.6]]) {
        const o = this.ctx.createOscillator();
        o.frequency.setValueAtTime(58, t + dt);
        o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(amp * 0.5, t + dt);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
        o.connect(g).connect(this.heartGain);
        o.start(t + dt);
        o.stop(t + dt + 0.3);
      }
      setTimeout(beat, 60000 / this.heartRate);
    };
    beat();
  }

  /**
   * Tensión dramática 0..1: acelera el latido y lo hace audible.
   * A 0 el corazón es inaudible: el jugador solo lo nota cuando ya está dentro.
   */
  setTension(tension) {
    if (!this.started) return;
    this.heartRate = 55 + tension * 65;
    this.heartGain.gain.linearRampToValueAtTime(
      tension < 0.25 ? 0 : (tension - 0.25) * 0.5,
      this.ctx.currentTime + 0.8,
    );
  }

  /** Volumen general 0..1 (lo controla el menú de pausa, ADR-010). */
  setVolumen(v) {
    if (!this.started) return;
    this.volumen = Math.max(0, Math.min(1, v));
    // El compresor maestro no tiene ganancia propia: se modulan los dos buses.
    const t = this.ctx.currentTime + 0.05;
    this.worldGain.gain.linearRampToValueAtTime(this.volumen, t);
    this.dramaGain.gain.linearRampToValueAtTime(this.volumen, t);
  }

  /** Foco acústico: 'mundo' (todo abierto) · 'closeup' (interrogatorio) · 'monitor' (rayos X). */
  setFocus(modo) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const presets = {
      mundo: { freq: 18000, gain: 1 },
      closeup: { freq: 700, gain: 0.4 },   // el mundo se apaga: solo respiración y voz
      monitor: { freq: 1600, gain: 0.55 }, // el zumbido del escáner manda
    };
    const p = presets[modo] ?? presets.mundo;
    this.worldFilter.frequency.exponentialRampToValueAtTime(p.freq, t + 0.9);
    this.worldGain.gain.linearRampToValueAtTime(p.gain, t + 0.9);
  }

  // ── One-shots ───────────────────────────────────────────────────────────
  #burst({ dur = 0.08, type = 'highpass', freq = 2000, q = 1, gain = 0.2, drama = false }) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(drama ? this.dramaGain : this.worldFilter);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  papel() {
    this.#burst({ dur: 0.14, freq: 2600, gain: 0.10 });
    setTimeout(() => this.#burst({ dur: 0.09, freq: 3400, gain: 0.06 }), 70);
  }

  golpeSello() {
    // Thud grave + click + eco del mostrador. El sonido más importante del juego.
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.13);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.dramaGain);
    o.start(t);
    o.stop(t + 0.35);
    this.#burst({ dur: 0.05, freq: 1800, gain: 0.3, drama: true });
    // Eco corto (la sala responde).
    setTimeout(() => this.#burst({ dur: 0.2, type: 'lowpass', freq: 500, gain: 0.06 }), 90);
  }

  /**
   * Clic de interfaz. El juego tenía sonido para el sello, el papel y el perro,
   * pero pulsar un botón del HUD era MUDO: la mitad de la sensación de solidez
   * de una UI está en que el dedo reciba respuesta.
   *
   * Es deliberadamente pequeño — un tick de relé, no un "blip" de videojuego:
   * un transitorio corto de ruido pasa-banda con un cuerpo de onda triangular
   * grave debajo. Suena a botón físico de mostrador.
   * @param {'suave'|'firme'} peso  'firme' para acciones con consecuencia.
   */
  clic(peso = 'suave') {
    if (!this.started) return;
    const firme = peso === 'firme';
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(firme ? 320 : 460, t);
    o.frequency.exponentialRampToValueAtTime(firme ? 140 : 240, t + 0.045);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(firme ? 0.07 : 0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (firme ? 0.09 : 0.055));
    o.connect(g).connect(this.dramaGain);
    o.start(t);
    o.stop(t + 0.12);
    this.#burst({ dur: 0.022, freq: firme ? 3200 : 4200, q: 0.7, gain: firme ? 0.09 : 0.05, drama: true });
  }

  /**
   * Paso del oficial. Caminar por el muelle era MUDO: seis mil metros cuadrados
   * de hormigón sin un solo sonido bajo los pies, que es lo que más delata que
   * un espacio en primera persona no está terminado.
   *
   * Dos capas, como un paso real: el CUERPO (un seno grave que cae rápido — la
   * suela contra la losa) y la TEXTURA (un transitorio de ruido, la arenilla).
   * Dentro de un contenedor la chapa resuena: el transitorio sube de frecuencia
   * y se le añade una cola metálica corta. Cada paso lleva variación aleatoria
   * de tono y volumen; sin ella, cinco pasos seguidos suenan a metrónomo.
   * @param {boolean} metal  true si el jugador va dentro de un contenedor.
   */
  paso(metal = false) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const jitter = 0.88 + Math.random() * 0.24;

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime((metal ? 132 : 96) * jitter, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.075);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.085 * jitter, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g).connect(this.worldFilter);
    o.start(t);
    o.stop(t + 0.14);

    this.#burst({
      dur: metal ? 0.05 : 0.035,
      type: 'highpass',
      freq: (metal ? 2600 : 1700) * jitter,
      gain: metal ? 0.055 : 0.038,
    });
    // La chapa del contenedor devuelve el golpe un instante después.
    if (metal) setTimeout(() => this.#burst({ dur: 0.18, type: 'bandpass', freq: 900, q: 6, gain: 0.028 }), 45);
  }

  /**
   * Chispa eléctrica del tubo de rayos X. Acompaña al arco que dibuja el shader
   * del monitor: sin sonido, un destello en pantalla se lee como un fallo de
   * renderizado; con él, se lee como una máquina vieja que pide corriente.
   *
   * Un arco real es ruido de banda ancha con un pico agudo y cola cortísima,
   * más un zumbido de red de 60 Hz que se cuela un instante (Perú va a 60).
   */
  chispa(fuerza = 1) {
    if (!this.started) return;
    const f = Math.max(0.2, Math.min(1, fuerza));
    // Crepitación: tres transitorios muy cortos y desiguales.
    for (const [ms, freq, g] of [[0, 5200, 0.10], [26, 3400, 0.06], [58, 6800, 0.035]]) {
      setTimeout(() => this.#burst({
        dur: 0.02 + Math.random() * 0.02,
        type: 'highpass',
        freq: freq * (0.85 + Math.random() * 0.3),
        q: 0.8,
        gain: g * f,
        drama: true,
      }), ms);
    }
    // Zumbido de red: el instante en que la fuente se resiente.
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    const bq = this.ctx.createBiquadFilter();
    bq.type = 'lowpass'; bq.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05 * f, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(bq).connect(g).connect(this.dramaGain);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Roce al abrir/cerrar un panel: aire, no un "swoosh" de presentación. */
  panel(abre = true) {
    if (!this.started) return;
    this.#burst({ dur: abre ? 0.13 : 0.09, type: 'bandpass', freq: abre ? 1500 : 900, q: 0.8, gain: 0.045 });
  }

  beep(ok = true) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = ok ? 1180 : 340;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (ok ? 0.12 : 0.4));
    o.connect(g).connect(this.dramaGain);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** Zumbido del escáner de rayos X (encender/apagar). */
  escaner(on) {
    if (!this.started) return;
    if (on && !this.scanNodes) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 48;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.6);
      o.connect(f).connect(g).connect(this.dramaGain);
      o.start();
      this.scanNodes = { o, g };
    } else if (!on && this.scanNodes) {
      const { o, g } = this.scanNodes;
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
      o.stop(this.ctx.currentTime + 0.6);
      this.scanNodes = null;
    }
  }

  /** Justus: gruñido (marca) o resoplido (nada). */
  justus(marca) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = this.ctx.createGain();
    o.connect(f).connect(g).connect(this.dramaGain);
    if (marca) {
      o.frequency.setValueAtTime(70, t);
      g.gain.setValueAtTime(0.12, t);
      // Gruñido rugoso: modulación rápida de pitch.
      for (let i = 0; i < 14; i++) o.frequency.setValueAtTime(62 + Math.random() * 22, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0, t + 0.9);
      o.start(t); o.stop(t + 1);
    } else {
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    }
  }

  /**
   * Llanto desesperado: sollozos descendentes con vibrato + inhalaciones
   * entrecortadas (ruido filtrado). Sobrio pero inconfundible.
   */
  llanto() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.72;
      // El sollozo: onda que cae con vibrato de 6 Hz.
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(390 - i * 28, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.5);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 6.5;
      const vibG = this.ctx.createGain();
      vibG.gain.value = 22;
      vib.connect(vibG).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 500;
      f.Q.value = 1.2;
      o.connect(f).connect(g).connect(this.dramaGain);
      o.start(t); o.stop(t + 0.6);
      vib.start(t); vib.stop(t + 0.6);
      // La inhalación entrecortada entre sollozos.
      setTimeout(() => this.#burst({ dur: 0.16, type: 'highpass', freq: 1400, gain: 0.05, drama: true }),
        (i * 0.72 + 0.58) * 1000);
    }
  }

  /** Silbato policial: doble chirrido agudo. */
  silbato() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    for (const dt of [0, 0.28]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(2100, t0 + dt);
      o.frequency.linearRampToValueAtTime(2350, t0 + dt + 0.18);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.22);
      o.connect(g).connect(this.dramaGain);
      o.start(t0 + dt); o.stop(t0 + dt + 0.25);
    }
  }

  /** Olfateo de Justus: ráfaga de resoplidos cortos por la nariz. */
  olfateo() {
    if (!this.started) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.#burst({ dur: 0.06, type: 'bandpass', freq: 700 + Math.random() * 300, q: 2, gain: 0.09, drama: true }),
        i * 130 + Math.random() * 40);
    }
  }

  /** Estática del televisor CRT (encender/apagar el Noticiero). */
  estatica(on) {
    if (!this.started) return;
    if (on && !this.tvNodes) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.#noiseBuffer;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      // Golpe de encendido y luego siseo de fondo.
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + 1.2);
      src.connect(f).connect(g).connect(this.dramaGain);
      src.start();
      this.tvNodes = { src, g };
    } else if (!on && this.tvNodes) {
      const { src, g } = this.tvNodes;
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
      src.stop(this.ctx.currentTime + 0.5);
      this.tvNodes = null;
    }
  }

  // ── Puerto de Chimbote (ADR-006) ──────────────────────────────────────────
  /** Lavado de mar: ruido grave con oleadas lentas (LFO) — el muelle respira. */
  #startSeaWash() {
    this.sea = this.#loopNoise('lowpass', 380, 0.4, 0.05);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11; // una ola cada ~9 s
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.sea.gain.gain);
    lfo.start();
  }

  #scheduleGaviotas() {
    const tick = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      this.gaviota();
      setTimeout(tick, 4000 + Math.random() * 9000);
    };
    setTimeout(tick, 2500);
  }

  #scheduleCuernos() {
    const tick = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      this.cuernoBarco();
      setTimeout(tick, 22000 + Math.random() * 30000);
    };
    setTimeout(tick, 9000);
  }

  /** Graznido de gaviota: 2–3 chillidos descendentes con vibrato. */
  gaviota() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.26;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1300 + Math.random() * 250, t);
      o.frequency.exponentialRampToValueAtTime(820, t + 0.2);
      const vib = this.ctx.createOscillator();
      vib.frequency.value = 22;
      const vibG = this.ctx.createGain();
      vibG.gain.value = 60;
      vib.connect(vibG).connect(o.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(f).connect(g).connect(this.worldFilter);
      o.start(t); o.stop(t + 0.26);
      vib.start(t); vib.stop(t + 0.26);
    }
  }

  /** Cuerno de carguero: nota gravísima, larga, que crece y se apaga (niebla). */
  cuernoBarco() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.7);
    g.gain.setValueAtTime(0.14, t + 2.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    g.connect(this.worldFilter);
    // Dos osciladores casi al unísono para el "batido" ronco del cuerno.
    for (const freq of [58, 58.6, 116]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const og = this.ctx.createGain();
      og.gain.value = freq > 100 ? 0.25 : 1;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      o.connect(og).connect(f).connect(g);
      o.start(t); o.stop(t + 3.3);
    }
  }

  /** Golpe metálico: puertas de contenedor al abrirse (chirrido + clonk). */
  contenedor() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // Chirrido de bisagra: ruido bandpass ascendente.
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.worldFilter);
    src.start(t); src.stop(t + 0.75);
    // Clonk final metálico grave.
    setTimeout(() => {
      const t2 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(160, t2);
      o.frequency.exponentialRampToValueAtTime(70, t2 + 0.15);
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.5, t2);
      g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.3);
      o.connect(g2).connect(this.dramaGain);
      o.start(t2); o.stop(t2 + 0.32);
    }, 650);
  }

  // ── Nivel 3 · Operativo Trafasport (ADR-007) ──────────────────────────────
  /** Arranque mínimo para escenas narrativas: solo buses + latido. */
  startRaid() {
    if (this.started) return;
    this.started = true;
    this.#initBuses();
    this.#startHeartbeat();
  }

  /**
   * Música dinámica del raid: 'tienda' (muzak aburrido de galería) ·
   * 'persecucion' (pulso frenético + sirena) · null (silencio).
   */
  musica(modo) {
    if (!this.started) return;
    // Apagar la capa anterior.
    if (this.musicaNodes) {
      const { oscs, gain } = this.musicaNodes;
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
      for (const o of oscs) { try { o.stop(this.ctx.currentTime + 0.7); } catch { /* ya parado */ } }
      clearInterval(this.musicaTimer);
      this.musicaNodes = null;
    }
    if (!modo) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(modo === 'tienda' ? 0.045 : 0.08, ctx.currentTime + 0.8);
    gain.connect(this.worldFilter);
    const oscs = [];

    if (modo === 'tienda') {
      // Muzak: arpegio suave y repetitivo de tienda de galería (triángulo, lento).
      const notas = [261.6, 329.6, 392.0, 329.6, 293.7, 392.0, 349.2, 293.7];
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.connect(gain);
      o.start();
      oscs.push(o);
      let i = 0;
      this.musicaTimer = setInterval(() => {
        if (ctx.state === 'closed') return;
        o.frequency.setTargetAtTime(notas[i % notas.length], ctx.currentTime, 0.04);
        i++;
      }, 460);
    } else {
      // Persecución: bajo pulsante frenético + sirena bitonal.
      const bajo = ctx.createOscillator();
      bajo.type = 'sawtooth';
      bajo.frequency.value = 55;
      const bajoGain = ctx.createGain();
      bajoGain.gain.value = 0.9;
      bajo.connect(bajoGain).connect(gain);
      bajo.start();
      const sirena = ctx.createOscillator();
      sirena.type = 'square';
      sirena.frequency.value = 660;
      const sirenaGain = ctx.createGain();
      sirenaGain.gain.value = 0.16;
      sirena.connect(sirenaGain).connect(gain);
      sirena.start();
      oscs.push(bajo, sirena);
      let beat = 0;
      this.musicaTimer = setInterval(() => {
        if (ctx.state === 'closed') return;
        const t = ctx.currentTime;
        bajoGain.gain.setValueAtTime(1, t);
        bajoGain.gain.exponentialRampToValueAtTime(0.25, t + 0.1);
        bajo.frequency.setValueAtTime(beat % 4 === 3 ? 73.4 : 55, t);
        sirena.frequency.setTargetAtTime(beat % 2 ? 660 : 880, t, 0.05);
        beat++;
      }, 140);
    }
    this.musicaNodes = { oscs, gain };
  }

  /** Cristales rotos: lluvia de clinks agudos + estallido de ruido. */
  vidrios() {
    if (!this.started) return;
    this.#burst({ dur: 0.25, type: 'highpass', freq: 3000, gain: 0.22, drama: true });
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.frequency.value = 2400 + Math.random() * 3200;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g).connect(this.dramaGain);
        o.start(t); o.stop(t + 0.14);
      }, 40 + i * 55 + Math.random() * 40);
    }
  }

  /** Tos del narrador (cuando el jugador mete la pata). */
  tos() {
    if (!this.started) return;
    for (const [delay, dur] of [[0, 0.09], [160, 0.12]]) {
      setTimeout(() => this.#burst({ dur, type: 'bandpass', freq: 420, q: 1.2, gain: 0.16, drama: true }), delay);
    }
  }

  /** Ladrido FELIZ de Justus (dos ladridos brillantes, nada de gruñido). */
  ladridoFeliz() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    for (const dt of [0, 0.28]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(420, t0 + dt);
      o.frequency.exponentialRampToValueAtTime(760, t0 + dt + 0.06);
      o.frequency.exponentialRampToValueAtTime(300, t0 + dt + 0.16);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.18);
      o.connect(f).connect(g).connect(this.dramaGain);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    }
  }

  /**
   * EL ESCÁNER CANINO (Canal Rojo). El ladrido de trabajo de Justus, graduable:
   * `calor` 0..1 es lo cerca que está del olor. Es la interfaz sonora de la
   * mecánica — el jugador aprende a leer al perro por el OÍDO antes que por la
   * barra de la pantalla, que es como se lee a un can detector de verdad.
   *
   * A poca intensidad: un solo ladrido corto y apagado, casi desgana.
   * A intensidad alta: ráfaga rápida, aguda y sostenida — el marcaje.
   */
  ladrido(calor = 1) {
    if (!this.started) return;
    const c = Math.max(0, Math.min(1, calor));
    const n = 1 + Math.round(c * 3);                 // 1 → 4 ladridos
    const t0 = this.ctx.currentTime;
    const sep = 0.26 - c * 0.11;                     // más caliente = más rápido
    for (let k = 0; k < n; k++) {
      const t = t0 + k * sep;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      const base = 300 + c * 190;                    // más caliente = más agudo
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.85, t + 0.045);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.15);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900 + c * 1400;            // el ladrido "abre" al acercarse
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05 + c * 0.13, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
      o.connect(f).connect(g).connect(this.dramaGain);
      o.start(t); o.stop(t + 0.2);
    }
  }

  /**
   * Pitido de proximidad (tipo detector): el tono sube con el calor. Acompaña al
   * ladrido en la barra de olfato para que la lectura funcione también sin
   * auriculares finos… y para que en móvil se note incluso con el altavoz malo.
   */
  pitidoProximidad(calor = 0) {
    if (!this.started) return;
    const c = Math.max(0, Math.min(1, calor));
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520 + c * 900, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 + c * 0.05, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.dramaGain);
    o.start(t); o.stop(t + 0.12);
  }

  /** Sonido "químico": burbujeo agudo inquietante (pegamento tóxico). */
  quimico() {
    if (!this.started) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(900 + Math.random() * 900, t);
        o.frequency.exponentialRampToValueAtTime(300 + Math.random() * 200, t + 0.09);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g).connect(this.dramaGain);
        o.start(t); o.stop(t + 0.12);
      }, i * 70);
    }
  }

  /** Chillido de ave/animal exótico: graznidos ásperos con pitch rugoso. */
  chillido() {
    if (!this.started) return;
    const t0 = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * 0.17;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(950 + Math.random() * 300, t);
      o.frequency.linearRampToValueAtTime(1550, t + 0.05);
      o.frequency.linearRampToValueAtTime(720, t + 0.14);
      for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(720 + Math.random() * 850, t + i * 0.017); // rugosidad
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(f).connect(g).connect(this.dramaGain);
      o.start(t); o.stop(t + 0.17);
    }
  }

  /** Aleteo: ráfaga de golpes de ala (ruido filtrado rítmico). */
  aleteo() {
    if (!this.started) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.#burst({ dur: 0.12, type: 'bandpass', freq: 380 + Math.random() * 220, q: 1.5, gain: 0.06, drama: true }),
        i * 110);
    }
  }

  // ── Centro Postal (ADR-013) ───────────────────────────────────────────────

  /**
   * Ambiente de la nave de clasificación: HVAC, zumbido de fluorescentes y un
   * murmullo de trabajo de fondo. Sin megafonía de aeropuerto ni mar — pero SÍ
   * con el latido, porque aquí la presión la pone el cronómetro de la oleada.
   *
   * La cinta transportadora NO arranca aquí: la enciende la escena con
   * `cinta(true)` cuando la primera oleada echa a andar, para que el jugador
   * OIGA el momento en que la nave se pone en marcha.
   */
  startPostal() {
    if (this.started) return;
    this.started = true;
    this.#initBuses();
    this.#startHVAC();
    this.#startFluorescents();
    this.#startCrowd();
    this.#startHeartbeat();
  }

  /**
   * La cinta transportadora: rumor grave continuo con el golpeteo lento de los
   * rodillos encima (LFO a 2.6 Hz sobre la ganancia). Es el reloj sonoro del
   * nivel — mientras suena, hay paquetes yendo hacia el camión.
   */
  cinta(on) {
    if (!this.started) return;
    if (on && !this.cintaNodes) {
      const capa = this.#loopNoise('lowpass', 210, 0.7, 0.0001);
      capa.gain.gain.linearRampToValueAtTime(0.055, this.ctx.currentTime + 0.9);
      // Rodillos: el traqueteo periódico que distingue una cinta de un ventilador.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 2.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain).connect(capa.gain.gain);
      lfo.start();
      this.cintaNodes = { capa, lfo };
    } else if (!on && this.cintaNodes) {
      const { capa, lfo } = this.cintaNodes;
      const t = this.ctx.currentTime;
      capa.gain.gain.cancelScheduledValues(t);
      capa.gain.gain.setValueAtTime(capa.gain.gain.value, t);
      capa.gain.gain.linearRampToValueAtTime(0.0001, t + 0.7);
      capa.src.stop(t + 0.8);
      lfo.stop(t + 0.8);
      this.cintaNodes = null;
    }
  }

  /**
   * El pulso de escaneo: un barrido de frecuencia cortísimo (el «zap» del lector
   * de códigos) seguido del veredicto. Tres resultados y tres timbres, porque el
   * jugador tiene que poder distinguirlos SIN mirar el HUD:
   *   'hallazgo' — dos notas ascendentes: algo apareció.
   *   'nada'     — un tono seco y plano: la herramienta no era esa.
   *   'infundado'— disonancia grave: disparaste sin señal.
   */
  pulsoEscaner(resultado = 'nada') {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const zap = this.ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(320, t);
    zap.frequency.exponentialRampToValueAtTime(2400, t + 0.07);
    const zf = this.ctx.createBiquadFilter();
    zf.type = 'bandpass'; zf.frequency.value = 1600; zf.Q.value = 2.4;
    const zg = this.ctx.createGain();
    zg.gain.setValueAtTime(0.07, t);
    zg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    zap.connect(zf).connect(zg).connect(this.dramaGain);
    zap.start(t); zap.stop(t + 0.11);

    const notas = {
      hallazgo: [[880, 0.10], [1320, 0.20]],
      nada: [[430, 0.16]],
      infundado: [[196, 0.34], [185, 0.34]],
    }[resultado] ?? [[430, 0.16]];

    notas.forEach(([hz, dur], i) => {
      const t0 = t + 0.09 + i * 0.09;
      const o = this.ctx.createOscillator();
      o.type = resultado === 'infundado' ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(hz, t0);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(resultado === 'infundado' ? 0.05 : 0.035, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(this.dramaGain);
      o.start(t0); o.stop(t0 + dur + 0.02);
    });
  }

  /** Campana de arranque de oleada: la nave avisa de que empieza el flujo. */
  campanaOleada() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (const [hz, retardo, amp] of [[660, 0, 0.06], [990, 0.16, 0.045]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(hz, t + retardo);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + retardo);
      g.gain.exponentialRampToValueAtTime(amp, t + retardo + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + 0.9);
      o.connect(g).connect(this.dramaGain);
      o.start(t + retardo); o.stop(t + retardo + 1);
    }
  }

  /** Stinger dramático (quiebre, hallazgo): nota grave que crece y se corta. */
  stinger() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(55, t);
    o.frequency.linearRampToValueAtTime(58, t + 1.8);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 1.6);
    g.gain.setValueAtTime(0.0001, t + 1.85);
    o.connect(g).connect(this.dramaGain);
    o.start(t);
    o.stop(t + 2);
  }
}

/** Instancia única. */
export const audio = new AudioEngine();
