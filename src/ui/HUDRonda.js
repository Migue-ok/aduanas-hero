import gsap from 'gsap';
import { isTouch } from '../core/Device.js';
import { audio } from '../audio/AudioEngine.js';
import { abrirHidden, cerrarHidden, abrirVelo, cerrarVelo } from './Paneles.js';
import { compacto } from './estilos.js';
import { ANOMALIAS } from '../gameplay/rondaPatio.js';

/**
 * HUDRonda — la interfaz del Nivel 5, deliberadamente escuálida.
 *
 * El nivel se juega mirando el MAPA, no el HUD: el estado del mundo ya lo cuenta
 * el propio patio (los bultos laten, los marcados llevan precinto cruzado, los
 * limpios una marquita verde). Así que aquí solo vive lo que el mapa no puede
 * decir: cuánto tiempo queda, cuántos faltan y qué es el bulto que tienes al
 * lado. Cuatro datos.
 *
 * Es la lección aprendida del Nivel 4, donde llegaron a convivir siete capas de
 * interfaz sobre 375 px de alto.
 */
export class HUDRonda {
  constructor({ onSalir = () => {}, onIniciar = () => {}, onReiniciar = () => {} } = {}) {
    this.cb = { onSalir, onIniciar, onReiniciar };
    this.notas = [];
  }

  mount(root = document.body) {
    HUDRonda.#css();
    const el = document.createElement('div');
    el.id = 'rp-hud';
    el.innerHTML = `
      <div class="rp-barra">
        <span class="rp-t">1:35</span>
        <div class="rp-crono"><i></i></div>
        <span class="rp-pend"><b>0</b> por marcar</span>
        <button class="rp-salir" title="Volver al menú">◄</button>
      </div>

      <div class="rp-ficha hidden"></div>

      <div class="rp-recargas">
        <div class="rp-rec rp-rec-esc"><i></i><span>ESCÁNER</span></div>
        <div class="rp-rec rp-rec-dash"><i></i><span>DASH</span></div>
      </div>

      <div class="rp-velo hidden" data-velo><div class="rp-card"></div></div>`;
    root.appendChild(el);
    this.el = el;
    this.$t = el.querySelector('.rp-t');
    this.$crono = el.querySelector('.rp-crono i');
    this.$pend = el.querySelector('.rp-pend b');
    this.$ficha = el.querySelector('.rp-ficha');
    this.$velo = el.querySelector('.rp-velo');
    this.$card = el.querySelector('.rp-card');
    this.$recEsc = el.querySelector('.rp-rec-esc i');
    this.$recDash = el.querySelector('.rp-rec-dash i');
    el.querySelector('.rp-salir').addEventListener('click', () => this.cb.onSalir());
    return this;
  }

  setTiempo(seg, total) {
    const s = Math.max(0, Math.ceil(seg));
    this.$t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const frac = Math.max(0, seg / total);
    this.$crono.style.width = `${frac * 100}%`;
    this.$crono.parentElement.classList.toggle('urgente', frac < 0.25);
  }

  setPendientes(n) {
    this.$pend.textContent = n;
    this.$pend.parentElement.classList.toggle('cero', n === 0);
  }

  setRecargas(esc, dash) {
    this.$recEsc.style.width = `${Math.min(1, esc) * 100}%`;
    this.$recDash.style.width = `${Math.min(1, dash) * 100}%`;
    this.$recEsc.parentElement.classList.toggle('listo', esc >= 1);
    this.$recDash.parentElement.classList.toggle('listo', dash >= 1);
  }

  /** La ficha del bulto que tienes al lado. Aparece sola, sin pulsar nada. */
  setCercano(b) {
    if (!b) { cerrarHidden(this.$ficha, { y: 6, duration: 0.12 }); return; }
    const estado = b.marcado
      ? `<em class="rp-est marcado">PRECINTADO</em>`
      : b.revelado
        ? (b.anomalia
          ? `<em class="rp-est mal">${b.anomalia.icono} ${b.anomalia.titular}</em>`
          : '<em class="rp-est ok">Sin anomalías · déjalo pasar</em>')
        : '<em class="rp-est">Sin escanear</em>';
    this.$ficha.innerHTML = `
      <b>${b.guia}</b><span>${b.carga} · ${b.origen}</span>${estado}
      ${b.revelado && b.anomalia && !b.marcado
        ? `<u>${isTouch ? 'MARCAR' : 'E'} para precintar</u>` : ''}`;
    abrirHidden(this.$ficha, { y: 8, duration: 0.18, sfx: false });
  }

  anotar(b, acierto) {
    this.notas.unshift({ b, acierto });
    if (this.notas.length > 12) this.notas.length = 12;
  }

  abrirBriefing() {
    this.el.classList.add('rp-modal');
    this.$card.innerHTML = `
      <div class="rp-tag">PATIO DE CONTENEDORES · RONDA DE INSPECCIÓN</div>
      <h2>TURNO DE PATIO</h2>
      <p class="rp-regla">Dispara el <b>pulso de escáner</b>. Los bultos que canten,
        <b>precíntalos</b> antes de que cierre el turno.</p>
      <div class="rp-comose">
        <div><i>🛰</i><b>ESCÁNER</b><span>revela lo que tengas alrededor</span></div>
        <div><i>⚑</i><b>MARCAR</b><span>precinta el bulto que tengas al lado</span></div>
        <div><i>⚡</i><b>DASH</b><span>el patio es grande y el reloj corre</span></div>
      </div>
      <p class="rp-aviso">Precintar un bulto limpio también cuenta: es una revisión que
        le cuesta horas a alguien que no hizo nada.</p>
      <button class="rp-btn rp-empezar">▶ SALIR A RONDA</button>`;
    abrirVelo(this.$velo, { duration: 0.35 });
    this.$card.querySelector('.rp-empezar').addEventListener('click', () => {
      audio.clic?.('firme');
      this.el.classList.remove('rp-modal');
      cerrarVelo(this.$velo, { duration: 0.25 });
      this.cb.onIniciar();
    });
  }

  abrirCierre({ motivo, aciertos, fallos, escapados, puntos }) {
    this.el.classList.add('rp-modal');
    const limpia = escapados === 0 && fallos === 0;
    // Lo que se aprendió, no lo que se puntuó: cada acierto deja su lección.
    const lecciones = this.notas.filter((n) => n.acierto && n.b.anomalia).slice(0, 3)
      .map((n) => `<div class="rp-lec"><b>${n.b.anomalia.icono} ${n.b.anomalia.titular}</b>
        <span>${n.b.anomalia.leccion}</span></div>`).join('');
    this.$card.innerHTML = `
      <div class="rp-tag">${motivo}</div>
      <h2 class="${limpia ? 'ok' : ''}">${limpia ? 'RONDA IMPECABLE' : 'TURNO CERRADO'}</h2>
      <div class="rp-res">
        <div class="bien"><b>${aciertos}</b><span>precintados con motivo</span></div>
        <div class="${fallos ? 'mal' : ''}"><b>${fallos}</b><span>revisiones infundadas</span></div>
        <div class="${escapados ? 'mal' : ''}"><b>${escapados}</b><span>salieron sin revisar</span></div>
      </div>
      <div class="rp-puntos">${puntos.toLocaleString('es-PE')} <span>PUNTOS</span></div>
      ${lecciones ? `<div class="rp-tag2">LO QUE VISTE HOY</div>${lecciones}` : ''}
      <div class="rp-acciones">
        <button class="rp-btn rp-otra">↻ OTRA RONDA</button>
        <button class="rp-btn rp-menu">◄ MENÚ</button>
      </div>`;
    abrirVelo(this.$velo, { duration: 0.45 });
    this.$card.querySelector('.rp-otra').addEventListener('click', () => this.cb.onReiniciar());
    this.$card.querySelector('.rp-menu').addEventListener('click', () => this.cb.onSalir());
  }

  destroy() {
    gsap.killTweensOf(this.$card);
    this.el?.remove();
  }

  static #hecho = false;

  static #css() {
    if (HUDRonda.#hecho) return;
    HUDRonda.#hecho = true;
    const s = document.createElement('style');
    s.textContent = `
      #rp-hud { position: fixed; inset: 0; z-index: 42; pointer-events: none;
        font-family: var(--f-body, system-ui); color: #f2f6fa; }
      #rp-hud button { pointer-events: auto; cursor: pointer; font-family: inherit; }
      .rp-ficha.hidden, .rp-velo.hidden { display: none; }

      /* ── Barra superior: los tres datos y la salida ──────────────────── */
      .rp-barra {
        position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%;
        transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
        padding: 7px 10px 7px 14px; border-radius: 999px; max-width: 94vw;
        background: rgba(10,15,22,.86); border: 1px solid rgba(148,176,208,.18);
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      }
      .rp-t { font-family: var(--f-data, monospace); font-size: 15px; font-variant-numeric: tabular-nums; }
      .rp-crono { width: clamp(70px, 22vw, 170px); height: 5px; border-radius: 999px;
        background: rgba(8,12,18,.8); overflow: hidden; }
      .rp-crono i { display: block; height: 100%; width: 100%;
        background: linear-gradient(90deg, #2f9ad9, #4fd0e0); transition: width .3s linear; }
      .rp-crono.urgente i { background: linear-gradient(90deg, #c0342a, #ff7d70);
        animation: rp-late .7s infinite; }
      @keyframes rp-late { 50% { filter: brightness(1.6); } }
      .rp-pend { font-family: var(--f-data, monospace); font-size: 10.5px; color: #9aabbe; white-space: nowrap; }
      .rp-pend b { color: var(--a-amber, #e0952a); font-size: 14px; }
      .rp-pend.cero b { color: var(--a-green, #3fc47f); }
      .rp-salir { width: 44px; height: 44px; min-width: 44px; border-radius: 50%;
        background: rgba(20,28,40,.8); color: #b9c6d4;
        border: 1px solid rgba(148,176,208,.2); font-size: 15px; }

      /* ── Ficha del bulto que tienes al lado ─────────────────────────── */
      .rp-ficha {
        position: absolute; left: max(10px, env(safe-area-inset-left)); bottom: 50%;
        transform: translateY(50%); width: clamp(150px, 40vw, 230px);
        padding: 9px 11px; border-radius: 10px;
        background: rgba(10,15,22,.92); border: 1px solid rgba(148,176,208,.18);
        border-left: 3px solid var(--a-amber, #e0952a);
      }
      .rp-ficha b { display: block; font-family: var(--f-data, monospace); font-size: 12px;
        letter-spacing: .1em; color: var(--a-amber, #e0952a); }
      .rp-ficha span { display: block; font-size: 11px; color: #a9b8c8; margin-top: 2px; }
      .rp-est { display: block; margin-top: 6px; font-size: 11px; line-height: 1.4;
        font-style: normal; color: #8b9bad; }
      .rp-est.ok { color: #6de0a4; }
      .rp-est.mal { color: #f0b95e; }
      .rp-est.marcado { color: #8fa0b4; }
      .rp-ficha u { display: block; margin-top: 6px; font-family: var(--f-data, monospace);
        font-size: 9.5px; letter-spacing: .12em; color: #4fd0e0; text-decoration: none; }

      /* ── Recargas: dos barritas, sin números ────────────────────────── */
      .rp-recargas { position: absolute; right: max(10px, env(safe-area-inset-right));
        top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 7px; }
      .rp-rec { width: 62px; padding: 4px 6px 5px; border-radius: 8px;
        background: rgba(10,15,22,.8); border: 1px solid rgba(148,176,208,.14); }
      .rp-rec span { display: block; font-family: var(--f-data, monospace); font-size: 7px;
        letter-spacing: .1em; color: #7d8ea1; margin-top: 3px; }
      .rp-rec i { display: block; height: 3px; border-radius: 999px; background: #4fd0e0; width: 0%; }
      .rp-rec.listo i { background: var(--a-green, #3fc47f); }
      .rp-rec.listo span { color: #9aabbe; }

      /* ── Hojas ──────────────────────────────────────────────────────── */
      .rp-velo { position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; padding: clamp(10px, 3vw, 24px); pointer-events: auto;
        overflow-y: auto; background: rgba(4,8,12,.8);
        -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
      .rp-card { position: relative; width: min(560px, 100%); max-height: 100%; overflow-y: auto;
        padding: clamp(14px, 3vw, 24px) clamp(14px, 3vw, 24px) 0;
        border-radius: 14px; background: rgba(10,15,22,.97);
        border: 1px solid rgba(148,176,208,.18); }
      .rp-tag { font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .22em;
        color: var(--a-amber, #e0952a); }
      .rp-card h2 { font-family: var(--f-display, sans-serif); font-size: clamp(19px, 5vw, 28px);
        letter-spacing: .08em; margin: 4px 0 10px; }
      .rp-card h2.ok { color: #6de0a4; }
      .rp-regla { font-size: clamp(13px, 3.4vw, 15px); line-height: 1.5; color: #dbe5f0;
        padding: 10px 12px; border-radius: 8px; margin: 0 0 10px;
        background: rgba(79,208,224,.09); border-left: 3px solid #4fd0e0; }
      .rp-regla b { color: #8fe4f0; }
      .rp-comose { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .rp-comose div { padding: 9px 6px; border-radius: 9px; text-align: center;
        background: rgba(20,28,40,.6); border: 1px solid rgba(148,176,208,.12); }
      .rp-comose i { display: block; font-size: 19px; font-style: normal; }
      .rp-comose b { display: block; font-family: var(--f-data, monospace); font-size: 9.5px;
        letter-spacing: .08em; color: var(--a-amber, #e0952a); margin-top: 3px; }
      .rp-comose span { display: block; font-size: 10px; line-height: 1.35; color: #a3b2c2; margin-top: 2px; }
      .rp-aviso { font-size: 11.5px; line-height: 1.5; color: #9aabbe; margin: 10px 0 0; }
      .rp-res { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 10px; }
      .rp-res div { padding: 9px 6px; border-radius: 9px; text-align: center;
        background: rgba(20,28,40,.6); border-top: 2px solid rgba(148,176,208,.25); }
      .rp-res div.bien { border-top-color: var(--a-green, #3fc47f); }
      .rp-res div.mal { border-top-color: var(--a-red, #e04a3c); }
      .rp-res b { display: block; font-family: var(--f-display, sans-serif); font-size: 22px; }
      .rp-res span { display: block; font-size: 9.5px; line-height: 1.3; color: #9aabbe; }
      .rp-puntos { font-family: var(--f-display, sans-serif); font-size: 26px;
        color: var(--a-amber, #e0952a); text-align: center; margin-bottom: 4px; }
      .rp-puntos span { font-family: var(--f-data, monospace); font-size: 10px;
        letter-spacing: .2em; color: #7d8ea1; }
      .rp-tag2 { font-family: var(--f-data, monospace); font-size: 9px; letter-spacing: .2em;
        color: #7d8ea1; margin: 12px 0 6px; }
      .rp-lec { padding: 8px 11px; margin-bottom: 6px; border-radius: 8px;
        background: rgba(20,28,40,.55); border-left: 3px solid var(--a-cyan, #4fd0e0); }
      .rp-lec b { display: block; font-size: 12px; color: #8fe4f0; }
      .rp-lec span { display: block; font-size: 11.5px; line-height: 1.5; color: #a9b8c8; margin-top: 2px; }
      /* Las acciones se anclan al pie: nunca hay que buscarlas con scroll. */
      .rp-acciones { display: flex; gap: 8px; }
      .rp-btn, .rp-acciones .rp-btn {
        position: sticky; bottom: 0; flex: 1; width: 100%; min-height: 52px;
        margin-top: 14px; padding: 14px 18px 16px; border: none; border-radius: 0;
        font-family: var(--f-data, monospace); font-size: 12px; letter-spacing: .14em;
        color: #10131a; background: linear-gradient(180deg, #ffca6a, #e8a032);
        border-radius: 10px 10px 0 0;
      }
      .rp-acciones .rp-menu { background: rgba(20,28,40,.9); color: #c3cfdc;
        border: 1px solid rgba(148,176,208,.24); }
      .rp-card > .rp-btn { margin-bottom: 0; }

      /* Con una hoja abierta, el HUD de juego se aparta entero. */
      #rp-hud.rp-modal .rp-barra, #rp-hud.rp-modal .rp-ficha,
      #rp-hud.rp-modal .rp-recargas { opacity: 0; pointer-events: none; transition: opacity .25s; }
    ` + compacto(`
      @S .rp-barra { padding: 5px 8px 5px 11px; gap: 7px; }
      @S .rp-t { font-size: 13px; }
      @S .rp-pend { font-size: 9px; }
      @S .rp-rec { width: 52px; }
      @S .rp-comose span { font-size: 9px; }
      @S .rp-ficha { bottom: auto; top: 64px; transform: none; }
    `);
    document.head.appendChild(s);
  }
}

/** Se exporta para que el Códice del nivel pueda listarlas si algún día lo hay. */
export { ANOMALIAS };
