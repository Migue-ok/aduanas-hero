import gsap from 'gsap';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';

/**
 * JustusCoach — el K-9 veterano como GUÍA UNIVERSAL de los tres niveles.
 *
 * El problema que resuelve: cada nivel enseñaba sus controles con un `toast` de
 * dos segundos o con nada en absoluto. El jugador entraba al muelle de Chimbote
 * sin saber que existe un joystick, y al raid de Trafasport sin saber que hay
 * que arrastrar cajas. Aquí Justus toma el papel de mentor: aparece, explica en
 * frases cortas y SEÑALA con luz el botón del que está hablando.
 *
 * Decisiones de diseño:
 *  - Vive en `document.body`, no en `#hud-root`: los niveles vacían ese nodo al
 *    montarse y se llevarían al perro por delante.
 *  - No bloquea el juego. Sin scrim modal, sin pausa: es una tarjeta con la que
 *    puedes convivir. El tutorial que secuestra la pantalla se odia.
 *  - Recuerda lo aprendido (`localStorage`). La segunda partida no repite la
 *    clase, pero la pata flotante la reabre cuando quieras.
 *  - Voz opcional a través del Narrator (respeta el mute global del jugador) y
 *    un ladrido real del AudioEngine al entrar.
 *  - Alto contraste desde el primer píxel (Fase 1): blanco puro y ámbar sobre
 *    azul noche casi opaco, objetivos táctiles de 52 px.
 *
 * API:
 *   coach.guiar('aeropuerto', [{ txt, foco?, voz? }, …], { forzar })
 *   coach.decir('chimbote:contenedor', 'Frase suelta')
 *   coach.ocultar() · coach.reiniciar(clave) · coach.destroy()
 */

const LS = 'ah_coach_';
const visto = (clave) => {
  try { return localStorage.getItem(LS + clave) === '1'; } catch { return false; }
};
const marcarVisto = (clave) => {
  try { localStorage.setItem(LS + clave, '1'); } catch { /* modo incógnito: da igual */ }
};

/** Retrato de Justus en SVG: barato, nítido a cualquier DPI y animable por CSS. */
const RETRATO = `
<svg class="jc-dog" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="jc-pelo" cx="38%" cy="30%">
      <stop offset="0%" stop-color="#6b5138"/><stop offset="100%" stop-color="#3d2e1f"/>
    </radialGradient>
  </defs>
  <!-- orejas -->
  <g class="jc-ear jc-ear-l"><path d="M17 26 L12 6 L27 17 Z" fill="#3d2e1f"/><path d="M18 24 L15 12 L24 18 Z" fill="#6b4b32"/></g>
  <g class="jc-ear jc-ear-r"><path d="M47 26 L52 6 L37 17 Z" fill="#3d2e1f"/><path d="M46 24 L49 12 L40 18 Z" fill="#6b4b32"/></g>
  <!-- cráneo -->
  <ellipse cx="32" cy="33" rx="18" ry="17" fill="url(#jc-pelo)"/>
  <!-- cejas claras: la expresión del pastor -->
  <ellipse cx="24" cy="27" rx="4.4" ry="1.7" fill="#8a6a45"/>
  <ellipse cx="40" cy="27" rx="4.4" ry="1.7" fill="#8a6a45"/>
  <!-- hocico -->
  <ellipse cx="32" cy="43" rx="10" ry="8" fill="#8a6a45"/>
  <ellipse cx="32" cy="39" rx="3.6" ry="2.8" fill="#0b0b0b"/>
  <path d="M32 42 v3 M32 45 q-4 3 -7 1 M32 45 q4 3 7 1" stroke="#3d2e1f" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <!-- lengua: solo asoma cuando está contento -->
  <ellipse class="jc-tongue" cx="32" cy="50" rx="3.2" ry="4" fill="#d4707f"/>
  <!-- ojos googly (ADR-004) -->
  <g class="jc-eye jc-eye-l"><circle cx="25" cy="32" r="5.4" fill="#f7f9fc"/><circle class="jc-pupil" cx="25" cy="32" r="2.5" fill="#0d0d0d"/></g>
  <g class="jc-eye jc-eye-r"><circle cx="39" cy="32" r="5.4" fill="#f7f9fc"/><circle class="jc-pupil" cx="39" cy="32" r="2.5" fill="#0d0d0d"/></g>
  <!-- cicatriz de veterano -->
  <path d="M19 24 l3 4" stroke="#8a6a45" stroke-width="1" stroke-linecap="round"/>
  <!-- collar K-9 -->
  <path d="M15 46 q17 10 34 0 v5 q-17 10 -34 0 Z" fill="#1c2a3a"/>
  <rect x="28" y="47.5" width="8" height="5" rx="1" fill="#d8b34a"/>
</svg>`;

const CSS = `
#justus-coach {
  position: fixed; z-index: 60; left: 18px; bottom: 18px;
  width: 396px; max-width: calc(100vw - 28px);
  display: none; align-items: flex-start; gap: 13px;
  padding: 14px 16px 14px 14px;
  background: linear-gradient(158deg, rgba(17, 27, 42, 0.965), rgba(6, 10, 17, 0.985));
  -webkit-backdrop-filter: blur(12px) saturate(1.2); backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(150, 180, 216, 0.32);
  border-left: 4px solid #f5b544;
  border-radius: 4px 14px 14px 4px;
  box-shadow: 0 24px 60px rgba(0,0,0,.78), 0 0 0 1px rgba(245,181,68,.16), 0 0 44px rgba(245,181,68,.1);
  color: #ffffff; font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
}
#justus-coach.jc-on { display: flex; }
@supports not (backdrop-filter: blur(1px)) {
  #justus-coach { background: linear-gradient(158deg, #111b2a, #060a11); }
}

/* ── Retrato ─────────────────────────────────────────────────────────── */
#justus-coach .jc-avatar {
  flex: 0 0 auto; width: 62px; height: 62px; border-radius: 50%;
  background: radial-gradient(circle at 40% 30%, #22314a, #0a1017);
  border: 2px solid rgba(245,181,68,.55);
  box-shadow: 0 0 22px rgba(245,181,68,.28), 0 6px 16px rgba(0,0,0,.6);
  display: grid; place-items: center; overflow: hidden;
}
.jc-dog { width: 54px; height: 54px; display: block; }
.jc-ear { transform-origin: 32px 22px; animation: jc-oreja 3.4s ease-in-out infinite; }
.jc-ear-r { animation-delay: -1.5s; }
@keyframes jc-oreja { 0%,88%,100% { transform: rotate(0deg); } 92% { transform: rotate(-7deg); } 96% { transform: rotate(4deg); } }
.jc-eye { transform-origin: center; animation: jc-parpadeo 5.2s infinite; }
@keyframes jc-parpadeo { 0%,94%,100% { transform: scaleY(1); } 96.5% { transform: scaleY(0.08); } }
.jc-pupil { animation: jc-mirada 6s ease-in-out infinite; }
@keyframes jc-mirada { 0%,100% { transform: translate(0,0); } 30% { transform: translate(1.6px,.6px); } 65% { transform: translate(-1.5px,-.5px); } }
.jc-tongue { transform-origin: 32px 46px; animation: jc-lengua 2.6s ease-in-out infinite; }
@keyframes jc-lengua { 0%,100% { transform: scaleY(.25); opacity:.75; } 50% { transform: scaleY(1); opacity:1; } }
#justus-coach.jc-habla .jc-avatar { animation: jc-bote .5s ease-in-out infinite; }
@keyframes jc-bote { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(-2.5deg); } }

/* ── Texto ───────────────────────────────────────────────────────────── */
#justus-coach { overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
#justus-coach .jc-cuerpo { flex: 1 1 auto; min-width: 0; }
#justus-coach .jc-nombre {
  font-family: 'Consolas', 'SF Mono', monospace; font-size: 10px; font-weight: 700;
  letter-spacing: 2.4px; color: #f5b544; margin-bottom: 5px;
  display: flex; align-items: center; gap: 8px;
}
#justus-coach .jc-nombre i {
  font-style: normal; font-size: 9px; letter-spacing: 1.4px; color: #8fa2b8;
  border: 1px solid rgba(143,162,184,.35); border-radius: 3px; padding: 1px 5px;
}
#justus-coach .jc-txt {
  font-size: 14.5px; line-height: 1.5; color: #ffffff;
  text-shadow: 0 1px 3px rgba(0,0,0,.75);
  overflow-wrap: anywhere; min-height: 2.9em;
}
#justus-coach .jc-txt b, #justus-coach .jc-txt strong { color: #ffd280; font-weight: 700; }
#justus-coach .jc-txt kbd {
  display: inline-block; min-width: 20px; padding: 1px 6px; margin: 0 2px;
  background: #f5b544; color: #0e1319; border-radius: 3px;
  font-family: 'Consolas', monospace; font-weight: 700; font-size: 12px;
}

/* ── Pie: puntos de progreso + acción ────────────────────────────────── */
#justus-coach .jc-pie {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 11px;
  /* Si el cuerpo hace scroll (apaisado bajo), el botón de acción no se pierde. */
  position: sticky; bottom: 0;
  background: linear-gradient(transparent, rgba(8, 13, 21, 0.94) 42%);
  padding-top: 6px;
}
#justus-coach .jc-puntos { display: flex; gap: 5px; }
#justus-coach .jc-punto {
  width: 7px; height: 7px; border-radius: 50%; background: rgba(150,180,216,.3);
  transition: background .25s, transform .25s;
}
#justus-coach .jc-punto.on { background: #f5b544; transform: scale(1.25); }
#justus-coach .jc-acciones { display: flex; gap: 7px; }
#justus-coach button {
  min-height: 40px; padding: 10px 18px; cursor: pointer;
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI Semibold', system-ui, sans-serif;
  font-size: 12px; letter-spacing: 1.6px; font-weight: 700; text-transform: uppercase;
  color: #0e1319; background: linear-gradient(180deg, #ffca6a, #e8a032);
  border: none; border-radius: 5px;
  box-shadow: 0 6px 18px rgba(245,181,68,.3);
  transition: transform .1s, box-shadow .18s, filter .18s;
}
#justus-coach button:hover { filter: brightness(1.09); box-shadow: 0 8px 24px rgba(245,181,68,.45); }
#justus-coach button:active { transform: translateY(1px) scale(.98); }
#justus-coach button.jc-salta {
  color: #cfdae7; background: transparent; border: 1px solid rgba(150,180,216,.34);
  box-shadow: none; font-weight: 600; letter-spacing: 1.2px;
}
#justus-coach button.jc-salta:hover { border-color: rgba(245,181,68,.7); color: #ffd280; }

/* ── Pata flotante: reabre la guía cuando el jugador se pierde ───────── */
#jc-pata {
  position: fixed; z-index: 59; right: 14px; bottom: 14px;
  width: 52px; height: 52px; border-radius: 50%; display: none;
  place-items: center; cursor: pointer; font-size: 24px; line-height: 1;
  background: linear-gradient(160deg, rgba(17,27,42,.96), rgba(6,10,17,.98));
  border: 1px solid rgba(245,181,68,.5); color: #f5b544;
  box-shadow: 0 10px 26px rgba(0,0,0,.6), 0 0 20px rgba(245,181,68,.16);
  transition: transform .18s, box-shadow .18s;
}
#jc-pata.jc-on { display: grid; }
#jc-pata:hover { transform: scale(1.08); box-shadow: 0 12px 32px rgba(0,0,0,.7), 0 0 30px rgba(245,181,68,.35); }
#jc-pata:active { transform: scale(.95); }

/* ── Foco: Justus SEÑALA el botón del que habla ──────────────────────── */
.jc-foco {
  position: relative;
  outline: 2px solid #f5b544 !important;
  outline-offset: 3px;
  border-radius: 6px;
  animation: jc-latido 1.25s ease-in-out infinite;
  z-index: 61 !important;
}
@keyframes jc-latido {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,181,68,.55), 0 0 22px rgba(245,181,68,.35); }
  50%      { box-shadow: 0 0 0 8px rgba(245,181,68,0), 0 0 34px rgba(245,181,68,.6); }
}

/* ── Móvil: cinta inferior a ancho completo, por encima del dock ─────── */
@media (pointer: coarse), (max-width: 768px) {
  #justus-coach {
    left: 50%; right: auto; transform: translateX(-50%);
    bottom: 10px; width: min(96vw, 560px); max-width: 96vw;
    padding: 12px 13px; gap: 11px; border-radius: 4px 14px 14px 4px;
  }
  #justus-coach .jc-avatar { width: 52px; height: 52px; }
  .jc-dog { width: 45px; height: 45px; }
  #justus-coach .jc-txt { font-size: 14px; line-height: 1.45; min-height: 2.8em; }
  #justus-coach button { min-height: 52px; padding: 13px 18px; font-size: 12px; }
  #jc-pata { width: 56px; height: 56px; bottom: 12px; right: 12px; }
}
@media (max-width: 430px) {
  #justus-coach { width: 97vw; max-width: 97vw; padding: 11px; gap: 9px; }
  #justus-coach .jc-avatar { width: 46px; height: 46px; }
  .jc-dog { width: 40px; height: 40px; }
  #justus-coach .jc-txt { font-size: 13.5px; }
  #justus-coach .jc-nombre i { display: none; }
  #justus-coach button { padding: 13px 12px; font-size: 11px; letter-spacing: 1px; }
}
/* Altura escasa (móvil apaisado): la tarjeta se aprieta para no tapar el juego */
@media (max-height: 460px) and (pointer: coarse) {
  #justus-coach { bottom: 6px; padding: 9px 11px; }
  #justus-coach .jc-txt { font-size: 12.5px; min-height: 2.6em; }
  #justus-coach .jc-avatar { width: 44px; height: 44px; }
  .jc-dog { width: 38px; height: 38px; }
  #justus-coach button { min-height: 44px; padding: 10px 14px; }
  #justus-coach .jc-pie { margin-top: 7px; }
}
@media (prefers-reduced-motion: reduce) {
  .jc-ear, .jc-eye, .jc-pupil, .jc-tongue, .jc-foco, #justus-coach.jc-habla .jc-avatar { animation: none !important; }
}
`;

class JustusCoach {
  constructor() {
    this.el = null;
    this.pata = null;
    this.pasos = [];
    this.i = 0;
    this.clave = null;
    this.activo = false;
    this._typeTimer = null;
    this._autoTimer = null;
    this._foco = null;
    this._onFin = null;
  }

  // ── Construcción perezosa: nada existe hasta que Justus habla ──────────
  #asegurar() {
    if (this.el) return;
    const style = document.createElement('style');
    style.id = 'jc-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    this._style = style;

    const el = document.createElement('div');
    el.id = 'justus-coach';
    el.innerHTML = `
      <div class="jc-avatar">${RETRATO}</div>
      <div class="jc-cuerpo">
        <div class="jc-nombre">JUSTUS · K-9 <i>GUÍA</i></div>
        <div class="jc-txt"></div>
        <div class="jc-pie">
          <div class="jc-puntos"></div>
          <div class="jc-acciones">
            <button class="jc-salta" type="button">SALTAR</button>
            <button class="jc-next" type="button">SIGUIENTE</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    this.$txt = el.querySelector('.jc-txt');
    this.$puntos = el.querySelector('.jc-puntos');
    this.$next = el.querySelector('.jc-next');
    this.$salta = el.querySelector('.jc-salta');

    this.$next.addEventListener('click', () => this.#avanzar());
    this.$salta.addEventListener('click', () => this.#terminar(true));

    const pata = document.createElement('button');
    pata.id = 'jc-pata';
    pata.type = 'button';
    pata.title = 'Que Justus lo explique otra vez';
    pata.setAttribute('aria-label', 'Repetir la guía de Justus');
    pata.textContent = '🐕';
    pata.addEventListener('click', () => this.repetir());
    document.body.appendChild(pata);
    this.pata = pata;

    // Girar el teléfono cambia el alto del dock: hay que recolocarse.
    this._onResize = () => { if (this.activo) this.#reposicionar(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  /**
   * Lanza una secuencia guiada.
   * @param {string} clave        id de la lección (se recuerda en localStorage)
   * @param {Array}  pasos        [{ txt, foco?, voz?, dur? }]
   * @param {object} opts         { forzar, alFinal }
   */
  guiar(clave, pasos, { forzar = false, alFinal = null, pos = 'abajo' } = {}) {
    if (!pasos?.length) return;
    this._pos = pos;
    if (!forzar && visto(clave)) {
      // Ya lo sabe: solo dejamos la pata a mano por si se pierde.
      this.#asegurar();
      this._ultima = { clave, pasos };
      this.pata.classList.add('jc-on');
      return;
    }
    this.#asegurar();
    this._ultima = { clave, pasos };
    this._onFin = alFinal;
    this.clave = clave;
    this.pasos = pasos;
    this.i = 0;
    this.activo = true;

    this.$puntos.innerHTML = pasos.map(() => '<span class="jc-punto"></span>').join('');
    this.$salta.style.display = pasos.length > 1 ? '' : 'none';
    this.pata.classList.remove('jc-on');

    clearTimeout(this._cierreTimer); // si veníamos de un cierre, lo cancelamos
    this.el.classList.add('jc-on');
    // Bandera global: los HUD de cada nivel apartan sus propias cintas mientras
    // Justus ocupa el borde inferior (ver CSS del raid).
    document.body.classList.add('jc-guiando');
    this.#reposicionar();
    gsap.fromTo(this.el,
      { opacity: 0, y: pos === 'arriba' ? -26 : 28, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.62, ease: 'back.out(1.7)', overwrite: true });
    audio.ladridoFeliz();
    this.#pintar();
  }

  /**
   * La tarjeta no puede tapar el botón que está iluminando. En pantallas
   * táctiles el dock de herramientas ocupa exactamente el sitio donde vive
   * Justus, así que lo MEDIMOS y nos plantamos justo encima. Los niveles que
   * enseñan el mando virtual (muelle, raid) piden `pos:'arriba'` y se colocan
   * bajo la barra superior, dejando libres joystick y botones.
   */
  #reposicionar() {
    if (!this.el) return;
    const est = this.el.style;
    const compacto = matchMedia('(pointer: coarse), (max-width: 768px)').matches;
    if (!compacto) { est.top = ''; est.bottom = ''; est.maxHeight = ''; return; }
    if (this._pos === 'arriba') {
      est.top = '52px'; est.bottom = 'auto';
      est.maxHeight = `${Math.max(120, window.innerHeight - 120)}px`;
      return;
    }
    est.top = '';
    // Medimos TODO lo que vive pegado al borde inferior — el dock del aeropuerto
    // y el mando virtual del muelle y el raid — y nos plantamos encima de lo más
    // alto. Es una sola regla genérica: ninguna escena tiene que avisarnos de su
    // mobiliario, y el consejo nunca tapa el control que está señalando.
    let ocupado = 0;
    for (const sel of ['#dock:not(.oculto)', '.tp-stick', '.tp-btn']) {
      for (const n of document.querySelectorAll(sel)) {
        if (n.offsetParent === null) continue;              // oculto: no estorba
        const r = n.getBoundingClientRect();
        if (r.height === 0) continue;
        ocupado = Math.max(ocupado, window.innerHeight - r.top);
      }
    }
    ocupado = Math.round(ocupado);

    // Un móvil apaisado tiene 390 px de alto: entre el mando y la barra superior
    // puede no quedar sitio para la tarjeta entera. Antes que recortarla contra
    // el borde, se le pone techo y su cuerpo hace scroll (el pie queda pegado
    // abajo, así que ENTENDIDO siempre se alcanza).
    const libre = window.innerHeight - ocupado - 54;
    if (libre < 130) {
      // Ni con esas: nos pegamos al fondo y aceptamos solapar el mando, que es
      // menos grave que una tarjeta cortada por la mitad.
      est.bottom = '10px';
      est.maxHeight = `${Math.max(120, window.innerHeight - 56)}px`;
    } else {
      est.bottom = `${ocupado + 10}px`;
      est.maxHeight = `${libre}px`;
    }
  }

  /** Un solo consejo, sin secuencia. Se recuerda igual. */
  decir(clave, txt, opts = {}) {
    this.guiar(clave, [{ txt, ...opts }], opts);
  }

  /** Reabre la última lección aunque ya estuviera vista. */
  repetir() {
    if (!this._ultima) return;
    this.guiar(this._ultima.clave, this._ultima.pasos, { forzar: true, alFinal: this._onFin });
  }

  #pintar() {
    const paso = this.pasos[this.i];
    if (!paso) return this.#terminar(false);

    [...this.$puntos.children].forEach((p, k) => p.classList.toggle('on', k <= this.i));
    this.$next.textContent = this.i === this.pasos.length - 1 ? 'ENTENDIDO' : 'SIGUIENTE';
    this.#reposicionar(); // el dock crece y encoge entre pasos (botones que aparecen)

    this.#soltarFoco();
    if (paso.foco) {
      const objetivo = typeof paso.foco === 'string'
        ? [...document.querySelectorAll(paso.foco)].find((n) => n.offsetParent !== null)
          ?? document.querySelector(paso.foco)
        : paso.foco;
      if (objetivo) { objetivo.classList.add('jc-foco'); this._foco = objetivo; }
    }

    // Máquina de escribir: el texto entra con ritmo, no de golpe.
    clearInterval(this._typeTimer);
    this.el.classList.add('jc-habla');
    const html = paso.txt;
    const plano = html.replace(/<[^>]+>/g, '');
    this.$txt.innerHTML = '';
    let n = 0;
    const paso_ms = 1000 / (paso.cps ?? 52);
    this._typeTimer = setInterval(() => {
      n += 1;
      // Escribimos sobre el texto plano y, al acabar, restauramos el HTML rico.
      this.$txt.textContent = plano.slice(0, n);
      if (n >= plano.length) {
        clearInterval(this._typeTimer);
        this._typeTimer = null; // sin esto, `#avanzar` cree que aún se escribe
        this.$txt.innerHTML = html;
        this.el.classList.remove('jc-habla');
      }
    }, paso_ms);

    if (paso.voz !== false) narrator.decir('Justus', plano);

    // Auto-avance opcional: para pasos que acompañan una animación del mundo.
    clearTimeout(this._autoTimer);
    if (paso.dur) this._autoTimer = setTimeout(() => this.#avanzar(), paso.dur * 1000);
  }

  #avanzar() {
    // Un toque durante el tecleo completa la frase en vez de saltarla.
    if (this._typeTimer && this.$txt.textContent.length < this.pasos[this.i]?.txt.replace(/<[^>]+>/g, '').length) {
      clearInterval(this._typeTimer);
      this._typeTimer = null;
      this.$txt.innerHTML = this.pasos[this.i].txt;
      this.el.classList.remove('jc-habla');
      return;
    }
    this.i += 1;
    if (this.i >= this.pasos.length) return this.#terminar(false);
    audio.beep(true);
    this.#pintar();
  }

  #terminar(saltado) {
    clearInterval(this._typeTimer);
    clearTimeout(this._autoTimer);
    this.#soltarFoco();
    this.activo = false;
    document.body.classList.remove('jc-guiando');
    if (this.clave) marcarVisto(this.clave);
    if (!saltado) audio.ladridoFeliz();
    narrator.callar();
    // La salida se anima, pero el ESTADO no puede depender de que la animación
    // termine: con la pestaña en segundo plano el navegador estrangula el rAF,
    // GSAP deja de avanzar y su `onComplete` no llega nunca — la tarjeta se
    // quedaría clavada en pantalla. Un `setTimeout` de respaldo cierra igual.
    gsap.to(this.el, { opacity: 0, y: 22, scale: 0.93, duration: 0.28, ease: 'power2.in',
      onComplete: () => this.#cerrarTarjeta() });
    clearTimeout(this._cierreTimer);
    this._cierreTimer = setTimeout(() => this.#cerrarTarjeta(), 320);

    const fin = this._onFin;
    this._onFin = null;
    fin?.();
  }

  /** Oculta la tarjeta y saca la pata. Idempotente: se llama por dos vías. */
  #cerrarTarjeta() {
    if (!this.el || !this.el.classList.contains('jc-on')) return;
    clearTimeout(this._cierreTimer);
    this.el.classList.remove('jc-on', 'jc-habla');
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { clearProps: 'opacity,transform' });
    this.pata?.classList.add('jc-on');
  }

  #soltarFoco() {
    this._foco?.classList.remove('jc-foco');
    this._foco = null;
  }

  /** Cierre inmediato sin marcar como visto (cambio de contexto brusco). */
  ocultar() {
    clearInterval(this._typeTimer);
    this._typeTimer = null;
    clearTimeout(this._autoTimer);
    clearTimeout(this._cierreTimer);
    this.#soltarFoco();
    this.activo = false;
    document.body.classList.remove('jc-guiando');
    if (this.el) {
      gsap.killTweensOf(this.el);
      gsap.set(this.el, { clearProps: 'opacity,transform' });
      this.el.classList.remove('jc-on', 'jc-habla');
    }
  }

  /** Muestra u oculta la pata de ayuda (un nivel puede no querer el estorbo). */
  setPata(on) {
    this.#asegurar();
    this.pata.classList.toggle('jc-on', !!on);
  }

  reiniciar(clave) {
    try {
      if (clave) localStorage.removeItem(LS + clave);
      else for (const k of Object.keys(localStorage)) if (k.startsWith(LS)) localStorage.removeItem(k);
    } catch { /* nada que limpiar */ }
  }

  /** Desmontaje total: los niveles lo llaman en su `unmount()`. */
  destroy() {
    this.ocultar();
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
      this._onResize = null;
    }
    clearTimeout(this._cierreTimer);
    this.el?.remove();
    this.pata?.remove();
    this._style?.remove();
    this.el = null; this.pata = null; this._style = null;
    this._ultima = null; this._onFin = null;
  }
}

export const coach = new JustusCoach();

/** Atajo de QA: `?tutorial=1` obliga a que las tres lecciones vuelvan a salir. */
if (new URLSearchParams(location.search).get('tutorial') === '1') coach.reiniciar();
