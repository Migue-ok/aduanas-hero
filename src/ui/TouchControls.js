import { isTouch } from '../core/Device.js';

/**
 * TouchControls — el mando virtual (ADR-008).
 *
 * DECISIÓN CLAVE: el joystick y los botones **despachan `KeyboardEvent`s
 * reales** sobre `window` con el mismo `code` que usaría un teclado. Así toda
 * la lógica de juego (`this.keys['KeyW']`, `if (e.code === 'Space')`…) funciona
 * en móvil sin tocar una sola línea de gameplay: el móvil "escribe" por el
 * jugador. También expone `axis` por si una escena quiere valor analógico.
 *
 * Uso:
 *   const pad = new TouchControls({ joystick: true, buttons: [
 *     { code: 'Space', label: 'OLFATO', hint: 'mantén' },
 *   ]});
 *   pad.mount();   // no hace nada si el dispositivo no es táctil
 *   pad.destroy();
 */
export class TouchControls {
  constructor({ joystick = true, buttons = [], onLook = null } = {}) {
    this.enabled = isTouch;
    this.joystickOn = joystick;
    this.buttonDefs = buttons;
    this.onLook = onLook;          // callback opcional para "mirar" arrastrando
    this.axis = { x: 0, y: 0 };    // -1..1 (y negativo = adelante)
    this._activas = new Set();     // teclas virtuales pulsadas ahora mismo
    this._stickId = null;
    this._lookId = null;
  }

  mount() {
    if (!this.enabled || this.root) return;
    this.#injectStyles();
    const root = document.createElement('div');
    root.id = 'touch-pad';
    root.innerHTML = `
      ${this.joystickOn ? '<div class="tp-stick"><div class="tp-knob"></div></div>' : ''}
      <div class="tp-buttons"></div>`;
    document.body.appendChild(root);
    this.root = root;

    if (this.joystickOn) {
      this.stick = root.querySelector('.tp-stick');
      this.knob = root.querySelector('.tp-knob');
      this.stick.addEventListener('pointerdown', (e) => this.#stickDown(e));
    }

    const cont = root.querySelector('.tp-buttons');
    for (const def of this.buttonDefs) {
      const b = document.createElement('button');
      b.className = 'tp-btn' + (def.small ? ' tp-small' : '');
      b.innerHTML = `<span>${def.label}</span>${def.hint ? `<em>${def.hint}</em>` : ''}`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('on');
        this.#press(def.code);
      });
      const soltar = (e) => {
        e?.stopPropagation();
        b.classList.remove('on');
        this.#release(def.code);
      };
      b.addEventListener('pointerup', soltar);
      b.addEventListener('pointercancel', soltar);
      b.addEventListener('pointerleave', soltar);
      cont.appendChild(b);
    }

    // "Mirar" arrastrando en cualquier zona libre (para escenas en 1.ª persona).
    if (this.onLook) {
      this._lookHandler = (e) => this.#lookMove(e);
      this._lookDown = (e) => {
        // El mando no gira la cámara (y `target` puede no ser un Element).
        if (e.target?.closest?.('#touch-pad')) return;
        this._lookId = e.pointerId;
        this._lookLast = { x: e.clientX, y: e.clientY };
      };
      this._lookUp = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
      window.addEventListener('pointerdown', this._lookDown, true);
      window.addEventListener('pointermove', this._lookHandler, true);
      window.addEventListener('pointerup', this._lookUp, true);
      window.addEventListener('pointercancel', this._lookUp, true);
    }
  }

  // ── Joystick ──────────────────────────────────────────────────────────────
  #stickDown(e) {
    e.preventDefault();
    this._stickId = e.pointerId;
    const r = this.stick.getBoundingClientRect();
    this._cx = r.left + r.width / 2;
    this._cy = r.top + r.height / 2;
    this._radio = r.width / 2;
    this._moveH = (ev) => this.#stickMove(ev);
    this._upH = (ev) => this.#stickUp(ev);
    window.addEventListener('pointermove', this._moveH, { passive: false });
    window.addEventListener('pointerup', this._upH);
    window.addEventListener('pointercancel', this._upH);
    this.#stickMove(e);
  }

  #stickMove(e) {
    if (e.pointerId !== this._stickId) return;
    e.preventDefault?.();
    let dx = e.clientX - this._cx;
    let dy = e.clientY - this._cy;
    const dist = Math.hypot(dx, dy);
    const max = this._radio;
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.axis.x = dx / max;
    this.axis.y = dy / max;
    this.#sync();
  }

  #stickUp(e) {
    if (e.pointerId !== this._stickId) return;
    this._stickId = null;
    this.knob.style.transform = 'translate(0,0)';
    this.axis.x = 0; this.axis.y = 0;
    this.#sync();
    window.removeEventListener('pointermove', this._moveH);
    window.removeEventListener('pointerup', this._upH);
    window.removeEventListener('pointercancel', this._upH);
  }

  /** Traduce el vector del joystick a WASD virtuales (zona muerta del 28 %). */
  #sync() {
    const dz = 0.28;
    const quiero = new Set();
    if (this.axis.y < -dz) quiero.add('KeyW');
    if (this.axis.y > dz) quiero.add('KeyS');
    if (this.axis.x < -dz) quiero.add('KeyA');
    if (this.axis.x > dz) quiero.add('KeyD');
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      if (quiero.has(code) && !this._activas.has(code)) this.#press(code);
      else if (!quiero.has(code) && this._activas.has(code)) this.#release(code);
    }
  }

  // ── Mirar arrastrando (1.ª persona sin PointerLock) ───────────────────────
  #lookMove(e) {
    if (e.pointerId !== this._lookId || !this._lookLast) return;
    const dx = e.clientX - this._lookLast.x;
    const dy = e.clientY - this._lookLast.y;
    this._lookLast = { x: e.clientX, y: e.clientY };
    this.onLook(dx, dy);
  }

  // ── Teclas virtuales ──────────────────────────────────────────────────────
  #press(code) {
    if (this._activas.has(code)) return;
    this._activas.add(code);
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  }

  #release(code) {
    if (!this._activas.has(code)) return;
    this._activas.delete(code);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }

  /** Muestra u oculta el mando (p. ej. durante una cinemática). */
  setVisible(v) {
    if (this.root) this.root.style.display = v ? '' : 'none';
    if (!v) for (const c of [...this._activas]) this.#release(c);
  }

  destroy() {
    for (const c of [...this._activas]) this.#release(c);
    if (this.onLook) {
      window.removeEventListener('pointerdown', this._lookDown, true);
      window.removeEventListener('pointermove', this._lookHandler, true);
      window.removeEventListener('pointerup', this._lookUp, true);
      window.removeEventListener('pointercancel', this._lookUp, true);
    }
    this.root?.remove();
    this.root = null;
  }

  #injectStyles() {
    if (document.getElementById('tp-style')) return;
    const css = `
      #touch-pad { position: fixed; inset: 0; z-index: 60; pointer-events: none;
        font-family: 'Courier New', monospace; touch-action: none; }
      #touch-pad > * { pointer-events: auto; }
      .tp-stick {
        position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom));
        width: 132px; height: 132px; border-radius: 50%;
        background: radial-gradient(circle, rgba(20,28,40,.5), rgba(8,12,18,.72));
        border: 2px solid rgba(224,149,42,.45); touch-action: none;
        box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .tp-knob {
        position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px;
        border-radius: 50%; background: rgba(224,149,42,.85);
        box-shadow: 0 3px 12px rgba(0,0,0,.6); transition: transform .06s linear; }
      .tp-buttons {
        position: absolute; right: max(18px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom));
        display: flex; flex-wrap: wrap-reverse; gap: 12px; justify-content: flex-end;
        max-width: 46vw; }
      .tp-btn {
        min-width: 84px; min-height: 84px; padding: 6px; border-radius: 50%;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        background: rgba(12,18,26,.78); color: #eef4f8;
        border: 2px solid rgba(224,149,42,.55); font-family: inherit;
        font-size: 12px; font-weight: bold; letter-spacing: .04em; line-height: 1.1;
        box-shadow: 0 5px 18px rgba(0,0,0,.5); touch-action: none; cursor: pointer; }
      .tp-btn.tp-small { min-width: 64px; min-height: 64px; font-size: 11px; }
      .tp-btn em { font-style: normal; font-size: 9px; opacity: .65; font-weight: normal; }
      .tp-btn.on { background: rgba(224,149,42,.9); color: #10151b; transform: scale(.94); }
      @media (max-height: 460px) {
        .tp-stick { width: 108px; height: 108px; }
        .tp-knob { width: 48px; height: 48px; margin: -24px 0 0 -24px; }
        .tp-btn { min-width: 70px; min-height: 70px; font-size: 11px; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'tp-style';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
