import * as THREE from 'three';
import gsap from 'gsap';
import { Engine } from '../core/Engine.js';

// Sin lagSmoothing: con FPS bajos, GSAP congelaba su reloj y las transiciones
// "gateaban" minutos. Preferimos que salten al día: el tiempo del juego manda.
gsap.ticker.lagSmoothing(0);
import { bus, Señal } from '../core/EventBus.js';
import { CinematicCamera, Vista } from '../camera/CinematicCamera.js';
import { Renderer } from '../render/Renderer.js';
import { Terminal } from '../world/Terminal.js';
import { AmbientNPCs } from '../world/AmbientNPCs.js';
import { PassengerActor } from '../world/PassengerActor.js';
import { Desk } from '../world/Desk.js';
import { Justus } from '../world/Justus.js';
import { NewsTV } from '../world/NewsTV.js';
import { PassportBook } from '../world/PassportBook.js';
import { Police } from '../world/Police.js';
import { Motas } from '../world/Motas.js';
import { XRayView } from '../xray/XRayView.js';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';
import { TurnManager } from '../gameplay/TurnManager.js';
import { HUD } from '../ui/HUD.js';
import { coach } from '../ui/JustusCoach.js';
import { puntaje, VALOR } from '../core/Puntaje.js';
import { Marcador } from '../ui/Marcador.js';
import { CanalRojo } from '../gameplay/CanalRojo.js';
import { Dirandro } from '../gameplay/Dirandro.js';
import { Perfilamiento } from '../gameplay/Perfilamiento.js';

/**
 * main — el director de orquesta.
 * Une motor, mundo, cámara, audio, física y gameplay siguiendo el ciclo por
 * pasajero del Bucle Principal: llegada → herramientas → sello → consecuencia.
 */

// ── Escenario ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl');
const scene = new THREE.Scene();
const cine = new CinematicCamera(null);
const renderer = new Renderer(canvas, scene, cine.camera);
cine.renderer = renderer;

const terminal = new Terminal(scene, renderer.gl);
const npcs = new AmbientNPCs(scene);
const desk = new Desk(scene, audio, cine);
const justus = new Justus(scene, audio);
const newsTV = new NewsTV(scene, audio);
const passportBook = new PassportBook(scene, cine.camera, audio);
const police = new Police(scene);
// Polvo suspendido sobre el puesto: los fluorescentes del techo dejan de ser
// planos y el aire entre la cámara y el pasajero pasa a tener cuerpo.
const motas = new Motas(scene, {
  centro: new THREE.Vector3(0, 1.9, -1.2),
  ancho: 11, alto: 3.4, fondo: 9,
  color: 0xe6eefa, opacidad: 0.17, tam: 8,
});
const xray = new XRayView(renderer.gl);
const hud = new HUD(document.getElementById('hud-root'));
const marcador = new Marcador(document.getElementById('hud-root'));
const turn = new TurnManager();
const engine = new Engine();

// El canal rojo vive DENTRO de esta terminal (a la derecha del puesto): entrar
// es un movimiento de cámara, no una carga de nivel. El decorado se construye
// la primera vez que se deriva a alguien.
const canal = new CanalRojo({
  scene, cine, audio, justus, hud, canvas,
  base: new THREE.Vector3(9.2, 0, -4.2),
});

// La sala de DIRANDRO se levanta lejos del hall y con paredes propias: el
// encierro tiene que ser real. Se construye solo si un caso llega hasta ahí.
const dirandro = new Dirandro({
  scene, cine, audio, hud,
  base: new THREE.Vector3(26, 0, -4),
});

// Acto 1 del turno: el mirador sobre la sala de llegadas.
const perfil = new Perfilamiento({
  scene, cine, audio, hud, canvas,
  base: new THREE.Vector3(0, 0, -10.5),
});

// ── Estado de sesión ──────────────────────────────────────────────────────
let actor = null;            // PassengerActor en el puesto
let interrogatorio = null;   // atajo a turn.interrogatorio
let confesion = false;       // el quiebre dejó el caso resuelto
let justusUsado = false;
let tensionExtra = 0;        // aporte de contexto (trama, quiebre) a la tensión
let ultimoTell = null;       // {zona, t} — para el toque directo al pasajero

/** Diálogo con voz: subtítulo en pantalla + narración por speechSynthesis. */
function decir(hablante, texto, opts = {}) {
  hud.dialog(hablante, texto, opts.cps);
  narrator.decir(hablante, texto);
}

// ── Bucle de sistemas ─────────────────────────────────────────────────────
engine.add(terminal);
engine.add(npcs);
engine.add(desk);
engine.add(justus);
engine.add(newsTV);
engine.add(police);
engine.add(motas);
engine.add({ update: (dt, t) => actor?.update(dt, t) });
engine.add({
  update(dt, t) {
    canal.update(dt, t);
    canal.tick(dt);
    dirandro.update(dt, t);
    perfil.update(dt, t);
  },
});
engine.add(cine);
engine.add({
  update(dt, t) {
    // Tensión dramática global: el estrés del interrogado + el contexto.
    const stressN = interrogatorio ? interrogatorio.stress / 100 : 0;
    const enCloseup = cine.vista === Vista.CLOSEUP ? 1 : 0.45;
    const tension = Math.min(1, stressN * enCloseup + tensionExtra);
    renderer.tension = tension;
    cine.setTension(tension);
    audio.setTension(tension);

    // Justus huele el miedo: banda crítica de estrés = gruñido de vigilancia.
    justus.setAlerta(!!actor && !!interrogatorio && !interrogatorio.quebrado && interrogatorio.stress >= 80);

    // Los rayos X renderizan por su cuenta, así que hay que darle el latido al
    // guardián de FPS a mano: si no, el nivel se queda sin red de seguridad
    // durante todo el minijuego — justo su pantalla más cargada.
    if (xray.active) { renderer.vigilar(); xray.update(dt, t); }
    else renderer.update(dt);
  },
});

// ── Flujo del turno ───────────────────────────────────────────────────────
/**
 * El turno tiene tres actos desde ADR-012:
 *
 *   1. **PERFILAMIENTO** — el mirador sobre la sala de llegadas: a quién derivas.
 *   2. **CANAL ROJO** — si marcaste a alguien, su equipaje sobre la mesa. Aquí
 *      es donde el acierto (o el error) del acto 1 se paga en carne.
 *   3. **PUESTO** — el bucle clásico de cuatro pasajeros, que no se toca.
 *
 * Y dentro del acto 3, sellar RETENIDO o DERIVADO vuelve a abrir el canal rojo
 * (y, si aparece sustancia, la sala de DIRANDRO). El nivel dejó de ser un
 * mostrador para pasar a ser un recorrido por el control entero.
 */
/**
 * EL PERFILAMIENTO NO ABRE TODOS LOS TURNOS (playtest 2026-08-12).
 *
 * El Backlog ya dejaba escrita esta salida —«mover el acto 1 a uno de cada dos
 * turnos si en pruebas con adolescentes se hace largo»— y la prueba dice que sí
 * se hace largo. Jugando el nivel de principio a fin hay que atravesar NUEVE
 * pantallas antes del primer interrogatorio: sala de llegadas, ficha, acta de
 * derivación, canal rojo, a veces DIRANDRO y por fin el briefing del turno. Para
 * un juego que se presenta con «todos te mienten», tardar tanto en sentar a
 * alguien enfrente es el problema de ritmo más caro que tiene.
 *
 * En turnos impares se entra por el mirador (el turno 1 SIEMPRE, que es donde se
 * enseña); en los pares se entra directo al mostrador. El acto no desaparece: se
 * alterna, y de paso deja de ser rutina — cuando toca, se nota.
 */
const PERFILAMIENTO_CADA = 2;

function beginTurn() {
  puntaje.reiniciarTurno(); // el marcador es del TURNO; el récord sobrevive aparte
  if (turn.turnoN % PERFILAMIENTO_CADA === 1) iniciarPerfilamiento();
  else arrancarPuesto();
}

/** Qué esconde el equipaje de alguien derivado desde el perfilamiento. */
const TIPOS_PERFILADO = ['dinero', 'mercancia', 'fauna', 'patrimonio', 'sustancia'];

/**
 * Justus explica el perfilamiento. Tres frases, ninguna de más de 100 caracteres.
 *
 * Antes eran cuatro de ~180 (729 caracteres, casi un minuto de lectura seguida)
 * y empezaban con «el mirador», «el canal rojo» y «una derivación»: tres
 * palabras que un jugador nuevo no conoce, en la primera frase del juego. Se
 * dicen ahora en el idioma en que se piensa la acción — mirar, elegir, marcar —
 * y la jerga la aprende cuando la ve escrita en su propia acta.
 */
const PASOS_JUSTUS_PERFILAMIENTO = [
  {
    // No repite la orden que ya está en la cabecera del acto: la completa.
    txt: '¡Jefe! Soy Justus. Aquí se mira a todos antes de decidir.',
  },
  {
    txt: 'Su ficha no trae ni foto ni pinta: solo lo que la persona ESTÁ HACIENDO.',
  },
  {
    txt: 'Buscamos a quien EVITA el control, no al que suda o corre. Y se marca por conducta: por el color o el país, jamás.',
    foco: '.pf-cab',
  },
];

function iniciarPerfilamiento() {
  hud.setModoZona(true);
  hud.hideTools();
  hud.hideDock();
  hud.hideDialog();
  hud.clearSeñales();
  hud.setTopbar({
    turno: turn.turnoN, franja: `${turn.reputacion}/100`, alerta: 'ACTO 1 · PERFILAMIENTO',
  });
  narrator.decir(null, 'Sala de llegadas. Mira quién viene, no cómo viene vestido.', { esNarrador: true });
  // El figurantaje del hall se retira: comparte zona con el grupo del
  // perfilamiento y, al no responder al dedo, solo genera clics fallidos.
  npcs.setVisible(false);

  // La clase magistral del acto 1, una sola vez en la carrera. Justus lo explica
  // porque viniendo de él la regla antisesgo no suena a cartel institucional:
  // suena a un veterano diciéndote cómo se hace el trabajo.
  if (turn.turnoN === 1) {
    // 1,2 s, no 2,4: el jugador acaba de entrar a una sala llena de gente y lo
    // primero que quiere saber es qué se toca. Dos segundos y medio mirando sin
    // que pase nada es exactamente el hueco por el que se abandona una partida.
    setTimeout(() => coach.guiar('perfilamiento', PASOS_JUSTUS_PERFILAMIENTO), 1200);
  } else {
    coach.setPata(true);
  }

  perfil.abrir({
    onCerrar: ({ marcada, acierto }) => {
      if (!marcada) { arrancarPuesto(); return; }
      hud.setTopbar({
        turno: turn.turnoN, franja: `${turn.reputacion}/100`, alerta: 'ACTO 2 · CANAL ROJO',
      });
      // Aquí se cierra el círculo del acto 1: si acertaste hay algo dentro; si
      // te equivocaste de persona, el operativo sale vacío y hay que verlo.
      canal.abrir({
        tipo: acierto ? TIPOS_PERFILADO[Math.floor(Math.random() * TIPOS_PERFILADO.length)] : 'nada',
        titular: marcada.nombre,
        onCerrar: ({ derivaDirandro }) => {
          if (!derivaDirandro) { arrancarPuesto(); return; }
          dirandro.abrir({
            titular: marcada.nombre,
            hayHallazgo: true,
            onCerrar: () => arrancarPuesto(),
          });
        },
      });
    },
  });
}

function arrancarPuesto() {
  hud.setModoZona(false);
  npcs.setVisible(true);
  audio.setFocus('mundo');
  tensionExtra = 0;
  cine.goTo(Vista.PUESTO, { duration: 1.1 });
  setTimeout(() => turn.iniciarTurno(), 600);
}

bus.on(Señal.TURNO_INICIADO, ({ turno, briefing }) => {
  hud.setTopbar({ turno, franja: `${turn.reputacion}/100`, alerta: 'ALERTA: RUTA CALIENTE' });
  hud.showBriefing(turno, briefing, presentNext);
  narrator.decir(null, briefing, { esNarrador: true });
});

function presentNext() {
  // Limpieza del pasajero anterior.
  if (actor) { actor.dispose(scene); actor = null; }
  desk.clearDecals();
  hud.hideTools();
  hud.hideDialog();
  hud.clearSeñales();
  confesion = false;
  justusUsado = false;
  tensionExtra = 0;

  narrator.callar();
  justus.reset(); // pase lo que pase, el K-9 vuelve a su puesto entre pasajeros
  police.limpiar();

  const caso = turn.siguientePasajero();
  if (!caso) return; // el cierre llega por TURNO_FINALIZADO

  interrogatorio = turn.interrogatorio;
  // El actor necesita la línea base psicológica (vive en psique, no en perfil).
  actor = new PassengerActor(scene, { ...caso.perfil, lineaBase: caso.psique.lineaBase });
  npcs.advanceQueue();
  passportBook.cerrar();
  // Al llegar al puesto, el pasajero ENTREGA el pasaporte con la mano;
  // el objeto físico nace en el vértice del gesto y cae al mostrador.
  const esteActor = actor;
  setTimeout(() => {
    if (actor === esteActor) actor.entregarPasaporte(() => desk.tossPassport());
  }, 1700);
  if (caso.esTrama) tensionExtra = 0.22; // el clímax se siente antes de saberse

  cine.goTo(Vista.PUESTO);
  audio.setFocus('mundo');
  hud.setTopbar({
    turno: turn.turnoN, pasajero: turn.indice + 1, total: turn.cola.length,
    franja: `${turn.reputacion}/100`, alerta: caso.esTrama ? 'VUELO DE MADRUGADA · RUTA CALIENTE' : '',
  });
  hud.showFicha(caso);
  showMainDock();

  // El pasajero saluda casi al llegar. Antes tardaba 2,6 s en abrir la boca y
  // el jugador se quedaba mirando a un muñeco callado con el dock ya puesto.
  setTimeout(() => { if (turn.caso === caso) decir(caso.perfil.nombre, caso.dialogos.saludo); }, 1400);

  // Justus da la bienvenida al puesto en el primer pasajero de la carrera.
  // Espera a que el saludo del pasajero termine: dos voces a la vez no se
  // entiende ninguna. Con el saludo adelantado a 1,4 s, 3,2 basta — y son tres
  // segundos en los que el dock ya está vivo y se puede tocar, no de bloqueo.
  if (turn.turnoN === 1 && turn.indice === 0) {
    setTimeout(() => { if (turn.caso === caso) coach.guiar('aeropuerto', PASOS_JUSTUS_AEROPUERTO); }, 3200);
  } else {
    coach.setPata(true);
  }
}

/**
 * El K-9 presenta el puesto: una frase por herramienta, iluminando su botón.
 *
 * Antes eran seis párrafos de ~160 caracteres (983 en total, 70 s de lectura
 * seguida) con la presentación del perro incluida. Un jugador que acaba de ver
 * aparecer cinco botones no quiere la biografía de nadie: quiere saber para qué
 * sirve cada uno. Como cada paso SEÑALA su botón, el texto solo tiene que
 * completar lo que el dedo ya está mirando.
 */
const PASOS_JUSTUS_AEROPUERTO = [
  {
    txt: 'Soy Justus, jefe. Doce años en esta puerta. Le presento el puesto.',
  },
  {
    txt: 'INTERROGAR: siéntese enfrente. Sus ojos, sus manos y su garganta son botones.',
    foco: '#dock button[data-tool="interrogar"]',
  },
  {
    txt: 'DOCUMENTOS: arrastre las hojas. Los sellos no mienten.',
    foco: '#dock button[data-tool="documentos"]',
  },
  {
    txt: 'RAYOS X: cambie el contraste y toque la silueta rara.',
    foco: '#dock button[data-tool="xray"]',
  },
  {
    txt: 'Y si duda, llámeme. Cuando me siento junto a una maleta, no me equivoco.',
    foco: '#dock button[data-tool="justus"]',
  },
  {
    txt: 'DECIDIR sella, y el sello no se deshace. Sin señales anotadas es una corazonada… y se pagan.',
    foco: '#dock button[data-tool="decidir"]',
  },
];

function showMainDock() {
  const caso = turn.caso;
  hud.hideTools();
  hud.showDock([
    { id: 'interrogar', label: 'INTERROGAR', onClick: openInterrogation },
    { id: 'documentos', label: 'DOCUMENTOS', onClick: openDocuments },
    { id: 'xray', label: 'RAYOS X', onClick: openXray },
    { id: 'justus', label: justusUsado ? 'JUSTUS ✓' : 'JUSTUS (K-9)', disabled: justusUsado, onClick: callJustus },
    ...(turn.escanerCorporalDisponible()
      ? [{ id: 'corporal', label: 'ESCÁNER CORPORAL', cls: 'peligro', onClick: openCorporal }]
      : []),
    { id: 'decidir', label: 'DECIDIR', cls: 'primary', onClick: openDecision },
  ]);
  bus.emit(Señal.HERRAMIENTA_USADA, { caso_id: caso.id });
}

// ── Interrogatorio ────────────────────────────────────────────────────────
function openInterrogation() {
  cine.goTo(Vista.CLOSEUP);
  audio.setFocus('closeup');
  hud.hideDock();
  bus.emit(Señal.INTERROGATORIO_INICIADO, { caso_id: turn.caso.id });
  refreshInterrogation();
}

function refreshInterrogation() {
  hud.hideTools();
  hud.showInterrogation(
    {
      agotado: interrogatorio.agotado,
      quebrado: interrogatorio.quebrado,
      evidencias: turn.expediente,
    },
    {
      preguntar(tema) { applyResult(interrogatorio.preguntar(tema)); },
      presionar() {
        const res = interrogatorio.presionar();
        if (res.cerrado) hud.toast('Se cierra: «O me imputa algo, o llamamos a mi abogado.» Tiempo perdido.', { alerta: true });
        if (res.abuso) reportAbuse();
        applyResult(res);
      },
      calmar() {
        const res = interrogatorio.calmar();
        if (res.señalInocencia) {
          hud.showTellChip('se calma DE VERDAD — firma del inocente', () => turn.registrarSeñal(res.señalInocencia));
        }
        applyResult(res);
      },
      silencio() { applyResult(interrogatorio.silencio()); },
      confrontar() {
        const ev = turn.expediente[0];
        const res = interrogatorio.confrontar(ev.id);
        if (res.abuso) {
          reportAbuse();
          hud.toast('Confrontaste sin base a una persona que solo estaba asustada.', { alerta: true });
        }
        if (res.señalExtra) turn.registrarSeñal(res.señalExtra);
        applyResult(res);
      },
      cerrar() {
        cine.goTo(Vista.PUESTO);
        audio.setFocus('mundo');
        showMainDock();
      },
    },
  );
}

function applyResult(res) {
  if (interrogatorio.fuga) return; // la escena de fuga manda: nada de diálogo normal
  if (res.dialogo) {
    // El estrés modula la voz: aguda y entrecortada cuando el miedo aprieta.
    hud.dialog(turn.caso.perfil.nombre, res.dialogo);
    narrator.decir(turn.caso.perfil.nombre, res.dialogo, { estres: interrogatorio.stress / 100 });
  }
  if (res.tell) {
    actor.gesto(res.tell.gesto ?? 'mano_cuello');
    ultimoTell = { zona: res.tell.zona, t: performance.now() };
    bus.emit(Señal.TELL_EMITIDO, res.tell);
    offerTopologyChip();
  }
  actor.setStress(interrogatorio.stress);
  if (!interrogatorio.quebrado) refreshInterrogationSoon();
}

function offerTopologyChip() {
  // La topología del estrés es una señal en sí misma cuando ya es legible.
  const mapa = { 'CASO-102': 's_uniforme', 'CASO-103': 's_picos', 'CASO-104': 's_esquiva' };
  const id = mapa[turn.caso.id];
  if (!id || !interrogatorio.topologiaLegible()) return;
  if (turn.expediente.some((s) => s.id === id)) return;
  hud.showTellChip(turn.caso.señales[id], () => turn.registrarSeñal(id));
}

let refreshTimer = null;
function refreshInterrogationSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshInterrogation, 350);
}

function reportAbuse() {
  turn.registrarAbuso();
  cine.shake(0.8);
  puntaje.sumar(VALOR.abuso, 'EXCESO SIN INDICIOS',
    { detalle: 'Presionar sin nada escrito no es firmeza: es un procedimiento que no se sostiene.' });
}

bus.on(Señal.QUIEBRE, ({ es_culpable }) => {
  const caso = turn.caso;
  audio.stinger();
  cine.shake(1.2);
  tensionExtra = 0.5;
  if (es_culpable) {
    confesion = true;
    actor.gesto('quiebre_confiesa');
    decir(caso.perfil.nombre, caso.dialogos.quiebre, { cps: 32 });
    hud.toast('QUIEBRE: la confesión queda registrada. El caso está prácticamente resuelto.');
    puntaje.sumar(VALOR.quiebreCulpable, 'QUIEBRE CON BASE · confesión registrada');
  } else {
    // El falso positivo tiene rostro: escena de consecuencia inmediata (P4).
    actor.gesto('quiebre_colapso');
    turn.registrarAbuso();
    turn.registrarAbuso();
    hud.dialog('', caso.dialogos.quiebre, 30);
    narrator.decir(null, caso.dialogos.quiebre, { esNarrador: true });
    hud.toast('Quebraste a una inocente. La fila entera lo vio. Tu reputación paga.', { alerta: true, dur: 5200 });
    puntaje.sumar(VALOR.quiebreInocente, 'QUEBRASTE A UNA PERSONA INOCENTE',
      { detalle: 'El estrés alto NO es culpa. Mucha gente honesta se desarma frente a un uniforme.' });
  }
  setTimeout(refreshInterrogation, 400);
});

// ── LA FUGA: clímax de estrés 100 (Interrogatorio §La fuga) ───────────────
bus.on(Señal.FUGA, () => {
  const caso = turn.caso;
  confesion = true;      // la fuga es flagrancia: evidencia plena
  tensionExtra = 0.85;   // el corazón a tope, la lente al límite
  hud.hideTools();
  hud.hideDock();
  hud.hideDialog();
  puntaje.sumar(VALOR.fuga, 'FUGA = FLAGRANCIA',
    { detalle: 'Correr ante el control es, por sí solo, evidencia plena.' });

  // 1) El estallido: gira y corre. La cámara abre y persigue con la mirada.
  audio.stinger();
  cine.shake(1.5);
  cine.goTo(Vista.PUESTO, { duration: 0.7 });
  const destino = actor.huir();
  hud.dialog('', '¡¡SE ESCAPA!!', 60);
  audio.justus(true); // el K-9 explota en ladridos
  setTimeout(() => audio.justus(true), 600);

  // La mirada de la cámara sigue la carrera hacia el fondo.
  setTimeout(() => {
    gsap.to(cine.baseLook, { x: destino.x * 0.6, y: 1.0, z: -5.5, duration: 1.8, ease: 'power2.inOut' });
    gsap.to(cine.camera, { fov: 62, duration: 1.4, onUpdate: () => cine.camera.updateProjectionMatrix() });
  }, 500);

  // 2) La intervención: silbato y dos oficiales desde los flancos.
  setTimeout(() => audio.silbato(), 900);
  police.capturar(actor.group, destino, {
    onCornered() {
      // 3) El cerco se cierra: colapso, llanto y la frase que cae como un sello.
      actor.capturado();
      audio.llanto();
      cine.shake(1.2);
      setTimeout(() => {
        hud.dialog('Oficial de policía', '¡Se acabó! Va a tener que pagar la multa máxima.', 38);
        narrator.decir('Oficial de policía', '¡Se acabó! Va a tener que pagar la multa máxima.');
      }, 1200);
    },
    onDone() {
      // 4) Escoltado fuera de cámara. El expediente se cierra con el sello.
      hud.hideDialog();
      hud.showConsequence(
        `${caso.perfil.nombre} corrió. La fuga lo dijo todo: flagrancia, multa máxima y el expediente completo sobre tu mostrador.`,
        () => openDecision(),
      );
      narrator.decir(null, 'La fuga lo dijo todo.', { esNarrador: true });
      tensionExtra = 0.3;
    },
  });
});

// ── Documentos ────────────────────────────────────────────────────────────
function openDocuments() {
  cine.goTo(Vista.ESCRITORIO);
  audio.papel();
  hud.hideTools();
  // El pasaporte es un libro 3D con hojas arrastrables; llegar a la página
  // de sellos registra su señal. El resto de papeles sigue en fichas.
  passportBook.abrir(turn.caso, (señalId) => {
    if (turn.registrarSeñal(señalId)) {
      audio.beep(true);
      hud.toast('La página de sellos habla: señal registrada en el expediente.');
    }
  });
  const tienePasaporte = turn.caso.documentos.some((d) => d.id === 'pasaporte');
  if (tienePasaporte) hud.toast('Arrastra las hojas del pasaporte para pasarlas.', { dur: 3600 });
  hud.showDocuments(
    { ...turn.caso, documentos: turn.caso.documentos.filter((d) => d.id !== 'pasaporte') },
    (señalId) => {
      audio.papel();
      if (turn.registrarSeñal(señalId)) audio.beep(true);
    },
  );
  hud.showDock([{
    label: 'VOLVER AL PUESTO',
    onClick() {
      hud.hideDocuments();
      passportBook.cerrar();
      cine.goTo(Vista.PUESTO);
      showMainDock();
    },
  }]);
}

// ── Rayos X ───────────────────────────────────────────────────────────────
function openXray() {
  hud.hideTools();
  hud.hideDock();
  hud.hideDialog();
  audio.escaner(true);
  audio.setFocus('monitor');
  xray.open(turn.caso, (item) => {
    hud.xrayLabel(item.etiqueta);
    if (item.señal) {
      const nueva = turn.registrarSeñal(item.señal);
      audio.beep(true);
      if (nueva) audio.stinger();
    } else {
      audio.beep(false);
    }
  });
  hud.showXray({
    contraste(m) { xray.setContraste(m); audio.beep(true); },
    salir() {
      xray.close();
      audio.escaner(false);
      audio.setFocus('mundo');
      hud.hideXray();
      cine.goTo(Vista.PUESTO, { duration: 0.9 });
      showMainDock();
    },
  });
}

// ── Justus (K-9) ──────────────────────────────────────────────────────────
function callJustus() {
  if (justus.ocupado) return;
  justusUsado = true;
  const j = turn.caso.justus;
  const marca = j.objetivo !== 'nada';

  // La cámara baja a la altura del perro: su trabajo merece su plano.
  hud.hideDock();
  hud.hideDialog();
  cine.goTo(Vista.JUSTUS, { duration: 1.1 });

  justus.olfatear({ objetivo: j.objetivo, insistente: j.insistente }).then(() => {
    const textos = {
      nada: 'Justus rodea al pasajero, olfatea el equipaje… y se aparta. Nada.',
      maleta: j.insistente
        ? 'Justus marca la caja y SE SIENTA. No se aparta. No se está equivocando.'
        : 'Justus marca el equipaje y se sienta.',
      persona: 'Justus ignora la mochila… y marca a la PERSONA. A la persona, no al equipaje.',
    };
    hud.toast(textos[j.objetivo], { dur: 4200 });
    if (j.señal) turn.registrarSeñal(j.señal);
    cine.shake(marca ? 0.7 : 0.2);
    cine.goTo(Vista.PUESTO, { duration: 1.2 });
    showMainDock(); // refresca (puede habilitar el escáner corporal)
  });
}

// ── Escáner corporal (CASO-103, §28: siluetas) ───────────────────────────
function openCorporal() {
  hud.hideTools();
  hud.hideDock();
  hud.showCorporal(
    () => {
      const ec = turn.caso.escanerCorporal;
      turn.registrarSeñal(ec.señal);
      audio.stinger();
      hud.toast(ec.texto, { alerta: true, dur: 4500 });
    },
    showMainDock,
  );
}

// ── Decisión: el sello ────────────────────────────────────────────────────
function openDecision() {
  cine.goTo(Vista.SELLO);
  audio.setFocus('mundo');
  hud.hideTools();
  hud.hideDock();
  hud.hideDialog();
  hud.showDecision(confesion ? -1 : turn.expediente.length, (decisionId) => {
    // El juice de la duda: con expediente flojo, la mano tiembla (nunca bloquea).
    const dudar = !confesion && turn.expediente.length < 2;
    desk.stamp(decisionId, dudar, () => {
      const resultado = turn.decidir(decisionId, { confesion });
      const escoltado = ['RETENIDO', 'DERIVADO'].includes(decisionId);
      puntaje.porVeredicto(resultado.calidad);
      actor.salir({ escoltado });
      hud.hideFicha();
      tensionExtra = resultado.calidad === 'fallo' ? 0.3 : 0.1;

      // RETENIDO y DERIVADO ya no son un párrafo: son la puerta del canal rojo.
      // El sello deja de ser el final del caso y pasa a ser su segundo acto.
      if (escoltado) {
        setTimeout(() => entrarCanalRojo(resultado, turn.caso), 1100);
        return;
      }

      cine.goTo(Vista.PUESTO, { duration: 1.8 });
      setTimeout(() => {
        hud.showConsequence(resultado.escena, presentNext);
        narrator.decir(null, resultado.escena, { esNarrador: true });
        bus.emit(Señal.CONSECUENCIA_MOSTRADA, { caso_id: turn.caso.id });
      }, 900);
    });
  });
}

// ── Acto 3: el canal rojo (`02 - Diseño/12`) ─────────────────────────────
/**
 * Qué esconde el equipaje de cada caso. La coherencia importa: derivar a Doña
 * Rosa manda al canal un operativo VACÍO, y el jugador tiene que descubrir por
 * sí mismo que no hay nada — la lección que ningún texto sustituye.
 */
const HALLAZGO_POR_CASO = {
  'CASO-101': 'mercancia',
  'CASO-102': 'nada',
  'CASO-103': 'sustancia',
  'CASO-104': 'patrimonio',
  'CASO-105': 'dinero',
  'CASO-106': 'fauna',
};

function entrarCanalRojo(resultado, caso) {
  hud.hideTools();
  hud.hideDock();
  hud.hideDialog();
  hud.setModoZona(true);
  coach.setPata(false);
  tensionExtra = 0.25;

  canal.abrir({
    tipo: HALLAZGO_POR_CASO[caso.id] ?? 'mercancia',
    titular: caso.perfil.nombre,
    onCerrar: ({ derivaDirandro }) => {
      if (derivaDirandro) entrarDirandro(resultado, caso);
      else volverAlPuesto(resultado, caso);
    },
  });
}

/**
 * El escalón siguiente: cuando el canal rojo encuentra indicio de sustancia,
 * Aduanas deja de ser competente y entra la Policía. El corte a negro no es
 * estética: marca que se cruzó una puerta que no se cruza a la ligera.
 */
function entrarDirandro(resultado, caso) {
  hud.showConsequence(
    'Indicio de sustancia controlada. Aduanas deja de ser competente: se convoca a DIRANDRO '
    + 'y el equipaje pasa a la sala de revisión intrusiva.',
    () => {
      dirandro.abrir({
        titular: caso.perfil.nombre,
        // El único caso del set con carga corporal real es el mochilero (G3).
        // En los demás, llegar aquí significa que el jugador escaló de más — y
        // el acta se lo va a decir.
        hayHallazgo: caso.id === 'CASO-103',
        onCerrar: () => volverAlPuesto(resultado, caso),
      });
    },
  );
  narrator.decir(null, 'Indicio de sustancia. Entra DIRANDRO.', { esNarrador: true });
}

function volverAlPuesto(resultado, caso) {
  hud.setModoZona(false);
  tensionExtra = 0.1;
  cine.goTo(Vista.PUESTO, { duration: 1.6 });
  audio.setFocus('mundo');
  setTimeout(() => {
    hud.showConsequence(resultado.escena, presentNext);
    narrator.decir(null, resultado.escena, { esNarrador: true });
    bus.emit(Señal.CONSECUENCIA_MOSTRADA, { caso_id: caso.id });
  }, 800);
}

// ── Cierre del turno: el Noticiero primero, la Hoja de Servicio después ───
bus.on(Señal.TURNO_FINALIZADO, (data) => {
  hud.hideTools();
  hud.hideDock();
  hud.hideFicha();
  hud.hideDialog();
  hud.setTopbar({ turno: turn.turnoN - 1, franja: data.franja, alerta: '' });

  // Pan cinematográfico al televisor de la pared: la madrugada tiene noticias.
  cine.goTo(Vista.NOTICIERO, { duration: 2.2 });
  audio.setFocus('monitor');
  tensionExtra = data.titulares.length ? 0.35 : 0.12;

  const titulares = data.titulares.length
    ? data.titulares
    : ['Madrugada tranquila en el aeropuerto.', 'Sin novedades del control de aduanas. Por ahora.'];
  setTimeout(() => {
    newsTV.encender(titulares);
    narrator.decir('noticiero', `Última hora. ${titulares.join(' ')}`, { esNarrador: true });
  }, 1400);

  setTimeout(() => {
    hud.showConsequence('', () => {
      newsTV.apagar();
      audio.setFocus('mundo');
      tensionExtra = 0;
      cine.goTo(Vista.PUESTO, { duration: 1.4 });
      hud.showSummary({ ...data, balanceHTML: Marcador.balanceHTML() }, beginTurn);
    });
  }, 2600);
});

// ── Expediente en pantalla ────────────────────────────────────────────────
// Cada señal anotada suma en el acto: el jugador ve que documentar PAGA, que es
// exactamente la lección aduanera que el juego quiere dejar (Regla de Oro §2).
bus.on(Señal.SENAL_REGISTRADA, ({ texto }) => {
  hud.addSeñal(texto);
  puntaje.sumar(VALOR.senal, 'SEÑAL ANOTADA EN EL EXPEDIENTE', { detalle: texto });
});

// ── Interacción directa: TOCAR al pasajero en el close-up ─────────────────
// El cuerpo es la interfaz (regla 6 del interrogatorio): si el jugador toca la
// zona que acaba de "hablar" (ojos/boca/manos/postura), el tell queda anotado.
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (cine.vista !== Vista.CLOSEUP || !actor || !interrogatorio || xray.active) return;
  puntero.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(puntero, cine.camera);
  const zona = actor.hitTest(raycaster);
  if (!zona) return;

  const fresco = ultimoTell && (performance.now() - ultimoTell.t) < 6000;
  if (fresco && (zona === ultimoTell.zona || zona === 'postura')) {
    // Tell atrapado con el dedo: se anota la topología si el caso la define.
    bus.emit(Señal.TELL_REGISTRADO, { zona });
    audio.beep(true);
    cine.shake(0.3);
    const mapa = { 'CASO-102': 's_uniforme', 'CASO-103': 's_picos', 'CASO-104': 's_esquiva' };
    const id = mapa[turn.caso.id];
    if (id && interrogatorio.topologiaLegible() && turn.registrarSeñal(id)) {
      hud.toast('Tell anotado en el expediente.');
    } else {
      hud.toast('Anotado: el cuerpo reaccionó. Sigue leyendo el patrón.');
      puntaje.sumar(VALOR.tell, 'TELL ATRAPADO', { detalle: 'Leíste el cuerpo en el momento exacto en que habló.' });
    }
    ultimoTell = null;
  } else {
    // Tocar sin motivo también comunica: el pasajero lo nota.
    const nombreZona = { ojos: 'sus ojos', boca: 'su garganta', manos: 'sus manos', postura: 'su postura' }[zona];
    hud.toast(`Observas ${nombreZona}. Nada fuera de lo común… por ahora.`);
  }
});

// ── Voz narrada: toggle en la barra superior ──────────────────────────────
document.getElementById('hud-root').querySelector('#btn-voz').onclick = (e) => {
  const on = narrator.toggle();
  e.currentTarget.textContent = on ? '🔊' : '🔇';
  e.currentTarget.classList.toggle('apagado', !on);
};

// ── Arranque (el clic desbloquea el audio) ────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('title-screen').classList.add('hidden');
  audio.start();
  audio.setFocus('mundo');
  engine.start();
  beginTurn();
}, { once: true });

// El mundo ya respira detrás del título.
engine.start();

// ── Atajos de QA ──────────────────────────────────────────────────────────
// F = forzar FUGA · C = canal rojo · D = sala intrusiva de DIRANDRO.
// (El mismo criterio que F9 en el Nivel 3: probar una fase sin jugar la previa.)
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f' && actor) bus.emit(Señal.FUGA, { caso_id: turn.caso.id });
  if (k === 'c' && turn.caso && !canal.activo) {
    entrarCanalRojo({ escena: 'Fin del ensayo de QA.' }, turn.caso);
  }
  if (k === 'p' && !perfil.activo && !canal.activo && !dirandro.activo) iniciarPerfilamiento();
  if (k === 'd' && turn.caso && !dirandro.activo) {
    hud.setModoZona(true);
    hud.hideTools(); hud.hideDock(); hud.hideDialog();
    dirandro.abrir({
      titular: turn.caso.perfil.nombre,
      hayHallazgo: true,
      onCerrar: () => volverAlPuesto({ escena: 'Fin del ensayo de QA.' }, turn.caso),
    });
  }
});

// Gancho de depuración (solo dev): permite inspeccionar sistemas desde la consola.
if (import.meta.env?.DEV) {
  window.__AH = {
    bus, Señal, turn, cine, newsTV, justus, audio, renderer, xray, hud, motas,
    canal, dirandro, perfil, puntaje,
  };
}
