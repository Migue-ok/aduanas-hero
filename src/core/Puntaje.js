import { bus, Señal } from './EventBus.js';

/**
 * Puntaje — el marcador de la carrera (ADR-012).
 *
 * Hasta ahora el único número que veía el jugador era la reputación, y llegaba
 * *tarde*: se movía en silencio y solo se leía al cerrar el turno, en la Hoja de
 * Servicio. Un acierto y un error se sentían igual **en el momento de cometerlos**.
 *
 * Este módulo no sustituye a la reputación (que sigue siendo la consecuencia
 * lenta y narrativa de `01 - Fundamentos/04 - Regla de Oro`): añade la capa
 * rápida, la que responde en el mismo segundo en que actúas. Reputación = qué
 * clase de oficial eres. Puntos = qué tan bien lo hiciste ahora mismo.
 *
 * Reglas del sistema:
 * 1. **Todo punto tiene motivo escrito.** Nunca un `+120` pelado: siempre
 *    «+120 · Señal anotada en el expediente». El marcador enseña, no solo premia.
 * 2. **El error resta y se nota.** Restar es la mitad del sistema: si equivocarse
 *    saliera gratis, la decisión no pesaría (Bucle Principal §consecuencias).
 * 3. **La racha premia leer, no adivinar.** Aciertos encadenados multiplican
 *    hasta ×2; un solo fallo la parte. Presionar al azar nunca la sostiene.
 * 4. **El multiplicador jamás agranda un castigo.** Las penalizaciones son
 *    planas: la racha es un premio, no una trampa de bola de nieve.
 */

/** Tabla de valores base. Positivo premia; negativo castiga (sin multiplicar). */
export const VALOR = Object.freeze({
  // — Puesto de control —
  senal: 120,             // señal anotada en el expediente
  tell: 80,               // tell del cuerpo atrapado con el dedo
  quiebreCulpable: 260,   // confesión arrancada con base
  quiebreInocente: -420,  // quebrar a alguien que no traía nada
  abuso: -110,            // presionar/confrontar sin indicios
  fuga: 300,              // la fuga es flagrancia: el caso se cierra solo

  // — El sello (por calidad del veredicto) —
  selloSolida: 500,
  selloAceptable: 360,
  selloCorrecto: 240,
  selloCorazonada: 60,    // acertaste, pero sin nada escrito: casi no cuenta
  selloParcial: -180,
  selloFallo: -400,

  // — Canal Rojo · Inspección Secundaria (SUNAT) —
  maletaCorrecta: 450,
  maletaVacia: -260,      // abriste la equivocada: perdiste tu única apertura
  pistaLeida: 90,         // indicio del equipaje anotado antes de abrir
  perroLeido: 140,        // seguiste el marcaje del K-9
  canalOmision: -300,     // cerraste el canal con el bulto delante

  // — Sala de Revisión Intrusiva (DIRANDRO) —
  hallazgoIntrusivo: 600,
  trazaPositiva: 180,
  trazaFallida: -70,
  intrusivoInfundado: -320, // revisión intrusiva sin sostén: es una persona, no un trámite

  // — Centro Postal · Oleadas de Intercepción (ADR-013) —
  encomiendaInterceptada: 220,  // la herramienta correcta sobre el síntoma correcto
  escaneoInfundado: -140,       // disparaste a un paquete que no mostraba nada
  encomiendaEscapada: -260,     // se fue al camión con la señal a la vista
  actaSolida: 480,              // evidencia cruzada: dos pruebas distintas del mismo expediente
  actaCae: -300,                // una sola señal no sostiene un acta

  // — Perfilamiento (Canal Rojo, semáforo aduanero) —
  perfilAcierto: 400,
  perfilIndicadorExtra: 110,  // cada conducta observable adicional bien leída
  perfilInocente: -240,
  perfilSesgo: -600,          // marcar por rasgos personales: el error más caro del juego
  perfilOmision: -300,        // dejar pasar al que sí daba indicios
});

const CLAVE = 'aduanas-hero:puntaje:v1';

class Puntaje {
  constructor() {
    this.total = 0;
    this.racha = 0;
    this.mejorRacha = 0;
    this.aciertos = 0;
    this.errores = 0;
    this.record = this.#leerRecord();
    this.historial = []; // [{motivo, puntos, tipo}] — alimenta la Hoja de Servicio
  }

  #leerRecord() {
    try { return Number(localStorage.getItem(CLAVE) ?? 0); } catch { return 0; }
  }

  #guardarRecord() {
    if (this.total <= this.record) return;
    this.record = this.total;
    try { localStorage.setItem(CLAVE, String(this.total)); } catch { /* incógnito */ }
  }

  /** El multiplicador vivo: 1.0 → 2.0. Se muestra en el marcador desde ×1.2. */
  get multiplicador() {
    return 1 + Math.min(this.racha, 5) * 0.2;
  }

  /**
   * Suma (o resta) puntos con motivo visible.
   *
   * @param {number} base       valor de la tabla VALOR
   * @param {string} motivo     texto corto que aparece junto al número
   * @param {object} [opts]
   * @param {boolean} [opts.rompeRacha]  fuerza el corte de racha aunque sume
   * @param {boolean} [opts.neutro]      ni suma ni resta a la racha (bonus de contexto)
   * @param {string}  [opts.detalle]     segunda línea del popup: la lección
   */
  sumar(base, motivo, { rompeRacha = false, neutro = false, detalle = '' } = {}) {
    const positivo = base > 0;
    // El multiplicador solo agranda lo bueno (regla 4).
    const puntos = positivo ? Math.round(base * this.multiplicador) : base;

    if (!neutro) {
      if (positivo && !rompeRacha) {
        this.racha++;
        this.aciertos++;
        this.mejorRacha = Math.max(this.mejorRacha, this.racha);
      } else if (!positivo || rompeRacha) {
        if (!positivo) this.errores++;
        this.racha = 0;
      }
    }

    // El total nunca baja de cero: un turno malo deja el marcador en blanco,
    // no en números rojos que ya no se pueden remontar (y con ellos, la sesión).
    this.total = Math.max(0, this.total + puntos);
    this.#guardarRecord();
    this.historial.push({ motivo, puntos, tipo: positivo ? 'bien' : 'mal' });

    bus.emit(Señal.PUNTOS, {
      puntos, motivo, detalle,
      total: this.total,
      racha: this.racha,
      multiplicador: this.multiplicador,
      tipo: positivo ? 'bien' : 'mal',
    });
    return puntos;
  }

  /** Atajo para el sello: traduce la calidad del veredicto a puntos. */
  porVeredicto(calidad) {
    const mapa = {
      solida: [VALOR.selloSolida, 'SELLO SÓLIDO · decisión correcta con expediente'],
      aceptable: [VALOR.selloAceptable, 'SELLO CORRECTO · vía adecuada'],
      correcto: [VALOR.selloCorrecto, 'SELLO CORRECTO · poca evidencia escrita'],
      corazonada: [VALOR.selloCorazonada, 'ACERTASTE DE CORAZONADA · sin nada en el expediente'],
      parcial: [VALOR.selloParcial, 'SELLO QUE NO SOSTIENE · la vía era otra'],
      fallo: [VALOR.selloFallo, 'SELLO EQUIVOCADO'],
    };
    const [base, motivo] = mapa[calidad] ?? mapa.correcto;
    return this.sumar(base, motivo, { rompeRacha: calidad === 'corazonada' });
  }

  /** Cierre de turno: el balance que firma la Hoja de Servicio. */
  balance() {
    return {
      total: this.total,
      record: this.record,
      aciertos: this.aciertos,
      errores: this.errores,
      mejorRacha: this.mejorRacha,
      // El top-3 de lo que más sumó y lo que más costó: el resumen que enseña.
      mejores: [...this.historial].filter((h) => h.puntos > 0).sort((a, b) => b.puntos - a.puntos).slice(0, 3),
      peores: [...this.historial].filter((h) => h.puntos < 0).sort((a, b) => a.puntos - b.puntos).slice(0, 3),
    };
  }

  /** Arranca un turno nuevo conservando el récord histórico. */
  reiniciarTurno() {
    this.total = 0;
    this.racha = 0;
    this.mejorRacha = 0;
    this.aciertos = 0;
    this.errores = 0;
    this.historial = [];
    bus.emit(Señal.PUNTOS, {
      puntos: 0, motivo: '', total: 0, racha: 0, multiplicador: 1, tipo: 'reset',
    });
  }
}

/** Instancia única: el marcador es uno solo para toda la sesión. */
export const puntaje = new Puntaje();
