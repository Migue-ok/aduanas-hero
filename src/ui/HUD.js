import gsap from 'gsap';
import { TEMAS } from '../gameplay/cases.js';
import { audio } from '../audio/AudioEngine.js';
// El patrón de apertura/cierre nació aquí y vive ahora en `ui/Paneles.js`, que
// lo comparte con los HUD de los niveles 2 y 3. Toda la explicación de por qué
// hace falta `clearProps`, respaldo por temporizador y protección contra la
// reapertura está documentada allí.
import { abrirPanel, cerrarPanel, cascada } from './Paneles.js';

/**
 * HUD — la capa diegética: papelería, monitores, sellos.
 * Es solo vista: recibe datos y callbacks; la lógica vive en main.js y gameplay/.
 * Regla del Bucle (7): durante el turno, cero interrupciones de UI.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="topbar">
        <span id="tb-turno"></span>
        <span id="tb-alerta" class="alerta"></span>
        <span class="tb-derecha">
          <span id="tb-rep" class="rep"></span>
          <button id="btn-voz" title="Narración por voz">🔊</button>
        </span>
      </div>
      <div id="ficha" class="panel oculto"></div>
      <div id="expediente" class="panel">
        <h3>EXPEDIENTE</h3>
        <div id="expediente-lista"><div class="vacio">Sin señales registradas.</div></div>
      </div>
      <div id="dialogo" class="dialogo"><div class="hablante"></div><div class="texto"></div></div>
      <div id="interrogatorio" class="panel oculto"></div>
      <div id="documentos" class="panel oculto"></div>
      <div id="xray-label" class="oculto"></div>
      <div id="xray-controls" class="panel oculto"></div>
      <div id="corporal" class="panel oculto"></div>
      <div id="decision" class="panel oculto"></div>
      <div id="dock" class="dock oculto"></div>
      <div id="consecuencia">
        <div class="barra top"></div><div class="barra bottom"></div>
        <div class="texto"></div>
        <button class="continuar oculto">CONTINUAR</button>
      </div>
      <div id="hoja" class="sheet oculto"></div>
      <div id="toast" class="toast"></div>
    `;
    this.$ = (id) => root.querySelector(`#${id}`);
    this.typeTimer = null;
  }

  // ── Barra superior ──────────────────────────────────────────────────
  setTopbar({ turno, pasajero, total, franja, alerta }) {
    this.$('tb-turno').textContent = `TURNO ${String(turno).padStart(3, '0')}${pasajero ? ` · PASAJERO ${pasajero}/${total}` : ''}`;
    this.$('tb-alerta').textContent = alerta ?? '';
    this.$('tb-rep').textContent = `REPUTACIÓN: ${franja}`;
  }

  // ── Briefing / Hoja de servicio ─────────────────────────────────────
  showBriefing(turno, briefing, onStart) {
    const hoja = this.$('hoja');
    hoja.innerHTML = `
      <h2>ORDEN DE SERVICIO · TURNO ${String(turno).padStart(3, '0')}</h2>
      <p class="brief-body">${briefing}</p>
      <p class="brief-body" style="margin-top:12px">Cuatro pasajeros en cola. La fila no espera.</p>
      <button class="firma">ATENDER AL PRIMER PASAJERO</button>
    `;
    abrirPanel(hoja, { y: 26, scale: 0.9, duration: 0.55 });
    hoja.querySelector('button').onclick = () => {
      audio.clic('firme');
      cerrarPanel(hoja, { sfx: true });
      onStart();
    };
  }

  showSummary({ resultados, aciertos, total, franja, noticia, abusos }, onSign) {
    const filas = resultados.map((r) => `
      <div class="fila-resultado">
        <b>${r.caso.titulo}</b> — sello: ${r.decision}
        <span class="calidad ${r.calidad}">[${r.calidad.toUpperCase()}]</span>
        ${['fallo', 'parcial'].includes(r.calidad) && r.señalesPerdidas.length
          ? `<div class="perdida">La señal estaba ahí: «${r.señalesPerdidas[0]}»</div>` : ''}
      </div>`).join('');
    const hoja = this.$('hoja');
    hoja.innerHTML = `
      <h2>HOJA DE SERVICIO</h2>
      ${filas}
      <div class="fila-resultado"><b>Balance:</b> ${aciertos}/${total} decisiones sostenibles
        ${abusos ? ` · <span class="calidad fallo">${abusos} exceso(s) sin indicios</span>` : ''}</div>
      <div class="noticia"><b>NOTICIERO —</b> ${noticia}</div>
      <div class="fila-resultado"><b>Reputación:</b> ${franja}</div>
      <button class="firma">FIRMAR Y CONTINUAR</button>
    `;
    abrirPanel(hoja, { y: 26, scale: 0.9, duration: 0.55 });
    hoja.querySelector('button').onclick = () => {
      audio.clic('firme');
      cerrarPanel(hoja, { sfx: true });
      onSign();
    };
  }

  // ── Ficha del pasajero ──────────────────────────────────────────────
  showFicha(caso) {
    const f = this.$('ficha');
    f.innerHTML = `
      <h3>LLEGADA · ${caso.id}</h3>
      <div class="nombre">${caso.perfil.nombre}, ${caso.perfil.edad}</div>
      <div class="meta">${caso.perfil.origen}</div>
      <div class="obs">${caso.perfil.presentacion}</div>
    `;
    // Entra desde la izquierda, como una ficha que deslizan sobre el mostrador.
    abrirPanel(f, { y: 0, scale: 0.94, duration: 0.5, sfx: false });
  }

  hideFicha() { cerrarPanel(this.$('ficha')); }

  // ── Diálogo con máquina de escribir ─────────────────────────────────
  dialog(hablante, texto, cps = 45) {
    const d = this.$('dialogo');
    clearInterval(this.typeTimer);
    d.classList.add('visible');
    d.querySelector('.hablante').textContent = hablante.toUpperCase();
    const target = d.querySelector('.texto');
    target.textContent = '';
    let i = 0;
    this.typeTimer = setInterval(() => {
      target.textContent = texto.slice(0, ++i);
      if (i >= texto.length) clearInterval(this.typeTimer);
    }, 1000 / cps);
  }

  hideDialog() {
    clearInterval(this.typeTimer);
    this.$('dialogo').classList.remove('visible');
  }

  // ── Dock de herramientas ────────────────────────────────────────────
  showDock(botones) {
    const dock = this.$('dock');
    dock.innerHTML = '';
    for (const b of botones) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.cls) el.className = b.cls;
      // `id` estable e independiente del rótulo: Justus lo usa para SEÑALAR el
      // botón del que está hablando (`[data-tool="xray"]`) sin depender del texto.
      if (b.id) el.dataset.tool = b.id;
      el.disabled = !!b.disabled;
      el.onclick = (ev) => { audio.clic(b.cls === 'primary' ? 'firme' : 'suave'); b.onClick(ev); };
      dock.appendChild(el);
    }
    abrirPanel(dock, { y: 22, scale: 1, duration: 0.4, sfx: false });
  }

  hideDock() { cerrarPanel(this.$('dock'), { y: 18 }); }

  // ── Interrogatorio: la LIBRETA del oficial ──────────────────────────
  // Nada de cajones grises: una libreta de papel con preguntas anotadas a mano
  // y cuatro tácticas con icono. Y el recordatorio clave: al pasajero se le
  // puede TOCAR — sus ojos, manos y garganta son botones.
  showInterrogation({ agotado, quebrado, evidencias }, on) {
    const p = this.$('interrogatorio');
    const off = agotado || quebrado ? 'disabled' : '';
    const temas = TEMAS.map((t) =>
      `<button class="tema" data-tema="${t.id}" ${off}>· ¿${t.label}?</button>`).join('');
    const conf = evidencias.length
      ? `<button class="tactica confrontar" data-t="confrontar" ${off} title="Confrontar con la evidencia del expediente">📎<span>CONFRONTAR (${evidencias.length})</span></button>`
      : '';
    p.innerHTML = `
      <div class="libreta-titulo">LIBRETA DEL OFICIAL${agotado ? ' — sin más preguntas: la fila aprieta' : ''}</div>
      <div class="temas">${temas}</div>
      <div class="tacticas">
        <button class="tactica" data-t="presionar" ${off} title="Subir la presión"><b>⚡</b><span>PRESIONAR</span></button>
        <button class="tactica" data-t="calmar" ${off} title="Bajar la tensión y diagnosticar"><b>🕊</b><span>CALMAR</span></button>
        <button class="tactica" data-t="silencio" ${off} title="Sostener la mirada y esperar"><b>…</b><span>SILENCIO</span></button>
        ${conf}
      </div>
      <div class="libreta-pista">👁 Toca al pasajero — ojos · garganta · manos · postura — cuando su cuerpo hable.</div>
      <div id="tell-slot"></div>
      <button class="volver" data-t="cerrar">◂ VOLVER AL PUESTO</button>
    `;
    abrirPanel(p, { y: 20, scale: 0.96, duration: 0.46 });
    p.querySelectorAll('button.tema').forEach((b) => {
      b.onclick = () => { audio.clic(); on.preguntar(b.dataset.tema); };
    });
    p.querySelectorAll('button.tactica').forEach((b) => {
      b.onclick = () => { audio.clic('firme'); on[b.dataset.t](); };
    });
    p.querySelector('[data-t="cerrar"]').onclick = () => { audio.clic(); on.cerrar(); };
  }

  hideInterrogation() { cerrarPanel(this.$('interrogatorio')); }

  /** Chip de tell registrable: aparece cuando el cuerpo "habló" y el jugador puede anotarlo. */
  showTellChip(texto, onClick) {
    const slot = this.$('interrogatorio').querySelector('#tell-slot');
    if (!slot || slot.querySelector('.chip-tell')) return;
    const chip = document.createElement('span');
    chip.className = 'chip-tell';
    chip.textContent = `✎ ANOTAR EN EXPEDIENTE: ${texto}`;
    chip.onclick = () => { audio.clic('firme'); chip.remove(); onClick(); };
    slot.appendChild(chip);
    gsap.from(chip, { opacity: 0, scale: 0.7, duration: 0.42, ease: 'back.out(2.4)',
      onComplete: () => gsap.set(chip, { clearProps: 'transform,opacity' }) });
  }

  // ── Documentos ──────────────────────────────────────────────────────
  showDocuments(caso, onSeñal) {
    const p = this.$('documentos');
    p.innerHTML = caso.documentos.map((doc) => `
      <div class="doc" data-doc="${doc.id}">
        <h4>${doc.titulo}</h4>
        ${doc.lineas.map((l, i) =>
          `<div class="linea ${l.señal ? 'señalable' : ''}" data-i="${i}">${l.texto}</div>`).join('')}
      </div>`).join('');
    abrirPanel(p, { y: 24, scale: 0.94, duration: 0.5 });
    // Las fichas caen escalonadas, como papeles que alguien deja de uno en uno.
    cascada(p.querySelectorAll('.doc'), { y: 26, duration: 0.42, stagger: 0.09 });
    p.querySelectorAll('.doc').forEach((docEl) => {
      const doc = caso.documentos.find((d) => d.id === docEl.dataset.doc);
      docEl.querySelectorAll('.linea.señalable').forEach((lin) => {
        lin.onclick = () => {
          if (lin.classList.contains('registrada')) return;
          lin.classList.add('registrada');
          onSeñal(doc.lineas[Number(lin.dataset.i)].señal);
        };
      });
    });
  }

  hideDocuments() { cerrarPanel(this.$('documentos')); }

  // ── Rayos X ─────────────────────────────────────────────────────────
  showXray(on) {
    const c = this.$('xray-controls');
    c.innerHTML = `
      <button data-m="0">CONTRASTE NORMAL</button>
      <button data-m="1">REALZAR ORGÁNICO</button>
      <button data-m="2">REALZAR INORGÁNICO</button>
      <button data-m="salir" class="primary">APAGAR ESCÁNER</button>
    `;
    abrirPanel(c, { y: 20, scale: 0.96, duration: 0.42 });
    c.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        audio.clic(b.dataset.m === 'salir' ? 'firme' : 'suave');
        return b.dataset.m === 'salir' ? on.salir() : on.contraste(Number(b.dataset.m));
      };
    });
    this.xrayLabel('Arrastra la maleta · rueda = zoom · toca una silueta para marcarla');
  }

  xrayLabel(texto) {
    const l = this.$('xray-label');
    const nuevo = l.classList.contains('oculto');
    l.classList.remove('oculto');
    l.textContent = texto;
    // El rótulo cambia mucho durante el escaneo: solo late al aparecer o al
    // cambiar de texto, nunca un rebote completo que distraiga de la silueta.
    gsap.fromTo(l, { opacity: nuevo ? 0 : 0.35, scale: nuevo ? 0.94 : 1 },
      { opacity: 1, scale: 1, duration: nuevo ? 0.4 : 0.22, ease: 'back.out(1.6)', overwrite: 'auto',
        onComplete: () => gsap.set(l, { clearProps: 'transform,opacity' }) });
  }

  hideXray() {
    cerrarPanel(this.$('xray-controls'));
    cerrarPanel(this.$('xray-label'), { duration: 0.16 });
  }

  // ── Escáner corporal (siluetas, Visión §28.2) ───────────────────────
  showCorporal(onMark, onClose) {
    const p = this.$('corporal');
    p.innerHTML = `
      <h3>ESCÁNER CORPORAL · PROTOCOLO</h3>
      <svg viewBox="0 0 100 220">
        <path d="M50 10 a12 12 0 1 0 0.1 0 M38 40 h24 l6 55 h-8 l-4 100 h-8 l-2 -60 l-2 60 h-8 l-4 -100 h-8 z"
          fill="#27374a" stroke="#4a6a8a" stroke-width="1.5"/>
        <ellipse class="zona-anomala" cx="50" cy="88" rx="11" ry="14" fill="rgba(208,138,29,0.55)"/>
      </svg>
      <p style="font-size:11px;color:#8a95a3;letter-spacing:1px">Representación por siluetas. Toca la anomalía.</p>
      <button style="margin-top:10px">CERRAR</button>
    `;
    abrirPanel(p, { y: 18, scale: 0.9, duration: 0.5 });
    p.querySelector('.zona-anomala').addEventListener('click', () => {
      p.querySelector('.zona-anomala').style.fill = 'rgba(194,43,43,0.8)';
      audio.clic('firme');
      onMark();
    }, { once: true });
    p.querySelector('button').onclick = () => { audio.clic(); cerrarPanel(p, { sfx: true }); onClose(); };
  }

  // ── Decisión ────────────────────────────────────────────────────────
  showDecision(expedienteCount, onDecide) {
    const p = this.$('decision');
    p.innerHTML = `
      <div class="sellos">
        ${['PASE', 'COBRO', 'RETENIDO', 'DERIVADO'].map((s) => `<button class="${s}">${s}</button>`).join('')}
      </div>
      <div class="aviso">${expedienteCount === -1
        ? 'FLAGRANCIA registrada: el expediente se sostiene solo.'
        : expedienteCount === 0
          ? 'Expediente vacío: será una corazonada.'
          : `${expedienteCount} señal(es) en el expediente.`} El sello es irreversible.</div>
    `;
    abrirPanel(p, { y: 22, scale: 0.93, duration: 0.5 });
    // Los cuatro sellos entran en abanico: el gesto irreversible se presenta.
    cascada(p.querySelectorAll('.sellos button'), { y: 18, duration: 0.34, stagger: 0.06 });
    p.querySelectorAll('.sellos button').forEach((b) => {
      b.onclick = () => { audio.clic('firme'); cerrarPanel(p, { duration: 0.16 }); onDecide(b.textContent); };
    });
  }

  hideDecision() { cerrarPanel(this.$('decision')); }

  // ── Expediente ──────────────────────────────────────────────────────
  addSeñal(texto) {
    const lista = this.$('expediente-lista');
    lista.querySelector('.vacio')?.remove();
    const el = document.createElement('div');
    el.className = 'señal';
    el.textContent = texto;
    lista.appendChild(el);
    // Una prueba entrando al expediente merece que el panel entero acuse el golpe.
    gsap.fromTo(this.$('expediente'), { scale: 1.035 },
      { scale: 1, duration: 0.42, ease: 'elastic.out(1, 0.5)', overwrite: 'auto',
        onComplete: () => gsap.set(this.$('expediente'), { clearProps: 'transform' }) });
  }

  clearSeñales() {
    this.$('expediente-lista').innerHTML = '<div class="vacio">Sin señales registradas.</div>';
  }

  // ── Consecuencia (letterbox) ────────────────────────────────────────
  showConsequence(texto, onContinue) {
    const c = this.$('consecuencia');
    c.classList.add('activa');
    c.querySelector('.texto').textContent = texto;
    const btn = c.querySelector('.continuar');
    btn.classList.remove('oculto');
    btn.onclick = () => {
      audio.clic('firme');
      c.classList.remove('activa');
      btn.classList.add('oculto');
      onContinue();
    };
  }

  // ── Toast ───────────────────────────────────────────────────────────
  toast(texto, { alerta = false, dur = 3200 } = {}) {
    const t = this.$('toast');
    t.textContent = texto;
    t.classList.toggle('alerta', alerta);
    t.classList.add('visible');
    gsap.fromTo(t, { y: -14, scale: 0.94 },
      { y: 0, scale: 1, duration: 0.44, ease: 'back.out(1.8)', overwrite: 'auto',
        onComplete: () => gsap.set(t, { clearProps: 'transform' }) });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('visible'), dur);
  }

  /** Oculta todos los paneles de herramienta (cambio de contexto limpio). */
  hideTools() {
    this.hideInterrogation();
    this.hideDocuments();
    this.hideXray();
    this.hideDecision();
    cerrarPanel(this.$('corporal'));
  }
}
