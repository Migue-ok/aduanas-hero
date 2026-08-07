import gsap from 'gsap';
import { audio } from '../audio/AudioEngine.js';
import { abrirPanel, cerrarPanel, cascada } from './Paneles.js';
import { compacto } from './estilos.js';

/**
 * HUDPerfilamiento — la libreta de observación del mirador.
 *
 * Dos decisiones de interfaz que son, en realidad, decisiones de contenido:
 *
 * · **La ficha no tiene fotografía ni rasgos.** Ni piel, ni ropa, ni edad, ni
 *   origen. Solo un identificador («Viajero C») y lo que la persona HACE. Si el
 *   panel mostrara una foto, todo el discurso antisesgo del nivel sería
 *   decorativo: el jugador decidiría mirando la cara.
 * · **El formulario de motivo mezcla lo válido con lo prohibido**, sin marcar
 *   cuál es cuál. Elegir mal y que el supervisor te devuelva el acta es el
 *   momento en que la lección se aprende de verdad.
 */
export class HUDPerfilamiento {
  constructor(root = document.getElementById('hud-root')) {
    HUDPerfilamiento.#inyectarCSS();
    this.el = document.createElement('div');
    this.el.id = 'perfilamiento';
    this.el.innerHTML = `
      <div class="pf-cab g-panel">
        <div class="pf-tit"><i></i>PERFILAMIENTO · SALA DE LLEGADAS</div>
        <div class="pf-brief"></div>
        <div class="pf-contador"></div>
      </div>
      <div class="pf-ficha g-panel oculto"></div>
      <div class="pf-dock oculto"></div>
      <div class="pf-motivo oculto"><div class="pf-mot-caja g-panel"></div></div>
      <div class="pf-informe oculto"><div class="pf-inf-caja g-panel"></div></div>
    `;
    root.appendChild(this.el);
    this.$ = (s) => this.el.querySelector(s);
  }

  setBrief(texto) {
    this.$('.pf-brief').textContent = texto;
    abrirPanel(this.$('.pf-cab'), { y: -16, scale: 0.97, duration: 0.5, sfx: false });
  }

  setContador(observados, total) {
    this.$('.pf-contador').innerHTML =
      `OBSERVADOS <b>${observados}/${total}</b> · derivaciones disponibles: <b>1</b>`;
  }

  showDock(botones) {
    const dock = this.$('.pf-dock');
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

  /**
   * @param {object} p  { nombre, conducta:{corto, largo} }
   * @param {object} on { derivar() }
   */
  showFicha(p, on) {
    const f = this.$('.pf-ficha');
    f.innerHTML = `
      <div class="pf-f-cab">
        <h4>${p.nombre}</h4>
        <span class="pf-f-id">OBSERVACIÓN DIRECTA</span>
      </div>
      <div class="pf-sin-rasgos">La ficha del oficial <b>no registra rasgos físicos</b>.
        Solo conducta observable, que es lo único que se puede escribir en un acta.</div>
      <div class="pf-obs-tit">LO QUE ESTÁ HACIENDO</div>
      <div class="pf-obs"><b>▸</b><span>${p.conducta.largo}</span></div>
      <button class="pf-derivar">⚑ MARCAR PARA REVISIÓN</button>
      <div class="pf-derivar-aviso">Tendrás que declarar el motivo. Y quedará firmado.</div>
    `;
    abrirPanel(f, { y: 0, scale: 0.95, duration: 0.4, sfx: false });
    cascada(f.querySelectorAll('.pf-obs'), { y: 12, duration: 0.32, stagger: 0.07 });
    f.querySelector('.pf-derivar').onclick = () => { audio.clic('firme'); on.derivar(); };
  }

  hideFicha() { cerrarPanel(this.$('.pf-ficha')); }

  /**
   * Formulario de motivo. `opciones` viene ya barajado y mezcla conducta propia,
   * conductas de otras personas y criterios prohibidos.
   */
  pedirMotivo(persona, opciones, onElegir, onCancelar) {
    const m = this.$('.pf-motivo');
    this.$('.pf-mot-caja').innerHTML = `
      <h3>ACTA DE DERIVACIÓN · ${persona.nombre}</h3>
      <p class="pf-mot-txt">Escribe el motivo. Lo que pongas aquí es lo que un juez leerá
        si esta derivación se discute.</p>
      <div class="pf-opciones">
        ${opciones.map((o, i) => `<button class="pf-op" data-i="${i}">${o.texto}</button>`).join('')}
      </div>
      <div class="pf-mot-rechazo"></div>
      <button class="g-btn pf-mot-cancelar">CANCELAR · SEGUIR OBSERVANDO</button>
    `;
    m.classList.remove('oculto');
    gsap.fromTo(this.$('.pf-mot-caja'), { scale: 0.88, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.38, ease: 'back.out(1.8)' });
    cascada(this.$('.pf-mot-caja').querySelectorAll('.pf-op'), { y: 14, duration: 0.3, stagger: 0.05 });

    this.$('.pf-mot-caja').querySelectorAll('.pf-op').forEach((b) => {
      b.onclick = () => {
        audio.clic('firme');
        onElegir(opciones[Number(b.dataset.i)], b);
      };
    });
    this.$('.pf-mot-cancelar').onclick = () => { audio.clic(); m.classList.add('oculto'); onCancelar(); };
  }

  /** El supervisor devuelve el acta: el motivo elegido no es admisible. */
  rechazarMotivo(boton, texto) {
    boton.classList.add('rechazado');
    boton.disabled = true;
    const zona = this.$('.pf-mot-rechazo');
    zona.innerHTML = `<b>EL SUPERVISOR DEVUELVE EL ACTA:</b> «${texto}»`;
    zona.classList.add('visible');
    gsap.fromTo(zona, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.35 });
    gsap.fromTo(this.$('.pf-mot-caja'), { x: -10 },
      { x: 0, duration: 0.6, ease: 'elastic.out(1,0.35)', onComplete: () => gsap.set(this.$('.pf-mot-caja'), { clearProps: 'transform' }) });
  }

  cerrarMotivo() { this.$('.pf-motivo').classList.add('oculto'); }

  informe({ titulo, cuerpo, leccion, acierto, extra = '' }, onContinuar) {
    const i = this.$('.pf-informe');
    this.$('.pf-inf-caja').innerHTML = `
      <div class="pf-sello ${acierto ? 'ok' : 'no'}">${acierto ? 'DERIVACIÓN SOSTENIDA' : 'DERIVACIÓN SIN SUSTENTO'}</div>
      <h3>${titulo}</h3>
      <p>${cuerpo}</p>
      ${extra}
      <div class="pf-leccion"><b>CRITERIO:</b> ${leccion}</div>
      <button class="g-btn pf-inf-btn">CONTINUAR</button>
    `;
    i.classList.remove('oculto');
    gsap.fromTo(this.$('.pf-inf-caja'), { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    this.$('.pf-inf-btn').onclick = () => { audio.clic('firme'); i.classList.add('oculto'); onContinuar(); };
  }

  ocultarTodo() {
    cerrarPanel(this.$('.pf-ficha'));
    cerrarPanel(this.$('.pf-dock'));
    cerrarPanel(this.$('.pf-cab'), { y: -14 });
    this.$('.pf-motivo').classList.add('oculto');
    this.$('.pf-informe').classList.add('oculto');
  }

  dispose() { this.el.remove(); }

  static #css = false;

  static #inyectarCSS() {
    if (HUDPerfilamiento.#css) return;
    HUDPerfilamiento.#css = true;
    const s = document.createElement('style');
    s.textContent = `
      #perfilamiento { position: absolute; inset: 0; pointer-events: none; z-index: 12;
        font-family: var(--f-body, system-ui, sans-serif); }
      #perfilamiento > * { pointer-events: auto; }
      #perfilamiento .oculto { display: none !important; }

      .pf-cab { position: absolute; top: 46px; left: 14px; width: min(390px, 45vw); padding: 12px 16px; }
      .pf-tit { font-family: var(--f-data,monospace); font-size: 10.5px; letter-spacing: .14em;
        color: #9fe8f2; display: flex; align-items: center; gap: 8px; }
      .pf-tit i { width: 9px; height: 9px; border-radius: 50%; background: var(--a-cyan,#4fd0e0);
        box-shadow: 0 0 10px var(--a-cyan,#4fd0e0); }
      .pf-brief { font-size: 12.5px; line-height: 1.55; color: var(--t-mid,#c3cfdc); margin: 8px 0 8px; }
      .pf-contador { font-family: var(--f-data,monospace); font-size: 10px; letter-spacing: .1em; color: #8fa0b4; }
      .pf-contador b { color: var(--a-amber,#e0952a); }

      .pf-ficha { position: absolute; right: 14px; top: 118px; width: min(330px, 42vw); padding: 14px 16px;
        max-height: calc(100vh - 200px); overflow-y: auto; }
      .pf-f-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .pf-ficha h4 { margin: 0; font-family: var(--f-display,sans-serif); font-size: 16px;
        letter-spacing: .05em; color: var(--t-hi,#f2f6fa); }
      .pf-f-id { font-family: var(--f-data,monospace); font-size: 9px; letter-spacing: .12em; color: var(--a-cyan,#4fd0e0); }
      .pf-sin-rasgos { font-size: 10.5px; line-height: 1.5; color: #8fa0b4; font-style: italic;
        margin: 9px 0 12px; padding: 7px 9px; border-left: 2px solid rgba(79,208,224,.45);
        background: rgba(79,208,224,.06); border-radius: 3px; }
      .pf-sin-rasgos b { color: #cfe6ec; font-style: normal; }
      .pf-obs-tit { font-family: var(--f-data,monospace); font-size: 9.5px; letter-spacing: .16em;
        color: #7e8ea1; margin-bottom: 7px; }
      .pf-obs { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5;
        color: var(--t-mid,#c3cfdc); padding: 9px 10px; margin-bottom: 12px;
        background: rgba(255,255,255,.04); border-radius: 5px;
        border-left: 2px solid rgba(224,149,42,.55); }
      .pf-obs b { color: var(--a-amber,#e0952a); }
      .pf-derivar { width: 100%; min-height: 44px; cursor: pointer; margin-bottom: 5px;
        background: rgba(224,74,60,.14); color: #ff9d92;
        border: 1px solid rgba(224,74,60,.6); border-radius: 6px;
        font-family: var(--f-display,sans-serif); font-size: 12.5px; letter-spacing: .1em; }
      .pf-derivar:hover { background: rgba(224,74,60,.24); }
      .pf-derivar-aviso { font-size: 10px; color: #8a7a70; font-style: italic; text-align: center; }

      .pf-dock { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 94vw; }
      .pf-dock .g-btn { display: flex; align-items: center; gap: 8px; }
      .pf-dock .g-btn i { font-style: normal; font-size: 16px; }
      .pf-dock .g-btn.peligro { border-color: rgba(224,74,60,.65); color: #ff9d92; }

      .pf-motivo, .pf-informe { position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; background: rgba(4,7,12,.75);
        -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); padding: 18px; }
      .pf-mot-caja, .pf-inf-caja { max-width: 560px; width: 100%; padding: 22px 26px; }
      .pf-mot-caja h3 { font-family: var(--f-display,sans-serif); font-size: 15px; letter-spacing: .14em;
        color: var(--t-hi,#f2f6fa); margin: 0 0 8px; text-align: center; }
      .pf-mot-txt { font-size: 12.5px; line-height: 1.6; color: #9aabbe; margin: 0 0 16px; text-align: center; }
      .pf-opciones { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .pf-op { text-align: left; cursor: pointer; min-height: 44px; padding: 11px 13px;
        font-family: inherit; font-size: 12.5px; line-height: 1.4; color: var(--t-mid,#c3cfdc);
        background: rgba(255,255,255,.04); border: 1px solid rgba(148,176,208,.24); border-radius: 6px; }
      .pf-op:hover:not(:disabled) { border-color: var(--a-amber,#e0952a); background: rgba(224,149,42,.12); }
      .pf-op.rechazado { border-color: rgba(224,74,60,.7); background: rgba(224,74,60,.14);
        color: #ff9d92; text-decoration: line-through; opacity: .8; cursor: default; }
      .pf-mot-rechazo { display: none; font-size: 12px; line-height: 1.6; color: #ffb3a9;
        background: rgba(224,74,60,.12); border-left: 3px solid #e04a3c; border-radius: 4px;
        padding: 10px 12px; margin-bottom: 12px; }
      .pf-mot-rechazo.visible { display: block; }
      .pf-mot-rechazo b { color: #e04a3c; font-family: var(--f-data,monospace); font-size: 10px;
        letter-spacing: .12em; display: block; margin-bottom: 4px; }
      .pf-mot-cancelar { width: 100%; }

      .pf-inf-caja { text-align: center; max-width: 560px; }
      .pf-sello { display: inline-block; font-family: var(--f-display,sans-serif); font-size: 11px;
        letter-spacing: .22em; padding: 6px 15px; border: 2px solid; border-radius: 3px;
        transform: rotate(-2deg); margin-bottom: 14px; }
      .pf-sello.ok { color: #3fc47f; border-color: #3fc47f; }
      .pf-sello.no { color: #e04a3c; border-color: #e04a3c; }
      .pf-inf-caja h3 { font-family: var(--f-display,sans-serif); font-size: 19px; letter-spacing: .05em;
        color: var(--t-hi,#f2f6fa); margin: 0 0 10px; }
      .pf-inf-caja p { font-size: 13.5px; line-height: 1.7; color: var(--t-mid,#c3cfdc); margin: 0 0 14px; }
      .pf-leccion { text-align: left; font-size: 12px; line-height: 1.65; color: #a9b8c8;
        background: rgba(79,208,224,.08); border-left: 3px solid var(--a-cyan,#4fd0e0);
        padding: 10px 12px; border-radius: 4px; margin-bottom: 18px; }
      .pf-leccion b { color: var(--a-cyan,#4fd0e0); font-family: var(--f-data,monospace);
        font-size: 10px; letter-spacing: .12em; }

    ` + compacto(`
      @S .pf-cab { top: 40px; left: 8px; width: min(250px, 42vw); padding: 8px 11px; }
      @S .pf-tit { font-size: 8.5px; letter-spacing: .06em; }
      @S .pf-brief { font-size: 10.5px; line-height: 1.45; margin: 5px 0 6px; }
      @S .pf-contador { font-size: 8.5px; }
      @S .pf-ficha { right: 8px; top: 96px; width: min(250px, 44vw); padding: 10px 11px;
        max-height: calc(100vh - 160px); }
      @S .pf-ficha h4 { font-size: 13px; }
      @S .pf-sin-rasgos { font-size: 9px; padding: 6px 7px; }
      @S .pf-obs { font-size: 10.5px; padding: 7px 8px; }
      @S .pf-derivar { font-size: 10.5px; min-height: 40px; }
      @S .pf-dock { bottom: 10px; gap: 6px; }
      @S .pf-dock .g-btn { min-height: 42px; padding: 9px 13px; font-size: 10.5px; letter-spacing: .07em; }
      @S .pf-mot-caja { padding: 15px 16px; }
      @S .pf-inf-caja { padding: 15px 16px; }
      @S .pf-mot-caja h3 { font-size: 12px; }
      @S .pf-mot-txt { font-size: 10.5px; margin-bottom: 10px; }
      @S .pf-op { font-size: 10.5px; padding: 9px 10px; min-height: 40px; }
      @S .pf-mot-rechazo { font-size: 10.5px; }
      @S .pf-inf-caja h3 { font-size: 15px; }
      @S .pf-inf-caja p { font-size: 11.5px; }
      @S .pf-leccion { font-size: 10.5px; }
    `);
    document.head.appendChild(s);
  }
}
