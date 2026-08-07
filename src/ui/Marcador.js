import gsap from 'gsap';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje } from '../core/Puntaje.js';
import { audio } from '../audio/AudioEngine.js';
import { compacto } from './estilos.js';

/**
 * Marcador — la cara visible de `core/Puntaje.js`.
 *
 * Dos piezas y ninguna más, porque el HUD del puesto ya está lleno:
 *
 * 1. **La píldora**: total vivo, racha y multiplicador. Vive pegada bajo la barra
 *    superior. El número no salta: se *cuenta* con un tween, que es lo que hace
 *    que el jugador mire el marcador en vez de leerlo.
 * 2. **El recibo flotante**: `+120 · SEÑAL ANOTADA`. Sube, se desvanece y deja
 *    dicho POR QUÉ. Sin el motivo, un número flotante es ruido; con él, es la
 *    forma más barata que tiene el juego de enseñar una regla aduanera real.
 *
 * Se auto-inyecta el CSS (patrón de `SceneManager`) para que cualquier nivel
 * pueda montarlo con una línea, sin tocar `style.css`.
 */
export class Marcador {
  constructor(root = document.getElementById('hud-root')) {
    this.root = root;
    Marcador.#inyectarCSS();

    this.el = document.createElement('div');
    this.el.id = 'marcador';
    this.el.innerHTML = `
      <div class="mk-pill">
        <span class="mk-label">PUNTOS</span>
        <span class="mk-total">0</span>
        <span class="mk-mult"></span>
      </div>
      <div class="mk-racha"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mk-recibos"></div>
    `;
    root.appendChild(this.el);

    this.$total = this.el.querySelector('.mk-total');
    this.$mult = this.el.querySelector('.mk-mult');
    this.$pill = this.el.querySelector('.mk-pill');
    this.$racha = this.el.querySelector('.mk-racha');
    this.$recibos = this.el.querySelector('.mk-recibos');

    this.mostrado = { v: 0 }; // el valor que se está contando en pantalla
    this.off = bus.on(Señal.PUNTOS, (p) => this.#aplicar(p));
  }

  #aplicar({ puntos, motivo, detalle, total, racha, multiplicador, tipo }) {
    // Cuenta hacia el total nuevo (nunca un salto seco).
    gsap.to(this.mostrado, {
      v: total,
      duration: tipo === 'reset' ? 0.2 : 0.7,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: () => { this.$total.textContent = Math.round(this.mostrado.v).toLocaleString('es-PE'); },
    });

    // Pips de racha: se encienden de izquierda a derecha.
    this.$racha.querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('on', i < racha));
    this.$mult.textContent = multiplicador >= 1.2 ? `×${multiplicador.toFixed(1)}` : '';
    this.$mult.classList.toggle('vivo', multiplicador >= 1.2);

    if (tipo === 'reset' || !motivo) return;

    // El golpe: verde que crece, rojo que se sacude.
    this.$pill.classList.remove('bien', 'mal');
    void this.$pill.offsetWidth; // reinicia la animación CSS aunque repita clase
    this.$pill.classList.add(tipo);
    gsap.fromTo(this.$pill,
      { scale: tipo === 'bien' ? 1.16 : 0.93, x: tipo === 'mal' ? -7 : 0 },
      { scale: 1, x: 0, duration: tipo === 'bien' ? 0.5 : 0.62,
        ease: tipo === 'bien' ? 'back.out(3)' : 'elastic.out(1, 0.35)',
        overwrite: 'auto', onComplete: () => gsap.set(this.$pill, { clearProps: 'transform' }) });

    this.#recibo(puntos, motivo, detalle, tipo);

    // Sonido: el marcador tiene voz propia y es corta.
    if (tipo === 'bien') {
      audio.beep(true);
      if (racha >= 3) audio.chispa(0.5); // la racha suena distinto: se está cocinando algo
    } else {
      audio.beep(false);
    }
  }

  #recibo(puntos, motivo, detalle, tipo) {
    const r = document.createElement('div');
    r.className = `mk-recibo ${tipo}`;
    r.innerHTML = `
      <b>${puntos > 0 ? '+' : ''}${puntos.toLocaleString('es-PE')}</b>
      <span>${motivo}</span>
      ${detalle ? `<em>${detalle}</em>` : ''}`;
    this.$recibos.appendChild(r);

    // Sube, se abre y se va. La cola nunca crece: solo caben 4 a la vez.
    while (this.$recibos.children.length > 4) this.$recibos.firstChild.remove();
    gsap.fromTo(r,
      { opacity: 0, y: 18, scale: 0.86 },
      { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(2.2)' });
    gsap.to(r, {
      opacity: 0, y: -26, duration: 0.6, delay: detalle ? 3.4 : 2.2, ease: 'power2.in',
      onComplete: () => r.remove(),
    });
  }

  /** Cierra el marcador (cambio de nivel). */
  dispose() {
    this.off?.();
    gsap.killTweensOf(this.mostrado);
    this.el.remove();
  }

  /** Panel de balance para la Hoja de Servicio (HTML listo para insertar). */
  static balanceHTML() {
    const b = puntaje.balance();
    const linea = (h) => `<div class="mk-bal-fila ${h.puntos > 0 ? 'bien' : 'mal'}">
        <b>${h.puntos > 0 ? '+' : ''}${h.puntos.toLocaleString('es-PE')}</b> ${h.motivo}</div>`;
    return `
      <div class="mk-balance">
        <div class="mk-bal-total">
          <span>PUNTAJE DEL TURNO</span>
          <b>${b.total.toLocaleString('es-PE')}</b>
          ${b.total >= b.record && b.total > 0 ? '<i class="mk-record">¡NUEVO RÉCORD!</i>'
            : `<i>récord: ${b.record.toLocaleString('es-PE')}</i>`}
        </div>
        <div class="mk-bal-stats">
          ✔ ${b.aciertos} aciertos · ✖ ${b.errores} errores · racha máxima ×${b.mejorRacha}
        </div>
        ${b.mejores.length ? `<div class="mk-bal-grupo">LO QUE MÁS SUMÓ${b.mejores.map(linea).join('')}</div>` : ''}
        ${b.peores.length ? `<div class="mk-bal-grupo">LO QUE COSTÓ CARO${b.peores.map(linea).join('')}</div>` : ''}
      </div>`;
  }

  static #cssPuesto = false;

  static #inyectarCSS() {
    if (Marcador.#cssPuesto) return;
    Marcador.#cssPuesto = true;
    const style = document.createElement('style');
    style.textContent = `
      #marcador {
        position: absolute; top: 46px; right: 14px; z-index: 14;
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
        pointer-events: none; font-family: var(--f-data, monospace);
      }
      .mk-pill {
        display: flex; align-items: baseline; gap: 9px;
        padding: 7px 15px; border-radius: 999px;
        background: rgba(11, 16, 24, 0.86);
        -webkit-backdrop-filter: blur(14px) saturate(1.25);
        backdrop-filter: blur(14px) saturate(1.25);
        border: 1px solid rgba(148, 176, 208, 0.18);
        box-shadow: 0 10px 26px rgba(0,0,0,.5);
        transition: border-color .3s, box-shadow .3s;
      }
      .mk-pill.bien { border-color: rgba(63,196,127,.85); box-shadow: 0 0 26px rgba(63,196,127,.4); }
      .mk-pill.mal  { border-color: rgba(224,74,60,.85);  box-shadow: 0 0 26px rgba(224,74,60,.4); }
      .mk-label { font-size: 9px; letter-spacing: .26em; color: #8fa0b4; }
      .mk-total {
        font-family: var(--f-display, 'Bahnschrift', sans-serif);
        font-size: 25px; font-weight: 700; letter-spacing: .04em;
        color: #f2f6fa; font-variant-numeric: tabular-nums; line-height: 1;
      }
      .mk-mult { font-size: 12px; letter-spacing: .1em; color: #5c6a7c; transition: color .3s; }
      .mk-mult.vivo { color: #e0952a; text-shadow: 0 0 12px rgba(224,149,42,.7); }

      .mk-racha { display: flex; gap: 4px; padding-right: 4px; }
      .mk-racha i {
        width: 15px; height: 3px; border-radius: 2px;
        background: rgba(148,176,208,.16); transition: background .25s, box-shadow .25s;
      }
      .mk-racha i.on { background: #e0952a; box-shadow: 0 0 8px rgba(224,149,42,.8); }

      .mk-recibos { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; margin-top: 2px; }
      .mk-recibo {
        display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
        justify-content: flex-end; max-width: 300px; text-align: right;
        padding: 6px 12px; border-radius: 8px;
        background: rgba(9, 13, 20, 0.9);
        border-right: 3px solid; box-shadow: 0 8px 22px rgba(0,0,0,.45);
      }
      .mk-recibo.bien { border-color: #3fc47f; }
      .mk-recibo.mal  { border-color: #e04a3c; }
      .mk-recibo b {
        font-family: var(--f-display, sans-serif); font-size: 19px; letter-spacing: .03em;
        font-variant-numeric: tabular-nums;
      }
      .mk-recibo.bien b { color: #6de0a4; text-shadow: 0 0 14px rgba(63,196,127,.55); }
      .mk-recibo.mal b  { color: #ff7d70; text-shadow: 0 0 14px rgba(224,74,60,.55); }
      .mk-recibo span { font-size: 10.5px; letter-spacing: .1em; color: #cdd8e5; text-transform: uppercase; }
      .mk-recibo em {
        flex-basis: 100%; font-size: 11px; font-style: italic; line-height: 1.45;
        color: #9aabbe; font-family: var(--f-body, sans-serif); text-transform: none;
      }

      /* Balance en la Hoja de Servicio (papel, no cristal: ahí manda la tinta) */
      .mk-balance { margin: 14px 0 4px; font-family: var(--f-data, monospace); }
      .mk-bal-total { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .mk-bal-total span { font-size: 11px; letter-spacing: .2em; color: #6a5c38; }
      .mk-bal-total b { font-size: 30px; color: #2a2419; font-variant-numeric: tabular-nums; }
      .mk-bal-total i { font-size: 11px; color: #8a7a4a; font-style: italic; }
      .mk-bal-total i.mk-record { color: #1e6e3a; font-weight: 700; font-style: normal; letter-spacing: .1em; }
      .mk-bal-stats { font-size: 12px; color: #6a5c38; margin: 4px 0 10px; }
      .mk-bal-grupo { font-size: 10px; letter-spacing: .18em; color: #8a7a4a; margin-top: 8px; }
      .mk-bal-fila { font-size: 12.5px; letter-spacing: 0; margin: 3px 0 0 6px; color: #4a4030; }
      .mk-bal-fila b { font-variant-numeric: tabular-nums; }
      .mk-bal-fila.bien b { color: #1e6e3a; }
      .mk-bal-fila.mal b  { color: #a31f27; }

    ` + compacto(`
      /* Táctil: el marcador encoge para no comerse la escena */
      @S #marcador { top: 40px; right: 8px; gap: 4px; }
      @S .mk-pill { padding: 5px 11px; gap: 7px; }
      @S .mk-total { font-size: 19px; }
      @S .mk-label { font-size: 8px; letter-spacing: .18em; }
      @S .mk-racha i { width: 11px; height: 2.5px; }
      @S .mk-recibo { max-width: 210px; padding: 5px 9px; gap: 6px; }
      @S .mk-recibo b { font-size: 15px; }
      @S .mk-recibo span { font-size: 9px; letter-spacing: .06em; }
      @S .mk-recibo em { font-size: 10px; }
    `);
    document.head.appendChild(style);
  }
}
