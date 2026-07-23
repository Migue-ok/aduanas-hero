/**
 * Progreso — la carrera del oficial (ADR-011).
 *
 * Hasta ahora cada nivel era una isla: la reputación nacía en 50 y moría al
 * salir. No había carrera, no había consecuencia entre niveles. Aquí vive el
 * expediente del jugador, persistido en `localStorage`.
 *
 * Regla de diseño (Visión §consecuencias): la reputación es **una sola** para
 * toda la carrera. Lo que haces en el muelle te sigue al aeropuerto.
 */

const CLAVE = 'aduanas-hero:progreso:v1';

const INICIAL = {
  reputacion: 50,          // 0..100 — la carrera entera
  turnos: 0,               // operativos cerrados
  incautaciones: 0,
  rescates: 0,             // fauna liberada al Escuadrón Ecológico
  errores: 0,
  niveles: {},             // { [id]: { completado, mejorAciertos, veces } }
};

function leer() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return { ...INICIAL, niveles: {} };
    const p = JSON.parse(raw);
    return { ...INICIAL, ...p, niveles: { ...(p.niveles ?? {}) } };
  } catch {
    return { ...INICIAL, niveles: {} }; // localStorage bloqueado: se juega igual
  }
}

function escribir(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* modo incógnito */ }
}

export const progreso = {
  get datos() { return leer(); },

  /** Reputación de la carrera (la que arranca cualquier nivel). */
  get reputacion() { return leer().reputacion; },

  /** Suma/resta reputación con tope 0..100 y devuelve el valor nuevo. */
  ajustarReputacion(delta) {
    const p = leer();
    p.reputacion = Math.max(0, Math.min(100, p.reputacion + delta));
    escribir(p);
    return p.reputacion;
  },

  /** Registra el cierre de un operativo. */
  cerrarOperativo(nivelId, { aciertos = 0, errores = 0, incautaciones = 0, rescates = 0 } = {}) {
    const p = leer();
    p.turnos += 1;
    p.errores += errores;
    p.incautaciones += incautaciones;
    p.rescates += rescates;
    const n = p.niveles[nivelId] ?? { completado: false, mejorAciertos: 0, veces: 0 };
    n.completado = true;
    n.veces += 1;
    n.mejorAciertos = Math.max(n.mejorAciertos, aciertos);
    p.niveles[nivelId] = n;
    escribir(p);
    return p;
  },

  /** Rango del oficial según la reputación — el título que muestra el menú. */
  get rango() {
    const r = leer().reputacion;
    if (r >= 90) return 'OFICIAL CONDECORADO';
    if (r >= 75) return 'OFICIAL DE CONFIANZA';
    if (r >= 55) return 'OFICIAL EN SERVICIO';
    if (r >= 35) return 'EN OBSERVACIÓN';
    if (r >= 15) return 'BAJO SUMARIO';
    return 'AL BORDE DE LA BAJA';
  },

  reiniciar() { escribir({ ...INICIAL, niveles: {} }); },
};
