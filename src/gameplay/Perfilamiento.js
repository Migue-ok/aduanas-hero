import * as THREE from 'three';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje, VALOR } from '../core/Puntaje.js';
import { isMobile, tuneRaycaster } from '../core/Device.js';
import { generarSala, opcionesDeMotivo } from './indicadores.js';
import { SalaLlegadas } from '../world/SalaLlegadas.js';
import { HUDPerfilamiento } from '../ui/HUDPerfilamiento.js';

/**
 * Perfilamiento — el **Acto 1** del turno (`02 - Diseño/13`).
 *
 * Antes de sentarse en el puesto, el oficial mira. Un grupo de viajeros cruza la
 * sala de llegadas hacia el semáforo aduanero y hay que decidir a quién derivar
 * al canal rojo — con **una sola derivación** y con un acta que hay que firmar
 * explicando por qué.
 *
 * Todo el minijuego está construido para desmontar un reflejo concreto: el de
 * mirar a la gente y decidir por su aspecto. Lo hace de tres maneras a la vez —
 * la apariencia se sortea sin relación con la culpabilidad
 * (`indicadores.js`), la ficha del oficial no registra rasgos, y el formulario
 * de motivo incluye los criterios prohibidos para que el jugador los elija
 * alguna vez y reciba el acta de vuelta en la cara.
 *
 * Y la conexión que lo cierra: **quien queda marcado va al canal rojo de
 * verdad**. Si acertaste, hay algo. Si te equivocaste de persona, no hay nada —
 * y el juego te obliga a mirar cómo esa persona recoge su ropa delante de todos.
 */
export class Perfilamiento {
  constructor({ scene, cine, audio, hud, canvas, base }) {
    this.scene = scene;
    this.cine = cine;
    this.audio = audio;
    this.hudPrincipal = hud;
    this.canvas = canvas;
    this.base = base ?? new THREE.Vector3(0, 0, -10.5);
    this.mundo = null;
    this.ui = null;
    this.activo = false;
    this.raycaster = tuneRaycaster(new THREE.Raycaster());
    this.puntero = new THREE.Vector2();
    this.onPointer = (e) => this.#click(e);
  }

  #asegurarMundo() {
    if (!this.mundo) this.mundo = new SalaLlegadas(this.scene, this.base);
    if (!this.ui) this.ui = new HUDPerfilamiento();
    return this.mundo;
  }

  update(dt, t) { if (this.activo) this.mundo?.update(dt, t); }

  /**
   * @param {object} opts
   * @param {Function} opts.onCerrar  recibe { marcada, acierto, persona }
   */
  abrir({ onCerrar = () => {} } = {}) {
    const mundo = this.#asegurarMundo();
    this.activo = true;
    this.onCerrar = onCerrar;
    this.sala = generarSala({ cantidad: isMobile ? 5 : 7, objetivos: 1 });
    this.observados = new Set();
    this.seleccion = null;
    this.marcada = null;

    mundo.montar(this.sala);
    const v = mundo.vistaMirador;
    this.cine.enfocar(v.pos, v.look, { ...v, duration: 1.8, vista: 'perfilamiento' });
    this.audio.setFocus('mundo');

    this.ui.setBrief(
      'Grupo de llegadas en tránsito al semáforo aduanero. Observa cómo se comportan y decide '
      + 'a quién derivar. Tienes UNA derivación, y hay que justificarla por escrito.');
    this.ui.setContador(0, this.sala.gente.length);
    this.#dock();

    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.hudPrincipal?.toast('Toca a una persona para observarla. Mira lo que HACE, no cómo se ve.',
      { dur: 5200 });
    bus.emit(Señal.HERRAMIENTA_USADA, { zona: 'perfilamiento' });
  }

  #dock() {
    this.ui.showDock([
      {
        icono: '⤢', label: 'VISTA DE LA SALA',
        onClick: () => {
          this.seleccion = null;
          this.mundo.apagarResaltes();
          this.ui.hideFicha();
          const v = this.mundo.vistaMirador;
          this.cine.enfocar(v.pos, v.look, { ...v, duration: 1.0, vista: 'perfilamiento' });
        },
      },
      {
        icono: '✔', label: 'DEJAR PASAR A TODOS', cls: 'peligro',
        onClick: () => this.#dejarPasar(),
      },
    ]);
  }

  #click(e) {
    if (!this.activo) return;
    this.puntero.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.puntero, this.cine.camera);
    const id = this.mundo.hitTest(this.raycaster);
    if (id) this.#observar(id);
  }

  #observar(id) {
    if (this.seleccion === id) return;
    this.seleccion = id;
    this.mundo.resaltar(id);
    this.audio.clic('suave');

    const p = this.sala.gente.find((x) => x.id === id);
    const v = this.mundo.vistaPersona(id);
    this.cine.enfocar(v.pos, v.look, { ...v, duration: 0.9, vista: 'perfilamiento_persona' });

    if (!this.observados.has(id)) {
      this.observados.add(id);
      this.ui.setContador(this.observados.size, this.sala.gente.length);
      // Observar suma poco pero suma: el hábito de mirar a TODOS antes de
      // decidir es, literalmente, la vacuna contra el sesgo.
      puntaje.sumar(50, 'OBSERVACIÓN REGISTRADA', { neutro: true, detalle: p.conducta.corto });
    }
    this.ui.showFicha(p, { derivar: () => this.#pedirMotivo(p) });
  }

  // ── El acta ─────────────────────────────────────────────────────────────
  #pedirMotivo(p) {
    const opciones = opcionesDeMotivo(p, this.sala);
    this.ui.pedirMotivo(p, opciones,
      (op, boton) => this.#evaluarMotivo(p, op, boton),
      () => { /* sigue observando */ });
  }

  #evaluarMotivo(p, op, boton) {
    // 1) Criterio prohibido: el supervisor devuelve el acta. La derivación NO
    //    llega a producirse — el jugador tiene que encontrar un motivo real o
    //    cancelar. Cobrar y dejar pasar el acta sería enseñar que discriminar
    //    funciona pero es caro; lo que enseña de verdad es que NO SE PUEDE.
    if (op.tipo === 'prohibido') {
      this.audio.beep(false);
      this.cine.shake(0.5);
      this.ui.rechazarMotivo(boton, op.respuesta);
      puntaje.sumar(op.suave ? -180 : VALOR.perfilSesgo,
        op.suave ? 'ACTA POR CORAZONADA · RECHAZADA' : 'MOTIVO DISCRIMINATORIO · ACTA RECHAZADA',
        { detalle: op.respuesta });
      return;
    }

    // 2) Conducta ajena: describió algo que no hizo ESTA persona.
    if (op.tipo === 'ajeno') {
      this.audio.beep(false);
      this.ui.rechazarMotivo(boton, 'Eso no lo hizo esta persona. Lo vio en otra. Un acta con hechos '
        + 'que no ocurrieron se cae sola.');
      puntaje.sumar(-160, 'HECHO ATRIBUIDO A LA PERSONA EQUIVOCADA',
        { detalle: 'Observar bien incluye no mezclar a quién le viste hacer qué.' });
      return;
    }

    // 3) Motivo correcto: el acta sale. Ahora se ve si la conducta era, además,
    //    la de alguien que traía algo.
    this.ui.cerrarMotivo();
    this.#derivar(p, op);
  }

  #derivar(p, op) {
    this.activo = false;
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.marcada = p;
    this.mundo.marcarDerivado(p.id);
    this.mundo.apagarResaltes();
    this.ui.hideFicha();

    const v = this.mundo.vistaPersona(p.id);
    this.cine.enfocar(v.pos, v.look, { ...v, duration: 0.9, vista: 'perfilamiento_marcado' });

    const rigor = this.observados.size / this.sala.gente.length;
    const observóTodo = rigor >= 0.7;

    if (p.esObjetivo) {
      this.audio.stinger();
      this.cine.shake(0.9);
      puntaje.sumar(VALOR.perfilAcierto, 'DERIVACIÓN CON SUSTENTO CONDUCTUAL', { detalle: op.leccion });
      if (observóTodo) {
        puntaje.sumar(220, 'OBSERVASTE AL GRUPO COMPLETO ANTES DE DECIDIR', {
          detalle: 'Comparar es lo que convierte una impresión en un criterio.',
        });
      }
      this.ui.informe({
        titulo: 'DERIVADO AL CANAL ROJO',
        cuerpo: `${p.nombre} pasa al módulo de inspección secundaria. El acta dice: `
          + `«${op.texto}». Eso es un hecho, tiene hora, tiene cámara y se sostiene.`,
        leccion: op.leccion,
        acierto: true,
        extra: observóTodo ? '' :
          `<div class="pf-leccion" style="border-color:#e0952a;background:rgba(224,149,42,.08)">
             <b>PERO:</b> observaste ${this.observados.size} de ${this.sala.gente.length}.
             Acertaste sin comparar, y eso la próxima vez es suerte.
           </div>`,
      }, () => this.#terminar());
    } else {
      // La conducta era real… pero inocente. La lección central del minijuego.
      this.audio.beep(false);
      puntaje.sumar(VALOR.perfilInocente, 'DERIVASTE UNA CONDUCTA CON EXPLICACIÓN', {
        detalle: p.conducta.leccion,
      });
      this.ui.informe({
        titulo: 'DERIVADO… PERO NO ERA ESO',
        cuerpo: `${p.nombre} pasa al canal rojo. El motivo que firmaste («${op.texto}») describe algo `
          + 'que efectivamente ocurrió: no inventaste nada. El problema es otro — esa conducta tenía '
          + 'una explicación que estaba a la vista, y ahora hay una persona abriendo su equipaje '
          + 'delante de una fila por algo que no era.',
        leccion: p.conducta.leccion,
        acierto: false,
      }, () => this.#terminar());
    }
  }

  #dejarPasar() {
    this.activo = false;
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.mundo.apagarResaltes();
    this.ui.hideFicha();
    const objetivo = this.sala.gente.find((p) => p.esObjetivo);
    const loVio = this.observados.has(objetivo?.id);

    puntaje.sumar(VALOR.perfilOmision, 'DEJASTE PASAR AL GRUPO ENTERO', {
      detalle: loVio
        ? 'Lo tuviste en la ficha y lo dejaste ir. Observar sin decidir no es prudencia: es no hacer el trabajo.'
        : 'Ni siquiera llegaste a observarlo. La sala tenía una conducta que sostenía una derivación.',
    });
    this.ui.informe({
      titulo: 'NADIE FUE DERIVADO',
      cuerpo: 'El grupo cruza el semáforo y se pierde en la salida. La sala se vacía.',
      leccion: `${objetivo?.nombre ?? 'Una de esas personas'} venía haciendo esto: `
        + `«${objetivo?.conducta.largo ?? '—'}» ${objetivo?.conducta.leccion ?? ''}`,
      acierto: false,
    }, () => this.#terminar());
  }

  #terminar() {
    this.ui.ocultarTodo();
    const acierto = !!this.marcada?.esObjetivo;
    bus.emit(Señal.PERFILAMIENTO_RESUELTO, { acierto, marcada: this.marcada?.id ?? null });
    setTimeout(() => this.mundo.limpiar(), 900);
    this.onCerrar?.({ marcada: this.marcada, acierto });
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.ui?.dispose();
    this.mundo?.dispose();
    this.ui = null;
    this.mundo = null;
  }
}
