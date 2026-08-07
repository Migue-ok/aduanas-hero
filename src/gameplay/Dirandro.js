import * as THREE from 'three';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje, VALOR } from '../core/Puntaje.js';
import { isMobile } from '../core/Device.js';
import { SalaIntrusiva } from '../world/SalaIntrusiva.js';
import { HUDDirandro } from '../ui/HUDDirandro.js';

/**
 * Dirandro — la Sala de Revisión Intrusiva jugable.
 *
 * Es el techo del nivel y su momento más incómodo, y eso es intencionado. El
 * canal rojo se juega con curiosidad; esto se juega con responsabilidad. Tres
 * estaciones encadenadas, cada una con un recurso escaso:
 *
 *   1. **Escáner corporal** — 3 marcajes. Se lee un medidor, no se adivina.
 *   2. **Espectrómetro (IMS)** — 3 hisopos. Se elige DÓNDE, y ahí está la clase.
 *   3. **Revisión profunda** — 3 calibraciones. Medir antes de rasgar el forro.
 *
 * El resultado no se decide al final: se va construyendo. Si el jugador llega a
 * la estación 3 sin nada, el juego se lo dice en el acta y le cobra el
 * procedimiento infundado (`VALOR.intrusivoInfundado`) — porque una revisión
 * intrusiva sin sustento es exactamente el abuso que este nivel enseña a evitar.
 *
 * Límite de contenido innegociable (Visión §28.2): el escáner corporal muestra
 * un MANIQUÍ genérico y una zona. Nunca un cuerpo, nunca una imagen anatómica.
 */

/** Los seis puntos de hisopado. `contacto` marca dónde la mano tocó de verdad. */
function generarPuntosSwab(positivoReal) {
  const base = [
    { id: 'asa', label: 'Asa telescópica', contacto: true, nota: 'Es lo que se agarra para cargarla. El primer sitio donde mirar.' },
    { id: 'tiradores', label: 'Tiradores de cremallera', contacto: true, nota: 'Quien cerró la maleta después de cargarla tocó esto.' },
    { id: 'cierre', label: 'Cierre interior del forro', contacto: true, nota: 'Si alguien abrió el forro, dejó residuo aquí.' },
    { id: 'ruedas', label: 'Ruedas y base exterior', contacto: false, nota: 'Aquí solo hay suelo de aeropuerto: negativo esperable.' },
    { id: 'tela', label: 'Tela exterior, cara frontal', contacto: false, nota: 'Superficie expuesta, lavada por la cinta y la lluvia. Poco útil.' },
    { id: 'etiqueta', label: 'Etiqueta de facturación', contacto: false, nota: 'La puso el personal de la aerolínea, no el pasajero.' },
  ];
  // Los positivos van en los puntos de CONTACTO, y solo si hay algo que hallar.
  return base.map((p) => ({ ...p, positivo: positivoReal && p.contacto && Math.random() < 0.75 }));
}

/** Las cinco zonas de la estructura. Una engorda si hay compartimento. */
function generarZonas(hayCompartimento) {
  const zonas = [
    { id: 'tapa', label: 'Tapa superior', grosorFicha: 9 },
    { id: 'base', label: 'Base / fondo interior', grosorFicha: 11 },
    { id: 'izq', label: 'Pared lateral izquierda', grosorFicha: 8 },
    { id: 'der', label: 'Pared lateral derecha', grosorFicha: 8 },
    { id: 'marco', label: 'Marco perimetral', grosorFicha: 14 },
  ];
  const iAnomala = hayCompartimento ? Math.floor(Math.random() * zonas.length) : -1;
  return zonas.map((z, i) => ({
    ...z,
    grosorReal: i === iAnomala
      ? z.grosorFicha * 3 + Math.floor(Math.random() * 12)
      : z.grosorFicha + Math.floor(Math.random() * 3) - 1,
    anomala: i === iAnomala,
  }));
}

export class Dirandro {
  constructor({ scene, cine, audio, hud, base }) {
    this.scene = scene;
    this.cine = cine;
    this.audio = audio;
    this.hudPrincipal = hud;
    this.base = base ?? new THREE.Vector3(26, 0, -4);
    this.sala = null;
    this.ui = null;
    this.activo = false;
  }

  #asegurarMundo() {
    if (!this.sala) this.sala = new SalaIntrusiva(this.scene, this.base);
    if (!this.ui) this.ui = new HUDDirandro();
    return this.sala;
  }

  update(dt, t) { if (this.activo) this.sala?.update(dt, t); }

  /**
   * @param {object} opts
   * @param {string} opts.titular
   * @param {boolean} opts.hayHallazgo  si el caso realmente esconde sustancia
   * @param {Function} opts.onCerrar
   */
  abrir({ titular = 'Persona intervenida', hayHallazgo = true, onCerrar = () => {} }) {
    const sala = this.#asegurarMundo();
    this.activo = true;
    this.onCerrar = onCerrar;
    this.titular = titular;
    this.hayHallazgo = hayHallazgo;
    this.sustento = { cuerpo: false, trazas: 0, estructura: false };

    this.PASOS = ['Escáner corporal', 'Trazas (IMS)', 'Revisión profunda'];
    this.audio.setFocus('monitor');
    this.cine.enfocar(sala.vistaGeneral.pos, sala.vistaGeneral.look,
      { ...sala.vistaGeneral, duration: 1.8, vista: 'dirandro' });

    this.ui.setCabecera(
      `${titular} pasa a sala restringida. Todo lo que hagas aquí queda en acta y en video. `
      + 'Tres estaciones, y en cada una los recursos están contados.', this.PASOS, 0);

    bus.emit(Señal.HERRAMIENTA_USADA, { zona: 'dirandro' });
    setTimeout(() => this.#fase1(), 1900);
  }

  // ── Estación 1 · Escáner corporal ───────────────────────────────────────
  #fase1() {
    const sala = this.sala;
    this.ui.setCabecera(
      'El equipo proyecta un maniquí genérico. Lee el medidor de densidad y marca la zona '
      + 'donde el material no cuadra con un cuerpo.', this.PASOS, 0);
    this.cine.enfocar(sala.vistaArco.pos, sala.vistaArco.look, { ...sala.vistaArco, duration: 1.4, vista: 'dirandro_arco' });
    sala.escanearArco(true);

    // La anomalía cae en el tronco/abdomen si la hay; si no la hay, el pico se
    // sitúa igual pero el "hallazgo" es un artefacto de ropa: marcar acierta el
    // pico, pero la estación 2 y 3 dirán que no había nada. La densidad NUNCA
    // miente sobre dónde está el pico; miente sobre qué significa.
    const anomalia = 0.34 + Math.random() * 0.3;
    this.ui.escanerCorporal(
      { anomalia, tolerancia: isMobile ? 0.09 : 0.07, intentos: 3 },
      {
        marcar: (acierto, dist) => {
          if (acierto) {
            this.audio.stinger();
            this.cine.shake(0.6);
            this.sustento.cuerpo = true;
            puntaje.sumar(240, 'ZONA DE DENSIDAD LOCALIZADA', {
              detalle: 'Marcaste sobre el pico del medidor, no a ojo. Así se lee un escáner.',
            });
          } else {
            this.audio.beep(false);
            puntaje.sumar(-70, 'MARCAJE FUERA DE ZONA', {
              detalle: dist > 0.25
                ? 'Muy lejos del pico. El medidor sube ANTES de que la barra llegue: ahí está el aviso.'
                : 'Casi. La lectura ya estaba bajando cuando marcaste.',
            });
          }
        },
        terminar: () => {
          sala.escanearArco(false);
          this.ui.ocultarEstacion();
          setTimeout(() => this.#fase2(), 700);
        },
      },
    );
  }

  // ── Estación 2 · Espectrómetro de trazas ────────────────────────────────
  #fase2() {
    const sala = this.sala;
    this.ui.setCabecera(
      'Espectrómetro de movilidad iónica. Tres hisopos y ni uno más: elige superficies '
      + 'donde una mano haya tocado de verdad.', this.PASOS, 1);
    this.cine.enfocar(sala.vistaCarrito.pos, sala.vistaCarrito.look,
      { ...sala.vistaCarrito, duration: 1.3, vista: 'dirandro_ims' });
    sala.mostrarPuntosSwab(true);

    const puntos = generarPuntosSwab(this.hayHallazgo);
    this.ui.espectrometro(puntos, 3, {
      hisopar: (pt, i) => {
        sala.marcarSwab(i, pt.positivo);
        sala.pintarEspectro(pt.positivo
          ? [{ x: 90, alto: 30 }, { x: 168, alto: 74, etiqueta: 'ALCALOIDE' }]
          : [{ x: 78, alto: 26 }, { x: 140, alto: 18 }]);
        if (pt.positivo) {
          this.sustento.trazas++;
          this.cine.shake(0.5);
          puntaje.sumar(VALOR.trazaPositiva, 'TRAZA POSITIVA EN SUPERFICIE DE CONTACTO', {
            detalle: pt.nota,
          });
        } else {
          puntaje.sumar(pt.contacto ? 0 : VALOR.trazaFallida,
            pt.contacto ? 'HISOPADO CORRECTO, SIN TRAZA' : 'HISOPO GASTADO EN UNA SUPERFICIE MUERTA',
            { detalle: pt.nota, neutro: pt.contacto });
        }
      },
      terminar: () => {
        sala.mostrarPuntosSwab(false);
        this.ui.ocultarEstacion();
        setTimeout(() => this.#fase3(), 700);
      },
    });
  }

  // ── Estación 3 · Revisión profunda ──────────────────────────────────────
  #fase3() {
    const sala = this.sala;
    this.ui.setCabecera(
      'Mesa de revisión profunda. Calibra la estructura y compárala con la ficha del fabricante. '
      + 'El forro solo se abre donde la medida lo justifique.', this.PASOS, 2);
    this.cine.enfocar(sala.vistaMesa.pos, sala.vistaMesa.look,
      { ...sala.vistaMesa, duration: 1.3, vista: 'dirandro_mesa' });

    const zonas = generarZonas(this.hayHallazgo);
    this.ui.revisionProfunda(zonas, 3, {
      medir: (z) => {
        if (z.anomala) {
          this.cine.shake(0.7);
          puntaje.sumar(VALOR.pistaLeida, 'GROSOR ANÓMALO MEDIDO', {
            detalle: `${z.label}: ${z.grosorReal} mm frente a los ${z.grosorFicha} mm de ficha. Ahí hay algo.`,
          });
        } else {
          puntaje.sumar(40, 'ZONA DESCARTADA CON CALIBRE', {
            detalle: `${z.label} coincide con la ficha. Descartar con un número también es trabajo.`,
          });
        }
      },
      marcar: (z) => {
        this.ui.ocultarEstacion();
        if (z.anomala) {
          sala.revelarCompartimento();
          this.sustento.estructura = true;
          this.audio.stinger();
          this.cine.shake(1.3);
          // A 0,85 m la cámara se metía DENTRO del compartimento y el hallazgo
          // salía como una mancha azul. Este plano corto deja ver la maleta.
          this.cine.enfocar([sala.base.x - 0.5, 1.58, sala.base.z + 1.95],
            [sala.base.x - 0.6, 0.98, sala.base.z + 0.4],
            { fov: 38, focus: 1.7, aperture: 0.00042, duration: 1.0, vista: 'dirandro_hallazgo' });
        }
        setTimeout(() => this.#cerrar(z), z.anomala ? 1800 : 500);
      },
    });
  }

  // ── El acta ─────────────────────────────────────────────────────────────
  #cerrar(zonaAbierta) {
    const s = this.sustento;
    const indicios = (s.cuerpo ? 1 : 0) + (s.trazas > 0 ? 1 : 0) + (s.estructura ? 1 : 0);
    const hallazgo = s.estructura && this.hayHallazgo;

    if (hallazgo) {
      puntaje.sumar(VALOR.hallazgoIntrusivo, 'HALLAZGO EN REVISIÓN INTRUSIVA', {
        detalle: `Acta con ${indicios} de 3 sustentos: ${[
          s.cuerpo && 'escáner', s.trazas > 0 && 'trazas', 'estructura'].filter(Boolean).join(' + ')}.`,
      });
    } else if (indicios === 0) {
      puntaje.sumar(VALOR.intrusivoInfundado, 'REVISIÓN INTRUSIVA SIN NINGÚN SUSTENTO', {
        detalle: 'Encerraste a una persona en un cuarto sin ventanas y no reuniste ni un indicio.',
      });
    } else {
      puntaje.sumar(-90, 'PROCEDIMIENTO SIN RESULTADO', {
        detalle: 'Reuniste algún indicio, pero el acta se cierra sin hallazgo. Pasa, y también cuenta.',
      });
    }

    const cuerpoTexto = hallazgo
      ? `El forro cede. Bajo ${zonaAbierta.label.toLowerCase()}, ${zonaAbierta.grosorReal} mm de pared `
        + 'donde la ficha decía ' + zonaAbierta.grosorFicha + ': paquetes planos, prensados y sellados al vacío. '
        + `${this.titular} deja de mirar al suelo y pide un abogado. La unidad se hace cargo.`
      : indicios === 0
        ? `No hay nada. ${this.titular} recompone su equipaje en silencio mientras firmas un acta vacía. `
          + 'La sala se queda con el zumbido del fluorescente.'
        : `El indicio no llegó a hallazgo. ${this.titular} sale con su acta y su vuelo perdido. `
          + 'A veces el procedimiento es correcto y el resultado es negativo: eso también es el oficio.';

    const leccion = hallazgo
      ? 'Un acta de DIRANDRO se sostiene sobre tres patas: la lectura del escáner, la traza química y la '
        + 'medición estructural. Con las tres, no hay defensa posible. Con una sola, se cae en el juzgado.'
      : 'La revisión intrusiva es la herramienta más invasiva del control fronterizo, y por eso exige el '
        + 'sustento más alto. Cuando no hay indicios, la respuesta correcta llega ANTES: no derivar.';

    this.ui.acta({
      titulo: hallazgo ? 'COMPARTIMENTO OCULTO EN LA ESTRUCTURA' : 'SIN HALLAZGO',
      cuerpo: cuerpoTexto,
      leccion,
      positivo: hallazgo,
    }, () => this.#terminar(hallazgo));
  }

  #terminar(hallazgo) {
    this.activo = false;
    this.ui.ocultarTodo();
    this.sala.escanearArco(false);
    bus.emit(Señal.INTRUSIVA_RESUELTA, { hallazgo, sustento: this.sustento });
    this.onCerrar?.({ hallazgo, sustento: this.sustento });
  }

  dispose() {
    this.ui?.dispose();
    this.sala?.dispose();
    this.ui = null;
    this.sala = null;
  }
}
