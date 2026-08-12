/**
 * ux-movil.browser.mjs — banco de pruebas de la UX móvil (ADR-014).
 *
 * Se ejecuta DENTRO del juego, no contra un DOM simulado: la mitad de los fallos
 * que persigue —hitboxes reales, modales recortados, la tarjeta de Justus
 * tapando el dock— solo existen cuando el CSS del proyecto entero está aplicado
 * sobre un viewport concreto. Un test con `jsdom` los daría todos por buenos.
 *
 * Uso, desde la consola del navegador con el juego cargado:
 *
 *     const t = await import('/tests/ux-movil.browser.mjs');
 *     await t.todo();            // cola de Justus + auditoría de la pantalla
 *     t.auditarPantalla();       // solo la medición de lo que hay ahora en pantalla
 *
 * Devuelve `{ pass, fail, casos }` y lo imprime por consola. `fail === 0` es la
 * condición de aprobado.
 */

const MIN_TACTIL = 44;

// ── Utilidades ──────────────────────────────────────────────────────────────
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Visible DE VERDAD. La opacidad hay que acumularla por la cadena de padres:
 * `getComputedStyle` devuelve la propia, así que un botón dentro de un panel
 * apagado a `opacity: 0` seguía contando como visible — y así el HUD de juego
 * del Nivel 4, que se apaga entero mientras hay una hoja abierta, aparecía como
 * un montón de botones tapados que en realidad nadie ve.
 */
function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) <= 0.05) return false;
  }
  return true;
}

function nombre(el) {
  const cls = (typeof el.className === 'string' && el.className.trim())
    ? '.' + el.className.trim().split(/\s+/).join('.') : '';
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
}

class Acta {
  constructor() { this.casos = []; }

  ok(nombreCaso, condicion, detalle = '') {
    this.casos.push({ nombre: nombreCaso, pass: !!condicion, detalle });
    return !!condicion;
  }

  get pass() { return this.casos.filter((c) => c.pass).length; }
  get fail() { return this.casos.filter((c) => !c.pass).length; }

  imprimir(titulo) {
    console.group(`%c${titulo} — ${this.pass} OK / ${this.fail} FALLO`,
      `color:${this.fail ? '#e04a3c' : '#3fc47f'};font-weight:700`);
    for (const c of this.casos) {
      console.log(`%c${c.pass ? '✔' : '✖'} ${c.nombre}`,
        `color:${c.pass ? '#3fc47f' : '#e04a3c'}`, c.detalle || '');
    }
    console.groupEnd();
    return { pass: this.pass, fail: this.fail, casos: this.casos };
  }
}

// ── 1. La cola de Justus ────────────────────────────────────────────────────
/**
 * Comprueba lo único que importa del refactor: que dos avisos simultáneos NO se
 * pisen. El escenario es el real del Nivel 4 —un consejo por dominio disparado
 * mientras Justus da la clase— reducido a sus tres llamadas.
 */
export async function colaJustus() {
  const a = new Acta();
  const { coach } = await import('/src/ui/JustusCoach.js');

  coach.ocultar();
  coach.reiniciar();

  const leccion = [
    { txt: 'Primera frase de la clase magistral.', voz: false },
    { txt: 'Segunda frase de la clase magistral.', voz: false },
  ];

  coach.guiar('qa:leccion', leccion, { forzar: true });
  const claveTrasLeccion = coach.clave;
  a.ok('la lección abre en el acto', coach.activo && claveTrasLeccion === 'qa:leccion',
    `activo=${coach.activo} clave=${claveTrasLeccion}`);

  // Tres avisos encima, como cuando el jugador cruza tres dominios seguidos.
  coach.decir('qa:c1', 'Consejo uno.', { voz: false });
  coach.decir('qa:c2', 'Consejo dos.', { voz: false });
  coach.decir('qa:c3', 'Consejo tres.', { voz: false });
  coach.decir('qa:c3', 'Consejo tres repetido.', { voz: false }); // duplicado

  a.ok('un aviso NO interrumpe la lección en curso', coach.clave === 'qa:leccion',
    `clave activa = ${coach.clave}`);
  a.ok('los avisos esperan en la cola', coach.cola.length > 0,
    `en cola = ${coach.cola.length}`);
  a.ok('la cola no crece sin tope', coach.cola.length <= 3,
    `en cola = ${coach.cola.length} (tope 3)`);
  a.ok('los duplicados se descartan',
    coach.cola.filter((m) => m.clave === 'qa:c3').length <= 1,
    `qa:c3 en cola = ${coach.cola.filter((m) => m.clave === 'qa:c3').length}`);
  a.ok('la lección se muestra como tarjeta completa',
    coach.el.classList.contains('jc-leccion') && !coach.el.classList.contains('jc-susurro'));

  // La lección termina: solo entonces sale el siguiente, y tras el cooldown.
  coach.el.querySelector('.jc-next').click();  // completa el tecleo del paso 1
  coach.el.querySelector('.jc-next').click();  // paso 2
  coach.el.querySelector('.jc-next').click();  // completa el tecleo del paso 2
  coach.el.querySelector('.jc-next').click();  // ENTENDIDO → termina

  a.ok('la lección terminada queda marcada como vista',
    localStorage.getItem('ah_coach_qa:leccion') === '1');
  a.ok('nada arranca durante el cooldown', !coach.activo,
    `activo=${coach.activo}`);

  await esperar(1300);
  a.ok('el siguiente aviso sale solo al liberarse el canal', coach.activo,
    `activo=${coach.activo} clave=${coach.clave}`);
  a.ok('un aviso suelto sale como susurro discreto',
    coach.el.classList.contains('jc-susurro'),
    `clases = ${coach.el.className}`);
  a.ok('el susurro no roba el dedo al juego',
    getComputedStyle(coach.el).pointerEvents === 'none',
    `pointer-events = ${getComputedStyle(coach.el).pointerEvents}`);
  a.ok('el susurro deja una salida de 44 px',
    (() => {
      const r = coach.el.querySelector('.jc-cerrar').getBoundingClientRect();
      return r.width >= MIN_TACTIL && r.height >= MIN_TACTIL;
    })(),
    (() => {
      const r = coach.el.querySelector('.jc-cerrar').getBoundingClientRect();
      return `${Math.round(r.width)}×${Math.round(r.height)}`;
    })());

  // El susurro se va solo: es su razón de ser.
  const antes = coach.activo;
  await esperar(4200);
  a.ok('el susurro se cierra solo, sin que el jugador lo toque',
    antes && !coach.activo, `activo=${coach.activo}`);

  coach.ocultar();
  coach.reiniciar('qa:leccion');
  for (const k of ['qa:c1', 'qa:c2', 'qa:c3']) coach.reiniciar(k);
  a.ok('la cola queda vacía tras ocultar()', coach.cola.length === 0);

  return a.imprimir('COLA DE JUSTUS');
}

// ── 2. Auditoría de la pantalla actual ──────────────────────────────────────
/**
 * Mide TODO lo interactivo y visible ahora mismo. No sabe de niveles: se llama
 * con el aeropuerto delante, con la mesa de peritaje abierta o con lo que sea,
 * y contesta si eso concreto se puede tocar y cabe.
 */
export function auditarPantalla(etiqueta = 'PANTALLA ACTUAL') {
  const a = new Acta();
  // El menú de niveles y la portada SÍ se auditan: son pantallas de verdad y la
  // de entrada al juego. No molestan al medir el resto de la partida porque
  // `visible()` acumula la opacidad de los ancestros y ambas quedan a 0 en
  // cuanto arranca un nivel.
  const raices = ['#hud-root', '#justus-coach', '#jc-pata', '#touch-pad',
    '#cp-hud', '#marcador', '#pause-root', '#level-menu', '#title-screen'];
  const nodos = raices
    .flatMap((s) => [...document.querySelectorAll(s)])
    .flatMap((r) => [r, ...r.querySelectorAll('*')]);

  /**
   * ¿Es este nodo un objetivo táctil POR SÍ MISMO?
   *
   * `cursor: pointer` se hereda, así que el icono y la etiqueta de dentro de un
   * botón lo declaran igual que el botón. Medirlos sería un falso positivo: lo
   * que el dedo golpea es el botón entero. Solo cuenta el tocable más externo.
   */
  const tocablePropio = (el) => {
    const s = getComputedStyle(el);
    if (!(el.tagName === 'BUTTON' || !!el.onclick || s.cursor === 'pointer')) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (p.tagName === 'BUTTON' || !!p.onclick || ps.cursor === 'pointer') return false;
    }
    return true;
  };

  const pequenos = [];
  const cortados = [];
  for (const el of nodos) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (tocablePropio(el) && (r.width < MIN_TACTIL || r.height < MIN_TACTIL)) {
      pequenos.push(`${nombre(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // Un panel puede desbordar a propósito por arriba (marcas flotantes); lo que
    // no puede es salirse a los lados, que es donde se corta el texto.
    if (r.width > 8 && (r.left < -1 || r.right > window.innerWidth + 1)) {
      cortados.push(`${nombre(el)} [${Math.round(r.left)}…${Math.round(r.right)}]`);
    }
  }

  a.ok('ningún objetivo táctil por debajo de 44 px', pequenos.length === 0,
    pequenos.join(' · '));

  /* Un botón que se ve pero no se puede pulsar es peor que uno que no está: el
     jugador insiste. El caso real que destapó esta comprobación fue la tarjeta
     de Justus plantada sobre la barra de acciones del perfilamiento. */
  /* Estar fuera del área visible de un contenedor con scroll NO es quedar
     tapado: es una lista que se arrastra, y eso el jugador lo entiende. Solo
     interesa el botón que SE VE y aun así no recibe su propio toque. */
  const dentroDeSuScroll = (el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowY;
      if (ov !== 'auto' && ov !== 'scroll' && ov !== 'hidden') continue;
      const pr = p.getBoundingClientRect();
      if (r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return false;
    }
    return true;
  };

  /* Que una PANTALLA entera esté delante tampoco es tapar un botón: la portada
     cubre el HUD del nivel que carga detrás, y eso es lo que tiene que pasar. Se
     descarta al oclusor que ocupa casi todo el viewport; lo que se persigue aquí
     es el solapamiento accidental entre piezas de una misma pantalla. */
  const esPantallaCompleta = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.92 && r.height >= window.innerHeight * 0.92;
  };

  const tapados = [];
  for (const el of nodos) {
    if (el.tagName !== 'BUTTON' || !visible(el) || !dentroDeSuScroll(el)) continue;
    const r = el.getBoundingClientRect();
    const enCentro = document.elementFromPoint(
      Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (enCentro && !el.contains(enCentro) && !enCentro.contains(el)
        && !esPantallaCompleta(enCentro)) {
      tapados.push(`${nombre(el)} ← ${nombre(enCentro)}`);
    }
  }
  a.ok('ningún botón visible queda tapado por otra capa', tapados.length === 0,
    tapados.join(' · '));
  a.ok('ningún panel se sale por los lados', cortados.length === 0,
    cortados.join(' · '));
  a.ok('la página no hace scroll horizontal',
    document.documentElement.scrollWidth <= window.innerWidth,
    `scrollWidth=${document.documentElement.scrollWidth} vs ${window.innerWidth}`);

  /* La tarjeta de Justus se coloca midiendo el mobiliario de abajo. Si esa
     medida se equivoca —pasó con la hotbar del Nivel 4, que en táctil no está
     abajo— la tarjeta sale despedida contra el techo y se corta. */
  const jc = document.querySelector('#justus-coach');
  if (jc && visible(jc)) {
    const r = jc.getBoundingClientRect();
    a.ok('la tarjeta de Justus cabe entera en pantalla',
      r.top >= -1 && r.bottom <= window.innerHeight + 1,
      `top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} vp=${window.innerHeight}`);
    a.ok('la tarjeta de Justus no roba el dedo al juego',
      getComputedStyle(jc).pointerEvents === 'none');
  }

  // Las hojas modales tienen que dejar su acción a la vista sin buscarla.
  const modales = [...document.querySelectorAll(
    '.cp-per-card, .cp-velo-card, .cp-fallo-card, .cp-panel-card, .sheet')]
    .filter(visible);
  for (const m of modales) {
    const accion = m.querySelector(
      '.cp-per-acciones, .cp-cierre-acciones, .cp-empezar, .cp-fallo-ok, button.firma');
    if (!accion) continue;
    const r = accion.getBoundingClientRect();
    a.ok(`la acción de ${nombre(m)} está a la vista sin scroll`,
      r.bottom <= window.innerHeight + 1 && r.top >= -1,
      `top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} vp=${window.innerHeight}`);
  }

  return a.imprimir(`${etiqueta} · ${window.innerWidth}×${window.innerHeight}`);
}

// ── 3. Todo junto ───────────────────────────────────────────────────────────
export async function todo() {
  const cola = await colaJustus();
  const ui = auditarPantalla();
  const total = { pass: cola.pass + ui.pass, fail: cola.fail + ui.fail };
  console.log(`%cTOTAL — ${total.pass} OK / ${total.fail} FALLO`,
    `color:${total.fail ? '#e04a3c' : '#3fc47f'};font-weight:700;font-size:14px`);
  return { ...total, cola, ui };
}
