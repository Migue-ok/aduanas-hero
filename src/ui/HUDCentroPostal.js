import gsap from 'gsap';
import { isTouch } from '../core/Device.js';
import { audio } from '../audio/AudioEngine.js';
import { abrirHidden, cerrarHidden, abrirVelo, cerrarVelo, cascada } from './Paneles.js';
import { punch } from '../core/Juice.js';
import { compacto } from './estilos.js';
import {
  HERRAMIENTAS, CODICE, EXPEDIENTES, evaluarActa, requisitosActa, consecuenciaActa,
} from '../gameplay/encomiendas.js';

/**
 * HUDCentroPostal — toda la interfaz del Nivel 4 (ADR-013).
 *
 * Se monta con una línea y se auto-inyecta el CSS, igual que `HUDCanalRojo` y
 * `HUDDirandro`. La escena no toca un solo nodo del DOM: le habla a este objeto.
 *
 * ── Las piezas, y por qué están donde están ────────────────────────────────
 *
 *  · **Integridad** (arriba izquierda) — sustituye a los corazones del vídeo de
 *    referencia. Va a la izquierda porque el marcador de puntos (ADR-012) ya
 *    ocupa la derecha, y las dos cifras que suben y bajan no pueden compartir
 *    rincón: el ojo necesita saber cuál acaba de moverse.
 *  · **Cronómetro y oleada** (arriba centro) — bajo el botón de pausa.
 *  · **Columna de accesos** (derecha) — Casos y Códice, como en el vídeo.
 *  · **Hotbar** (abajo centro) — las cuatro herramientas.
 *  · **Marcas flotantes** — chips anclados a cada paquete, proyectados desde el
 *    mundo 3D. Son EL canal por el que el jugador lee un síntoma, así que no
 *    pueden vivir en un panel lateral: tienen que estar sobre la caja.
 *
 * ── Nota sobre la hotbar en táctil ─────────────────────────────────────────
 * En móvil la hotbar NO es pulsable: quien cambia de herramienta es el mando
 * virtual (`TouchControls` con `Digit1`–`Digit4`). Tener dos zonas táctiles
 * para lo mismo, una de ellas de 40 px en el borde inferior, es una invitación
 * a fallar el toque en el peor momento. Aquí queda como indicador de estado.
 */
export class HUDCentroPostal {
  constructor({
    onSalir = () => {}, onHerramienta = () => {}, onIniciar = () => {},
    onActa = () => {}, onCerrarPeritaje = () => {}, onReiniciar = () => {},
    onNarrar = () => {},
  } = {}) {
    this.cb = { onSalir, onHerramienta, onIniciar, onActa, onCerrarPeritaje, onReiniciar, onNarrar };
    this.marcasVivas = new Map();     // id de paquete → nodo
    this.codiceVisto = new Set(['inicio']);
    this.expedientesVistos = new Set();
    this.notas = [];                  // pistas del turno para el Diario
    this._timers = [];
  }

  mount(root = document.body) {
    HUDCentroPostal.#inyectarCSS();
    const el = document.createElement('div');
    el.id = 'cp-hud';
    el.innerHTML = `
      <div class="cp-integridad">
        <div class="cp-int-cab"><span>INTEGRIDAD DEL TURNO</span><b class="cp-int-num">100</b></div>
        <div class="cp-int-barra"><i></i></div>
        <div class="cp-int-pie">Baja solo por errores de lectura</div>
      </div>

      <div class="cp-oleada">
        <div class="cp-ol-tag">OLEADA <b class="cp-ol-n">1/3</b></div>
        <div class="cp-ol-nombre">—</div>
        <div class="cp-ol-crono"><i></i></div>
        <div class="cp-ol-datos"><span class="cp-ol-rest">—</span><span class="cp-ol-t">—</span></div>
      </div>

      <div class="cp-accesos">
        <button class="cp-acc" data-panel="casos" title="Casos del turno (M)"><span>🗒</span><em>CASOS</em></button>
        <button class="cp-acc" data-panel="codice" title="Códice (C)"><span>📖</span><em>CÓDICE</em></button>
        <button class="cp-acc cp-acc-salir" title="Volver al menú"><span>◄</span><em>MENÚ</em></button>
      </div>

      <div class="cp-marcas"></div>

      <div class="cp-ficha hidden"></div>
      <div class="cp-aviso hidden"></div>

      <div class="cp-tip"></div>
      <div class="cp-hotbar"></div>

      <div class="cp-panel hidden">
        <div class="cp-panel-card g-panel"></div>
      </div>

      <div class="cp-peritaje hidden">
        <div class="cp-per-card g-panel">
          <div class="cp-per-tag">MESA DE PERITAJE</div>
          <h2>ARMA EL ACTA DE DECOMISO</h2>
          <p class="cp-per-que">Un <b>acta de decomiso</b> es el papel con el que la aduana se queda
            la mercancía. Si no se sostiene, el envío se devuelve.</p>

          <div class="cp-per-tag2">1 · LO QUE TIENE QUE CUMPLIR</div>
          <div class="cp-per-check"></div>

          <div class="cp-per-tag2">2 · TOCA UNA PRUEBA PARA PONERLA EN EL ACTA</div>
          <div class="cp-per-piezas"></div>

          <div class="cp-per-tag2">3 · EL ACTA</div>
          <div class="cp-per-mesa">
            <div class="cp-per-huecos"></div>
            <div class="cp-per-veredicto"></div>
          </div>

          <div class="cp-per-acciones">
            <button class="g-btn cp-per-firmar g-btn--primary">✒ FIRMAR ACTA</button>
            <button class="g-btn cp-per-saltar">SEGUIR SIN ACTA</button>
          </div>
        </div>
      </div>

      <div class="cp-fallo hidden"><div class="cp-fallo-card g-panel"></div></div>

      <div class="cp-velo hidden"><div class="cp-velo-card g-panel"></div></div>`;
    root.appendChild(el);
    this.el = el;

    this.$int = el.querySelector('.cp-int-barra i');
    this.$intNum = el.querySelector('.cp-int-num');
    this.$olN = el.querySelector('.cp-ol-n');
    this.$olNombre = el.querySelector('.cp-ol-nombre');
    this.$olCrono = el.querySelector('.cp-ol-crono i');
    this.$olRest = el.querySelector('.cp-ol-rest');
    this.$olT = el.querySelector('.cp-ol-t');
    this.$marcas = el.querySelector('.cp-marcas');
    this.$ficha = el.querySelector('.cp-ficha');
    this.$aviso = el.querySelector('.cp-aviso');
    this.$hotbar = el.querySelector('.cp-hotbar');
    this.$tip = el.querySelector('.cp-tip');
    this.$panel = el.querySelector('.cp-panel');
    this.$panelCard = el.querySelector('.cp-panel-card');
    this.$peritaje = el.querySelector('.cp-peritaje');
    this.$velo = el.querySelector('.cp-velo');
    this.$veloCard = el.querySelector('.cp-velo-card');
    this.$fallo = el.querySelector('.cp-fallo');
    this.$falloCard = el.querySelector('.cp-fallo-card');

    this.#construirHotbar();

    el.querySelectorAll('.cp-acc[data-panel]').forEach((b) => {
      b.addEventListener('click', () => {
        audio.clic();
        this.togglePanel(b.dataset.panel);
      });
    });
    el.querySelector('.cp-acc-salir').addEventListener('click', () => this.cb.onSalir());
    el.querySelector('.cp-per-firmar').addEventListener('click', () => this.#firmarActa());
    el.querySelector('.cp-per-saltar').addEventListener('click', () => this.#cerrarPeritaje(null));
    return this;
  }

  // ── Hotbar ────────────────────────────────────────────────────────────────
  #construirHotbar() {
    // La FAMILIA va impresa en el slot, bajo el nombre. Es la traducción que
    // convierte «¿cuál de las cuatro?» en «¿de qué habla el síntoma?».
    this.$hotbar.innerHTML = HERRAMIENTAS.map((h, i) => `
      <button class="cp-slot" data-i="${i}" ${isTouch ? 'tabindex="-1"' : ''}>
        <span class="cp-slot-n">${i + 1}</span>
        <span class="cp-slot-ico" style="color:${h.css}">${h.icono}</span>
        <span class="cp-slot-name">${h.nombre}</span>
        <span class="cp-slot-fam">${h.familia}</span>
      </button>`).join('');
    if (!isTouch) {
      this.$hotbar.querySelectorAll('.cp-slot').forEach((b) => {
        b.addEventListener('click', () => this.cb.onHerramienta(Number(b.dataset.i)));
      });
    } else {
      // En táctil la hotbar SOBRA: las cuatro herramientas ya están, con su
      // familia debajo, en los botones del mando que sí se pulsan. Tenerlas
      // además arriba a la izquierda obligaba a mirar a un sitio para entender
      // y tocar en otro, y ocupaba la columna que el notch ya estrecha.
      this.$hotbar.classList.add('cp-hotbar--indicador', 'cp-hotbar--oculta');
    }
    this.setHerramienta(0);
  }

  setHerramienta(i) {
    this.$hotbar.querySelectorAll('.cp-slot').forEach((b, k) => {
      b.classList.toggle('on', k === i);
      if (k === i) {
        b.style.setProperty('--tono', HERRAMIENTAS[k].css);
        punch(b, { escala: 1.16, duration: 0.3 });
      }
    });
    // Rótulo sobre la hotbar: recuerda QUÉ lee la herramienta que acabas de
    // empuñar. Cuesta nada y evita el «pruebo las cuatro a ver cuál suena».
    const h = HERRAMIENTAS[i];
    this.$tip.innerHTML = `<i style="color:${h.css}">${h.icono}</i>
      <b style="color:${h.css}">${h.nombre}</b><span>lee <em>${h.familia}</em></span>`;
    this.$tip.classList.add('on');
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => this.$tip.classList.remove('on'), 2400);
  }

  /** Cuenta atrás del pulso: la hotbar se apaga mientras el escáner recarga. */
  setRecarga(frac) {
    this.$hotbar.style.setProperty('--recarga', `${Math.round((1 - frac) * 100)}%`);
  }

  // ── Estado del turno ──────────────────────────────────────────────────────
  setIntegridad(v) {
    const pc = Math.max(0, Math.min(100, v));
    this.$int.style.width = `${pc}%`;
    this.$intNum.textContent = Math.round(pc);
    const barra = this.$int.parentElement;
    barra.classList.toggle('critica', pc <= 30);
    barra.classList.toggle('media', pc > 30 && pc <= 60);
    if (pc <= 30) punch(this.$intNum, { escala: 1.25 });
  }

  setOleada({ indice, total, nombre, restantes, tiempo, duracion }) {
    this.$olN.textContent = `${indice + 1}/${total}`;
    this.$olNombre.textContent = nombre;
    this.$olRest.innerHTML = restantes > 0
      ? `<b>${restantes}</b> con señal en la cinta`
      : 'sin señales pendientes';
    const seg = Math.max(0, Math.ceil(tiempo));
    this.$olT.textContent = `${String(Math.floor(seg / 60))}:${String(seg % 60).padStart(2, '0')}`;
    const frac = duracion > 0 ? Math.max(0, tiempo / duracion) : 0;
    this.$olCrono.style.width = `${frac * 100}%`;
    this.$olCrono.parentElement.classList.toggle('urgente', frac < 0.22);
  }

  // ── Marcas flotantes sobre los paquetes ───────────────────────────────────
  /**
   * @param {Array} lista  `{ id, x, y, texto, icono, tono, objetivo, oculto }`
   *   en coordenadas de PANTALLA (la escena ya proyectó).
   *
   * Reutiliza los nodos por id en vez de reconstruir la capa: con hasta diez
   * paquetes vivos y 60 fotogramas por segundo, recrear el HTML sería crear y
   * tirar 600 nodos por segundo — y perdería la transición CSS que hace que un
   * chip aparezca en vez de parpadear.
   */
  marcas(lista) {
    const vistos = new Set();
    for (const m of lista) {
      vistos.add(m.id);
      let nodo = this.marcasVivas.get(m.id);
      if (!nodo) {
        nodo = document.createElement('div');
        nodo.className = 'cp-marca';
        nodo.innerHTML = '<i></i><span></span>';
        this.$marcas.appendChild(nodo);
        this.marcasVivas.set(m.id, nodo);
        gsap.fromTo(nodo, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'back.out(2)' });
      }
      if (nodo.dataset.txt !== m.texto) {
        nodo.dataset.txt = m.texto;
        nodo.querySelector('span').textContent = m.texto;
        nodo.querySelector('i').textContent = m.icono ?? '';
      }
      nodo.style.transform = `translate3d(${m.x}px, ${m.y}px, 0) translate(-50%, -100%)`;
      nodo.style.setProperty('--tono', m.tono ?? '#e0952a');
      nodo.classList.toggle('objetivo', !!m.objetivo);
      nodo.style.opacity = m.oculto ? '0' : '';
    }
    for (const [id, nodo] of this.marcasVivas) {
      if (vistos.has(id)) continue;
      this.marcasVivas.delete(id);
      gsap.to(nodo, { opacity: 0, scale: 0.8, duration: 0.18, onComplete: () => nodo.remove() });
    }
  }

  /**
   * Ficha del paquete apuntado: lo que el jugador lee ANTES de disparar.
   *
   * Solo se llama cuando CAMBIA el objetivo. La distancia, que sí varía a cada
   * fotograma, va por `setDistancia`: reconstruir este `innerHTML` sesenta veces
   * por segundo tiraría y recrearía media docena de nodos por frame y, de paso,
   * mataría la animación de entrada del panel en cada repintado.
   */
  setObjetivo(info) {
    if (!info) {
      this.$fiDist = null;
      cerrarHidden(this.$ficha, { y: 8, duration: 0.14 });
      return;
    }
    this.$ficha.innerHTML = `
      <div class="cp-fi-cab"><b>GUÍA ${info.guia}</b><i>${info.dist.toFixed(1)} m</i></div>
      <div class="cp-fi-row"><span>REMITENTE</span><b>${info.remitente}</b></div>
      <div class="cp-fi-row"><span>ORIGEN</span><b>${info.origen}</b></div>
      <div class="cp-fi-row"><span>DECLARA</span><b>${info.declarado}</b></div>
      <div class="cp-fi-row"><span>PESO DECL.</span><b>${info.pesoDeclarado.toFixed(1)} kg</b></div>
      ${info.sintoma
        ? `<div class="cp-fi-sint"><i>${info.sintoma.icono}</i><div>
             <b>${info.sintoma.etiqueta}</b><em>${info.sintoma.lectura}</em></div></div>`
        : '<div class="cp-fi-limpio">Sin señales visibles · nada que justifique un escaneo</div>'}`;
    this.$fiDist = this.$ficha.querySelector('.cp-fi-cab i');
    abrirHidden(this.$ficha, { y: 10, scale: 0.96, duration: 0.26, sfx: false });
  }

  /** Solo el número de metros. Barato de llamar cada fotograma. */
  setDistancia(d) {
    if (this.$fiDist) this.$fiDist.textContent = `${d.toFixed(1)} m`;
  }

  /** Aviso central efímero: el resultado de un pulso, en una línea. */
  aviso(texto, tipo = 'info') {
    this.$aviso.classList.remove('ok', 'mal', 'neutro', 'info');
    this.$aviso.classList.add(tipo);
    this.$aviso.innerHTML = texto;
    abrirHidden(this.$aviso, { y: 14, scale: 0.94, duration: 0.3, sfx: false });
    clearTimeout(this._avisoT);
    this._avisoT = setTimeout(() => cerrarHidden(this.$aviso), 2600);
  }

  // ── Diario de Casos y Códice ──────────────────────────────────────────────
  /** Apunta una pista en el Diario del turno. */
  anotar(texto, tono = '#c3cfdc') {
    this.notas.unshift({ texto, tono });
    if (this.notas.length > 14) this.notas.length = 14;
    if (this.panelAbierto === 'casos') this.#pintarPanel('casos');
  }

  /** Desbloquea fichas del Códice (`llave` = dominio de herramienta o expediente). */
  desbloquear(llave) {
    if (!llave || this.codiceVisto.has(llave)) return false;
    this.codiceVisto.add(llave);
    if (EXPEDIENTES[llave]) this.expedientesVistos.add(llave);
    const ficha = CODICE.find((c) => c.llave === llave);
    if (ficha) {
      this.aviso(`📖 CÓDICE · nueva ficha: <b>${ficha.termino}</b>`, 'info');
      const b = this.el.querySelector('.cp-acc[data-panel="codice"]');
      b.classList.add('nuevo');
      punch(b, { escala: 1.3 });
    }
    if (this.panelAbierto === 'codice') this.#pintarPanel('codice');
    return true;
  }

  /** Datos vivos que pinta el Diario. Los repone la escena en cada oleada. */
  setContextoCasos(ctx) {
    this.ctxCasos = ctx;
    if (this.panelAbierto === 'casos') this.#pintarPanel('casos');
  }

  togglePanel(cual) {
    if (this.panelAbierto === cual) { this.cerrarPanel(); return; }
    this.panelAbierto = cual;
    // Modo modal también aquí. Estaba solo en el peritaje y en el cierre, así
    // que con el Diario o el Códice abiertos seguían encendidos por detrás la
    // hotbar, la columna de accesos y las marcas flotantes de los paquetes:
    // dos interfaces completas discutiéndose la misma pantalla de 375 px.
    this.el.classList.add('cp-modal');
    this.#pintarPanel(cual);
    abrirVelo(this.$panel, { duration: 0.28 });
    gsap.fromTo(this.$panelCard, { opacity: 0, y: 24, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.6)',
        onComplete: () => gsap.set(this.$panelCard, { clearProps: 'transform,opacity' }) });
    if (cual === 'codice') this.el.querySelector('.cp-acc[data-panel="codice"]').classList.remove('nuevo');
  }

  cerrarPanel() {
    if (!this.panelAbierto) return;
    this.panelAbierto = null;
    this.el.classList.remove('cp-modal');
    cerrarVelo(this.$panel, { duration: 0.2 });
  }

  #pintarPanel(cual) {
    const cerrar = '<button class="cp-cerrar">✕</button>';
    if (cual === 'casos') {
      const c = this.ctxCasos ?? {};
      const hilos = [...this.expedientesVistos].map((id) => {
        const e = EXPEDIENTES[id];
        return `<div class="cp-hilo" style="--tono:${e.color}">
            <b>${e.nombre}</b><span>${e.resumen}</span></div>`;
      }).join('') || '<p class="cp-vacio">Aún no has tirado de ningún hilo.</p>';
      this.$panelCard.innerHTML = `
        ${cerrar}
        <div class="cp-p-tag">CASOS DEL TURNO</div>
        <h2 class="g-title">${c.nombre ?? 'CENTRO POSTAL'}</h2>
        <div class="cp-objetivos">
          <div class="cp-obj"><b>${c.restantes ?? 0}</b><span>paquetes con señal aún en la cinta</span></div>
          <div class="cp-obj"><b>${c.interceptados ?? 0}</b><span>encomiendas interceptadas</span></div>
          <div class="cp-obj"><b>${c.escapados ?? 0}</b><span>se fueron en el camión</span></div>
        </div>
        <div class="cp-p-tag2">EL HILO DE LA RED</div>
        <div class="cp-hilos">${hilos}</div>
        <div class="cp-p-tag2">BITÁCORA</div>
        <div class="cp-notas">${this.notas.length
          ? this.notas.map((n) => `<div class="cp-nota" style="--tono:${n.tono}">${n.texto}</div>`).join('')
          : '<p class="cp-vacio">Sin anotaciones todavía.</p>'}</div>`;
    } else {
      const grupos = {};
      for (const f of CODICE) {
        (grupos[f.grupo] ??= []).push(f);
      }
      // Las fichas BLOQUEADAS se cuentan, no se pintan.
      //
      // Antes cada una ocupaba su propio bloque con «▮▮▮▮▮▮▮▮» y la misma frase
      // repetida: el Códice abría con 1413 caracteres y casi tres pantallas de
      // arrastre, la mayoría relleno de cosas que el jugador no puede leer. Al
      // contarlas en una línea, lo que se ve es lo que se ha ganado —y el panel
      // CRECE conforme se juega, que es lo que hace que apetezca volver a abrirlo.
      let pendientes = 0;
      const cuerpo = Object.entries(grupos).map(([g, fichas]) => {
        const abiertas = fichas.filter((f) => this.codiceVisto.has(f.llave));
        pendientes += fichas.length - abiertas.length;
        if (!abiertas.length) return '';
        return `
        <div class="cp-cod-grupo">
          <div class="cp-p-tag2">${g}</div>
          ${abiertas.map((f) => {
    // DOS NIVELES: la definición y el desarrollo. Cada ficha era un párrafo de
    // tres o cuatro líneas y el Códice se leía como un examen. Se parte por la
    // primera oración —que es, en todas, la definición— y el resto se despliega
    // a quien le interese. No se pierde una palabra del contenido educativo:
    // se le da orden de lectura. `<details>` nativo: sin JS y accesible.
    const corte = f.texto.indexOf('. ');
    const hayDos = corte > 0 && corte < 150 && corte + 2 < f.texto.length;
    const def = hayDos ? f.texto.slice(0, corte + 1) : f.texto;
    const resto = hayDos ? f.texto.slice(corte + 2) : '';
    return resto
      ? `<details class="cp-cod">
             <summary><b>${f.termino}</b><span>${def}</span><i class="cp-cod-mas">más</i></summary>
             <p>${resto}</p>
           </details>`
      : `<div class="cp-cod"><b>${f.termino}</b><p>${def}</p></div>`;
  }).join('')}
        </div>`;
      }).join('');
      const pie = pendientes
        ? `<div class="cp-cod-pend">🔒 <b>${pendientes}</b> ficha${pendientes > 1 ? 's' : ''} por
             descubrir. Se abren solas al usarlas en la nave.</div>`
        : '<div class="cp-cod-pend cp-cod-pend--full">✔ Códice completo. Todas las fichas abiertas.</div>';
      this.$panelCard.innerHTML = `
        ${cerrar}
        <div class="cp-p-tag">CÓDICE ADUANERO</div>
        <h2 class="g-title">LO QUE APRENDES SE QUEDA</h2>
        <div class="cp-cods">${cuerpo || '<p class="cp-vacio">Aún no has abierto ninguna ficha.</p>'}</div>
        ${pie}`;
    }
    this.$panelCard.querySelector('.cp-cerrar').addEventListener('click', () => this.cerrarPanel());
    cascada(this.$panelCard.querySelectorAll('.cp-obj, .cp-cod, .cp-hilo, .cp-nota'),
      { y: 14, duration: 0.3, stagger: 0.03 });
  }

  // ── Briefing y cierre ─────────────────────────────────────────────────────
  abrirBriefing({ nombre, briefing, indice, total, primera }) {
    // El briefing es una hoja a pantalla completa y la oleada aún no ha
    // empezado: el HUD de juego de debajo no informa de nada y solo compite.
    this.el.classList.add('cp-modal');
    this.$veloCard.innerHTML = `
      <div class="cp-p-tag">CENTRO DE CLASIFICACIÓN POSTAL · LIMA</div>
      <h2 class="g-title">${nombre}</h2>
      <p class="cp-brief">${briefing}</p>
      ${primera ? `
        <div class="cp-regla-corta">Lee el cartel <b>⚠</b> del bulto y dispárale la herramienta
          que habla de eso mismo.</div>
        <div class="cp-p-tag2">TU CINTURÓN · CADA UNA LEE UNA COSA</div>
        <div class="cp-tools cp-tools--tira">
          ${HERRAMIENTAS.map((h) => `
            <div class="cp-tool" style="--tono:${h.css}">
              <i>${h.icono}</i><b>${h.nombre}</b><em>${h.familia}</em>
            </div>`).join('')}
        </div>` : ''}
      <div class="cp-ol-progreso">OLEADA ${indice + 1} DE ${total}</div>
      <button class="g-btn g-btn--primary cp-empezar">▶ ${primera ? 'ENTRAR EN SERVICIO' : 'ARRANCAR LA CINTA'}</button>`;
    abrirVelo(this.$velo, { duration: 0.4 });
    gsap.fromTo(this.$veloCard, { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)',
        onComplete: () => gsap.set(this.$veloCard, { clearProps: 'transform,opacity' }) });
    this.$veloCard.querySelector('.cp-empezar').addEventListener('click', () => {
      audio.clic('firme');
      this.el.classList.remove('cp-modal');
      cerrarVelo(this.$velo, { duration: 0.3 });
      this.cb.onIniciar();
    });
  }

  cerrarVeloAhora() {
    this.el.classList.remove('cp-modal');
    cerrarVelo(this.$velo, { duration: 0.2 });
  }

  /** Hoja de cierre del operativo. */
  abrirCierre({ titulo, texto, filas, balanceHTML, motivo }) {
    this.el.classList.add('cp-modal');
    this.$veloCard.innerHTML = `
      <div class="cp-p-tag">${motivo}</div>
      <h2 class="g-title">${titulo}</h2>
      <p class="cp-brief">${texto}</p>
      <div class="cp-resumen">
        ${filas.map((f) => `<div class="cp-res-fila ${f.tipo ?? ''}"><span>${f.k}</span><b>${f.v}</b></div>`).join('')}
      </div>
      ${balanceHTML ?? ''}
      <div class="cp-cierre-acciones">
        <button class="g-btn g-btn--primary cp-otra">↻ OTRO TURNO</button>
        <button class="g-btn cp-menu">◄ VOLVER AL MENÚ</button>
      </div>`;
    abrirVelo(this.$velo, { duration: 0.5 });
    gsap.fromTo(this.$veloCard, { opacity: 0, y: 34, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.4)',
        onComplete: () => gsap.set(this.$veloCard, { clearProps: 'transform,opacity' }) });
    cascada(this.$veloCard.querySelectorAll('.cp-res-fila'), { y: 16, stagger: 0.05 });
    this.$veloCard.querySelector('.cp-otra').addEventListener('click', () => this.cb.onReiniciar());
    this.$veloCard.querySelector('.cp-menu').addEventListener('click', () => this.cb.onSalir());
  }

  // ── Mesa de Peritaje ──────────────────────────────────────────────────────
  /**
   * @param {object[]} evidencias  piezas recolectadas en la oleada
   * @param {number} huecos        casillas del acta (3)
   */
  abrirPeritaje(evidencias, huecos = 3) {
    this.acta = [];
    this.evidencias = evidencias;
    this.huecosActa = huecos;
    this.el.classList.add('cp-modal');
    // Qué es un acta se explica UNA vez por partida. A la tercera oleada el
    // jugador ya lo sabe y ese párrafo solo empuja hacia abajo lo que sí tiene
    // que mirar: los tres requisitos y las pruebas que puede colocar.
    // `!!`: con `undefined` como segundo argumento, `toggle` lo trata como «no
    // me lo has pasado» y alterna — o sea, ocultaba el párrafo justo la primera
    // vez y lo enseñaba a partir de la segunda, exactamente al revés.
    this.$peritaje.querySelector('.cp-per-que').classList.toggle('oculto-def', !!this.periVisto);
    this.periVisto = true;
    this.$peritaje.querySelector('.cp-per-veredicto').innerHTML = '';
    this.#pintarPeritaje();
    abrirVelo(this.$peritaje, { duration: 0.42 });
    const card = this.$peritaje.querySelector('.cp-per-card');
    gsap.fromTo(card, { opacity: 0, y: 40, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.4)',
        onComplete: () => gsap.set(card, { clearProps: 'transform,opacity' }) });
    audio.panel(true);
  }

  #pintarPeritaje() {
    const $huecos = this.$peritaje.querySelector('.cp-per-huecos');
    const $piezas = this.$peritaje.querySelector('.cp-per-piezas');
    const $check = this.$peritaje.querySelector('.cp-per-check');

    // Los tres requisitos, marcándose en vivo. Es la pieza que convierte el
    // panel de «rompecabezas sin instrucciones» en algo que se puede razonar.
    $check.innerHTML = requisitosActa(this.acta).map((r) => `
      <div class="cp-req ${r.ok ? 'ok' : ''}">
        <i>${r.ok ? '✔' : '○'}</i>
        <div><b>${r.texto}</b><span>${r.ayuda}</span></div>
      </div>`).join('');

    $huecos.innerHTML = Array.from({ length: this.huecosActa }, (_, i) => {
      const p = this.acta[i];
      return p
        ? `<button class="cp-hueco lleno" data-quitar="${i}" style="--tono:${p.tono}">
             <i>${p.icono}</i><b>${p.titulo}</b>
             <em>${p.familia ? 'prueba de ' + p.familia : ''}</em>
             <u>${p.expedienteNombre}</u>
             <s>quitar</s></button>`
        : `<div class="cp-hueco"><span>${i + 1}</span><em>casilla libre</em></div>`;
    }).join('');

    const disponibles = this.evidencias.filter((e) => !this.acta.includes(e));
    $piezas.innerHTML = disponibles.length
      ? disponibles.map((p) => `
          <button class="cp-pieza" data-id="${p.id}" style="--tono:${p.tono}">
            <i>${p.icono}</i>
            <div>
              <b>${p.titulo}</b>
              <em>prueba de <u>${p.familia ?? 'naturaleza desconocida'}</u> · guía ${p.guia}</em>
              <span class="cp-pieza-exp">${p.expedienteNombre}</span>
            </div>
          </button>`).join('')
      : '<p class="cp-vacio">Ya colocaste toda la evidencia que tenías.</p>';

    $huecos.querySelectorAll('[data-quitar]').forEach((b) => {
      b.addEventListener('click', () => {
        audio.clic();
        this.acta.splice(Number(b.dataset.quitar), 1);
        this.#pintarPeritaje();
      });
    });
    $piezas.querySelectorAll('.cp-pieza').forEach((b) => {
      b.addEventListener('click', () => {
        if (this.acta.length >= this.huecosActa) {
          this.aviso('El acta ya tiene sus tres casillas ocupadas.', 'neutro');
          return;
        }
        const pieza = this.evidencias.find((e) => e.id === b.dataset.id);
        if (!pieza) return;
        audio.papel();
        // La pieza «vuela» al hueco: la coreografía de arrastrar del vídeo de
        // referencia, resuelta con un toque en vez de con un drag. En un panel
        // que también se juega con el dedo, un arrastre real se pelea con el
        // scroll del contenedor; un tap no falla nunca.
        const destino = this.$peritaje.querySelectorAll('.cp-hueco')[this.acta.length];
        const a = b.getBoundingClientRect();
        const d = destino?.getBoundingClientRect();
        this.acta.push(pieza);
        if (d) {
          const clon = b.cloneNode(true);
          clon.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;
            margin:0;z-index:120;pointer-events:none`;
          document.body.appendChild(clon);
          gsap.to(clon, {
            left: d.left, top: d.top, width: d.width, scale: 0.9, opacity: 0.15,
            duration: 0.42, ease: 'power3.inOut', onComplete: () => clon.remove(),
          });
        }
        this.#pintarPeritaje();
        this.#previsualizarActa();
      });
    });
  }

  /** Adelanta el veredicto SIN puntuar: enseña la regla mientras se compone. */
  #previsualizarActa() {
    const $v = this.$peritaje.querySelector('.cp-per-veredicto');
    if (this.acta.length === 0) { $v.innerHTML = ''; return; }
    const r = evaluarActa(this.acta);
    $v.className = `cp-per-veredicto ${r.solida ? 'ok' : 'aviso'}`;
    $v.innerHTML = `${r.solida ? '✔' : '⚠'} ${r.motivo}`;
    gsap.fromTo($v, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25 });
  }

  /**
   * Firmar ya no cierra el panel en seco.
   *
   * Antes el acta se firmaba, el panel desaparecía y el jugador solo veía un
   * número en el marcador — «firmas y ya», con sus palabras. Ahora entre medias
   * va una hoja de resolución que dice QUÉ le pasó al envío y POR QUÉ, que es
   * donde está la lección. El puntaje se aplica igual, pero después de leerla.
   */
  #firmarActa() {
    if (!this.acta.length) {
      this.aviso('No puedes firmar un acta vacía. Coloca al menos una prueba.', 'mal');
      return;
    }
    const r = evaluarActa(this.acta);
    audio.golpeSello();
    const c = consecuenciaActa(r.solida);
    const piezas = [...this.acta];

    cerrarVelo(this.$peritaje, { duration: 0.3 });
    this.$falloCard.innerHTML = `
      <div class="cp-p-tag">RESOLUCIÓN DEL ACTA</div>
      <h2 class="g-title ${r.solida ? 'ok' : 'mal'}">${r.solida ? '✔' : '✖'} ${c.titulo}</h2>
      <div class="cp-res-motivo ${r.solida ? 'ok' : 'mal'}">${r.motivo}</div>
      <div class="cp-p-tag2">QUÉ PASA AHORA CON EL ENVÍO</div>
      <p class="cp-brief">${c.que}</p>
      <div class="cp-p-tag2">LO QUE HAY QUE APRENDER DE ESTO</div>
      <p class="cp-regla">${c.leccion}</p>
      <div class="cp-per-firmadas">
        ${piezas.map((p) => `<span style="--tono:${p.tono}">${p.icono} ${p.titulo}</span>`).join('')}
      </div>
      <button class="g-btn g-btn--primary cp-fallo-ok">CONTINUAR</button>`;
    abrirVelo(this.$fallo, { duration: 0.35 });
    gsap.fromTo(this.$falloCard, { opacity: 0, y: 28, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)',
        onComplete: () => gsap.set(this.$falloCard, { clearProps: 'transform,opacity' }) });
    this.cb.onNarrar?.(`${c.titulo}. ${c.que}`);

    this.$falloCard.querySelector('.cp-fallo-ok').addEventListener('click', () => {
      audio.clic('firme');
      cerrarVelo(this.$fallo, { duration: 0.25 });
      this.el.classList.remove('cp-modal');
      this.cb.onActa({ ...r, piezas });
    });
  }

  #cerrarPeritaje(resultado) {
    this.el.classList.remove('cp-modal');
    cerrarVelo(this.$peritaje, { duration: 0.3 });
    if (resultado) this.cb.onActa(resultado);
    else this.cb.onCerrarPeritaje();
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  destroy() {
    for (const t of this._timers) clearTimeout(t);
    clearTimeout(this._avisoT);
    gsap.killTweensOf(this.$panelCard);
    gsap.killTweensOf(this.$veloCard);
    for (const [, n] of this.marcasVivas) { gsap.killTweensOf(n); n.remove(); }
    this.marcasVivas.clear();
    this.el?.remove();
  }

  static #css = false;

  static #inyectarCSS() {
    if (HUDCentroPostal.#css) return;
    HUDCentroPostal.#css = true;
    const s = document.createElement('style');
    s.textContent = `
      #cp-hud { position: fixed; inset: 0; z-index: 42; pointer-events: none;
        font-family: var(--f-body, system-ui); color: var(--t-hi, #f2f6fa); }
      #cp-hud button { pointer-events: auto; cursor: pointer; font-family: inherit; }

      /* ── Integridad ──────────────────────────────────────────────────── */
      .cp-integridad {
        position: absolute; top: max(12px, env(safe-area-inset-top)); left: 14px; width: 250px;
        padding: 10px 13px 8px; border-radius: var(--r-md, 12px);
        background: var(--g-bg, rgba(13,19,28,.62));
        -webkit-backdrop-filter: var(--g-blur); backdrop-filter: var(--g-blur);
        border: 1px solid var(--g-border, rgba(148,176,208,.16));
      }
      .cp-int-cab { display: flex; justify-content: space-between; align-items: baseline;
        font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .2em; color: #8fa0b4; }
      .cp-int-cab b { font-family: var(--f-display, sans-serif); font-size: 20px; color: #f2f6fa;
        letter-spacing: .03em; font-variant-numeric: tabular-nums; }
      .cp-int-barra { position: relative; height: 9px; margin: 6px 0 5px; border-radius: 999px;
        background: rgba(8,12,18,.75); overflow: hidden;
        box-shadow: inset 0 1px 3px rgba(0,0,0,.6); }
      .cp-int-barra i { display: block; height: 100%; width: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #2f9ad9, #4fd0e0);
        box-shadow: 0 0 12px rgba(79,208,224,.55); transition: width .45s cubic-bezier(.2,.9,.3,1), background .4s; }
      .cp-int-barra.media i { background: linear-gradient(90deg, #d99a2a, #e0c14f); box-shadow: 0 0 12px rgba(224,149,42,.5); }
      .cp-int-barra.critica i { background: linear-gradient(90deg, #c0342a, #e04a3c); box-shadow: 0 0 14px rgba(224,74,60,.7);
        animation: cp-late 1s ease-in-out infinite; }
      @keyframes cp-late { 50% { filter: brightness(1.5); } }
      .cp-int-pie { font-family: var(--f-data, monospace); font-size: 9px; color: #67788c; letter-spacing: .06em; }

      /* ── Oleada / cronómetro ─────────────────────────────────────────── */
      .cp-oleada {
        position: absolute; top: max(58px, calc(env(safe-area-inset-top) + 52px)); left: 50%;
        transform: translateX(-50%); width: 300px; text-align: center;
        padding: 8px 14px 9px; border-radius: var(--r-md, 12px);
        background: var(--g-bg, rgba(13,19,28,.62));
        -webkit-backdrop-filter: var(--g-blur); backdrop-filter: var(--g-blur);
        border: 1px solid var(--g-border, rgba(148,176,208,.16));
      }
      .cp-ol-tag { font-family: var(--f-data, monospace); font-size: 9px; letter-spacing: .26em; color: #8fa0b4; }
      .cp-ol-tag b { color: var(--a-amber, #e0952a); }
      .cp-ol-nombre { font-family: var(--f-display, sans-serif); font-size: 13px; letter-spacing: .1em; margin: 2px 0 6px; }
      .cp-ol-crono { height: 5px; border-radius: 999px; background: rgba(8,12,18,.75); overflow: hidden; }
      .cp-ol-crono i { display: block; height: 100%; background: linear-gradient(90deg, #7f8ea0, #cfe0f0); }
      .cp-ol-crono.urgente i { background: linear-gradient(90deg, #c0342a, #ff7d70); animation: cp-late .7s infinite; }
      .cp-ol-datos { display: flex; justify-content: space-between; margin-top: 5px;
        font-family: var(--f-data, monospace); font-size: 10px; color: #9aabbe; }
      .cp-ol-datos b { color: var(--a-amber, #e0952a); }

      /* ── Columna de accesos ──────────────────────────────────────────────
         A la IZQUIERDA, no en la esquina superior derecha como el vídeo de
         referencia. Esa esquina no está libre en este juego: la ocupa el
         marcador de puntos (ui/Marcador.js), que es sistema compartido de
         ADR-012 y escupe recibos flotantes de hasta 300 px hacia abajo. Con
         los accesos ahí, cada intercepción tapaba los botones con su propio
         texto — y mover el marcador habría cambiado el HUD de los otros tres
         niveles para arreglar un problema del cuarto.
         (Sin acentos graves aquí dentro: esto vive en un template literal y
         un solo backtick cerraría la cadena y rompería el módulo entero.) */
      .cp-accesos { position: absolute; top: 112px; left: 14px; display: flex; flex-direction: column; gap: 8px; }
      .cp-acc {
        width: 54px; height: 54px; border-radius: 14px; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 1px;
        background: var(--g-bg, rgba(13,19,28,.62)); color: var(--t-mid, #c3cfdc);
        -webkit-backdrop-filter: var(--g-blur); backdrop-filter: var(--g-blur);
        border: 1px solid var(--g-border, rgba(148,176,208,.16));
        transition: border-color .18s, color .18s, transform .1s;
      }
      .cp-acc span { font-size: 19px; line-height: 1; }
      .cp-acc em { font-family: var(--f-data, monospace); font-size: 7.5px; letter-spacing: .12em; font-style: normal; }
      .cp-acc:hover { border-color: var(--g-border-hot, rgba(224,149,42,.55)); color: #fff; }
      .cp-acc:active { transform: scale(.94); }
      .cp-acc.nuevo { border-color: var(--a-amber, #e0952a); color: var(--a-amber, #e0952a);
        box-shadow: 0 0 0 1px rgba(224,149,42,.4), 0 0 18px rgba(224,149,42,.35); }
      .cp-acc-salir { color: #93a2b4; }

      /* ── Marcas flotantes sobre los paquetes ─────────────────────────── */
      .cp-marcas { position: absolute; inset: 0; overflow: hidden; }
      .cp-marca {
        position: absolute; top: 0; left: 0; display: flex; align-items: center; gap: 6px;
        padding: 4px 10px 4px 7px; border-radius: 999px; white-space: nowrap;
        background: rgba(9,13,20,.86); border: 1px solid var(--tono, #e0952a);
        box-shadow: 0 4px 16px rgba(0,0,0,.5), 0 0 14px color-mix(in srgb, var(--tono) 30%, transparent);
        font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .07em;
        color: #e9f0f7; transition: opacity .2s;
      }
      .cp-marca i { font-style: normal; font-size: 12px; color: var(--tono, #e0952a); }
      .cp-marca.objetivo {
        background: rgba(14,22,32,.95); transform-origin: 50% 100%;
        box-shadow: 0 6px 22px rgba(0,0,0,.6), 0 0 0 2px color-mix(in srgb, var(--tono) 55%, transparent),
          0 0 26px color-mix(in srgb, var(--tono) 45%, transparent);
      }
      .cp-marca.objetivo::after {
        content: ''; position: absolute; left: 50%; top: 100%; width: 2px; height: 16px;
        margin-left: -1px; background: linear-gradient(180deg, var(--tono), transparent);
      }

      /* ── Ficha del objetivo ──────────────────────────────────────────── */
      .cp-ficha {
        position: absolute; left: 14px; bottom: 118px; width: 268px;
        padding: 11px 13px; border-radius: var(--r-md, 12px);
        background: var(--g-bg-solid, rgba(11,16,24,.9));
        -webkit-backdrop-filter: var(--g-blur); backdrop-filter: var(--g-blur);
        border: 1px solid var(--g-border, rgba(148,176,208,.16));
        border-left: 3px solid var(--a-amber, #e0952a);
      }
      .cp-ficha.hidden, .cp-aviso.hidden, .cp-panel.hidden,
      .cp-peritaje.hidden, .cp-velo.hidden, .cp-fallo.hidden { display: none; }
      .oculto-def { display: none !important; }
      .cp-fi-cab { display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: 7px; font-family: var(--f-data, monospace); }
      .cp-fi-cab b { font-size: 12px; letter-spacing: .12em; color: var(--a-amber, #e0952a); }
      .cp-fi-cab i { font-size: 10px; color: #7d8ea1; font-style: normal; }
      .cp-fi-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; line-height: 1.7; }
      .cp-fi-row span { font-family: var(--f-data, monospace); font-size: 9px; letter-spacing: .14em; color: #7d8ea1; }
      .cp-fi-row b { font-weight: 500; color: #dce6f0; text-align: right; }
      .cp-fi-sint { display: flex; gap: 9px; margin-top: 9px; padding-top: 9px;
        border-top: 1px dashed rgba(148,176,208,.22); }
      .cp-fi-sint i { font-size: 17px; font-style: normal; }
      .cp-fi-sint b { display: block; font-family: var(--f-data, monospace); font-size: 10px;
        letter-spacing: .1em; color: var(--a-amber, #e0952a); }
      .cp-fi-sint em { display: block; font-size: 11px; line-height: 1.45; color: #a9b8c8; margin-top: 3px; }
      .cp-fi-limpio { margin-top: 9px; padding-top: 8px; border-top: 1px dashed rgba(148,176,208,.22);
        font-size: 11px; color: #7f909f; font-style: italic; }

      /* ── Aviso central ───────────────────────────────────────────────── */
      .cp-aviso {
        position: absolute; left: 50%; top: 30%; transform: translateX(-50%);
        max-width: min(560px, 78vw); text-align: center;
        padding: 11px 22px; border-radius: var(--r-sm, 6px);
        background: rgba(9,13,20,.92); border-left: 3px solid var(--a-amber, #e0952a);
        font-size: 14px; line-height: 1.5; box-shadow: 0 14px 40px rgba(0,0,0,.55);
      }
      .cp-aviso b { color: var(--a-amber, #e0952a); }
      .cp-aviso.ok { border-color: var(--a-green, #3fc47f); }
      .cp-aviso.ok b { color: #6de0a4; }
      .cp-aviso.mal { border-color: var(--a-red, #e04a3c); }
      .cp-aviso.mal b { color: #ff8d80; }
      .cp-aviso.neutro { border-color: #7d8ea1; }

      /* ── Hotbar ──────────────────────────────────────────────────────── */
      .cp-hotbar {
        position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom));
        transform: translateX(-50%); display: flex; gap: 9px;
      }
      .cp-slot {
        position: relative; overflow: hidden;
        width: 86px; padding: 8px 6px 7px; border-radius: 12px;
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        background: var(--g-bg, rgba(13,19,28,.62)); color: var(--t-low, #9aabbe);
        -webkit-backdrop-filter: var(--g-blur); backdrop-filter: var(--g-blur);
        border: 1px solid var(--g-border, rgba(148,176,208,.16));
        transition: border-color .18s, color .18s, transform .12s, background .18s;
      }
      .cp-slot-n { position: absolute; top: 3px; left: 7px; font-family: var(--f-data, monospace);
        font-size: 9px; color: #5f6f81; }
      .cp-slot-ico { font-size: 20px; line-height: 1.1; filter: grayscale(.6); transition: filter .2s; }
      .cp-slot-name { font-family: var(--f-data, monospace); font-size: 8.5px; letter-spacing: .1em; }
      .cp-slot-fam { font-size: 9.5px; font-style: italic; color: #7d8ea1; transition: color .2s; }
      .cp-slot.on .cp-slot-fam { color: var(--tono, #e0952a); }
      .cp-slot.on {
        color: #f2f6fa; border-color: var(--tono, #e0952a); background: rgba(16,24,34,.92);
        box-shadow: 0 0 0 1px var(--tono), 0 0 22px color-mix(in srgb, var(--tono) 32%, transparent);
        transform: translateY(-4px);
      }
      .cp-slot.on .cp-slot-ico { filter: none; }
      .cp-slot.on::after {
        content: ''; position: absolute; left: 0; bottom: 0; height: 3px;
        width: var(--recarga, 100%); background: var(--tono, #e0952a); opacity: .9;
      }
      .cp-hotbar--indicador .cp-slot { pointer-events: none; }
      .cp-hotbar--oculta { display: none; }

      /* Rótulo de la herramienta recién empuñada, justo encima de la hotbar. */
      .cp-tip {
        position: absolute; left: 50%; bottom: max(96px, calc(env(safe-area-inset-bottom) + 96px));
        transform: translateX(-50%) translateY(8px);
        display: flex; align-items: baseline; gap: 8px; white-space: nowrap;
        padding: 6px 15px; border-radius: 999px;
        background: rgba(9,13,20,.92); border: 1px solid rgba(148,176,208,.2);
        font-family: var(--f-data, monospace); font-size: 11px; letter-spacing: .1em;
        opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none;
      }
      .cp-tip.on { opacity: 1; transform: translateX(-50%) translateY(0); }
      .cp-tip i { font-size: 14px; font-style: normal; }
      .cp-tip span { color: #93a2b4; text-transform: none; letter-spacing: .04em; }
      .cp-tip em { color: #dbe5f0; font-style: italic; }

      /* ── Paneles (Casos / Códice) ────────────────────────────────────── */
      .cp-panel, .cp-peritaje, .cp-velo, .cp-fallo {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        padding: clamp(12px, 3vw, 30px); pointer-events: auto; overflow-y: auto;
        background: rgba(4,8,12,.76);
        -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);
      }
      .cp-panel-card, .cp-per-card, .cp-velo-card, .cp-fallo-card {
        /* El ancho se mide contra el HUECO REAL (100% del contenedor, que ya
           descuenta su propio padding), no contra 94vw: sumados, la hoja al
           94vw y el padding del velo pasaban de 100vw en pantallas de 375 px y
           la tarjeta salia recortada por el borde derecho. */
        position: relative; width: min(720px, 100%); max-width: 100%;
        max-height: 100%; overflow-y: auto; overscroll-behavior: contain;
        padding: clamp(14px, 3vw, 28px);
        /* OPACA, no cristal. La primitiva g-panel es translúcida por diseño —
           correcta para una píldora del HUD flotando sobre la escena— pero
           detrás de una hoja de servicio con veinte líneas de texto deja pasar
           los anaqueles y el resumen del turno se vuelve ilegible. */
        background: rgba(10, 15, 22, 0.965);
      }

      /* Modo modal: mientras hay una hoja abierta (peritaje o cierre), el HUD de
         juego se aparta. Si no, el marcador sigue escupiendo recibos y la
         hotbar sigue encendida ENCIMA del panel que el jugador está leyendo. */
      #cp-hud.cp-modal .cp-integridad,
      #cp-hud.cp-modal .cp-oleada,
      #cp-hud.cp-modal .cp-accesos,
      #cp-hud.cp-modal .cp-hotbar,
      #cp-hud.cp-modal .cp-ficha,
      #cp-hud.cp-modal .cp-marcas,
      #cp-hud.cp-modal .cp-aviso { opacity: 0; pointer-events: none; transition: opacity .25s; }
      .cp-cerrar {
        /* 44 px es el mínimo táctil: con 38 se fallaba el toque a la primera y
           el jugador acababa pulsando el texto de detrás. */
        position: absolute; top: 8px; right: 8px; width: 44px; height: 44px;
        min-width: 44px; min-height: 44px; border-radius: 10px; z-index: 2;
        background: rgba(20,28,40,.8); color: #b9c6d4; border: 1px solid rgba(148,176,208,.2); font-size: 15px;
      }
      .cp-cerrar:hover { color: #fff; border-color: var(--a-red, #e04a3c); }
      .cp-p-tag { font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .26em;
        color: var(--a-amber, #e0952a); margin-bottom: 6px; }
      .cp-p-tag2 { font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .22em;
        color: #7d8ea1; margin: 18px 0 8px; border-bottom: 1px solid rgba(148,176,208,.14); padding-bottom: 5px; }
      #cp-hud .g-title { font-family: var(--f-display, sans-serif); font-size: clamp(19px, 3vw, 27px);
        letter-spacing: .1em; margin: 0 0 8px; }
      .cp-objetivos { display: flex; gap: 10px; flex-wrap: wrap; }
      .cp-obj { flex: 1 1 150px; padding: 11px 13px; border-radius: 10px;
        background: rgba(20,28,40,.6); border: 1px solid rgba(148,176,208,.13); }
      .cp-obj b { display: block; font-family: var(--f-display, sans-serif); font-size: 25px;
        color: var(--a-amber, #e0952a); line-height: 1.1; }
      .cp-obj span { font-size: 11px; color: #9aabbe; }
      .cp-hilo { padding: 10px 13px; margin-bottom: 7px; border-radius: 8px;
        background: rgba(20,28,40,.6); border-left: 3px solid var(--tono, #e0952a); }
      .cp-hilo b { display: block; font-family: var(--f-data, monospace); font-size: 11px;
        letter-spacing: .14em; color: var(--tono, #e0952a); }
      .cp-hilo span { font-size: 12px; color: #b3c1d0; line-height: 1.5; }
      .cp-nota { padding: 7px 11px; margin-bottom: 5px; border-radius: 6px; font-size: 12px; line-height: 1.5;
        background: rgba(20,28,40,.5); border-left: 2px solid var(--tono, #7d8ea1); color: #c3cfdc; }
      .cp-vacio { font-size: 12px; color: #7d8ea1; font-style: italic; }
      .cp-cod { padding: 10px 13px; margin-bottom: 7px; border-radius: 8px;
        background: rgba(20,28,40,.55); border: 1px solid rgba(148,176,208,.1); }
      .cp-cod b { font-family: var(--f-data, monospace); font-size: 12px; letter-spacing: .1em;
        color: var(--a-cyan, #4fd0e0); }
      .cp-cod p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.6; color: #b3c1d0; }

      /* Ficha en dos niveles: la definición se lee siempre, el desarrollo se pide. */
      details.cp-cod { padding: 0; }
      details.cp-cod > summary {
        list-style: none; cursor: pointer; padding: 10px 13px; border-radius: 8px;
        min-height: 44px; display: flex; flex-direction: column; justify-content: center;
        position: relative; padding-right: 52px;
      }
      details.cp-cod > summary::-webkit-details-marker { display: none; }
      details.cp-cod > summary span { display: block; margin-top: 3px;
        font-size: 12.5px; line-height: 1.55; color: #b3c1d0; }
      /* El «más» es la única promesa de que ahí abajo hay algo. */
      .cp-cod-mas {
        position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
        font-family: var(--f-data, monospace); font-style: normal; font-size: 9px;
        letter-spacing: .1em; color: #7d8ea1; border: 1px solid rgba(148,176,208,.28);
        border-radius: 999px; padding: 4px 8px; transition: color .18s, border-color .18s;
      }
      details.cp-cod[open] > summary .cp-cod-mas { color: var(--a-cyan, #4fd0e0);
        border-color: rgba(79,208,224,.5); }
      details.cp-cod[open] > summary .cp-cod-mas::after { content: ' ▴'; }
      details.cp-cod:not([open]) > summary .cp-cod-mas::after { content: ' ▾'; }
      details.cp-cod > p { padding: 0 13px 11px; margin: 0;
        border-top: 1px dashed rgba(148,176,208,.16); padding-top: 9px; }
      .cp-cod.bloq { opacity: .42; }
      .cp-cod.bloq b { color: #6b7b8d; letter-spacing: .3em; }
      /* Lo que falta, en una línea: cuenta y promesa, sin ocupar media pantalla. */
      .cp-cod-pend { margin-top: 12px; padding: 9px 12px; border-radius: 8px; font-size: 11.5px;
        line-height: 1.5; color: #8b9bad; background: rgba(20,28,40,.5);
        border: 1px dashed rgba(148,176,208,.22); }
      .cp-cod-pend b { color: var(--a-amber, #e0952a); }
      .cp-cod-pend--full { color: #86e4b0; border-color: rgba(63,196,127,.4); }

      /* ── Briefing / cierre ───────────────────────────────────────────── */
      .cp-brief { font-size: 14.5px; line-height: 1.65; color: #c3cfdc; margin: 0 0 14px; }
      /* minmax(min(Npx, 100%), 1fr) en vez de minmax(Npx, 1fr): sin ese min(),
         cuando la columna disponible baja del minimo la pista NO se encoge y la
         rejilla desborda la tarjeta. Es lo que pasaba con estas cinco rejillas
         en un telefono. */
      .cp-regla { font-size: 12.5px; line-height: 1.6; color: #9aabbe; padding: 10px 13px;
        border-left: 3px solid var(--a-cyan, #4fd0e0); background: rgba(79,208,224,.07); border-radius: 0 7px 7px 0; }
      .cp-regla b { color: #8fe4f0; }

      /* ── EL BRIEFING SE QUEDÓ EN DOS COSAS (2026-08-12) ──────────────────
         Antes traía cuatro pasos numerados, cuatro fichas de herramienta con su
         pista y cuatro filas de controles: 1163 caracteres, 83 s de lectura y
         dos pantallas de scroll. Y en cuanto se cerraba, Justus explicaba LO
         MISMO en seis tarjetas. Nadie lee dos veces el mismo tutorial: se salta
         el primero que aparece, que casualmente era el que tenía los dibujos.
         Ahora el briefing enseña UNA regla y EL CINTURÓN; el resto lo dice
         Justus dentro del juego, señalando la cosa de la que habla. */
      .cp-regla-corta { font-size: clamp(13px, 3.4vw, 16px); line-height: 1.5; color: #dbe5f0;
        padding: 11px 14px; margin-bottom: 4px; border-radius: 8px;
        background: rgba(79,208,224,.09); border-left: 3px solid var(--a-cyan, #4fd0e0); }
      .cp-regla-corta b { color: #8fe4f0; }

      /* El cinturón, en tira: cuatro iconos con su familia debajo. Se lee de un
         vistazo, que es justo lo que un briefing tiene que permitir. */
      .cp-tools--tira { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .cp-tools--tira .cp-tool { padding: 9px 4px; border-radius: 10px; text-align: center;
        background: rgba(20,28,40,.6); border: 1px solid rgba(148,176,208,.12);
        border-top: 2px solid var(--tono, #e0952a); }
      .cp-tools--tira .cp-tool i { display: block; font-size: 21px; font-style: normal; line-height: 1.2; }
      .cp-tools--tira .cp-tool b { display: block; font-family: var(--f-data, monospace);
        font-size: 9.5px; letter-spacing: .08em; color: var(--tono, #e0952a); margin-top: 3px; }
      .cp-tools--tira .cp-tool em { display: block; font-size: 10.5px; font-style: italic; color: #a3b2c2; }
      .cp-ol-progreso { font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .24em;
        color: #7d8ea1; margin: 14px 0 12px; }
      .cp-empezar, .cp-cierre-acciones .g-btn { width: 100%; }
      .cp-cierre-acciones { display: flex; gap: 9px; margin-top: 14px; flex-wrap: wrap; }
      .cp-cierre-acciones .g-btn { flex: 1 1 180px; }
      .cp-resumen { display: flex; flex-direction: column; gap: 5px; margin: 12px 0; }
      .cp-res-fila { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
        padding: 8px 12px; border-radius: 7px; background: rgba(20,28,40,.55);
        border-left: 3px solid rgba(148,176,208,.25); }
      .cp-res-fila span { font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .14em; color: #93a2b4; }
      .cp-res-fila b { font-family: var(--f-display, sans-serif); font-size: 17px; }
      .cp-res-fila.bien { border-left-color: var(--a-green, #3fc47f); }
      .cp-res-fila.bien b { color: #6de0a4; }
      .cp-res-fila.mal { border-left-color: var(--a-red, #e04a3c); }
      .cp-res-fila.mal b { color: #ff8d80; }

      /* ── Mesa de peritaje ────────────────────────────────────────────── */
      .cp-per-card { width: min(820px, 100%); }
      .cp-per-cab { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; }
      .cp-per-tag { font-family: var(--f-data, monospace); font-size: 10px; letter-spacing: .26em; color: var(--a-amber, #e0952a); }
      .cp-per-card h2 { font-family: var(--f-display, sans-serif); font-size: clamp(20px, 3vw, 30px);
        letter-spacing: .1em; margin: 4px 0 0; }
      .cp-per-regla { flex: 1 1 260px; max-width: 340px; font-size: 11.5px; line-height: 1.6; color: #9aabbe;
        padding: 9px 12px; background: rgba(224,149,42,.08); border-left: 3px solid var(--a-amber, #e0952a);
        border-radius: 0 7px 7px 0; }
      .cp-per-regla b { color: #f0b95e; }
      .cp-per-mesa { margin: 16px 0 6px; padding: 14px; border-radius: 12px;
        background: linear-gradient(150deg, rgba(60,46,28,.5), rgba(24,20,14,.6));
        border: 1px solid rgba(190,150,90,.22); }
      .cp-per-huecos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 10px; }
      .cp-hueco { min-height: 78px; border-radius: 10px; padding: 9px 11px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center;
        border: 2px dashed rgba(190,150,90,.35); background: rgba(12,10,8,.4); color: #8a7a5e; }
      .cp-hueco span { font-family: var(--f-display, sans-serif); font-size: 22px; opacity: .5; }
      .cp-hueco em { font-family: var(--f-data, monospace); font-size: 9px; letter-spacing: .14em; font-style: normal; }
      .cp-hueco.lleno { border-style: solid; border-color: var(--tono, #e0952a); background: rgba(16,22,30,.85); color: #e8eef5; }
      .cp-hueco.lleno i { font-size: 20px; font-style: normal; color: var(--tono, #e0952a); }
      .cp-hueco.lleno b { font-size: 11.5px; line-height: 1.35; font-weight: 500; }
      .cp-hueco.lleno em { color: var(--tono, #e0952a); opacity: .85; }
      .cp-per-veredicto { margin-top: 11px; font-size: 12.5px; line-height: 1.55; padding: 9px 12px; border-radius: 7px; }
      .cp-per-veredicto:empty { display: none; }
      .cp-per-veredicto.ok { background: rgba(63,196,127,.12); color: #86e4b0; border-left: 3px solid var(--a-green, #3fc47f); }
      .cp-per-veredicto.aviso { background: rgba(224,149,42,.1); color: #f0c07a; border-left: 3px solid var(--a-amber, #e0952a); }
      .cp-per-tag2 { font-family: var(--f-data, monospace); font-size: 9.5px; letter-spacing: .22em;
        color: #7d8ea1; margin: 14px 0 8px; }
      .cp-per-piezas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 8px; }
      .cp-pieza { display: flex; align-items: center; gap: 10px; text-align: left; padding: 9px 12px;
        border-radius: 9px; background: rgba(20,28,40,.7); color: #e8eef5;
        border: 1px solid rgba(148,176,208,.14); border-left: 3px solid var(--tono, #e0952a);
        transition: transform .12s, border-color .18s, background .18s; }
      .cp-pieza:hover { transform: translateY(-2px); background: rgba(26,36,50,.9); }
      .cp-pieza i { font-size: 19px; font-style: normal; color: var(--tono, #e0952a); }
      .cp-pieza b { display: block; font-size: 12px; font-weight: 500; line-height: 1.35; }
      .cp-pieza em { display: block; font-family: var(--f-data, monospace); font-size: 9px;
        letter-spacing: .08em; color: #8b9bad; font-style: normal; margin-top: 2px; }
      .cp-per-acciones { display: flex; gap: 9px; margin-top: 16px; flex-wrap: wrap; }
      .cp-per-acciones .g-btn { flex: 1 1 200px; }

      /* Explicación de qué es un acta: va arriba del todo y en lenguaje llano. */
      .cp-per-que { font-size: 13.5px; line-height: 1.6; color: #b9c6d4; margin: 8px 0 4px;
        padding: 11px 14px; border-radius: 8px; background: rgba(20,28,40,.55);
        border-left: 3px solid var(--a-amber, #e0952a); }
      .cp-per-que b { color: #f0c07a; }

      /* Checklist de requisitos, marcándose en vivo. */
      .cp-per-check { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(215px, 100%), 1fr)); gap: 8px; }
      .cp-req { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 8px;
        background: rgba(20,28,40,.55); border: 1px solid rgba(148,176,208,.12);
        transition: background .25s, border-color .25s; }
      .cp-req i { flex: 0 0 20px; height: 20px; border-radius: 50%; font-style: normal; font-size: 11px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(148,176,208,.16); color: #8b9bad; transition: background .25s, color .25s; }
      .cp-req b { display: block; font-family: var(--f-data, monospace); font-size: 11px;
        letter-spacing: .08em; color: #c3cfdc; }
      .cp-req span { display: block; font-size: 11px; line-height: 1.45; color: #8b9bad; margin-top: 2px; }
      .cp-req.ok { background: rgba(63,196,127,.1); border-color: rgba(63,196,127,.4); }
      .cp-req.ok i { background: var(--a-green, #3fc47f); color: #062713; }
      .cp-req.ok b { color: #86e4b0; }

      /* Piezas: la NATURALEZA en grande, que es el dato que decide. */
      .cp-pieza em u { color: var(--tono, #e0952a); text-decoration: none; font-weight: 600; }
      .cp-pieza-exp { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px;
        font-family: var(--f-data, monospace); font-size: 8.5px; letter-spacing: .1em;
        background: color-mix(in srgb, var(--tono) 18%, transparent); color: var(--tono, #e0952a); }
      .cp-hueco.lleno u { display: block; margin-top: 3px; padding: 1px 7px; border-radius: 999px;
        font-family: var(--f-data, monospace); font-size: 8px; letter-spacing: .08em;
        text-decoration: none; background: color-mix(in srgb, var(--tono) 20%, transparent);
        color: var(--tono, #e0952a); }
      .cp-hueco.lleno s { display: block; margin-top: 4px; font-size: 9px; color: #7d8ea1;
        text-decoration: none; opacity: .75; }
      .cp-hueco.lleno em { font-style: italic; color: #a3b2c2; text-transform: none; letter-spacing: 0; }

      /* Hoja de resolución del acta: la consecuencia, explicada. */
      .cp-fallo-card { width: min(640px, 100%); }
      .cp-fallo-card h2.ok { color: #86e4b0; }
      .cp-fallo-card h2.mal { color: #ff8d80; }
      .cp-res-motivo { font-size: 13px; line-height: 1.55; padding: 10px 13px; border-radius: 8px; margin-bottom: 4px; }
      .cp-res-motivo.ok { background: rgba(63,196,127,.12); color: #86e4b0; border-left: 3px solid var(--a-green, #3fc47f); }
      .cp-res-motivo.mal { background: rgba(224,74,60,.12); color: #ff9d92; border-left: 3px solid var(--a-red, #e04a3c); }
      .cp-per-firmadas { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
      .cp-per-firmadas span { padding: 5px 11px; border-radius: 999px; font-size: 11px;
        background: rgba(20,28,40,.7); border: 1px solid var(--tono, #e0952a); color: #dbe5f0; }
      .cp-fallo-ok { width: 100%; margin-top: 14px; }

    ` + compacto(`
      /* ── Capa táctil: todo encoge y se aparta de los pulgares ────────── */
      @S .cp-integridad { width: 168px; padding: 7px 9px 6px; left: 8px; }
      @S .cp-int-cab { font-size: 7.5px; letter-spacing: .12em; }
      @S .cp-int-cab b { font-size: 15px; }
      @S .cp-int-barra { height: 7px; margin: 4px 0 3px; }
      @S .cp-int-pie { display: none; }
      @S .cp-oleada { width: 210px; padding: 6px 10px 7px; top: 50px; }
      @S .cp-ol-nombre { font-size: 10px; letter-spacing: .06em; margin: 1px 0 4px; }
      @S .cp-ol-tag { font-size: 7.5px; letter-spacing: .16em; }
      @S .cp-ol-datos { font-size: 8.5px; }
      /* En táctil la columna se tumba en FILA bajo la hotbar: en 400 px de alto
         apaisado no caben cuatro bloques apilados en el margen izquierdo. */
      @S .cp-accesos { top: 108px; left: 8px; right: auto; flex-direction: row; gap: 6px; }
      @S .cp-acc { width: 44px; height: 44px; border-radius: 11px; }
      @S .cp-acc span { font-size: 15px; }
      @S .cp-acc em { font-size: 6.5px; }
      @S .cp-marca { font-size: 8.5px; padding: 3px 7px 3px 5px; gap: 4px; }
      @S .cp-marca i { font-size: 10px; }
      @S .cp-ficha { width: 200px; left: 8px; top: 158px; bottom: auto; padding: 8px 10px; }
      @S .cp-fi-row { font-size: 9.5px; line-height: 1.55; }
      @S .cp-fi-row span { font-size: 7.5px; letter-spacing: .08em; }
      @S .cp-fi-cab b { font-size: 10px; }
      @S .cp-fi-sint em, @S .cp-fi-limpio { font-size: 9.5px; }
      @S .cp-aviso { font-size: 11.5px; padding: 8px 14px; top: 24%; }
      /* En táctil la hotbar deja de estar abajo. El borde inferior entero es del
         mando —joystick a la izquierda, botones a la derecha— y el hueco central
         que queda es demasiado estrecho para cuatro slots. Sube a la columna
         izquierda, bajo la barra de integridad, donde solo informa. */
      @S .cp-hotbar { gap: 4px; bottom: auto; top: 62px; left: 8px; transform: none; }
      @S .cp-slot { width: 54px; padding: 4px 3px 4px; border-radius: 9px; }
      @S .cp-slot-ico { font-size: 14px; }
      @S .cp-slot-name { font-size: 6.5px; letter-spacing: .04em; }
      @S .cp-slot-fam { font-size: 7.5px; }
      @S .cp-tip { bottom: auto; top: 108px; left: 8px; transform: none; padding: 4px 10px; font-size: 9px; }
      @S .cp-tip.on { transform: none; }

      /* ── LA COLUMNA IZQUIERDA, RECOLOCADA ─────────────────────────────
         Al retirarse la hotbar en tactil queda libre su franja, y la ficha del
         bulto sube a ocuparla. Estaba a 190 px y el JOYSTICK —que arranca hacia
         los 225 px en un movil apaisado— le tapaba media ficha: justamente los
         datos con los que se decide si el envio cuadra o no.
         Orden de arriba abajo: integridad · accesos · ficha, y el mando debajo
         sin pisar nada. */
      @S .cp-accesos { top: 62px; }
      @S .cp-ficha { top: 118px; max-height: calc(100vh - 250px); overflow-y: auto; }
      @S .cp-slot-n { font-size: 7px; top: 1px; left: 4px; }
      @S .cp-slot.on { transform: translateY(-2px); }
      @S .cp-brief { font-size: 12.5px; }
      @S .cp-hueco { min-height: 64px; }
      @S .cp-per-regla { font-size: 10.5px; }

      /* ── Hojas y modales en pantalla pequeña ──────────────────────────
         Medido en un teléfono apaisado (667x375): la mesa de peritaje tenía
         726 px de contenido dentro de 344 px visibles, y los dos botones que
         cierran el tramite —FIRMAR ACTA y SEGUIR SIN ACTA— vivian al final de
         ese scroll. El jugador firmaba a ciegas o no firmaba. La hoja pasa a
         ocupar el hueco entero y sus acciones se anclan al pie. */
      @S .cp-panel, @S .cp-peritaje, @S .cp-velo, @S .cp-fallo { padding: 8px; }
      @S .cp-panel-card, @S .cp-per-card, @S .cp-velo-card, @S .cp-fallo-card {
        width: 100%; max-width: 100%; padding: 12px 12px 0; }
      @S .cp-per-acciones, @S .cp-cierre-acciones, @S .cp-empezar, @S .cp-fallo-ok {
        position: sticky; bottom: 0; z-index: 3; margin-top: 12px; padding-bottom: 12px;
        background: linear-gradient(transparent, rgba(10,15,22,.99) 46%); }
      @S .cp-per-acciones, @S .cp-cierre-acciones { padding-top: 16px; gap: 8px; }
      @S .cp-per-acciones .g-btn, @S .cp-cierre-acciones .g-btn { flex: 1 1 140px; }

      /* Tipografia fluida: el texto de las hojas escala con el ancho real en
         vez de saltar entre dos tamanos fijos. */
      @S #cp-hud .g-title, @S .cp-per-card h2 { font-size: clamp(15px, 4.2vw, 22px); }
      @S .cp-per-que { font-size: clamp(11px, 3vw, 13px); padding: 9px 11px; }
      @S .cp-p-tag2 { margin: 12px 0 6px; }
      @S .cp-pieza b { font-size: clamp(10.5px, 2.8vw, 12px); }
      @S .cp-req span, @S .cp-tool > span, @S .cp-paso span { font-size: clamp(10px, 2.6vw, 12px); }
      @S .cp-cod p, @S .cp-hilo span, @S .cp-nota { font-size: clamp(10.5px, 2.8vw, 12.5px); }

      /* Objetivos tactiles: la columna de accesos sube de 44 a 48 px. */
      @S .cp-acc { width: 48px; height: 48px; }
    `);
    document.head.appendChild(s);
  }
}
