import { TEMAS } from '../gameplay/cases.js';

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
    hoja.classList.remove('oculto');
    hoja.innerHTML = `
      <h2>ORDEN DE SERVICIO · TURNO ${String(turno).padStart(3, '0')}</h2>
      <p class="brief-body">${briefing}</p>
      <p class="brief-body" style="margin-top:12px">Cuatro pasajeros en cola. La fila no espera.</p>
      <button class="firma">ATENDER AL PRIMER PASAJERO</button>
    `;
    hoja.querySelector('button').onclick = () => {
      hoja.classList.add('oculto');
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
    hoja.classList.remove('oculto');
    hoja.innerHTML = `
      <h2>HOJA DE SERVICIO</h2>
      ${filas}
      <div class="fila-resultado"><b>Balance:</b> ${aciertos}/${total} decisiones sostenibles
        ${abusos ? ` · <span class="calidad fallo">${abusos} exceso(s) sin indicios</span>` : ''}</div>
      <div class="noticia"><b>NOTICIERO —</b> ${noticia}</div>
      <div class="fila-resultado"><b>Reputación:</b> ${franja}</div>
      <button class="firma">FIRMAR Y CONTINUAR</button>
    `;
    hoja.querySelector('button').onclick = () => {
      hoja.classList.add('oculto');
      onSign();
    };
  }

  // ── Ficha del pasajero ──────────────────────────────────────────────
  showFicha(caso) {
    const f = this.$('ficha');
    f.classList.remove('oculto');
    f.innerHTML = `
      <h3>LLEGADA · ${caso.id}</h3>
      <div class="nombre">${caso.perfil.nombre}, ${caso.perfil.edad}</div>
      <div class="meta">${caso.perfil.origen}</div>
      <div class="obs">${caso.perfil.presentacion}</div>
    `;
  }

  hideFicha() { this.$('ficha').classList.add('oculto'); }

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
    dock.classList.remove('oculto');
    dock.innerHTML = '';
    for (const b of botones) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.cls) el.className = b.cls;
      el.disabled = !!b.disabled;
      el.onclick = b.onClick;
      dock.appendChild(el);
    }
  }

  hideDock() { this.$('dock').classList.add('oculto'); }

  // ── Interrogatorio: la LIBRETA del oficial ──────────────────────────
  // Nada de cajones grises: una libreta de papel con preguntas anotadas a mano
  // y cuatro tácticas con icono. Y el recordatorio clave: al pasajero se le
  // puede TOCAR — sus ojos, manos y garganta son botones.
  showInterrogation({ agotado, quebrado, evidencias }, on) {
    const p = this.$('interrogatorio');
    p.classList.remove('oculto');
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
    p.querySelectorAll('button.tema').forEach((b) => { b.onclick = () => on.preguntar(b.dataset.tema); });
    p.querySelectorAll('button.tactica').forEach((b) => { b.onclick = () => on[b.dataset.t](); });
    p.querySelector('[data-t="cerrar"]').onclick = on.cerrar;
  }

  hideInterrogation() { this.$('interrogatorio').classList.add('oculto'); }

  /** Chip de tell registrable: aparece cuando el cuerpo "habló" y el jugador puede anotarlo. */
  showTellChip(texto, onClick) {
    const slot = this.$('interrogatorio').querySelector('#tell-slot');
    if (!slot || slot.querySelector('.chip-tell')) return;
    const chip = document.createElement('span');
    chip.className = 'chip-tell';
    chip.textContent = `✎ ANOTAR EN EXPEDIENTE: ${texto}`;
    chip.onclick = () => { chip.remove(); onClick(); };
    slot.appendChild(chip);
  }

  // ── Documentos ──────────────────────────────────────────────────────
  showDocuments(caso, onSeñal) {
    const p = this.$('documentos');
    p.classList.remove('oculto');
    p.innerHTML = caso.documentos.map((doc) => `
      <div class="doc" data-doc="${doc.id}">
        <h4>${doc.titulo}</h4>
        ${doc.lineas.map((l, i) =>
          `<div class="linea ${l.señal ? 'señalable' : ''}" data-i="${i}">${l.texto}</div>`).join('')}
      </div>`).join('');
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

  hideDocuments() { this.$('documentos').classList.add('oculto'); }

  // ── Rayos X ─────────────────────────────────────────────────────────
  showXray(on) {
    const c = this.$('xray-controls');
    c.classList.remove('oculto');
    c.innerHTML = `
      <button data-m="0">CONTRASTE NORMAL</button>
      <button data-m="1">REALZAR ORGÁNICO</button>
      <button data-m="2">REALZAR INORGÁNICO</button>
      <button data-m="salir" class="primary">APAGAR ESCÁNER</button>
    `;
    c.querySelectorAll('button').forEach((b) => {
      b.onclick = () => (b.dataset.m === 'salir' ? on.salir() : on.contraste(Number(b.dataset.m)));
    });
    this.xrayLabel('Arrastra la maleta · rueda = zoom · toca una silueta para marcarla');
  }

  xrayLabel(texto) {
    const l = this.$('xray-label');
    l.classList.remove('oculto');
    l.textContent = texto;
  }

  hideXray() {
    this.$('xray-controls').classList.add('oculto');
    this.$('xray-label').classList.add('oculto');
  }

  // ── Escáner corporal (siluetas, Visión §28.2) ───────────────────────
  showCorporal(onMark, onClose) {
    const p = this.$('corporal');
    p.classList.remove('oculto');
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
    p.querySelector('.zona-anomala').addEventListener('click', () => {
      p.querySelector('.zona-anomala').style.fill = 'rgba(194,43,43,0.8)';
      onMark();
    }, { once: true });
    p.querySelector('button').onclick = () => { p.classList.add('oculto'); onClose(); };
  }

  // ── Decisión ────────────────────────────────────────────────────────
  showDecision(expedienteCount, onDecide) {
    const p = this.$('decision');
    p.classList.remove('oculto');
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
    p.querySelectorAll('.sellos button').forEach((b) => {
      b.onclick = () => { p.classList.add('oculto'); onDecide(b.textContent); };
    });
  }

  hideDecision() { this.$('decision').classList.add('oculto'); }

  // ── Expediente ──────────────────────────────────────────────────────
  addSeñal(texto) {
    const lista = this.$('expediente-lista');
    lista.querySelector('.vacio')?.remove();
    const el = document.createElement('div');
    el.className = 'señal';
    el.textContent = texto;
    lista.appendChild(el);
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
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('visible'), dur);
  }

  /** Oculta todos los paneles de herramienta (cambio de contexto limpio). */
  hideTools() {
    this.hideInterrogation();
    this.hideDocuments();
    this.hideXray();
    this.hideDecision();
    this.$('corporal').classList.add('oculto');
  }
}
