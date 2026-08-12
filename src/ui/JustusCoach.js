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
 *  - No bloquea el juego. Sin scrim modal, sin pausa, y desde ADR-014 tampoco
 *    roba el dedo: la tarjeta es `pointer-events: none` salvo sus controles.
 *  - Recuerda lo aprendido (`localStorage`). La segunda partida no repite la
 *    clase, pero la pata flotante la reabre cuando quieras.
 *  - Voz opcional a través del Narrator (respeta el mute global del jugador) y
 *    un ladrido real del AudioEngine al entrar.
 *  - Alto contraste desde el primer píxel (Fase 1): blanco puro y ámbar sobre
 *    azul noche casi opaco, objetivos táctiles de 52 px.
 *
 * ── UN SOLO JUSTUS A LA VEZ (la cola) ──────────────────────────────────────
 * Antes `guiar()` escribía directamente sobre el estado vivo (`this.pasos`,
 * `this.i = 0`). Dos avisos que coincidían —y coincidían mucho: el N1 programa
 * la clase del perfilamiento a los 2,4 s y la del puesto a los 6,2 s; el N4
 * suelta un consejo por cada dominio nuevo que apuntas— producían esto:
 *   · la lección a medias desaparecía sin marcarse como vista, así que volvía
 *     a salir en la siguiente partida;
 *   · su `alFinal` no llegaba nunca (en el N4 eso dejaba el tutorial colgado);
 *   · dos voces del Narrator y dos ladridos pisándose.
 * Ahora todo entra por una COLA con dos rangos: `leccion` (varios pasos, se
 * respeta entera) y `susurro` (una frase, cinta fina que se va sola). Nada
 * interrumpe a nada; entre dos intervenciones media un cooldown; los duplicados
 * se descartan y la cola tiene tope, así que un nivel que dispare diez consejos
 * seguidos no encadena diez tarjetas: se queda con las que caben.
 *
 * API:
 *   coach.guiar('aeropuerto', [{ txt, foco?, voz? }, …], { forzar })
 *   coach.decir('chimbote:contenedor', 'Frase suelta')
 *   coach.ocultar() · coach.reiniciar(clave) · coach.destroy()
 */

/** Respiro entre dos intervenciones: sin esto la cola se siente como spam. */
const COOLDOWN_MS = 900;
/** Tope de espera. Un consejo que lleva cuatro turnos en la cola ya no aplica. */
const MAX_COLA = 3;
/** Dos ladridos solapados suenan a bug; uno cada tanto suena a perro. */
const LADRIDO_MS = 1600;

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
  /* NO BLOQUEANTE (ADR-014). La tarjeta es un consejo, no un modal: los toques
     la ATRAVIESAN y llegan al juego. Solo los controles de Justus —y el cuerpo
     de texto cuando la lección tiene varios pasos y hace scroll— recuperan el
     dedo. Antes cualquier píxel de la tarjeta se tragaba el toque, así que un
     consejo plantado encima del dock dejaba el nivel injugable hasta cerrarlo. */
  pointer-events: none;
}
#justus-coach.jc-on { display: flex; }
#justus-coach button, #justus-coach .jc-cerrar { pointer-events: auto; }
/* Y solo cuando la lección NO CABE y hay que arrastrarla, el cuerpo atrapa el
   dedo. Si cabe entera —el caso normal— la tarjeta sigue siendo atravesable de
   lado a lado y el dock de debajo se puede pulsar sin cerrar nada. */
#justus-coach.jc-leccion.jc-scroll .jc-cuerpo { pointer-events: auto; }
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
  /* 44 px es el mínimo táctil del proyecto (WCAG 2.5.5 / HIG). Estaba en 40. */
  min-height: 44px; min-width: 44px; padding: 10px 18px; cursor: pointer;
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

/* ── SUSURRO — el consejo suelto, en cinta fina y sin botones ─────────────
   Una frase de aviso no merece la tarjeta entera con puntos de progreso y dos
   botones que hay que pulsar: se lee y se va sola. Ocupa la mitad de alto, no
   roba el dedo (la tarjeta entera ignora los punteros) y solo deja una ✕ de
   44 px por si molesta. Es el modo por defecto de decir().
   (Sin acentos graves aquí dentro: esto vive en un template literal.) */
#justus-coach.jc-susurro {
  width: 420px; padding: 9px 46px 9px 11px; gap: 10px;
  align-items: center; border-left-width: 3px;
  box-shadow: 0 14px 34px rgba(0,0,0,.6), 0 0 0 1px rgba(245,181,68,.14);
}
#justus-coach.jc-susurro .jc-pie { display: none; }
#justus-coach.jc-susurro .jc-avatar { width: 40px; height: 40px; border-width: 1px; }
#justus-coach.jc-susurro .jc-dog { width: 34px; height: 34px; }
#justus-coach.jc-susurro .jc-nombre { font-size: 9px; letter-spacing: 1.8px; margin-bottom: 2px; }
#justus-coach.jc-susurro .jc-nombre i { display: none; }
#justus-coach.jc-susurro .jc-txt { font-size: 13px; line-height: 1.42; min-height: 0; }

/* ✕ del susurro: existe solo ahí, y con el hitbox táctil completo. */
#justus-coach .jc-cerrar {
  display: none; position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
  width: 44px; height: 44px; padding: 0; min-width: 44px; min-height: 44px;
  background: none; border: none; box-shadow: none; border-radius: 8px;
  color: #9fb0c4; font-size: 15px; line-height: 1;
}
#justus-coach .jc-cerrar:hover { color: #ffd280; background: rgba(245,181,68,.12); filter: none; }
#justus-coach.jc-susurro { position: fixed; }
#justus-coach.jc-susurro .jc-cerrar { display: grid; place-items: center; }

/* Barra de vida del susurro: se ve cuánto le queda antes de irse solo. */
#justus-coach .jc-tiempo {
  display: none; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: rgba(245,181,68,.85); transform-origin: 0 50%; border-radius: 0 0 0 4px;
}
#justus-coach.jc-susurro .jc-tiempo { display: block; }

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
/* Con una hoja abierta la pata sobra, y encima estorba: vive en la esquina
   inferior derecha, que es justo donde los modales ponen su boton de accion
   (FIRMAR ACTA, VOLVER AL MENU). Se retira mientras haya algo que leer. */
body:has(.cp-peritaje:not(.hidden)) #jc-pata,
body:has(.cp-velo:not(.hidden)) #jc-pata,
body:has(.cp-fallo:not(.hidden)) #jc-pata,
body:has(.cp-panel:not(.hidden)) #jc-pata,
body:has(#hoja.sheet:not(.oculto)) #jc-pata,
/* Ni en la portada ni en el menu: son pantallas de entrada, no partida. La pata
   se queda del nivel anterior y aparece flotando sobre el titulo. */
body:has(#title-screen:not(.hidden)) #jc-pata,
body:has(#level-menu:not(.hidden)) #jc-pata { display: none; }
/* Y en tactil, tambien con una herramienta del puesto abierta: la pata vive en
   la esquina inferior derecha y ahi es donde cae VOLVER AL PUESTO cuando la
   libreta ocupa el ancho entero. Reaparece al cerrar la herramienta. */
@media (pointer: coarse), (max-width: 768px) {
  body:has(#interrogatorio:not(.oculto)) #jc-pata,
  body:has(#documentos:not(.oculto)) #jc-pata,
  body:has(#xray-controls:not(.oculto)) #jc-pata,
  body:has(#decision:not(.oculto)) #jc-pata,
  body:has(#corporal:not(.oculto)) #jc-pata { display: none; }
}
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

  /* El susurro en móvil es aún más fino: dos líneas como mucho, y encima del
     mobiliario inferior (lo mide reposicionar). El dedo lo atraviesa. */
  #justus-coach.jc-susurro {
    width: min(94vw, 480px); max-width: 94vw; padding: 8px 46px 8px 9px; gap: 9px;
  }
  #justus-coach.jc-susurro .jc-avatar { width: 38px; height: 38px; }
  #justus-coach.jc-susurro .jc-dog { width: 32px; height: 32px; }
  #justus-coach.jc-susurro .jc-txt { font-size: 12.5px; line-height: 1.4; }
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
    /** Mensajes esperando turno. Ver la nota larga de la cabecera del módulo. */
    this.cola = [];
    this._enCooldown = false;
    this._cooldownTimer = null;
    this._susurroTimer = null;
    this._ultimoLadrido = -1e9;
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
      </div>
      <button class="jc-cerrar" type="button" aria-label="Cerrar el aviso de Justus">✕</button>
      <i class="jc-tiempo"></i>`;
    document.body.appendChild(el);
    this.el = el;

    this.$txt = el.querySelector('.jc-txt');
    this.$puntos = el.querySelector('.jc-puntos');
    this.$next = el.querySelector('.jc-next');
    this.$salta = el.querySelector('.jc-salta');
    this.$cerrar = el.querySelector('.jc-cerrar');
    this.$tiempo = el.querySelector('.jc-tiempo');

    this.$next.addEventListener('click', () => this.#avanzar());
    this.$salta.addEventListener('click', () => this.#terminar(true));
    this.$cerrar.addEventListener('click', () => this.#terminar(false));

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
   * Lanza una secuencia guiada. NO interrumpe: si Justus ya está hablando, el
   * mensaje espera turno en la cola.
   *
   * @param {string} clave        id de la lección (se recuerda en localStorage)
   * @param {Array}  pasos        [{ txt, foco?, voz?, dur? }]
   * @param {object} opts         { forzar, alFinal, pos, susurro }
   */
  guiar(clave, pasos, opts = {}) {
    if (!pasos?.length) return;
    const { forzar = false } = opts;
    if (!forzar && visto(clave)) {
      // Ya lo sabe: solo dejamos la pata a mano por si se pierde.
      this.#asegurar();
      this._ultima = { clave, pasos, opts };
      this.pata.classList.add('jc-on');
      return;
    }
    this.#asegurar();
    this.#encolar({ clave, pasos, opts });
  }

  /**
   * Mete un mensaje en la cola y trata de despacharla.
   *
   * Reglas, en este orden:
   *  1. Nada de duplicados — ni contra lo que suena ahora ni contra lo que espera.
   *  2. Tope de cola: si rebosa, cae el susurro más viejo (una lección con varios
   *     pasos nunca se descarta: es contenido que el nivel considera obligatorio).
   */
  #encolar(msg) {
    msg.susurro = msg.opts.susurro ?? msg.pasos.length === 1;
    if (this.clave === msg.clave && this.activo) return;
    if (this.cola.some((m) => m.clave === msg.clave)) return;
    this.cola.push(msg);
    while (this.cola.length > MAX_COLA) {
      const i = this.cola.findIndex((m) => m.susurro);
      this.cola.splice(i >= 0 ? i : 0, 1);
    }
    this.#bombear();
  }

  /** Saca el siguiente mensaje si el canal está libre. Idempotente. */
  #bombear() {
    if (this.activo || this._enCooldown || !this.cola.length || !this.el) return;
    if (this.#pantallaOcupada()) { this.#reintentar(); return; }
    this.#abrir(this.cola.shift());
  }

  /**
   * ¿Hay una herramienta o una hoja ocupando la pantalla?
   *
   * En un monitor caben Justus y la libreta del interrogatorio a la vez. En un
   * teléfono apaisado —375 px de alto— no: la libreta ocupa el 68 % y la cinta
   * de diálogo el hueco de arriba, así que el consejo aterrizaba justo encima de
   * CONFRONTAR. La respuesta no es apretujarlo en un margen que no existe: es
   * ESPERAR. El aviso no se pierde —sigue en la cola— y sale en cuanto el
   * jugador cierra lo que tenía abierto, que además es cuando vuelve a tener
   * atención para leerlo.
   */
  #pantallaOcupada() {
    if (!matchMedia('(pointer: coarse), (max-width: 768px)').matches) return false;
    const sel = '#interrogatorio:not(.oculto), #documentos:not(.oculto), '
      + '#xray-controls:not(.oculto), #decision:not(.oculto), #corporal:not(.oculto), '
      + '.sheet:not(.oculto), .cp-peritaje:not(.hidden), .cp-velo:not(.hidden), '
      + '.cp-fallo:not(.hidden), .cp-panel:not(.hidden)';
    return [...document.querySelectorAll(sel)].some((n) => n.offsetParent !== null);
  }

  /** Vuelve a intentarlo más tarde: la cola no se vacía sola. */
  #reintentar() {
    clearTimeout(this._reintento);
    this._reintento = setTimeout(() => this.#bombear(), 1200);
  }

  /**
   * Vigilancia mientras habla: la herramienta puede abrirse DESPUÉS.
   *
   * El caso real: Justus arranca su clase del puesto y el jugador —que no le
   * está haciendo caso, cosa muy suya— pulsa INTERROGAR. La libreta se despliega
   * y la tarjeta se queda debajo, sobre CONFRONTAR. Comprobarlo solo al sacar de
   * la cola no basta, así que mientras hay tarjeta abierta se mira cada 600 ms.
   */
  #vigilar() {
    clearInterval(this._vigia);
    if (!matchMedia('(pointer: coarse), (max-width: 768px)').matches) return;
    this._vigia = setInterval(() => {
      if (!this.activo) { clearInterval(this._vigia); return; }
      if (this.#pantallaOcupada()) this.#apartar();
    }, 600);
  }

  /**
   * Cede el paso sin perder el mensaje: la tarjeta se recoge y vuelve al frente
   * de la cola. Sin marcar como vista — no se ha leído — así que reaparece
   * entera en cuanto el jugador cierra lo que abrió.
   */
  #apartar() {
    const pendiente = {
      clave: this.clave,
      pasos: this.pasos,
      susurro: this._susurro,
      opts: { ...(this._ultima?.opts ?? {}), forzar: true },
    };
    clearInterval(this._typeTimer); this._typeTimer = null;
    clearTimeout(this._autoTimer);
    clearTimeout(this._susurroTimer);
    clearInterval(this._vigia);
    this.#soltarFoco();
    this.activo = false;
    document.body.classList.remove('jc-guiando');
    narrator.callar();
    if (this.el) {
      gsap.killTweensOf(this.el);
      if (this.$tiempo) gsap.killTweensOf(this.$tiempo);
      gsap.set(this.el, { clearProps: 'opacity,transform' });
      this.el.classList.remove('jc-on', 'jc-habla', 'jc-susurro', 'jc-leccion', 'jc-scroll');
    }
    this.pata?.classList.add('jc-on');
    this.cola.unshift(pendiente);
    this.#reintentar();
  }

  /** Pinta y anima un mensaje que YA tiene el canal para él solo. */
  #abrir({ clave, pasos, opts }) {
    const { alFinal = null, pos = 'abajo', susurro = pasos.length === 1 } = opts;
    this._pos = pos;
    this._susurro = susurro;
    this._ultima = { clave, pasos, opts };
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
    this.el.classList.toggle('jc-susurro', susurro);
    this.el.classList.toggle('jc-leccion', !susurro);
    // Bandera global: los HUD de cada nivel apartan sus propias cintas mientras
    // Justus ocupa el borde inferior (ver CSS del raid). Un susurro no la pone:
    // es demasiado pequeño para justificar que el nivel reorganice su HUD.
    document.body.classList.toggle('jc-guiando', !susurro);
    this.#reposicionar();
    gsap.fromTo(this.el,
      { opacity: 0, y: pos === 'arriba' ? -26 : 28, scale: susurro ? 0.96 : 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: susurro ? 0.4 : 0.62, ease: 'back.out(1.7)', overwrite: true });
    if (!susurro) this.#ladrar();
    this.#pintar();
    this.#vigilar();
  }

  /** Un ladrido cada `LADRIDO_MS` como mucho: dos a la vez suenan a fallo. */
  #ladrar() {
    const ahora = performance.now();
    if (ahora - this._ultimoLadrido < LADRIDO_MS) return;
    this._ultimoLadrido = ahora;
    audio.ladridoFeliz();
  }

  /**
   * La voz de Justus, siempre en un solo canal: CALLA lo anterior antes de
   * empezar. El Narrator ya cancela por dentro, pero solo si el motor reporta
   * `speaking`, y con voces SAPI ese estado llega tarde — lo suficiente para que
   * dos frases se solapen medio segundo. Cortar aquí, explícitamente, es lo que
   * garantiza que nunca se oigan dos Justus a la vez.
   */
  #vozJustus(texto) {
    narrator.callar();
    narrator.decir('Justus', texto);
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
    // El susurro NUNCA va arriba: esa franja la ocupan los datos de turno de los
    // cuatro niveles (barra superior, oleada, integridad, marcador). Abajo, en
    // cambio, el centro queda libre en todos —el mando vive en las esquinas— y
    // es donde el jugador ya está mirando el dock.
    if (this._pos === 'arriba' && !this._susurro) {
      est.top = '52px'; est.bottom = 'auto';
      est.maxHeight = `${Math.max(120, window.innerHeight - 120)}px`;
      return;
    }
    est.top = '';
    // Medimos TODO lo que vive pegado al borde inferior y nos plantamos encima
    // de lo más alto. Es una sola regla genérica: ninguna escena tiene que
    // avisarnos de su mobiliario, y el consejo nunca tapa el control que está
    // señalando.
    //
    // La lista incluye los cuatro docks del juego, no solo el del puesto. Con
    // `#dock` a secas, Justus se plantaba encima de la barra de acciones del
    // PERFILAMIENTO —que es un `.pf-dock`— y su clase magistral tapaba justo los
    // dos botones de los que estaba hablando.
    let ocupado = 0;
    for (const sel of ['#dock:not(.oculto)', '.pf-dock', '.cr-dock', '.dr-dock',
      '.cp-hotbar', '.tp-stick', '.tp-btn']) {
      for (const n of document.querySelectorAll(sel)) {
        if (n.offsetParent === null) continue;              // oculto: no estorba
        const r = n.getBoundingClientRect();
        if (r.height === 0) continue;
        // Solo cuenta lo que de verdad está PEGADO al borde inferior. La hotbar
        // del Centro Postal, por ejemplo, sube a la columna izquierda en táctil
        // (el borde de abajo es del mando): medirla como mobiliario inferior
        // daba 313 px de ocupación y mandaba la tarjeta al techo, cortada.
        if (window.innerHeight - r.bottom > 24) continue;
        ocupado = Math.max(ocupado, window.innerHeight - r.top);
      }
    }
    ocupado = Math.round(ocupado);

    // Un móvil apaisado tiene 390 px de alto: entre el mando y la barra superior
    // puede no quedar sitio para la tarjeta entera. Antes que recortarla contra
    // el borde, se le pone techo y su cuerpo hace scroll (el pie queda pegado
    // abajo, así que ENTENDIDO siempre se alcanza).
    const libre = window.innerHeight - ocupado - 54;
    // El susurro cabe siempre: dos líneas de texto y un avatar de 38 px. Se le
    // pone techo bajo a propósito, para que ni con una frase larga crezca hasta
    // convertirse en la tarjeta invasiva que vino a sustituir.
    if (this._susurro) {
      est.bottom = `${ocupado + 8}px`;
      est.maxHeight = `${Math.max(56, Math.min(96, libre))}px`;
      return;
    }
    if (libre < 130) {
      // Ni con esas: nos pegamos al fondo y aceptamos solapar el mando, que es
      // menos grave que una tarjeta cortada por la mitad.
      est.bottom = '10px';
      est.maxHeight = `${Math.max(120, window.innerHeight - 56)}px`;
    } else {
      est.bottom = `${ocupado + 10}px`;
      est.maxHeight = `${libre}px`;
    }
    this.#ajustarScroll();
  }

  /**
   * Marca si la tarjeta necesita arrastre. De eso depende que retenga el dedo o
   * lo deje pasar al juego, así que se recalcula cada vez que cambia su
   * contenido o su sitio (ver la regla `.jc-leccion.jc-scroll` del CSS).
   */
  #ajustarScroll() {
    if (!this.el) return;
    this.el.classList.toggle('jc-scroll', this.el.scrollHeight > this.el.clientHeight + 1);
  }

  /**
   * Un solo consejo, sin secuencia: sale como SUSURRO (cinta fina, sin botones,
   * se cierra sola). Es la vía por la que los niveles avisan de algo puntual,
   * así que es justo la que no puede secuestrar la pantalla.
   */
  decir(clave, txt, opts = {}) {
    this.guiar(clave, [{ txt, ...opts }], { susurro: true, ...opts });
  }

  /** Reabre la última lección aunque ya estuviera vista. */
  repetir() {
    if (!this._ultima) return;
    const { clave, pasos, opts = {} } = this._ultima;
    this.guiar(clave, pasos, { ...opts, forzar: true, alFinal: this._onFin });
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
        this.#ajustarScroll(); // el texto ya está entero: ahora se sabe si cabe
        if (this._susurro) this.#programarAutocierre(plano);
      }
    }, paso_ms);

    if (paso.voz !== false) this.#vozJustus(plano);

    // Auto-avance opcional: para pasos que acompañan una animación del mundo.
    clearTimeout(this._autoTimer);
    if (paso.dur) this._autoTimer = setTimeout(() => this.#avanzar(), paso.dur * 1000);
  }

  /**
   * El susurro se va solo: tiempo de lectura real (~14 caracteres por segundo,
   * el ritmo de lectura en pantalla pequeña) con suelo de 3,6 s y techo de 9 s.
   * La barrita del borde inferior lo enseña, para que la desaparición no
   * sorprenda a nadie a mitad de frase.
   */
  #programarAutocierre(plano) {
    const ms = Math.min(9000, Math.max(3600, plano.length * 72));
    clearTimeout(this._susurroTimer);
    this._susurroTimer = setTimeout(() => this.#terminar(false), ms);
    if (this.$tiempo) {
      gsap.fromTo(this.$tiempo, { scaleX: 1 },
        { scaleX: 0, duration: ms / 1000, ease: 'none', overwrite: true });
    }
  }

  #avanzar() {
    // Un toque durante el tecleo completa la frase en vez de saltarla.
    if (this._typeTimer && this.$txt.textContent.length < this.pasos[this.i]?.txt.replace(/<[^>]+>/g, '').length) {
      clearInterval(this._typeTimer);
      this._typeTimer = null;
      this.$txt.innerHTML = this.pasos[this.i].txt;
      this.el.classList.remove('jc-habla');
      this.#ajustarScroll();
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
    clearTimeout(this._susurroTimer);
    clearInterval(this._vigia);
    if (this.$tiempo) gsap.killTweensOf(this.$tiempo);
    this.#soltarFoco();
    this.activo = false;
    document.body.classList.remove('jc-guiando');
    if (this.clave) marcarVisto(this.clave);
    // El ladrido de despedida es de las lecciones. Un susurro que se cierra solo
    // no puede ladrar: es exactamente el ruido que sobra durante el juego.
    if (!saltado && !this._susurro) this.#ladrar();
    narrator.callar();
    this.#programarSiguiente();
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
    this.el.classList.remove('jc-on', 'jc-habla', 'jc-susurro', 'jc-leccion');
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { clearProps: 'opacity,transform' });
    this.pata?.classList.add('jc-on');
  }

  /**
   * Cooldown y siguiente. El respiro no es cosmético: sin él, dos avisos
   * encolados se ven como un solo parpadeo y el jugador ni registra que han
   * sido dos cosas distintas.
   */
  #programarSiguiente() {
    this._enCooldown = true;
    clearTimeout(this._cooldownTimer);
    this._cooldownTimer = setTimeout(() => {
      this._enCooldown = false;
      this.#bombear();
    }, COOLDOWN_MS);
  }

  #soltarFoco() {
    this._foco?.classList.remove('jc-foco');
    this._foco = null;
  }

  /**
   * Cierre inmediato sin marcar como visto (cambio de contexto brusco).
   * Vacía también la cola: si el nivel cambia de acto, los consejos del acto
   * anterior ya no aplican y aparecerían fuera de contexto.
   */
  ocultar() {
    clearInterval(this._typeTimer);
    this._typeTimer = null;
    clearTimeout(this._autoTimer);
    clearTimeout(this._cierreTimer);
    clearTimeout(this._susurroTimer);
    clearTimeout(this._cooldownTimer);
    clearTimeout(this._reintento);
    clearInterval(this._vigia);
    this.cola.length = 0;
    this._enCooldown = false;
    this.#soltarFoco();
    this.activo = false;
    document.body.classList.remove('jc-guiando');
    if (this.el) {
      gsap.killTweensOf(this.el);
      if (this.$tiempo) gsap.killTweensOf(this.$tiempo);
      gsap.set(this.el, { clearProps: 'opacity,transform' });
      this.el.classList.remove('jc-on', 'jc-habla', 'jc-susurro', 'jc-leccion');
    }
  }

  /**
   * ¿Justus tiene algo entre manos? (hablando ahora o esperando turno).
   * Los niveles lo consultan para no encadenar avisos encima de una lección
   * —o para saber si una lección ya vista ni siquiera llegó a abrirse—.
   */
  get ocupado() {
    return this.activo || this.cola.length > 0;
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
