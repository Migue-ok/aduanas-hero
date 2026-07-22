import { bus, Señal } from '../core/EventBus.js';

/**
 * Interrogation — el estado psicológico oculto y sus reglas
 * (`02 - Diseño/03 - Mecanica - Interrogatorio.md`).
 *
 * El estrés JAMÁS se muestra como número: este sistema solo emite tells;
 * el actor 3D los encarna y el jugador los lee.
 *
 * Topologías:
 *  - culpable:    picos en temas sensibles; Calmar deja un tell residual.
 *  - inocente:    línea base alta y UNIFORME; Calmar calma de verdad.
 *  - profesional: picos amortiguados; se le gana con papeles, no con presión.
 */
export class Interrogation {
  constructor(caso) {
    this.caso = caso;
    this.psique = caso.psique;
    this.stress = this.psique.lineaBase;
    this.acciones = 0;
    this.quebrado = false;
    this.preguntasNeutras = 0; // para "leer la línea base primero"
    this.temasEsquivados = 0;  // tell del profesional
    this.cerrado = false;      // el profesional presionado se cierra
  }

  get maxAcciones() { return 6; }
  get agotado() { return this.acciones >= this.maxAcciones; }

  #mover(delta) {
    const sinTope = this.stress + delta; // el overshoot decide entre quiebre y FUGA
    this.stress = Math.max(this.psique.lineaBase * 0.6, Math.min(100, sinTope));
    if (this.quebrado) return;
    // Clímax de estrés: un golpe que empuja a un CULPABLE hasta 100 dispara la
    // fuga en vez del quiebre (doc: Interrogatorio §La fuga). Inocentes jamás fugan.
    if (sinTope >= 100 && this.psique.tipo === 'culpable') {
      this.quebrado = true;
      this.fuga = true;
      bus.emit(Señal.FUGA, { caso_id: this.caso.id });
      return;
    }
    if (this.stress >= this.psique.umbral) this.#quebrar();
  }

  #quebrar() {
    this.quebrado = true;
    const esCulpable = this.psique.tipo !== 'inocente';
    bus.emit(Señal.QUIEBRE, { caso_id: this.caso.id, es_culpable: esCulpable });
  }

  /**
   * Preguntar por un tema. Devuelve { dialogo, tell } — el tell describe
   * la reacción corporal para que el actor la interprete.
   */
  preguntar(tema) {
    this.acciones++;
    const sensibilidad = this.psique.temas[tema] ?? 0;
    const esSensible = sensibilidad > 0;

    let delta;
    if (this.psique.tipo === 'profesional') {
      delta = esSensible ? sensibilidad : 1; // amortiguado: casi no se mueve
      if (esSensible) this.temasEsquivados++;
    } else if (this.psique.tipo === 'inocente') {
      delta = 6; // TODO le sube un poco — uniforme, sin picos
    } else {
      delta = esSensible ? sensibilidad : 5;
    }
    if (!esSensible) this.preguntasNeutras++;
    this.#mover(delta);

    const tell = this.#tellActual(esSensible, tema);
    bus.emit(Señal.ACCION_OFICIAL, { tipo: 'preguntar', tema });
    if (tell) bus.emit(Señal.TELL_EMITIDO, tell);
    return { dialogo: this.caso.dialogos.porTema[tema], tell };
  }

  presionar() {
    this.acciones++;
    bus.emit(Señal.ACCION_OFICIAL, { tipo: 'presionar' });
    if (this.psique.tipo === 'profesional') {
      this.cerrado = true; // se cierra y amenaza con abogados: −tiempo, cero avance
      return { dialogo: this.caso.dialogos.presionado, tell: null, abuso: false, cerrado: true };
    }
    this.#mover(15 + Math.random() * 15);
    const abuso = this.psique.tipo === 'inocente'; // presionar sin indicios: castigo de reputación
    return { dialogo: this.caso.dialogos.presionado, tell: this.#tellActual(true, null), abuso };
  }

  calmar() {
    this.acciones++;
    bus.emit(Señal.ACCION_OFICIAL, { tipo: 'calmar' });
    this.#mover(-(10 + Math.random() * 10));
    // La herramienta de diagnóstico fina: el inocente SE CALMA de verdad;
    // al culpable le queda un tell residual (la pierna que no para).
    const residual = this.psique.tipo !== 'inocente';
    return {
      dialogo: this.caso.dialogos.calmado,
      tell: residual ? { zona: 'postura', intensidad: 0.4, residual: true } : null,
      señalInocencia: this.psique.tipo === 'inocente' ? 's_calma' : null,
    };
  }

  silencio() {
    this.acciones++;
    bus.emit(Señal.ACCION_OFICIAL, { tipo: 'silencio' });
    this.#mover(5);
    // Los culpables llenan el silencio; los inocentes solo se incomodan.
    const llena = this.psique.tipo === 'culpable';
    return {
      dialogo: this.caso.dialogos.silencio,
      tell: llena ? { zona: 'boca', intensidad: 0.5, habla_de_mas: true } : null,
    };
  }

  /**
   * Confrontar con evidencia del expediente. El golpe: +30..50 al culpable.
   * Contra un inocente o sin munición real: penalización fuerte y el pasajero se cierra.
   */
  confrontar(evidenciaId) {
    this.acciones++;
    bus.emit(Señal.ACCION_OFICIAL, { tipo: 'confrontar', evidencia_id: evidenciaId });
    if (this.psique.tipo === 'inocente') {
      this.#mover(20);
      return { dialogo: this.caso.dialogos.confrontado, abuso: true, tell: this.#tellActual(true, null) };
    }
    this.#mover(30 + Math.random() * 20);
    // CASO-105: la confrontación dispara el intento de coima (evidencia extra).
    const señalExtra = this.caso.id === 'CASO-105' ? 's_coima' : null;
    return { dialogo: this.caso.dialogos.confrontado, abuso: false, señalExtra, tell: this.#tellActual(true, null) };
  }

  /** Traducción de banda de estrés → tell corporal (tabla del Vault). */
  #tellActual(disparadoPorTema, tema) {
    const s = this.stress;
    if (s < 30) return null;
    let zona, gesto;
    if (s < 55) { zona = ['ojos', 'postura'][Math.random() < 0.5 ? 0 : 1]; gesto = 'mano_cuello'; }
    else if (s < 80) { zona = ['boca', 'manos'][Math.random() < 0.5 ? 0 : 1]; gesto = 'secarse'; }
    else { zona = 'manos'; gesto = Math.random() < 0.5 ? 'mirar_salida' : 'tragar'; }
    return {
      zona,
      gesto,
      intensidad: Math.min(1, s / 100),
      tema_disparador: disparadoPorTema ? tema : null,
    };
  }

  /** ¿El jugador ya puede leer la topología? (≥2 neutrales + ≥1 sensible tocado) */
  topologiaLegible() {
    if (this.psique.tipo === 'inocente') return this.acciones >= 3; // uniformidad visible
    return this.preguntasNeutras >= 1 && this.stress > this.psique.lineaBase + 15;
  }
}
