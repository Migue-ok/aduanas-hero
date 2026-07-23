/**
 * EventBus — el sistema nervioso del juego.
 * Contrato de señales de alto nivel definido en el Vault
 * (`02 - Diseño/01 - Bucle Principal.md` §Señales y cada mecánica).
 */
class EventBus {
  #listeners = new Map();

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  once(event, handler) {
    const dispose = this.on(event, (payload) => {
      dispose();
      handler(payload);
    });
    return dispose;
  }

  emit(event, payload = {}) {
    this.#listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

/** Instancia única compartida por todos los sistemas. */
export const bus = new EventBus();

/** Nombres canónicos de señales (evita strings mágicos dispersos). */
export const Señal = Object.freeze({
  TURNO_INICIADO: 'turno_iniciado',
  PASAJERO_PRESENTADO: 'pasajero_presentado',
  HERRAMIENTA_USADA: 'herramienta_usada',
  SENAL_REGISTRADA: 'senal_registrada',
  INTERROGATORIO_INICIADO: 'interrogatorio_iniciado',
  ACCION_OFICIAL: 'accion_oficial',
  TELL_EMITIDO: 'tell_emitido',
  TELL_REGISTRADO: 'tell_registrado',
  QUIEBRE: 'quiebre',
  FUGA: 'fuga',
  ESCANEO_INICIADO: 'escaneo_iniciado',
  SILUETA_MARCADA: 'silueta_marcada',
  ESCANEO_FINALIZADO: 'escaneo_finalizado',
  DECISION_TOMADA: 'decision_tomada',
  VEREDICTO_EVALUADO: 'veredicto_evaluado',
  CONSECUENCIA_MOSTRADA: 'consecuencia_mostrada',
  TURNO_FINALIZADO: 'turno_finalizado',
  VISTA_CAMBIADA: 'vista_cambiada',
  // Nivel 3 · Operativo Trafasport (ADR-007) — aditivas, no rompen el contrato.
  FASE_COMPLETADA: 'raid_fase_completada',
  QTE_SUCCESS: 'raid_qte_success',
  RAID_FINALIZADO: 'raid_finalizado',
});
