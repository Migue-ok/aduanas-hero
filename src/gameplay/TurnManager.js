import { bus, Señal } from '../core/EventBus.js';
import { CASOS, generarTurno } from './cases.js';
import { Interrogation } from './Interrogation.js';

/**
 * TurnManager — el episodio de 3–5 minutos (`02 - Diseño/01 - Bucle Principal.md`).
 * APERTURA → PASAJEROS (×4: ciclo llegada → herramientas → sello → consecuencia) → CIERRE.
 *
 * También lleva el expediente (las señales registradas: el jugador nunca depende
 * de su memoria) y evalúa el veredicto (decisión + evidencia → calidad).
 */
export class TurnManager {
  constructor() {
    this.reputacion = Number(localStorage.getItem('ah_reputacion') ?? 50);
    this.turnoN = Number(localStorage.getItem('ah_turno') ?? 1);
    // La cola del karma: consecuencias diferidas que maduran entre turnos
    // (persisten al cerrar el juego — el error de hoy vuelve mañana de verdad).
    try {
      this.diferidas = JSON.parse(localStorage.getItem('ah_diferidas') ?? '[]');
    } catch {
      this.diferidas = [];
    }
    this.reset();
  }

  reset() {
    this.cola = [];
    this.indice = -1;
    this.caso = null;
    this.interrogatorio = null;
    this.expediente = [];       // [{id, texto}]
    this.resultados = [];       // [{caso, decision, calidad, señalesHalladas, señalesTotales}]
    this.abusos = 0;            // presiones/confrontaciones injustas del turno
    this.relojTurno = 0;        // presión suave: la fila crece
  }

  iniciarTurno() {
    this.reset();
    this.cola = generarTurno();
    bus.emit(Señal.TURNO_INICIADO, {
      turno: this.turnoN,
      briefing: 'Turno noche. Alerta activa: RUTA CALIENTE — vuelo de madrugada desde frontera norte. ' +
        `Reputación: ${this.#franjaReputacion()}.`,
    });
  }

  siguientePasajero() {
    this.indice++;
    if (this.indice >= this.cola.length) {
      this.#cerrarTurno();
      return null;
    }
    this.caso = CASOS[this.cola[this.indice]];
    this.interrogatorio = new Interrogation(this.caso);
    this.expediente = [];
    bus.emit(Señal.PASAJERO_PRESENTADO, {
      caso: this.caso,
      posicion: this.indice + 1,
      total: this.cola.length,
    });
    return this.caso;
  }

  /** Registra una señal en el expediente (idempotente). */
  registrarSeñal(id) {
    if (!id || !this.caso.señales[id]) return false;
    if (this.expediente.some((s) => s.id === id)) return false;
    this.expediente.push({ id, texto: this.caso.señales[id] });
    bus.emit(Señal.SENAL_REGISTRADA, { id, texto: this.caso.señales[id] });
    return true;
  }

  registrarAbuso() {
    this.abusos++;
    this.reputacion = Math.max(0, this.reputacion - 4);
  }

  /** ¿El escáner corporal está habilitado? (CASO-103: requiere ≥1 señal registrada) */
  escanerCorporalDisponible() {
    const ec = this.caso?.escanerCorporal;
    return !!ec && this.expediente.length >= ec.requiereSeñales;
  }

  /**
   * El sello. Evalúa decisión + evidencia registrada
   * (`02 - Diseño/08 - Mecanica - Decision Final.md` §Evaluación del veredicto).
   */
  decidir(decision, { confesion = false } = {}) {
    const caso = this.caso;
    const def = caso.decisiones[decision];
    const esCorrecta = caso.decisiones.correcta.includes(decision);
    const señalesTotales = Object.keys(caso.señales).length;
    const halladas = this.expediente.length;

    let calidad;
    if (!esCorrecta) {
      calidad = def.calidad === 'parcial' ? 'parcial' : 'fallo';
    } else if (confesion) {
      calidad = def.calidad; // el quiebre deja el caso "prácticamente resuelto"
    } else if (halladas === 0) {
      calidad = 'corazonada';
    } else if (halladas >= Math.min(2, señalesTotales)) {
      calidad = def.calidad; // 'solida' | 'aceptable'
    } else {
      calidad = 'correcto';
    }

    const deltaRep = { solida: +5, aceptable: +3, correcto: +2, corazonada: 0, parcial: -2, fallo: -6 }[calidad];
    this.reputacion = Math.max(0, Math.min(100, this.reputacion + deltaRep));

    // Encolar el eco diferido: los fallos SIEMPRE vuelven; los hitos de trama también.
    if (['fallo', 'parcial'].includes(calidad) || (caso.esTrama && ['solida', 'aceptable'].includes(calidad))) {
      this.diferidas.push({ texto: def.diferida, espera: 2 }); // madura al cierre del turno siguiente
    }

    const resultado = {
      caso, decision, calidad,
      escena: def.escena,
      diferida: def.diferida,
      señalesHalladas: halladas,
      señalesTotales,
      señalesPerdidas: Object.entries(caso.señales)
        .filter(([id]) => !this.expediente.some((s) => s.id === id))
        .map(([, texto]) => texto),
    };
    this.resultados.push(resultado);

    bus.emit(Señal.DECISION_TOMADA, { caso_id: caso.id, decision });
    bus.emit(Señal.VEREDICTO_EVALUADO, { caso_id: caso.id, calidad, decision_correcta: caso.decisiones.correcta[0] });
    return resultado;
  }

  #cerrarTurno() {
    const aciertos = this.resultados.filter((r) => !['fallo', 'parcial'].includes(r.calidad)).length;

    // Madura la cola del karma: lo sembrado en turnos ANTERIORES se cobra hoy.
    for (const d of this.diferidas) d.espera--;
    const maduras = this.diferidas.filter((d) => d.espera <= 0);
    this.diferidas = this.diferidas.filter((d) => d.espera > 0);
    const titulares = maduras.map((d) => d.texto);
    const noticia = titulares[0] ?? 'Sin novedades. Por ahora.';

    this.turnoN++;
    localStorage.setItem('ah_reputacion', String(this.reputacion));
    localStorage.setItem('ah_turno', String(this.turnoN));
    localStorage.setItem('ah_diferidas', JSON.stringify(this.diferidas));

    bus.emit(Señal.TURNO_FINALIZADO, {
      resultados: this.resultados,
      aciertos,
      total: this.resultados.length,
      reputacion: this.reputacion,
      franja: this.#franjaReputacion(),
      noticia,
      titulares,
      abusos: this.abusos,
    });
  }

  #franjaReputacion() {
    const r = this.reputacion;
    if (r >= 80) return 'RESPETADO';
    if (r >= 60) return 'CONFIABLE';
    if (r >= 40) return 'EN OBSERVACIÓN';
    if (r >= 20) return 'CUESTIONADO';
    return 'ASUNTOS INTERNOS PREGUNTA POR TI';
  }
}
