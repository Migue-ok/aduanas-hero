import * as THREE from 'three';
import { bus, Señal } from '../core/EventBus.js';
import { puntaje, VALOR } from '../core/Puntaje.js';
import { isMobile, tuneRaycaster } from '../core/Device.js';
import { generarOperativo } from './equipajes.js';
import { ModuloInspeccion } from '../world/ModuloInspeccion.js';
import { HUDCanalRojo } from '../ui/HUDCanalRojo.js';

/**
 * CanalRojo — la Zona de Inspección Secundaria jugable
 * (`02 - Diseño/12 - Canal Rojo y Sala Intrusiva.md`).
 *
 * Es la respuesta a una pregunta vieja del diseño: **¿qué pasa DESPUÉS del
 * sello?** Hasta ahora, sellar «RETENIDO» o «DERIVADO» disparaba un párrafo de
 * texto y el turno seguía. El momento más caro de la partida — el que decide la
 * reputación — no se jugaba: se leía.
 *
 * Aquí sí se juega, y con una sola regla que lo tensa todo:
 *
 *   **UNA APERTURA POR OPERATIVO.**
 *
 * Todo lo demás (mirar, pesar, anotar, soltar al perro) es gratis e ilimitado.
 * Lo único escaso es abrir. Eso convierte la partida en lo que de verdad hace
 * un inspector: acumular sustento suficiente para justificar la molestia que
 * está a punto de causarle a una persona.
 *
 * Las tres fuentes de información se contradicen a propósito:
 *   · el **volumen ↔ peso** (dato duro, nunca miente, hay que ir a buscarlo);
 *   · los **indicios físicos** (algunos delatan, otros tienen explicación);
 *   · el **olfato de Justus** (señala olores, no delitos: puede marcar comida).
 * Obedecer a una sola de las tres es exactamente el error que el nivel enseña.
 */
export class CanalRojo {
  /**
   * @param {object} ctx  { scene, cine, audio, justus, hud, canvas, base }
   */
  constructor({ scene, cine, audio, justus, hud, canvas, base }) {
    this.scene = scene;
    this.cine = cine;
    this.audio = audio;
    this.justus = justus;
    this.hudPrincipal = hud;      // el HUD del puesto: se usa para toasts
    this.canvas = canvas;
    this.base = base ?? new THREE.Vector3(9.2, 0, -4.2);

    this.modulo = null;           // se construye la primera vez que se entra
    this.ui = null;
    this.activo = false;
    this.raycaster = tuneRaycaster(new THREE.Raycaster());
    this.puntero = new THREE.Vector2();
    this.onPointer = (e) => this.#click(e);
  }

  /** El módulo existe en la terminal aunque no se esté jugando en él. */
  #asegurarMundo() {
    if (!this.modulo) this.modulo = new ModuloInspeccion(this.scene, this.base);
    if (!this.ui) this.ui = new HUDCanalRojo();
    return this.modulo;
  }

  /** Sistema del bucle: mantiene vivo el semáforo y la regleta. */
  update(dt, t) { this.modulo?.update(dt, t); }

  /**
   * Abre el operativo.
   *
   * @param {object} opts
   * @param {string} opts.tipo      clave de hallazgo ('dinero' | 'fauna' | …)
   * @param {string} opts.titular   nombre del pasajero derivado
   * @param {Function} opts.onCerrar  recibe { acierto, derivaDirandro, bulto }
   */
  abrir({ tipo = 'dinero', titular = 'Pasajero derivado', onCerrar = () => {} }) {
    const modulo = this.#asegurarMundo();
    this.activo = true;
    this.onCerrar = onCerrar;

    // Menos bultos en móvil: cinco maletas en una pantalla de teléfono dejan de
    // ser una fila y pasan a ser una mancha (ADR-008).
    this.op = generarOperativo({ tipo, titular, cantidad: isMobile ? 4 : 5 });
    this.estado = new Map(this.op.bultos.map((b) => [b.id, { peso: null, anotados: new Set() }]));
    this.seleccion = null;
    this.aperturaGastada = false;
    this.justusUsado = false;
    this.marcadoPorJustus = null;
    this.tiempo = isMobile ? 105 : 120;
    this.tiempoMax = this.tiempo;
    this.penalizadoPorTiempo = false;

    modulo.montarBultos(this.op);
    modulo.pintarBalanza(null, { etiqueta: 'EN ESPERA' });

    // Justus se muda al canal: sin esto olfatearía a doce metros de la mesa.
    // Se guarda su puesto del mostrador para devolvérselo al salir — si no, el
    // siguiente `justus.reset()` del turno lo mandaría de vuelta aquí.
    this.justusHome = this.justus.home.clone();
    this.justusRot = this.justus.rotHome;
    this.justus.reset();
    // A la IZQUIERDA de la mesa y algo retrasado: en el encuadre general tiene
    // que leerse entero y de perfil, no comerse la esquina de la cámara.
    this.justus.mudarPuesto(
      new THREE.Vector3(this.base.x - 2.55, 0, this.base.z + 0.15), 0.6, true,
    );

    const v = modulo.vistaGeneral;
    this.cine.enfocar(v.pos, v.look, { ...v, duration: 1.6, vista: 'canal_rojo' });
    this.audio.setFocus('mundo');

    this.ui.setBrief(`Equipaje de ${titular} sobre la mesa. ${this.op.brief}`);
    this.ui.prepararOlfato(this.op.bultos);
    this.#dock();

    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.hudPrincipal?.toast('Toca una maleta para inspeccionarla. Mirar es gratis; ABRIR, no.', { dur: 4600 });

    bus.emit(Señal.HERRAMIENTA_USADA, { zona: 'canal_rojo' });
  }

  #dock() {
    this.ui.showDock([
      {
        id: 'justus', icono: '🐕',
        label: this.justusUsado ? 'JUSTUS YA BARRIÓ' : 'SOLTAR A JUSTUS',
        disabled: this.justusUsado || this.justus.ocupado,
        onClick: () => this.#soltarJustus(),
      },
      {
        id: 'general', icono: '⤢', label: 'VISTA GENERAL',
        onClick: () => {
          this.seleccion = null;
          this.modulo.apagarResaltes();
          this.ui.hideFicha();
          const v = this.modulo.vistaGeneral;
          this.cine.enfocar(v.pos, v.look, { ...v, duration: 1.0, vista: 'canal_rojo' });
        },
      },
      {
        id: 'cerrar', icono: '✔', label: 'CERRAR SIN ABRIR', cls: 'peligro',
        onClick: () => this.#cerrarSinAbrir(),
      },
    ]);
  }

  // ── Selección de bulto ──────────────────────────────────────────────────
  #click(e) {
    if (!this.activo) return;
    this.puntero.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.puntero, this.cine.camera);
    const id = this.modulo.hitTest(this.raycaster);
    if (id) this.#seleccionar(id);
  }

  #seleccionar(id) {
    if (this.seleccion === id) return;
    this.seleccion = id;
    this.modulo.apagarResaltes();
    this.modulo.resaltar(id, true);
    this.audio.clic('suave');

    const v = this.modulo.vistaBulto(id);
    this.cine.enfocar(v.pos, v.look, { ...v, duration: 0.9, vista: 'canal_rojo_bulto' });
    this.#pintarFicha();
  }

  #pintarFicha() {
    const b = this.op.bultos.find((x) => x.id === this.seleccion);
    const st = this.estado.get(this.seleccion);
    this.ui.showFicha(b, st, {
      anotar: (indId) => this.#anotar(b, indId),
      pesar: () => this.#pesar(b),
      abrir: () => this.#pedirApertura(b),
    });
  }

  #anotar(bulto, indId) {
    const st = this.estado.get(bulto.id);
    if (st.anotados.has(indId)) return;
    st.anotados.add(indId);
    const ind = bulto.indicios.find((i) => i.id === indId);
    if (!ind) return;

    if (ind.duro) {
      puntaje.sumar(VALOR.pistaLeida, 'INDICIO DE OCULTAMIENTO ANOTADO', { detalle: ind.leccion });
      this.cine.shake(0.25);
    } else {
      // Descartar bien también es trabajo: suma poco, pero enseña la regla.
      puntaje.sumar(40, 'OBSERVACIÓN DESCARTADA', { detalle: ind.leccion });
    }
  }

  #pesar(bulto) {
    const st = this.estado.get(bulto.id);
    if (st.peso != null) return;
    const kg = this.modulo.pesar(bulto.id);
    st.peso = kg;
    this.audio.beep(true);
    setTimeout(() => {
      this.modulo.pintarBalanza(kg, { etiqueta: bulto.codigo });
      const anomalo = kg > bulto.pesoEsperado * 1.45;
      if (anomalo) {
        this.audio.stinger();
        this.cine.shake(0.4);
        puntaje.sumar(VALOR.pistaLeida, 'DENSIDAD ANÓMALA CONFIRMADA', {
          detalle: `${kg.toFixed(1)} kg en ${bulto.volumen} L. La ropa no pesa eso ni mojada.`,
        });
      } else {
        puntaje.sumar(40, 'PESO VERIFICADO', {
          detalle: `${kg.toFixed(1)} kg para ${bulto.volumen} L: dentro de lo normal. Descartado por dato, no por intuición.`,
        });
      }
      if (this.seleccion === bulto.id) this.#pintarFicha();
    }, 1250);
  }

  // ── El escáner canino ───────────────────────────────────────────────────
  #soltarJustus() {
    if (this.justusUsado || this.justus.ocupado) return;
    this.justusUsado = true;
    this.#dock();
    this.ui.hideFicha();
    this.modulo.apagarResaltes();
    this.seleccion = null;

    // Plano bajo, a la altura del perro: su trabajo merece su encuadre.
    const v = this.modulo.vistaGeneral;
    this.cine.enfocar([v.pos[0], 1.25, v.pos[2] - 0.35], [v.look[0], 0.92, v.look[2]], {
      fov: 48, focus: 2.6, aperture: 0.0003, duration: 1.0, vista: 'canal_rojo_k9',
    });
    this.hudPrincipal?.toast('Justus barre la fila. Escucha: el ladrido cambia con el olor.', { dur: 4200 });

    const objetivos = this.modulo.bultos.map((b) => ({
      pos: new THREE.Vector3().copy(b.group.position).add(this.base),
      calor: b.datos.calor,
      marca: b.datos.calor > 0.9,
    }));

    this.justus.barrer(objetivos, {
      onOlfatear: (i, calor) => {
        const b = this.modulo.bultos[i];
        this.ui.marcarOlfato(b.id, calor);
        this.audio.pitidoProximidad(calor);
        if (calor > 0.4) this.cine.shake(calor * 0.35);
      },
      onMarcar: (i) => {
        const b = this.modulo.bultos[i];
        this.marcadoPorJustus = b.id;
        this.ui.marcarOlfato(b.id, 1, { marca: true });
        this.audio.stinger();
        this.cine.shake(0.8);
        this.hudPrincipal?.toast('Justus SE SIENTA y no se aparta. Ese es su marcaje.', { alerta: true, dur: 4200 });
      },
    }).then(() => {
      this.#dock();
      const v2 = this.modulo.vistaGeneral;
      this.cine.enfocar(v2.pos, v2.look, { ...v2, duration: 1.1, vista: 'canal_rojo' });
      puntaje.sumar(VALOR.perroLeido, 'BARRIDO CANINO REGISTRADO', {
        detalle: 'El can señala olores. Sirve como sustento, no como prueba: crúzalo con lo que ves.',
      });
    });
  }

  // ── La apertura ─────────────────────────────────────────────────────────
  #confianza(bulto) {
    const st = this.estado.get(bulto.id);
    let c = 0.1;
    for (const id of st.anotados) {
      c += bulto.indicios.find((i) => i.id === id)?.duro ? 0.28 : 0.05;
    }
    if (st.peso != null) c += st.peso > bulto.pesoEsperado * 1.45 ? 0.24 : 0.06;
    if (this.marcadoPorJustus === bulto.id) c += 0.24;
    return Math.min(1, c);
  }

  #pedirApertura(bulto) {
    if (this.aperturaGastada) {
      this.hudPrincipal?.toast('Ya gastaste tu única apertura autorizada.', { alerta: true });
      return;
    }
    const st = this.estado.get(bulto.id);
    const duros = [...st.anotados].filter((id) => bulto.indicios.find((i) => i.id === id)?.duro).length;
    this.ui.confirmar(bulto, { confianza: this.#confianza(bulto), indiciosDuros: duros },
      () => this.#abrirBulto(bulto),
      () => { /* vuelve a la ficha, ya visible */ });
  }

  async #abrirBulto(bulto) {
    this.aperturaGastada = true;
    this.activo = false; // se congela la selección durante la escena
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.ui.hideFicha();

    const v = this.modulo.vistaBulto(bulto.id);
    this.cine.enfocar([v.pos[0], v.pos[1] + 0.2, v.pos[2] + 0.15], v.look,
      { fov: 40, focus: 1.1, aperture: 0.0005, duration: 0.8, vista: 'canal_rojo_apertura' });

    this.audio.papel();
    await this.modulo.abrir(bulto.id, { hallazgo: bulto.esPositivo });

    const st = this.estado.get(bulto.id);
    const duros = [...st.anotados].filter((id) => bulto.indicios.find((i) => i.id === id)?.duro).length;

    if (bulto.esPositivo) {
      this.audio.stinger();
      this.cine.shake(1.2);
      puntaje.sumar(VALOR.maletaCorrecta, 'HALLAZGO EN EL CANAL ROJO', {
        detalle: duros >= 2
          ? 'Y con el acta sostenida: dos indicios duros anotados antes de abrir.'
          : 'Acertaste. Con más indicios anotados, el acta habría quedado blindada.',
      });
      this.ui.resultado({
        titulo: bulto.contenido.titulo,
        texto: bulto.contenido.texto,
        leccion: bulto.contenido.leccion,
        acierto: true,
        extra: `<div class="cr-leccion" style="border-color:#3fc47f;background:rgba(63,196,127,.08)">
            <b>SUSTENTO DEL ACTA:</b> ${Math.round(this.#confianza(bulto) * 100)}% ·
            ${duros} indicio(s) de ocultamiento anotado(s)${this.marcadoPorJustus === bulto.id ? ' · marcaje del can' : ''}
          </div>`,
      }, () => this.#terminar({ acierto: true, bulto }));
    } else {
      this.audio.beep(false);
      this.modulo.semaforoVerde();
      const laBuena = this.op.bultos.find((b) => b.esPositivo);
      puntaje.sumar(VALOR.maletaVacia, 'APERTURA EN VANO', {
        detalle: 'Gastaste tu única apertura. La persona recoge su ropa delante de la fila.',
      });
      this.ui.resultado({
        titulo: 'SIN NOVEDAD EN ESTE BULTO',
        texto: bulto.contenido.texto,
        leccion: laBuena
          ? bulto.contenido.leccion
          : 'Este equipaje no escondía nada, y ningún otro tampoco. Derivar a alguien tiene un costo '
            + 'aunque el oficial actúe de buena fe: el tiempo, la dignidad y la fila lo pagan igual.',
        acierto: false,
        extra: laBuena
          ? `<div class="cr-leccion" style="border-color:#e04a3c;background:rgba(224,74,60,.08)">
              <b>ESTABA EN:</b> ${laBuena.etiqueta} (${laBuena.codigo}) —
              ${laBuena.pesoReal.toFixed(1)} kg en ${laBuena.volumen} L, y
              «${laBuena.indicios.find((i) => i.duro)?.texto ?? 'con marcas de manipulación'}».
            </div>`
          : `<div class="cr-leccion" style="border-color:#e04a3c;background:rgba(224,74,60,.08)">
              <b>NO HABÍA NADA EN NINGÚN BULTO.</b> El operativo entero era infundado.
            </div>`,
      }, () => this.#terminar({ acierto: false, bulto }));
    }
  }

  #cerrarSinAbrir() {
    this.activo = false;
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.modulo.semaforoVerde();

    const laBuena = this.op.bultos.find((b) => b.esPositivo);
    if (laBuena) {
      puntaje.sumar(VALOR.canalOmision, 'DEJASTE PASAR EL BULTO', {
        detalle: 'Cerrar sin abrir cuando el sustento estaba sobre la mesa también es una decisión.',
      });
    } else {
      // Cerrar un operativo vacío es la jugada CORRECTA, y el juego tiene que
      // decirlo con puntos: si no, el jugador aprende a abrir siempre «por si
      // acaso», que es justo el reflejo que este nivel intenta desactivar.
      puntaje.sumar(280, 'CRITERIO: CERRASTE A TIEMPO', {
        detalle: 'No había nada, y lo determinaste sin desarmarle el equipaje a nadie.',
      });
    }
    this.ui.resultado({
      titulo: laBuena ? 'OPERATIVO CERRADO SIN APERTURA' : 'CERRADO CORRECTAMENTE · SIN NOVEDAD',
      texto: 'Devuelves el equipaje y levantas el precinto. La fila avanza.',
      leccion: laBuena
        ? `Estaba en ${laBuena.etiqueta} (${laBuena.codigo}): ${laBuena.pesoReal.toFixed(1)} kg en ${laBuena.volumen} L. `
          + `El indicio decisivo era «${laBuena.indicios.find((i) => i.duro)?.texto ?? 'la densidad'}».`
        : 'No siempre hay algo. Determinar que NO hay nada, y hacerlo rápido, es tan parte del oficio '
          + 'como la incautación. La fila que no se atiende también es un costo.',
      acierto: !laBuena,
    }, () => this.#terminar({ acierto: false, bulto: null }));
  }

  #terminar({ acierto, bulto }) {
    this.ui.ocultarTodo();
    if (this.justusHome) this.justus.mudarPuesto(this.justusHome, this.justusRot, true);
    const deriva = !!(acierto && bulto?.contenido?.derivaDirandro);
    bus.emit(Señal.CANAL_ROJO_RESUELTO, { acierto, tipo: this.op.tipo, deriva });
    // El decorado se queda montado: el canal rojo es parte de la terminal y se
    // ve desde el puesto. Solo se sueltan los bultos de ESTE operativo.
    setTimeout(() => this.modulo.limpiarBultos(), 900);
    this.onCerrar?.({ acierto, derivaDirandro: deriva, bulto, operativo: this.op });
  }

  /** Cronómetro suave: presiona con puntos, nunca corta la partida. */
  tick(dt) {
    if (!this.activo || !this.ui) return;
    this.tiempo = Math.max(0, this.tiempo - dt);
    this.ui.setReloj(this.tiempo / this.tiempoMax, this.tiempo);
    if (this.tiempo === 0 && !this.penalizadoPorTiempo) {
      this.penalizadoPorTiempo = true;
      puntaje.sumar(-120, 'LA FILA SE DESBORDÓ', {
        detalle: 'Inspeccionar bien es rápido: peso, costuras, precinto. Dar vueltas cuesta.',
      });
      this.hudPrincipal?.toast('El supervisor asoma la cabeza. La fila da la vuelta al pasillo.', { alerta: true });
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.ui?.dispose();
    this.modulo?.dispose();
    this.ui = null;
    this.modulo = null;
  }
}
