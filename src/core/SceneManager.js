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
import { progreso } from './Progreso.js';

export class SceneManager {
  constructor() {
    this.current = null;
    this.titleScreen = document.getElementById('title-screen');
    this.hudRoot = document.getElementById('hud-root');
    this.#injectStyles();
    this.#buildMenu();
  }

  /** Los niveles 3D piden apaisado en móvil; el menú se ve bien en vertical. */
  #pedirLandscape(on) {
    document.body.classList.toggle('needs-landscape', !!on);
    // Si el navegador lo permite (PWA/fullscreen), lo bloqueamos de verdad.
    if (on && screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
  }

  showMenu() {
    this.titleScreen?.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  #buildMenu() {
    // ── CROMOS, NO FICHAS DE CATÁLOGO ─────────────────────────────────────
    // Cada nivel traía etiqueta + nombre largo + un párrafo de hasta 180
    // caracteres + la lista de controles: 756 px de contenido en los 375 de alto
    // de un móvil apaisado, o sea que había que arrastrar la pantalla de INICIO.
    // Nadie lee cuatro sinopsis para elegir a qué jugar; se elige por la pinta y
    // por UN verbo. El detalle de cada nivel ya lo cuenta su propio briefing al
    // entrar, que es donde sirve.
    const NIVELES = [
      { id: 'aeropuerto', n: 1, icono: '🛂', nombre: 'Aeropuerto', verbo: 'Interroga y sella', tono: '#e0952a' },
      { id: 'chimbote', n: 2, icono: '🚢', nombre: 'Puerto', verbo: 'Recorre el muelle', tono: '#4fd0e0' },
      { id: 'trafasport', n: 3, icono: '🚔', nombre: 'Operativo', verbo: 'Historia narrada', tono: '#e04a3c' },
      { id: 'centropostal', n: 4, icono: '📦', nombre: 'Centro Postal', verbo: 'Contrarreloj', tono: '#3fc47f' },
      { id: 'rondapatio', n: 5, icono: '🛰', nombre: 'Ronda de Patio', verbo: 'Mapa 2D · dash', tono: '#4fd0e0' },
    ];
    const menu = document.createElement('div');
    menu.id = 'level-menu';
    menu.innerHTML = `
      <div class="lm-inner">
        <h1 class="lm-title">ADUANAS <span>HERO</span></h1>
        <p class="lm-sub">¿Dónde haces guardia hoy?</p>
        <div class="lm-cards">
          ${NIVELES.map((l) => `
          <button class="lm-card" data-level="${l.id}" style="--tono:${l.tono}">
            <span class="lm-card-ico">${l.icono}</span>
            <span class="lm-card-tag">N${l.n}</span>
            <span class="lm-card-name">${l.nombre}</span>
            <span class="lm-card-verbo">${l.verbo}</span>
          </button>`).join('')}
        </div>
        <div class="lm-expediente g-pill"></div>
      </div>`;
    document.body.appendChild(menu);
    this.menu = menu;
    menu.querySelectorAll('.lm-card').forEach((btn) => {
      btn.addEventListener('click', () => this.#select(btn.dataset.level), { once: false });
    });

    // Expediente de la carrera (ADR-011): la reputación persiste entre niveles.
    const d = progreso.datos;
    const hecho = (id) => (d.niveles[id]?.completado ? ' ✔' : '');
    menu.querySelector('.lm-expediente').innerHTML =
      `<b>${progreso.rango}</b> · REPUTACIÓN ${d.reputacion}/100 · TURNOS ${d.turnos}`
      + (d.incautaciones ? ` · INCAUTACIONES ${d.incautaciones}` : '')
      + (d.rescates ? ` · RESCATES ${d.rescates}` : '');
    for (const id of ['aeropuerto', 'chimbote', 'trafasport', 'centropostal']) {
      const card = menu.querySelector(`.lm-card[data-level="${id}"] .lm-card-tag`);
      if (card) card.textContent += hecho(id);
    }
  }

  /**
   * Cierra el nivel en curso antes de dejar la página.
   *
   * Hasta ahora `unmount()` estaba escrito en los dos niveles y **no lo llamaba
   * nadie**: `onExit` iba directo a `window.location.reload()`, así que toda la
   * cadena de liberación (`cerrarNivel`, `disposeScene`, `clearRigCache`,
   * `PostFX.dispose`) era código muerto. Y con ella se iba lo único que permite
   * saber si una fuga existe: la traza de VRAM que imprime `cerrarNivel` nunca
   * llegaba a la consola, de modo que cualquier cifra de «residuo» salía de una
   * llamada manual y no de una partida real.
   *
   * La recarga se mantiene (es la decisión de arquitectura vigente: volver al
   * menú = reset limpio), pero ahora se desmonta primero. El `try` no es
   * decoración: si el cierre reventara, el jugador se quedaría atrapado en un
   * nivel del que ya pulsó salir, y eso es mucho peor que una fuga.
   */
  cerrarActual() {
    try {
      this.current?.unmount?.();
    } catch (e) {
      console.warn('[AduanasHero] El nivel falló al cerrarse; se recarga igual.', e);
    }
    this.current = null;
  }

  async #select(levelId) {
    this.menu.classList.add('hidden');
    this.#pedirLandscape(true); // todos los niveles se juegan en horizontal
    if (levelId === 'aeropuerto') {
      // El aeropuerto conserva su flujo: pantalla de título → INICIAR TURNO.
      this.titleScreen?.classList.remove('hidden');
      await import('../scenes/AirportScene.js'); // arranca al importarse
    } else if (levelId === 'chimbote') {
      this.titleScreen?.classList.add('hidden');
      if (this.hudRoot) this.hudRoot.innerHTML = '';
      const mod = await import('../scenes/ChimbotePortScene.js');
      this.current = new mod.ChimbotePortScene({
        // Volver al menú = reset limpio (fase 1). Pero se desmonta ANTES de
        // recargar: es lo que ejercita la ruta de liberación y lo que deja la
        // medición de VRAM en la consola (ver `cerrarActual`).
        onExit: () => { this.cerrarActual(); window.location.reload(); },
      });
      this.current.mount();
    } else if (levelId === 'trafasport') {
      this.titleScreen?.classList.add('hidden');
      if (this.hudRoot) this.hudRoot.innerHTML = '';
      const mod = await import('../scenes/TrafasportRaidScene.js');
      this.current = new mod.TrafasportRaidScene({
        onExit: () => { this.cerrarActual(); window.location.reload(); },
      });
      this.current.mount();
    } else if (levelId === 'centropostal') {
      this.titleScreen?.classList.add('hidden');
      if (this.hudRoot) this.hudRoot.innerHTML = '';
      const mod = await import('../scenes/CentroPostalScene.js');
      this.current = new mod.CentroPostalScene({
        onExit: () => { this.cerrarActual(); window.location.reload(); },
      });
      this.current.mount();
    } else if (levelId === 'rondapatio') {
      this.titleScreen?.classList.add('hidden');
      if (this.hudRoot) this.hudRoot.innerHTML = '';
      const mod = await import('../scenes/RondaPatioScene.js');
      this.current = new mod.RondaPatioScene({
        onExit: () => { this.cerrarActual(); window.location.reload(); },
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
      #level-menu .lm-inner { text-align: center; width: 100%; max-width: 720px; padding: clamp(14px, 3vw, 24px); }
      #level-menu .lm-title { font-size: clamp(30px, 7vw, 58px); margin: 0 0 4px; letter-spacing: .04em; font-weight: 700; }
      #level-menu .lm-title span { color: #e0952a; }
      #level-menu .lm-sub { color: #9aa6b6; margin: 0 0 clamp(14px, 3vh, 26px); font-style: italic;
        font-size: clamp(12px, 3vw, 16px); }

      /* ── LOS CUATRO CROMOS ────────────────────────────────────────────
         Rejilla de dos columnas que en cuanto hay sitio se pone en cuatro. Cada
         cromo es un cuadrado con icono grande, número, nombre y un verbo: se
         elige mirando, no leyendo. Antes eran cuatro fichas de catálogo con
         párrafo, y el menú entero pedía scroll en un móvil apaisado. */
      #level-menu .lm-cards {
        display: grid; grid-template-columns: repeat(2, 1fr);
        gap: clamp(8px, 2vw, 14px);
      }
      @media (min-width: 620px) { #level-menu .lm-cards { grid-template-columns: repeat(4, 1fr); } }
      #level-menu .lm-card {
        position: relative; cursor: pointer; overflow: hidden;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 2px; min-height: 96px; padding: clamp(10px, 2.4vw, 16px) 8px;
        background: linear-gradient(165deg, rgba(28,38,54,.92), rgba(12,17,26,.94));
        border: 1px solid #2f3d52; border-top: 3px solid var(--tono, #e0952a);
        border-radius: 12px; color: inherit; font-family: inherit;
        transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      #level-menu .lm-card:hover {
        transform: translateY(-4px); border-color: var(--tono, #e0952a);
        box-shadow: 0 16px 40px rgba(0,0,0,.55), 0 0 0 1px var(--tono, #e0952a);
      }
      #level-menu .lm-card:active { transform: translateY(0) scale(.97); }
      #level-menu .lm-card-ico { font-size: clamp(26px, 7vw, 38px); line-height: 1.1; }
      #level-menu .lm-card-tag {
        position: absolute; top: 7px; left: 9px;
        font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: .12em;
        color: var(--tono, #e0952a); opacity: .85;
      }
      #level-menu .lm-card-name {
        font-size: clamp(13px, 3.4vw, 17px); font-weight: 700; line-height: 1.2; margin-top: 3px;
      }
      #level-menu .lm-card-verbo {
        font-family: 'Courier New', monospace; font-size: clamp(9px, 2.3vw, 11px);
        color: #93a1b4; letter-spacing: .04em; line-height: 1.3;
      }
      #level-menu .lm-expediente {
        margin-top: clamp(14px, 3vh, 26px); font-size: clamp(10px, 2.4vw, 12px); letter-spacing: .1em;
      }
      #level-menu .lm-expediente b { color: #e0952a; letter-spacing: .16em; }

      /* ── TÁCTIL (ADR-008) ─────────────────────────────────────────────
         Anclado al puntero grueso, no al ancho: un móvil apaisado mide 932 px y
         se escapaba de un max-width de 900px. Ya no hace falta apilar en columna
         —los cromos caben en rejilla— pero sí garantizar que el menú entero
         entra sin arrastrar: es la pantalla de INICIO. */
      @media (pointer: coarse) {
        #level-menu { overflow-y: auto; padding: 10px 0; }
        #level-menu .lm-inner { padding: 10px 12px; max-width: 100%; }
        #level-menu .lm-card { min-height: 88px; }
      }
      /* Apaisado bajo: el título cede altura para que los cromos no se corten. */
      @media (max-height: 460px) and (pointer: coarse) {
        #level-menu .lm-title { font-size: clamp(22px, 5vw, 34px); }
        #level-menu .lm-sub { margin-bottom: 10px; font-size: 11px; }
        #level-menu .lm-cards { grid-template-columns: repeat(4, 1fr); gap: 8px; }
        #level-menu .lm-card { min-height: 78px; padding: 8px 6px; }
        #level-menu .lm-card-ico { font-size: 24px; }
        #level-menu .lm-expediente { margin-top: 10px; }
      }

    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
}
