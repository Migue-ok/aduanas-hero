import gsap from 'gsap';
import { audio } from '../audio/AudioEngine.js';
import { abrirPanel, cerrarPanel } from './Paneles.js';
import { compacto } from './estilos.js';

/**
 * HUDDirandro — la consola de la sala de revisión intrusiva.
 *
 * Tres estaciones, tres lenguajes visuales distintos a propósito (el jugador
 * tiene que sentir que cambia de aparato, no de pestaña):
 *
 * 1. **Escáner corporal** — silueta genérica y una barra que barre. Regla
 *    innegociable de contenido (Visión §28.2): NUNCA se dibuja un cuerpo, solo
 *    un maniquí plano y una zona señalada. Así funcionan los escáneres de ondas
 *    milimétricas reales desde que se les exigió software de privacidad, y el
 *    juego lo dice en pantalla.
 * 2. **Espectrómetro de trazas (IMS)** — el jugador elige DÓNDE hisopar. La
 *    lección entera está en esa elección: se hisopa donde la mano tocó.
 * 3. **Revisión profunda** — calibre sobre la estructura. Medir, comparar con
 *    la ficha del fabricante, y solo entonces abrir el forro.
 */
export class HUDDirandro {
  constructor(root = document.getElementById('hud-root')) {
    HUDDirandro.#inyectarCSS();
    this.el = document.createElement('div');
    this.el.id = 'dirandro';
    this.el.innerHTML = `
      <div class="dr-cab g-panel">
        <div class="dr-tit"><i></i>SALA DE REVISIÓN INTRUSIVA · DIRANDRO — PNP</div>
        <div class="dr-sub"></div>
        <div class="dr-pasos"></div>
      </div>
      <div class="dr-estacion g-panel oculto"></div>
      <div class="dr-acta oculto"><div class="dr-acta-caja g-panel"></div></div>
    `;
    root.appendChild(this.el);
    this.$ = (s) => this.el.querySelector(s);
  }

  setCabecera(sub, pasos, activo) {
    this.$('.dr-sub').textContent = sub;
    this.$('.dr-pasos').innerHTML = pasos.map((p, i) =>
      `<span class="dr-paso ${i < activo ? 'hecho' : i === activo ? 'activo' : ''}">${i + 1}. ${p}</span>`).join('');
    abrirPanel(this.$('.dr-cab'), { y: -16, scale: 0.97, duration: 0.45, sfx: false });
  }

  // ══ ESTACIÓN 1 · Escáner corporal por barrido ═════════════════════════
  /**
   * @param {object} cfg  { anomalia: 0..1 (posición vertical), tolerancia, intentos }
   * @param {object} on   { marcar(aciertoBool, distancia), terminar(hallada) }
   */
  escanerCorporal(cfg, on) {
    const p = this.$('.dr-estacion');
    p.className = 'dr-estacion g-panel dr-scan';
    p.innerHTML = `
      <h4>ESTACIÓN 1 · ESCÁNER DE ONDAS MILIMÉTRICAS</h4>
      <p class="dr-nota">El equipo <b>no muestra el cuerpo</b>: proyecta un maniquí genérico y señala
        la zona donde la densidad no cuadra. Es el estándar de privacidad, y aquí es ley.</p>
      <div class="dr-scan-caja">
        <svg class="dr-silueta" viewBox="0 0 100 220" aria-label="Maniquí genérico">
          <path d="M50 12 a11 11 0 1 0 0.1 0 M39 38 h22 l6 54 h-7 l-4 100 h-8 l-2 -58 l-2 58 h-8 l-4 -100 h-7 z"
            fill="#243444" stroke="#4a6a8a" stroke-width="1.6"/>
        </svg>
        <div class="dr-linea"></div>
        <div class="dr-marca oculto"></div>
      </div>
      <div class="dr-medidor">
        <span>DENSIDAD</span>
        <div class="dr-med-barra"><i></i></div>
        <b class="dr-med-val">0.00</b>
      </div>
      <div class="dr-scan-btns">
        <button class="g-btn dr-marcar">◉ MARCAR ZONA</button>
        <span class="dr-intentos"></span>
      </div>
      <button class="dr-saltar">NO VEO NADA · PASAR A LA SIGUIENTE ESTACIÓN ▸</button>
    `;
    abrirPanel(p, { y: 16, scale: 0.95, duration: 0.45, sfx: false });

    const caja = p.querySelector('.dr-scan-caja');
    const linea = p.querySelector('.dr-linea');
    const barra = p.querySelector('.dr-med-barra i');
    const val = p.querySelector('.dr-med-val');
    const intentosEl = p.querySelector('.dr-intentos');
    let restantes = cfg.intentos;
    let pos = 0;
    intentosEl.textContent = `${restantes} marcajes disponibles`;

    const estado = { y: 0 };
    this.scanTween = gsap.to(estado, {
      y: 1, duration: 2.6, ease: 'none', repeat: -1,
      onUpdate: () => {
        pos = estado.y;
        const h = caja.clientHeight || 260;
        linea.style.transform = `translateY(${pos * h}px)`;
        // La densidad no es un número random: es una gaussiana centrada en la
        // anomalía. Así el jugador puede APRENDER a leer el medidor en vez de
        // adivinar, que es la diferencia entre un minijuego y una tirada.
        const d = (pos - cfg.anomalia) / 0.085;
        const lectura = 0.14 + 0.82 * Math.exp(-d * d) + Math.random() * 0.05;
        barra.style.width = `${Math.min(100, lectura * 100)}%`;
        barra.className = lectura > 0.7 ? 'quema' : lectura > 0.42 ? 'tibio' : '';
        val.textContent = lectura.toFixed(2);
        if (lectura > 0.75 && Math.random() < 0.25) audio.pitidoProximidad(lectura);
      },
    });

    // Salida siempre disponible. Sin esto, quien no vea el pico se queda mirando
    // una barra que baja para siempre: la estación no tiene otro final.
    p.querySelector('.dr-saltar').onclick = () => {
      audio.clic();
      this.scanTween.kill();
      on.terminar(false);
    };

    p.querySelector('.dr-marcar').onclick = () => {
      if (restantes <= 0) return;
      audio.clic('firme');
      const dist = Math.abs(pos - cfg.anomalia);
      const acierto = dist <= cfg.tolerancia;
      restantes--;
      intentosEl.textContent = `${restantes} marcaje(s) disponible(s)`;
      if (acierto) {
        this.scanTween.kill();
        const marca = p.querySelector('.dr-marca');
        marca.classList.remove('oculto');
        marca.style.top = `${cfg.anomalia * 100}%`;
        gsap.fromTo(marca, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.4)' });
        p.querySelector('.dr-marcar').disabled = true;
        on.marcar(true, dist);
        setTimeout(() => on.terminar(true), 1500);
      } else {
        gsap.fromTo(caja, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1,0.35)' });
        on.marcar(false, dist);
        if (restantes <= 0) {
          this.scanTween.kill();
          setTimeout(() => on.terminar(false), 900);
        }
      }
    };
  }

  // ══ ESTACIÓN 2 · Espectrómetro de trazas ══════════════════════════════
  /**
   * @param {Array} puntos  [{id, label, nota, positivo, contacto}]
   * @param {number} maxSwabs
   * @param {object} on  { hisopar(punto, i), terminar(positivos) }
   */
  espectrometro(puntos, maxSwabs, on) {
    const p = this.$('.dr-estacion');
    p.className = 'dr-estacion g-panel dr-esp';
    p.innerHTML = `
      <h4>ESTACIÓN 2 · ESPECTRÓMETRO DE MOVILIDAD IÓNICA</h4>
      <p class="dr-nota">Tienes <b>${maxSwabs} hisopos</b>. Piensa dónde puso las manos quien cargó
        esto: el residuo viaja en el contacto, no en el aire.</p>
      <div class="dr-puntos">
        ${puntos.map((pt, i) => `
          <button class="dr-punto" data-i="${i}">
            <b>${String.fromCharCode(65 + i)}</b><span>${pt.label}</span>
          </button>`).join('')}
      </div>
      <canvas class="dr-espectro" width="440" height="120"></canvas>
      <div class="dr-esp-lectura">Sin muestra analizada.</div>
      <button class="dr-saltar">SUFICIENTE · PASAR A LA MESA DE REVISIÓN ▸</button>
    `;
    abrirPanel(p, { y: 16, scale: 0.95, duration: 0.45, sfx: false });

    const cv = p.querySelector('.dr-espectro');
    const g = cv.getContext('2d');
    const lectura = p.querySelector('.dr-esp-lectura');
    let usados = 0;
    let positivos = 0;
    this.#dibujarEspectro(g, cv, null);

    // Guardar hisopos también es una decisión: el jugador puede cortar cuando ya
    // tiene lo que buscaba (o cuando ve que está gastando muestras a ciegas).
    p.querySelector('.dr-saltar').onclick = () => { audio.clic(); on.terminar(positivos); };

    p.querySelectorAll('.dr-punto').forEach((btn) => {
      btn.onclick = async () => {
        if (usados >= maxSwabs || btn.classList.contains('usado')) return;
        audio.clic('firme');
        usados++;
        btn.classList.add('usado');
        const i = Number(btn.dataset.i);
        const pt = puntos[i];

        lectura.textContent = 'Analizando muestra… (8 segundos de ciclo IMS)';
        this.#dibujarEspectro(g, cv, null, true);
        audio.escaner(true);
        await new Promise((r) => setTimeout(r, 1200));
        audio.escaner(false);

        const picos = pt.positivo
          ? [{ x: 90, alto: 34 }, { x: 232, alto: 86, etiqueta: 'ALCALOIDE' }, { x: 330, alto: 26 }]
          : [{ x: 78, alto: 30 }, { x: 150, alto: 22 }];
        this.#dibujarEspectro(g, cv, picos);
        btn.classList.add(pt.positivo ? 'positivo' : 'negativo');
        if (pt.positivo) { positivos++; audio.stinger(); }
        else audio.beep(false);
        lectura.innerHTML = pt.positivo
          ? `<b class="pos">POSITIVO</b> en ${pt.label}. ${pt.nota}`
          : `<b class="neg">NEGATIVO</b> en ${pt.label}. ${pt.nota}`;
        on.hisopar(pt, i);

        if (usados >= maxSwabs) {
          p.querySelectorAll('.dr-punto:not(.usado)').forEach((b) => { b.disabled = true; });
          setTimeout(() => on.terminar(positivos), 2000);
        }
      };
    });
  }

  #dibujarEspectro(g, cv, picos, cargando = false) {
    const { width: w, height: h } = cv;
    g.fillStyle = '#050d0a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(31,220,130,0.16)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#1fdc82';
    g.font = '11px monospace';
    if (cargando) { g.fillText('ANALIZANDO…', 12, h / 2); return; }
    if (!picos) { g.fillText('SIN MUESTRA', 12, h / 2); return; }
    g.strokeStyle = '#1fdc82';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, h - 10);
    for (let x = 0; x < w; x++) {
      let y = h - 10 - Math.random() * 2;
      for (const pk of picos) {
        const d = (x - pk.x) / 9;
        y -= pk.alto * Math.exp(-d * d);
      }
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#7cffb8';
    g.font = '10px monospace';
    for (const pk of picos) if (pk.etiqueta) g.fillText(pk.etiqueta, Math.min(pk.x - 22, w - 76), h - 14 - pk.alto);
  }

  // ══ ESTACIÓN 3 · Revisión profunda con calibre ════════════════════════
  /**
   * @param {Array} zonas  [{id, label, grosorFicha, grosorReal}]
   * @param {number} maxMedidas
   * @param {object} on  { medir(zona, i), marcar(zona, i) }
   */
  revisionProfunda(zonas, maxMedidas, on) {
    const p = this.$('.dr-estacion');
    p.className = 'dr-estacion g-panel dr-prof';
    p.innerHTML = `
      <h4>ESTACIÓN 3 · REVISIÓN PROFUNDA DE ESTRUCTURA</h4>
      <p class="dr-nota">Solo <b>${maxMedidas} medidas</b> de calibre. Compara con la ficha del
        fabricante: una pared que engorda es un compartimento.</p>
      <div class="dr-zonas">
        ${zonas.map((z, i) => `
          <div class="dr-zona" data-i="${i}">
            <div class="dr-z-info">
              <span class="dr-z-nom">${z.label}</span>
              <span class="dr-z-ficha">ficha: ${z.grosorFicha} mm</span>
              <span class="dr-z-real">sin calibrar</span>
            </div>
            <div class="dr-z-btns">
              <button class="dr-z-medir">CALIBRAR</button>
              <button class="dr-z-abrir" disabled>ABRIR FORRO</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="dr-prof-medidas"></div>
      <button class="dr-saltar">CERRAR EL ACTA SIN ABRIR NINGÚN FORRO ▸</button>
    `;
    abrirPanel(p, { y: 16, scale: 0.95, duration: 0.45, sfx: false });
    let usadas = 0;
    const contador = p.querySelector('.dr-prof-medidas');
    contador.textContent = `${maxMedidas} medidas disponibles`;

    // Puede pasar (y es un desenlace legítimo) que las tres calibraciones caigan
    // en zonas normales. Sin esta salida el acta no se podría cerrar nunca.
    p.querySelector('.dr-saltar').onclick = () => {
      audio.clic();
      p.querySelectorAll('.dr-z-abrir').forEach((b) => { b.disabled = true; });
      on.marcar({ label: 'ninguna zona', grosorFicha: 0, grosorReal: 0, anomala: false }, -1);
    };

    p.querySelectorAll('.dr-zona').forEach((fila) => {
      const i = Number(fila.dataset.i);
      const z = zonas[i];
      fila.querySelector('.dr-z-medir').onclick = () => {
        if (usadas >= maxMedidas) return;
        usadas++;
        audio.beep(true);
        contador.textContent = `${maxMedidas - usadas} medida(s) disponible(s)`;
        const real = fila.querySelector('.dr-z-real');
        real.textContent = `medido: ${z.grosorReal} mm`;
        const anomalo = z.grosorReal > z.grosorFicha * 2;
        real.classList.add(anomalo ? 'alto' : 'ok');
        fila.querySelector('.dr-z-medir').disabled = true;
        fila.querySelector('.dr-z-abrir').disabled = false;
        if (anomalo) audio.stinger();
        on.medir(z, i);
        // Agotadas las medidas, el resto de zonas queda sin calibrar — y sin
        // calibrar no se abre. El forro se rasga con sustento, no a ciegas.
        if (usadas >= maxMedidas) {
          p.querySelectorAll('.dr-z-medir:not(:disabled)').forEach((b) => { b.disabled = true; });
        }
      };
      fila.querySelector('.dr-z-abrir').onclick = () => {
        audio.clic('firme');
        p.querySelectorAll('.dr-z-abrir').forEach((b) => { b.disabled = true; });
        on.marcar(z, i);
      };
    });
  }

  ocultarEstacion() { cerrarPanel(this.$('.dr-estacion')); this.scanTween?.kill(); }

  // ══ ACTA FINAL ════════════════════════════════════════════════════════
  acta({ titulo, cuerpo, leccion, positivo }, onContinuar) {
    const a = this.$('.dr-acta');
    this.$('.dr-acta-caja').innerHTML = `
      <div class="dr-acta-sello ${positivo ? 'ok' : 'no'}">ACTA ${positivo ? 'DE HALLAZGO' : 'SIN HALLAZGO'}</div>
      <h3>${titulo}</h3>
      <p>${cuerpo}</p>
      <div class="dr-leccion"><b>LO QUE ACABAS DE APRENDER:</b> ${leccion}</div>
      <button class="g-btn dr-acta-btn">FIRMAR EL ACTA</button>
    `;
    a.classList.remove('oculto');
    gsap.fromTo(this.$('.dr-acta-caja'), { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    this.$('.dr-acta-btn').onclick = () => { audio.clic('firme'); a.classList.add('oculto'); onContinuar(); };
  }

  ocultarTodo() {
    this.scanTween?.kill();
    cerrarPanel(this.$('.dr-estacion'));
    cerrarPanel(this.$('.dr-cab'), { y: -14 });
    this.$('.dr-acta').classList.add('oculto');
  }

  dispose() { this.scanTween?.kill(); this.el.remove(); }

  static #css = false;

  static #inyectarCSS() {
    if (HUDDirandro.#css) return;
    HUDDirandro.#css = true;
    const s = document.createElement('style');
    s.textContent = `
      #dirandro { position: absolute; inset: 0; pointer-events: none; z-index: 12;
        font-family: var(--f-body, system-ui, sans-serif); }
      #dirandro > * { pointer-events: auto; }
      #dirandro .oculto { display: none !important; }

      .dr-cab { position: absolute; top: 46px; left: 14px; width: min(400px, 46vw); padding: 12px 16px; }
      .dr-tit { font-family: var(--f-data, monospace); font-size: 10.5px; letter-spacing: .13em;
        color: #ffd27a; display: flex; align-items: center; gap: 8px; }
      .dr-tit i { width: 9px; height: 9px; border-radius: 50%; background: #c8a23c;
        box-shadow: 0 0 10px #c8a23c; }
      .dr-sub { font-size: 12.5px; line-height: 1.55; color: var(--t-mid,#c3cfdc); margin: 8px 0 9px; }
      .dr-pasos { display: flex; gap: 6px; flex-wrap: wrap; }
      .dr-paso { font-family: var(--f-data,monospace); font-size: 9px; letter-spacing: .08em;
        padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(148,176,208,.2);
        color: #7e8ea1; }
      .dr-paso.activo { border-color: var(--a-amber,#e0952a); color: var(--a-amber,#e0952a);
        background: rgba(224,149,42,.12); }
      .dr-paso.hecho { border-color: rgba(63,196,127,.5); color: #3fc47f; }

      .dr-estacion { position: absolute; right: 14px; top: 118px; width: min(470px, 46vw);
        padding: 14px 16px; max-height: calc(100vh - 170px); overflow-y: auto; }
      .dr-estacion h4 { margin: 0 0 8px; font-family: var(--f-display,sans-serif); font-size: 13px;
        letter-spacing: .12em; color: var(--a-cyan,#4fd0e0); }
      .dr-nota { font-size: 11.5px; line-height: 1.55; color: #9aabbe; margin: 0 0 12px;
        border-left: 2px solid rgba(79,208,224,.4); padding-left: 9px; }
      .dr-nota b { color: #cfe6ec; }

      /* Estación 1 */
      .dr-scan-caja { position: relative; height: 260px; margin: 0 auto 10px; width: 130px;
        background: linear-gradient(180deg, rgba(20,30,44,.9), rgba(10,16,24,.9));
        border: 1px solid rgba(79,208,224,.25); border-radius: 6px; overflow: hidden; }
      .dr-silueta { width: 100%; height: 100%; display: block; }
      .dr-linea { position: absolute; left: 0; right: 0; top: 0; height: 3px;
        background: linear-gradient(90deg, transparent, #4fd0e0, transparent);
        box-shadow: 0 0 14px rgba(79,208,224,.9); }
      .dr-marca { position: absolute; left: 50%; width: 42px; height: 42px; margin: -21px 0 0 -21px;
        border: 2px solid #e04a3c; border-radius: 50%; background: rgba(224,74,60,.28);
        box-shadow: 0 0 22px rgba(224,74,60,.7); }
      .dr-medidor { display: grid; grid-template-columns: 66px 1fr 48px; align-items: center;
        gap: 9px; margin-bottom: 12px; }
      .dr-medidor span { font-family: var(--f-data,monospace); font-size: 9px; letter-spacing: .14em; color: #7e8ea1; }
      .dr-med-barra { height: 9px; border-radius: 5px; background: rgba(148,176,208,.14); overflow: hidden; }
      .dr-med-barra i { display: block; height: 100%; width: 0; background: #4a5a6c; border-radius: 5px;
        transition: background .2s; }
      .dr-med-barra i.tibio { background: #e0952a; }
      .dr-med-barra i.quema { background: #e04a3c; box-shadow: 0 0 12px rgba(224,74,60,.9); }
      .dr-med-val { font-family: var(--f-data,monospace); font-size: 14px; color: var(--t-hi,#f2f6fa);
        text-align: right; font-variant-numeric: tabular-nums; }
      .dr-scan-btns { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
      .dr-intentos { font-family: var(--f-data,monospace); font-size: 10px; color: #8fa0b4; }

      /* Estación 2 */
      .dr-puntos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 12px; }
      .dr-punto { display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer;
        min-height: 44px; padding: 8px 10px; font-family: inherit; font-size: 11.5px; line-height: 1.35;
        color: var(--t-mid,#c3cfdc); background: rgba(255,255,255,.03);
        border: 1px solid rgba(148,176,208,.24); border-radius: 5px; }
      .dr-punto:hover:not(:disabled) { border-color: var(--a-cyan,#4fd0e0); background: rgba(79,208,224,.1); }
      .dr-punto b { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px;
        border-radius: 4px; background: rgba(79,208,224,.18); color: #9fe8f2; font-size: 11px; }
      .dr-punto.usado { cursor: default; opacity: .9; }
      .dr-punto.positivo { border-color: #e04a3c; background: rgba(224,74,60,.16); }
      .dr-punto.positivo b { background: #e04a3c; color: #fff; }
      .dr-punto.negativo { border-color: rgba(63,196,127,.5); background: rgba(63,196,127,.08); }
      .dr-punto.negativo b { background: rgba(63,196,127,.7); color: #06210f; }
      .dr-punto:disabled { opacity: .32; cursor: default; }
      .dr-espectro { width: 100%; height: auto; border-radius: 5px; border: 1px solid rgba(31,220,130,.25);
        display: block; margin-bottom: 9px; }
      .dr-esp-lectura { font-size: 11.5px; line-height: 1.55; color: #a9b8c8; min-height: 34px; }
      .dr-esp-lectura b.pos { color: #ff7d70; letter-spacing: .1em; }
      .dr-esp-lectura b.neg { color: #6de0a4; letter-spacing: .1em; }

      /* Estación 3 */
      .dr-zonas { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
      .dr-zona { display: flex; justify-content: space-between; align-items: center; gap: 10px;
        padding: 8px 10px; background: rgba(255,255,255,.03);
        border: 1px solid rgba(148,176,208,.2); border-radius: 5px; }
      .dr-z-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .dr-z-btns { display: flex; gap: 6px; flex: 0 0 auto; }
      .dr-z-nom { font-size: 11.5px; color: var(--t-mid,#c3cfdc); }
      .dr-z-ficha { font-family: var(--f-data,monospace); font-size: 9.5px; color: #7e8ea1; }
      .dr-z-real { font-family: var(--f-data,monospace); font-size: 11px; color: #6a7787; }
      .dr-z-real.ok { color: #6de0a4; }
      .dr-z-real.alto { color: #ff7d70; font-weight: 700; }
      .dr-zona button { min-height: 38px; padding: 6px 10px; cursor: pointer;
        font-family: var(--f-display,sans-serif); font-size: 10px; letter-spacing: .08em;
        color: var(--t-hi,#f2f6fa); background: rgba(20,28,40,.9);
        border: 1px solid rgba(148,176,208,.28); border-radius: 5px; }
      .dr-z-medir:hover:not(:disabled) { border-color: var(--a-cyan,#4fd0e0); }
      .dr-z-abrir { border-color: rgba(224,74,60,.55) !important; color: #ff9d92 !important; }
      .dr-zona button:disabled { opacity: .3; cursor: default; }
      .dr-prof-medidas { font-family: var(--f-data,monospace); font-size: 10px; color: #8fa0b4;
        margin-bottom: 10px; }

      /* Salida de estación: siempre presente, discreta */
      .dr-saltar { display: block; width: 100%; min-height: 40px; margin-top: 10px; cursor: pointer;
        font-family: var(--f-data,monospace); font-size: 10px; letter-spacing: .1em;
        color: #8fa0b4; background: transparent;
        border: 1px dashed rgba(148,176,208,.28); border-radius: 5px; }
      .dr-saltar:hover { color: var(--t-hi,#f2f6fa); border-color: rgba(148,176,208,.5); }

      /* Acta */
      .dr-acta { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(4,7,12,.75); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); padding: 18px; }
      .dr-acta-caja { max-width: 540px; padding: 22px 26px; text-align: center; }
      .dr-acta-sello { display: inline-block; font-family: var(--f-display,sans-serif); font-size: 11px;
        letter-spacing: .24em; padding: 6px 15px; border: 2px solid; border-radius: 3px;
        transform: rotate(-2deg); margin-bottom: 14px; }
      .dr-acta-sello.ok { color: #e04a3c; border-color: #e04a3c; }
      .dr-acta-sello.no { color: #8fa0b4; border-color: #8fa0b4; }
      .dr-acta-caja h3 { font-family: var(--f-display,sans-serif); font-size: 19px; letter-spacing: .05em;
        color: var(--t-hi,#f2f6fa); margin: 0 0 10px; }
      .dr-acta-caja p { font-size: 13.5px; line-height: 1.7; color: var(--t-mid,#c3cfdc); margin: 0 0 14px; }
      .dr-leccion { text-align: left; font-size: 12px; line-height: 1.65; color: #a9b8c8;
        background: rgba(79,208,224,.08); border-left: 3px solid var(--a-cyan,#4fd0e0);
        padding: 10px 12px; border-radius: 4px; margin-bottom: 18px; }
      .dr-leccion b { color: var(--a-cyan,#4fd0e0); font-family: var(--f-data,monospace);
        font-size: 10px; letter-spacing: .12em; }

    ` + compacto(`
      @S .dr-cab { top: 40px; left: 8px; width: min(250px, 42vw); padding: 8px 11px; }
      @S .dr-sub { font-size: 10.5px; margin: 5px 0 6px; }
      @S .dr-tit { font-size: 8.5px; letter-spacing: .06em; }
      @S .dr-paso { font-size: 7.5px; padding: 3px 6px; }
      @S .dr-estacion { right: 8px; top: 96px; width: min(280px, 48vw); padding: 10px 11px;
        max-height: calc(100vh - 130px); }
      @S .dr-estacion h4 { font-size: 10.5px; }
      @S .dr-nota { font-size: 10px; }
      @S .dr-scan-caja { height: 170px; width: 90px; }
      @S .dr-punto { font-size: 9.5px; padding: 6px 7px; min-height: 40px; }
      @S .dr-puntos { grid-template-columns: 1fr; }
      @S .dr-esp-lectura { font-size: 10px; }
      @S .dr-zona { padding: 6px 8px; }
      @S .dr-z-nom { font-size: 10px; }
      @S .dr-acta-caja { padding: 16px 18px; }
      @S .dr-acta-caja p { font-size: 11.5px; }
      @S .dr-leccion { font-size: 10.5px; }
    `);
    document.head.appendChild(s);
  }
}
