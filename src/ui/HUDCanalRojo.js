import gsap from 'gsap';
import { audio } from '../audio/AudioEngine.js';
import { abrirPanel, cerrarPanel, cascada } from './Paneles.js';
import { compacto } from './estilos.js';

/**
 * HUDCanalRojo — la papelería del módulo de inspección secundaria.
 *
 * Vista pura: recibe datos y callbacks, no sabe nada del 3D ni de las reglas.
 * Cuatro piezas, cada una respondiendo a una pregunta que el jugador se hace:
 *
 * - **Cabecera** — «¿por qué estoy aquí y cuánto tiempo tengo?»
 * - **Ficha del bulto** — «¿qué veo en ESTA maleta?» (los indicios son chips
 *   anotables: leer y registrar es la mecánica, no un adorno).
 * - **Panel de olfato** — «¿qué dijo el perro?» Una barra por bulto, que es la
 *   traducción visual del ladrido graduado.
 * - **Confirmación de apertura** — «¿estoy seguro?» La única apertura del
 *   operativo merece una pantalla propia y un botón que cuesta pulsar.
 *
 * Se auto-inyecta el CSS (patrón de `Marcador`/`SceneManager`).
 */
export class HUDCanalRojo {
  constructor(root = document.getElementById('hud-root')) {
    HUDCanalRojo.#inyectarCSS();
    this.el = document.createElement('div');
    this.el.id = 'canal-rojo';
    this.el.innerHTML = `
      <div class="cr-cabecera g-panel">
        <div class="cr-titulo"><i></i>MÓDULO DE INSPECCIÓN SECUNDARIA · CANAL ROJO</div>
        <div class="cr-brief"></div>
        <div class="cr-reloj"><div class="cr-reloj-barra"></div></div>
        <div class="cr-reloj-txt"></div>
      </div>

      <div class="cr-olfato g-panel oculto">
        <h4>🐕 REGISTRO DE OLFATO · JUSTUS</h4>
        <div class="cr-olfato-lista"></div>
        <p class="cr-olfato-nota">Un can señala <b>olores</b>, no delitos. Contrasta el marcaje con lo que ves.</p>
      </div>

      <div class="cr-ficha g-panel oculto"></div>

      <div class="cr-dock oculto"></div>

      <div class="cr-confirmar oculto">
        <div class="cr-conf-caja g-panel">
          <h3>APERTURA ÚNICA</h3>
          <p class="cr-conf-txt"></p>
          <div class="cr-conf-btns">
            <button class="g-btn cr-conf-si">SÍ · ABRIR ESTE BULTO</button>
            <button class="g-btn cr-conf-no">VOLVER A MIRAR</button>
          </div>
        </div>
      </div>

      <div class="cr-resultado oculto">
        <div class="cr-res-caja g-panel"></div>
      </div>
    `;
    root.appendChild(this.el);
    this.$ = (sel) => this.el.querySelector(sel);
  }

  // ── Cabecera ────────────────────────────────────────────────────────────
  setBrief(texto) {
    this.$('.cr-brief').textContent = texto;
    abrirPanel(this.$('.cr-cabecera'), { y: -18, scale: 0.96, duration: 0.5, sfx: false });
  }

  /** Reloj de la fila: presiona, nunca bloquea. `r` va de 1 a 0. */
  setReloj(r, segundos) {
    const barra = this.$('.cr-reloj-barra');
    barra.style.width = `${Math.max(0, r) * 100}%`;
    barra.classList.toggle('urgente', r < 0.3);
    this.$('.cr-reloj-txt').textContent = r > 0
      ? `LA FILA ESPERA · ${Math.ceil(segundos)}s`
      : 'EL SUPERVISOR YA PREGUNTÓ DOS VECES';
  }

  // ── Dock de acciones ────────────────────────────────────────────────────
  showDock(botones) {
    const dock = this.$('.cr-dock');
    dock.innerHTML = '';
    for (const b of botones) {
      const el = document.createElement('button');
      el.className = `g-btn ${b.cls ?? ''}`;
      el.innerHTML = `${b.icono ? `<i>${b.icono}</i>` : ''}<span>${b.label}</span>`;
      el.disabled = !!b.disabled;
      el.onclick = () => { audio.clic(b.cls === 'peligro' ? 'firme' : 'suave'); b.onClick(); };
      dock.appendChild(el);
    }
    abrirPanel(dock, { y: 20, scale: 1, duration: 0.36, sfx: false });
  }

  // ── Ficha del bulto seleccionado ────────────────────────────────────────
  /**
   * @param {object} b        datos del bulto
   * @param {object} estado   { peso: number|null, anotados: Set<string> }
   * @param {object} on       { anotar(indicioId), pesar(), abrir() }
   */
  showFicha(b, estado, on) {
    const f = this.$('.cr-ficha');
    const dims = b.dims.map((v) => Math.round(v * 100)).join(' × ');
    const pesoHTML = estado.peso == null
      ? '<button class="cr-pesar">⚖ PESAR EN LA BALANZA</button>'
      : `<div class="cr-peso ${estado.peso > b.pesoEsperado * 1.45 ? 'alto' : ''}">
           <b>${estado.peso.toFixed(1)} kg</b>
           <span>esperable para ${b.volumen} L de ropa: ~${b.pesoEsperado.toFixed(1)} kg</span>
         </div>`;

    f.innerHTML = `
      <div class="cr-ficha-cab">
        <h4>${b.etiqueta}</h4>
        <span class="cr-cod">${b.codigo}</span>
      </div>
      <div class="cr-medidas">${dims} cm · ${b.volumen} L</div>
      ${pesoHTML}
      <div class="cr-indicios-tit">OBSERVACIÓN EXTERNA</div>
      <div class="cr-indicios">
        ${b.indicios.map((ind) => `
          <button class="cr-ind ${estado.anotados.has(ind.id) ? 'anotado' : ''}" data-ind="${ind.id}">
            <b>${estado.anotados.has(ind.id) ? '✔' : '✎'}</b>
            <span>${ind.texto}</span>
          </button>`).join('')}
      </div>
      <button class="cr-abrir">🔓 ABRIR ESTE BULTO</button>
      <div class="cr-abrir-aviso">Solo tienes UNA apertura en todo el operativo.</div>
    `;
    abrirPanel(f, { y: 0, scale: 0.95, duration: 0.4, sfx: false });
    cascada(f.querySelectorAll('.cr-ind'), { y: 12, duration: 0.3, stagger: 0.06 });

    f.querySelectorAll('.cr-ind').forEach((btn) => {
      btn.onclick = () => {
        if (btn.classList.contains('anotado')) return;
        audio.clic('firme');
        btn.classList.add('anotado');
        btn.querySelector('b').textContent = '✔';
        on.anotar(btn.dataset.ind);
      };
    });
    f.querySelector('.cr-pesar')?.addEventListener('click', () => { audio.clic('firme'); on.pesar(); });
    f.querySelector('.cr-abrir').onclick = () => { audio.clic('firme'); on.abrir(); };
  }

  hideFicha() { cerrarPanel(this.$('.cr-ficha')); }

  // ── Registro de olfato ──────────────────────────────────────────────────
  prepararOlfato(bultos) {
    const lista = this.$('.cr-olfato-lista');
    lista.innerHTML = bultos.map((b) => `
      <div class="cr-olf" data-b="${b.id}">
        <span class="cr-olf-nom">${b.etiqueta.replace(/ (de|con) .*/, '')}</span>
        <div class="cr-olf-barra"><i style="width:0%"></i></div>
        <span class="cr-olf-val">—</span>
      </div>`).join('');
    abrirPanel(this.$('.cr-olfato'), { y: 0, scale: 0.95, duration: 0.4, sfx: false });
  }

  /** Pinta la reacción del perro sobre un bulto (`calor` 0..1). */
  marcarOlfato(id, calor, { marca = false } = {}) {
    const fila = this.$(`.cr-olf[data-b="${id}"]`);
    if (!fila) return;
    const barra = fila.querySelector('.cr-olf-barra i');
    gsap.to(barra, { width: `${Math.round(calor * 100)}%`, duration: 0.55, ease: 'power2.out' });
    barra.className = calor > 0.75 ? 'quema' : calor > 0.4 ? 'tibio' : '';
    fila.querySelector('.cr-olf-val').textContent = calor > 0.75 ? 'MARCA'
      : calor > 0.4 ? 'interés' : calor > 0.18 ? 'leve' : 'nada';
    fila.classList.toggle('marcado', marca);
    if (marca) {
      gsap.fromTo(fila, { scale: 1.06 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,0.4)',
        onComplete: () => gsap.set(fila, { clearProps: 'transform' }) });
    }
  }

  // ── Confirmación de apertura ────────────────────────────────────────────
  confirmar(bulto, { confianza, indiciosDuros }, onSi, onNo) {
    const c = this.$('.cr-confirmar');
    const aviso = indiciosDuros === 0
      ? 'No has anotado <b>ningún indicio duro</b> en este bulto. Vas a abrir por corazonada.'
      : `Tienes <b>${indiciosDuros} indicio(s) de ocultamiento</b> anotado(s) en este bulto.`;
    this.$('.cr-conf-txt').innerHTML =
      `Vas a abrir <b>${bulto.etiqueta}</b> (${bulto.codigo}) delante del viajero.<br>${aviso}
       <br><span class="cr-conf-conf">Sustento del acta: ${Math.round(confianza * 100)}%</span>`;
    c.classList.remove('oculto');
    gsap.fromTo(this.$('.cr-conf-caja'), { scale: 0.86, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.36, ease: 'back.out(1.9)' });
    this.$('.cr-conf-si').onclick = () => { audio.clic('firme'); c.classList.add('oculto'); onSi(); };
    this.$('.cr-conf-no').onclick = () => { audio.clic(); c.classList.add('oculto'); onNo(); };
  }

  // ── Resultado del operativo ─────────────────────────────────────────────
  resultado({ titulo, texto, leccion, acierto, extra = '' }, onContinuar) {
    const r = this.$('.cr-resultado');
    this.$('.cr-res-caja').innerHTML = `
      <div class="cr-res-sello ${acierto ? 'ok' : 'no'}">${acierto ? 'HALLAZGO' : 'SIN NOVEDAD'}</div>
      <h3>${titulo}</h3>
      <p>${texto}</p>
      ${extra}
      <div class="cr-leccion"><b>POR QUÉ:</b> ${leccion}</div>
      <button class="g-btn cr-res-btn">CONTINUAR</button>
    `;
    r.classList.remove('oculto');
    gsap.fromTo(this.$('.cr-res-caja'), { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    this.$('.cr-res-btn').onclick = () => { audio.clic('firme'); r.classList.add('oculto'); onContinuar(); };
  }

  ocultarTodo() {
    cerrarPanel(this.$('.cr-ficha'));
    cerrarPanel(this.$('.cr-dock'));
    cerrarPanel(this.$('.cr-olfato'));
    cerrarPanel(this.$('.cr-cabecera'), { y: -14 });
    this.$('.cr-confirmar').classList.add('oculto');
    this.$('.cr-resultado').classList.add('oculto');
  }

  dispose() { this.el.remove(); }

  static #css = false;

  static #inyectarCSS() {
    if (HUDCanalRojo.#css) return;
    HUDCanalRojo.#css = true;
    const s = document.createElement('style');
    s.textContent = `
      #canal-rojo { position: absolute; inset: 0; pointer-events: none; z-index: 12;
        font-family: var(--f-body, system-ui, sans-serif); }
      #canal-rojo > * { pointer-events: auto; }
      #canal-rojo .oculto { display: none !important; }

      /* Cabecera */
      .cr-cabecera { position: absolute; top: 46px; left: 14px; width: min(380px, 44vw); padding: 12px 16px; }
      .cr-titulo { font-family: var(--f-data, monospace); font-size: 10.5px; letter-spacing: .14em;
        color: #ff7d70; display: flex; align-items: center; gap: 8px; }
      .cr-titulo i { width: 9px; height: 9px; border-radius: 50%; background: #e04a3c;
        box-shadow: 0 0 10px #e04a3c; animation: cr-late 1.4s infinite; }
      @keyframes cr-late { 50% { opacity: .3; box-shadow: none; } }
      .cr-brief { font-size: 12.5px; line-height: 1.55; color: var(--t-mid, #c3cfdc); margin: 8px 0 10px; }
      .cr-reloj { height: 4px; border-radius: 3px; background: rgba(148,176,208,.14); overflow: hidden; }
      .cr-reloj-barra { height: 100%; width: 100%; background: linear-gradient(90deg,#e0952a,#f0c168);
        transition: width .3s linear; }
      .cr-reloj-barra.urgente { background: linear-gradient(90deg,#e04a3c,#ff8a7a); }
      .cr-reloj-txt { font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .14em;
        color: #8fa0b4; margin-top: 5px; }

      /* Registro de olfato */
      .cr-olfato { position: absolute; left: 14px; bottom: 104px; width: min(300px, 40vw); padding: 12px 14px; }
      .cr-olfato h4 { font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .16em;
        color: var(--a-amber, #e0952a); margin: 0 0 9px; }
      .cr-olf { display: grid; grid-template-columns: 1fr 74px 46px; align-items: center; gap: 7px;
        padding: 3px 0; border-radius: 5px; }
      .cr-olf.marcado { background: rgba(224,74,60,.16); box-shadow: inset 0 0 0 1px rgba(224,74,60,.4); }
      .cr-olf-nom { font-size: 10.5px; color: var(--t-mid,#c3cfdc); overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .cr-olf-barra { height: 6px; border-radius: 4px; background: rgba(148,176,208,.14); overflow: hidden; }
      .cr-olf-barra i { display: block; height: 100%; background: #4a5a6c; border-radius: 4px; }
      .cr-olf-barra i.tibio { background: #e0952a; }
      .cr-olf-barra i.quema { background: #e04a3c; box-shadow: 0 0 10px rgba(224,74,60,.9); }
      .cr-olf-val { font-family: var(--f-data, monospace); font-size: 9px; letter-spacing: .08em;
        color: #8fa0b4; text-align: right; }
      .cr-olfato-nota { font-size: 10px; line-height: 1.5; color: #7e8ea1; font-style: italic;
        margin: 9px 0 0; border-top: 1px solid rgba(148,176,208,.12); padding-top: 7px; }
      .cr-olfato-nota b { color: #b9c6d6; }

      /* Ficha del bulto */
      .cr-ficha { position: absolute; right: 14px; top: 118px; width: min(320px, 42vw); padding: 14px 16px;
        max-height: calc(100vh - 220px); overflow-y: auto; }
      .cr-ficha-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .cr-ficha h4 { margin: 0; font-family: var(--f-display, sans-serif); font-size: 15px;
        letter-spacing: .04em; color: var(--t-hi,#f2f6fa); }
      .cr-cod { font-family: var(--f-data, monospace); font-size: 10px; color: var(--a-amber,#e0952a); }
      .cr-medidas { font-family: var(--f-data, monospace); font-size: 10.5px; color: #8fa0b4; margin: 4px 0 10px; }
      .cr-pesar, .cr-abrir {
        width: 100%; min-height: 44px; cursor: pointer; margin-bottom: 10px;
        background: rgba(20,28,40,.9); color: var(--t-hi,#f2f6fa);
        border: 1px solid rgba(148,176,208,.28); border-radius: 6px;
        font-family: var(--f-display, sans-serif); font-size: 12.5px; letter-spacing: .1em;
      }
      .cr-pesar:hover { border-color: var(--a-cyan,#4fd0e0); color: #9fe8f2; }
      .cr-abrir { border-color: rgba(224,74,60,.6); color: #ff9d92; margin-bottom: 4px; }
      .cr-abrir:hover { background: rgba(224,74,60,.2); }
      .cr-abrir-aviso { font-size: 10px; color: #8a7a70; font-style: italic; text-align: center; }
      .cr-peso { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; margin-bottom: 10px;
        background: rgba(31,220,130,.08); border-left: 3px solid #1fdc82; border-radius: 4px; }
      .cr-peso.alto { background: rgba(224,74,60,.12); border-color: #e04a3c; }
      .cr-peso b { font-family: var(--f-data, monospace); font-size: 20px; color: #6de0a4; }
      .cr-peso.alto b { color: #ff7d70; }
      .cr-peso span { font-size: 10px; color: #8fa0b4; }
      .cr-indicios-tit { font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .16em;
        color: #7e8ea1; margin-bottom: 6px; }
      .cr-indicios { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
      .cr-ind { display: flex; align-items: flex-start; gap: 8px; text-align: left; cursor: pointer;
        padding: 8px 10px; min-height: 44px;
        background: rgba(255,255,255,.03); border: 1px dashed rgba(148,176,208,.3);
        border-radius: 5px; color: var(--t-mid,#c3cfdc); font-size: 11.5px; line-height: 1.4;
        font-family: inherit; }
      .cr-ind:hover { border-color: var(--a-amber,#e0952a); background: rgba(224,149,42,.1); }
      .cr-ind b { color: var(--a-amber,#e0952a); font-size: 12px; }
      .cr-ind.anotado { border-style: solid; border-color: rgba(63,196,127,.55);
        background: rgba(63,196,127,.1); cursor: default; }
      .cr-ind.anotado b { color: #3fc47f; }

      /* Dock */
      .cr-dock { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 94vw; }
      .cr-dock .g-btn { display: flex; align-items: center; gap: 8px; }
      .cr-dock .g-btn i { font-style: normal; font-size: 16px; }
      .cr-dock .g-btn.peligro { border-color: rgba(224,74,60,.65); color: #ff9d92; }
      .cr-dock .g-btn:disabled { opacity: .34; cursor: default; }

      /* Confirmación */
      .cr-confirmar, .cr-resultado { position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center; background: rgba(4,7,12,.72);
        -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); padding: 18px; }
      .cr-conf-caja, .cr-res-caja { max-width: 520px; padding: 22px 26px; text-align: center; }
      .cr-conf-caja h3 { font-family: var(--f-display, sans-serif); letter-spacing: .2em;
        color: #ff9d92; margin: 0 0 12px; font-size: 15px; }
      .cr-conf-txt { font-size: 13.5px; line-height: 1.7; color: var(--t-mid,#c3cfdc); margin: 0 0 16px; }
      .cr-conf-txt b { color: var(--t-hi,#f2f6fa); }
      .cr-conf-conf { display: inline-block; margin-top: 8px; font-family: var(--f-data, monospace);
        font-size: 11px; letter-spacing: .1em; color: var(--a-amber,#e0952a); }
      .cr-conf-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .cr-conf-si { border-color: rgba(224,74,60,.7) !important; color: #ff9d92 !important; }

      /* Resultado */
      .cr-res-sello { display: inline-block; font-family: var(--f-display, sans-serif); font-size: 12px;
        letter-spacing: .26em; padding: 6px 16px; border: 2px solid; border-radius: 3px;
        transform: rotate(-2.5deg); margin-bottom: 14px; }
      .cr-res-sello.ok { color: #3fc47f; border-color: #3fc47f; }
      .cr-res-sello.no { color: #e04a3c; border-color: #e04a3c; }
      .cr-res-caja h3 { font-family: var(--f-display, sans-serif); font-size: 19px; letter-spacing: .06em;
        color: var(--t-hi,#f2f6fa); margin: 0 0 10px; }
      .cr-res-caja p { font-size: 13.5px; line-height: 1.7; color: var(--t-mid,#c3cfdc); margin: 0 0 14px; }
      .cr-leccion { text-align: left; font-size: 12px; line-height: 1.65; color: #a9b8c8;
        background: rgba(224,149,42,.08); border-left: 3px solid var(--a-amber,#e0952a);
        padding: 10px 12px; border-radius: 4px; margin-bottom: 18px; }
      .cr-leccion b { color: var(--a-amber,#e0952a); font-family: var(--f-data,monospace);
        font-size: 10px; letter-spacing: .14em; }

    ` + compacto(`
      @S .cr-cabecera { top: 40px; left: 8px; width: min(250px, 42vw); padding: 8px 11px; }
      @S .cr-brief { font-size: 10.5px; line-height: 1.45; margin: 5px 0 7px; }
      @S .cr-titulo { font-size: 8.5px; letter-spacing: .08em; }
      @S .cr-olfato { left: 8px; bottom: 80px; width: min(220px, 38vw); padding: 8px 10px; }
      @S .cr-olfato h4 { font-size: 8.5px; margin-bottom: 6px; }
      @S .cr-olf { grid-template-columns: 1fr 44px 34px; gap: 5px; }
      @S .cr-olf-nom { font-size: 9px; }
      @S .cr-olf-val { font-size: 7.5px; }
      @S .cr-olfato-nota { font-size: 8.5px; }
      @S .cr-ficha { right: 8px; top: 96px; width: min(240px, 42vw); padding: 10px 11px;
        max-height: calc(100vh - 170px); }
      @S .cr-ficha h4 { font-size: 12px; }
      @S .cr-medidas { font-size: 9px; }
      @S .cr-cod { font-size: 9px; }
      /* Ningun objetivo tactil baja de 44 px. Los indicios son la accion que mas
         se repite del acto (se anotan uno a uno) y estaban en 36. */
      @S .cr-ind { font-size: 10px; padding: 8px; min-height: 44px; }
      @S .cr-peso b { font-size: 16px; }
      @S .cr-pesar { font-size: 10.5px; min-height: 44px; }
      @S .cr-abrir { font-size: 10.5px; min-height: 44px; }
      @S .cr-dock { bottom: 10px; gap: 6px; }
      @S .cr-dock .g-btn { min-height: 44px; padding: 10px 13px; font-size: 10.5px; letter-spacing: .07em; }
      @S .cr-conf-caja { padding: 16px 18px; }
      @S .cr-res-caja { padding: 16px 18px; }
      @S .cr-conf-txt { font-size: 11.5px; line-height: 1.55; }
      @S .cr-res-caja p { font-size: 11.5px; line-height: 1.55; }
      @S .cr-res-caja h3 { font-size: 15px; }
      @S .cr-leccion { font-size: 10.5px; padding: 8px 10px; }
    `);
    document.head.appendChild(s);
  }
}
