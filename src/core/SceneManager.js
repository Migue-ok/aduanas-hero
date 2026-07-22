/**
 * SceneManager (ADR-006) — el router de niveles de Aduanas Hero.
 *
 * Ya no arrancamos directo en el aeropuerto: primero un MENÚ FLOTANTE deja
 * elegir mapa. Cada escena se carga por import dinámico (code-splitting: el
 * mapa no elegido ni se descarga) y expone `mount()` / opcional `unmount()`.
 *
 * - Nivel 1 · Aeropuerto Jorge Chávez → `scenes/AirportScene.js` (arranca al
 *   importarse; conserva su pantalla de título y su HUD, cero regresión).
 * - Nivel 2 · Puerto de Chimbote → `scenes/ChimbotePortScene.js` (free-roam FPS).
 */
export class SceneManager {
  constructor() {
    this.current = null;
    this.titleScreen = document.getElementById('title-screen');
    this.hudRoot = document.getElementById('hud-root');
    this.#injectStyles();
    this.#buildMenu();
  }

  showMenu() {
    this.titleScreen?.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  #buildMenu() {
    const menu = document.createElement('div');
    menu.id = 'level-menu';
    menu.innerHTML = `
      <div class="lm-inner">
        <div class="lm-badge">DIRECCIÓN DE ADUANAS · SELECCIÓN DE DESTINO</div>
        <h1 class="lm-title">ADUANAS <span>HERO</span></h1>
        <p class="lm-sub">Elige tu puesto de servicio para este turno.</p>
        <div class="lm-cards">
          <button class="lm-card" data-level="aeropuerto">
            <div class="lm-card-tag">NIVEL 1</div>
            <div class="lm-card-name">Aeropuerto Jorge Chávez</div>
            <div class="lm-card-desc">Control de llegadas. Interrogatorio de escritorio, rayos X, Justus K-9. El turno noche clásico.</div>
            <div class="lm-card-mode">▸ Modo escritorio</div>
          </button>
          <button class="lm-card" data-level="chimbote">
            <div class="lm-card-tag">NIVEL 2</div>
            <div class="lm-card-name">Puerto de Chimbote</div>
            <div class="lm-card-desc">Inspección marítima. Camina el muelle entre contenedores, cruza el manifiesto con los rayos X portátiles.</div>
            <div class="lm-card-mode">▸ Free-roam · WASD + ratón</div>
          </button>
        </div>
        <p class="lm-hint">Auriculares recomendados · 16+ · El Puerto es desktop-first (ratón + teclado)</p>
      </div>`;
    document.body.appendChild(menu);
    this.menu = menu;
    menu.querySelectorAll('.lm-card').forEach((btn) => {
      btn.addEventListener('click', () => this.#select(btn.dataset.level), { once: false });
    });
  }

  async #select(levelId) {
    this.menu.classList.add('hidden');
    if (levelId === 'aeropuerto') {
      // El aeropuerto conserva su flujo: pantalla de título → INICIAR TURNO.
      this.titleScreen?.classList.remove('hidden');
      await import('../scenes/AirportScene.js'); // arranca al importarse
    } else if (levelId === 'chimbote') {
      this.titleScreen?.classList.add('hidden');
      if (this.hudRoot) this.hudRoot.innerHTML = '';
      const mod = await import('../scenes/ChimbotePortScene.js');
      this.current = new mod.ChimbotePortScene({
        onExit: () => window.location.reload(), // volver al menú = reset limpio (fase 1)
      });
      this.current.mount();
    }
  }

  #injectStyles() {
    const css = `
      #level-menu {
        position: fixed; inset: 0; z-index: 50;
        display: flex; align-items: center; justify-content: center;
        background:
          radial-gradient(1200px 700px at 50% -10%, #1a2536 0%, #0a0d14 55%, #05070b 100%);
        color: #e8ecf2; font-family: 'Georgia', 'Times New Roman', serif;
        opacity: 1; transition: opacity .5s ease;
      }
      #level-menu.hidden { opacity: 0; pointer-events: none; }
      #level-menu .lm-inner { text-align: center; max-width: 900px; padding: 24px; }
      #level-menu .lm-badge {
        font-family: 'Courier New', monospace; letter-spacing: .28em; font-size: 12px;
        color: #7d8ba0; border: 1px solid #2b3648; display: inline-block;
        padding: 8px 16px; margin-bottom: 26px;
      }
      #level-menu .lm-title { font-size: 62px; margin: 0 0 6px; letter-spacing: .04em; font-weight: 700; }
      #level-menu .lm-title span { color: #e0952a; }
      #level-menu .lm-sub { color: #9aa6b6; margin: 0 0 34px; font-style: italic; }
      #level-menu .lm-cards { display: flex; gap: 22px; justify-content: center; flex-wrap: wrap; }
      #level-menu .lm-card {
        flex: 1 1 320px; max-width: 380px; text-align: left; cursor: pointer;
        background: linear-gradient(160deg, rgba(28,38,54,.9), rgba(12,17,26,.9));
        border: 1px solid #2f3d52; border-radius: 4px; padding: 22px 24px;
        color: inherit; font-family: inherit; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      #level-menu .lm-card:hover {
        transform: translateY(-4px); border-color: #e0952a;
        box-shadow: 0 16px 40px rgba(0,0,0,.55), 0 0 0 1px rgba(224,149,42,.3);
      }
      #level-menu .lm-card-tag {
        font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: .25em;
        color: #e0952a; margin-bottom: 10px;
      }
      #level-menu .lm-card-name { font-size: 25px; margin-bottom: 10px; }
      #level-menu .lm-card-desc { font-size: 14px; line-height: 1.55; color: #a9b4c2; margin-bottom: 16px; }
      #level-menu .lm-card-mode { font-family: 'Courier New', monospace; font-size: 12px; color: #6f7d90; }
      #level-menu .lm-hint { margin-top: 32px; color: #5f6b7c; font-size: 12px; font-family: 'Courier New', monospace; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
}
