import { narrator } from '../audio/Narrator.js';
import { audio } from '../audio/AudioEngine.js';
import { popIn } from '../core/Juice.js';

/**
 * PauseMenu — pausa y ajustes compartidos (ADR-010).
 *
 * HUECO QUE CIERRA: hasta ahora no había forma de pausar, de bajar el volumen
 * ni de **silenciar al narrador** dentro de un nivel. En móvil eso es grave: si
 * el jugador está en el bus, o no puede oír, la única salida era recargar.
 *
 * Se monta una vez por escena y expone `onPausa/onReanudar` para que la escena
 * congele su lógica (el bucle sigue renderizando: pausar el rAF deja la imagen
 * congelada de forma fea y rompe las transiciones de GSAP).
 */
export class PauseMenu {
  constructor({ onPausa, onReanudar, onSalir, onReiniciar } = {}) {
    this.onPausa = onPausa; this.onReanudar = onReanudar;
    this.onSalir = onSalir; this.onReiniciar = onReiniciar;
    this.abierto = false;
  }

  mount() {
    this.#injectStyles();
    const el = document.createElement('div');
    el.id = 'pause-root';
    el.innerHTML = `
      <button class="pz-open" aria-label="Pausa">❚❚</button>
      <div class="pz-overlay hidden">
        <div class="pz-card g-panel">
          <h2 class="g-title">EN PAUSA</h2>
          <label class="pz-row">
            <span>Voz del narrador</span>
            <button class="pz-toggle" data-on="1">ACTIVADA</button>
          </label>
          <label class="pz-row">
            <span>Volumen</span>
            <input class="pz-vol" type="range" min="0" max="100" value="85">
          </label>
          <div class="pz-actions">
            <button class="g-btn pz-resume g-btn--primary">▶ REANUDAR</button>
            <button class="g-btn pz-restart">↻ REINICIAR NIVEL</button>
            <button class="g-btn pz-exit g-btn--danger">◄ SALIR AL MENÚ</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.root = el;
    this.$overlay = el.querySelector('.pz-overlay');
    this.$card = el.querySelector('.pz-card');

    el.querySelector('.pz-open').addEventListener('click', () => this.abrir());
    el.querySelector('.pz-resume').addEventListener('click', () => this.cerrar());
    el.querySelector('.pz-restart').addEventListener('click', () => (this.onReiniciar ?? (() => location.reload()))());
    el.querySelector('.pz-exit').addEventListener('click', () => (this.onSalir ?? (() => location.reload()))());

    const tgl = el.querySelector('.pz-toggle');
    tgl.addEventListener('click', () => {
      const on = narrator.toggle();
      tgl.dataset.on = on ? '1' : '0';
      tgl.textContent = on ? 'ACTIVADA' : 'SILENCIADA';
    });

    const vol = el.querySelector('.pz-vol');
    vol.addEventListener('input', () => audio.setVolumen?.(vol.value / 100));

    // ESC abre/cierra en escritorio (en el Nivel 2 el ESC también suelta el
    // PointerLock: por eso el menú NO se abre solo con eso, hay botón visible).
    this._key = (e) => { if (e.code === 'Escape' && this.abierto) this.cerrar(); };
    window.addEventListener('keydown', this._key);
  }

  abrir() {
    if (this.abierto) return;
    this.abierto = true;
    this.$overlay.classList.remove('hidden');
    popIn(this.$card);
    narrator.callar();
    this.onPausa?.();
  }

  cerrar() {
    if (!this.abierto) return;
    this.abierto = false;
    this.$overlay.classList.add('hidden');
    this.onReanudar?.();
  }

  destroy() {
    window.removeEventListener('keydown', this._key);
    this.root?.remove();
    this._style?.remove();
  }

  #injectStyles() {
    if (document.getElementById('pz-style')) return;
    const s = document.createElement('style');
    s.id = 'pz-style';
    s.textContent = `
      #pause-root { position: fixed; inset: 0; z-index: 80; pointer-events: none; }
      #pause-root > * { pointer-events: auto; }
      .pz-open {
        position: absolute; top: max(10px, env(safe-area-inset-top)); left: 50%;
        transform: translateX(-50%);
        min-width: 48px; min-height: 40px; padding: 8px 14px; cursor: pointer;
        background: var(--g-bg, rgba(13,19,28,.62)); color: #eef4f8;
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        border: 1px solid rgba(148,176,208,.18); border-radius: 999px;
        font-family: var(--f-data, monospace); font-size: 13px; letter-spacing: .12em;
      }
      .pz-open:hover { border-color: var(--a-amber, #e0952a); color: var(--a-amber, #e0952a); }
      .pz-overlay {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        padding: clamp(12px, 4vw, 32px); overflow-y: auto;
        background: rgba(4, 8, 12, .72);
        -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
      }
      .pz-overlay.hidden { display: none; }
      .pz-card {
        width: min(420px, 92vw); padding: clamp(18px, 4vw, 28px);
        display: flex; flex-direction: column; gap: 14px; text-align: center;
        color: #eef4f8; font-family: var(--f-body, system-ui);
      }
      .pz-card h2 { font-size: clamp(18px, 3.4vw, 26px); letter-spacing: .2em; margin: 0 0 4px; }
      .pz-row {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        font-family: var(--f-data, monospace); font-size: clamp(11px, 1.7vw, 13px);
        color: #b9c6d4; text-align: left;
      }
      .pz-toggle {
        min-height: 40px; padding: 8px 14px; cursor: pointer; border-radius: 6px;
        background: rgba(63,196,127,.16); color: #3fc47f;
        border: 1px solid rgba(63,196,127,.45);
        font-family: var(--f-data, monospace); font-size: 12px; letter-spacing: .1em;
      }
      .pz-toggle[data-on="0"] { background: rgba(224,74,60,.14); color: #e04a3c; border-color: rgba(224,74,60,.45); }
      .pz-vol { flex: 1; max-width: 180px; accent-color: var(--a-amber, #e0952a); height: 28px; }
      .pz-actions { display: flex; flex-direction: column; gap: 9px; margin-top: 6px; }
      .pz-actions .g-btn { width: 100%; font-size: clamp(11px, 1.7vw, 14px); }
    `;
    document.head.appendChild(s);
    this._style = s;
  }
}
