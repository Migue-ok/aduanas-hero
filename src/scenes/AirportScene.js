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
import { XRayView } from '../xray/XRayView.js';
import { audio } from '../audio/AudioEngine.js';
import { narrator } from '../audio/Narrator.js';
import { TurnManager } from '../gameplay/TurnManager.js';
import { HUD } from '../ui/HUD.js';

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
const xray = new XRayView(renderer.gl);
const hud = new HUD(document.getElementById('hud-root'));
const turn = new TurnManager();
const engine = new Engine();

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
engine.add({ update: (dt, t) => actor?.update(dt, t) });
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

    if (xray.active) xray.update(dt, t);
    else renderer.update(dt);
  },
});

// ── Flujo del turno ───────────────────────────────────────────────────────
function beginTurn() {
  turn.iniciarTurno();
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
  }, 2700);
  if (caso.esTrama) tensionExtra = 0.22; // el clímax se siente antes de saberse

  cine.goTo(Vista.PUESTO);
  audio.setFocus('mundo');
  hud.setTopbar({
    turno: turn.turnoN, pasajero: turn.indice + 1, total: turn.cola.length,
    franja: `${turn.reputacion}/100`, alerta: caso.esTrama ? 'VUELO DE MADRUGADA · RUTA CALIENTE' : '',
  });
  hud.showFicha(caso);
  showMainDock();

  setTimeout(() => { if (turn.caso === caso) decir(caso.perfil.nombre, caso.dialogos.saludo); }, 2600);
}

function showMainDock() {
  const caso = turn.caso;
  hud.hideTools();
  hud.showDock([
    { label: 'INTERROGAR', onClick: openInterrogation },
    { label: 'DOCUMENTOS', onClick: openDocuments },
    { label: 'RAYOS X', onClick: openXray },
    { label: justusUsado ? 'JUSTUS ✓' : 'JUSTUS (K-9)', disabled: justusUsado, onClick: callJustus },
    ...(turn.escanerCorporalDisponible()
      ? [{ label: 'ESCÁNER CORPORAL', cls: 'peligro', onClick: openCorporal }]
      : []),
    { label: 'DECIDIR', cls: 'primary', onClick: openDecision },
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
  } else {
    // El falso positivo tiene rostro: escena de consecuencia inmediata (P4).
    actor.gesto('quiebre_colapso');
    turn.registrarAbuso();
    turn.registrarAbuso();
    hud.dialog('', caso.dialogos.quiebre, 30);
    narrator.decir(null, caso.dialogos.quiebre, { esNarrador: true });
    hud.toast('Quebraste a una inocente. La fila entera lo vio. Tu reputación paga.', { alerta: true, dur: 5200 });
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
      actor.salir({ escoltado });
      hud.hideFicha();
      cine.goTo(Vista.PUESTO, { duration: 1.8 });
      tensionExtra = resultado.calidad === 'fallo' ? 0.3 : 0.1;
      setTimeout(() => {
        hud.showConsequence(resultado.escena, presentNext);
        narrator.decir(null, resultado.escena, { esNarrador: true });
        bus.emit(Señal.CONSECUENCIA_MOSTRADA, { caso_id: turn.caso.id });
      }, 900);
    });
  });
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
      hud.showSummary(data, beginTurn);
    });
  }, 2600);
});

// ── Expediente en pantalla ────────────────────────────────────────────────
bus.on(Señal.SENAL_REGISTRADA, ({ texto }) => hud.addSeñal(texto));

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

// ── Atajo de prueba para forzar FUGA ──────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F') && actor) {
    bus.emit(Señal.FUGA, { caso_id: turn.caso.id });
  }
});

// Gancho de depuración (solo dev): permite inspeccionar sistemas desde la consola.
if (import.meta.env?.DEV) {
  window.__AH = { bus, Señal, turn, cine, newsTV, justus, audio, renderer };
}
