/**
 * indicadores.js — el catálogo del **perfilamiento por conducta**
 * (`02 - Diseño/13 - Perfilamiento sin sesgo.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO ENTERO
 * ─────────────────────────────────────────────────────────────────────────────
 * Un juego sobre control aduanero que premie «marcar al que se ve raro» está
 * enseñando a discriminar, y lo está haciendo con la eficacia de un videojuego:
 * por refuerzo, sin argumentar. Así que aquí el antisesgo no es un cartel de
 * advertencia al inicio — es la **mecánica**:
 *
 * 1. **La apariencia se sortea aparte de la culpabilidad.** Piel, ropa, edad
 *    aparente, estatura y equipaje se asignan con un generador que NO conoce el
 *    rol del personaje (`sortearApariencia`). Es matemáticamente imposible
 *    aprender a acertar mirando a la gente, porque no hay correlación que
 *    aprender. Un jugador que lo intente bajará su puntaje hasta convencerse.
 * 2. **Marcar exige declarar el motivo**, y los motivos prohibidos están en la
 *    lista, a la vista. No se ocultan: se ofrecen, y se penalizan. Ver la opción
 *    «por su nacionalidad» y que el supervisor te la rechace enseña más que no
 *    verla nunca.
 * 3. **Los indicios son observables y verificables**: lo que la persona HACE,
 *    o una contradicción entre dos documentos. Nada de intuiciones.
 * 4. **Los distractores son inocentes con motivo.** El nervioso de su primer
 *    vuelo, la madre agobiada, el que corre por una conexión. Sirven para que
 *    «nervioso» deje de significar «culpable», que es el prejuicio número uno
 *    de cualquiera que se siente por primera vez en un puesto de control.
 *
 * Y el límite de contenido de la Visión §28 sigue vigente: esto enseña a
 * DETECTAR, no da un manual de cómo evadir. Todos los indicadores de abajo son
 * material divulgado por administraciones aduaneras en sus campañas públicas.
 */

/** Conductas que SÍ sostienen una derivación. Observables, describibles en un acta. */
export const CONDUCTAS_VALIDAS = [
  {
    id: 'evita_canino',
    gesto: 'evita',
    corto: 'Cambia de carril al ver al can',
    largo: 'Iba por el carril central; al aparecer el binomio canino se desplazó dos carriles y se colocó detrás de un grupo.',
    leccion: 'Evitar activamente el control es conducta, no apariencia: se describe, se filma y se sostiene en un acta.',
  },
  {
    id: 'vigila_modulo',
    gesto: 'vigila',
    corto: 'Vigila el módulo de reojo, repetidamente',
    largo: 'Evita mirar de frente al módulo de aduanas, pero lo consulta de reojo cada pocos segundos. Mide, no mira.',
    leccion: 'La diferencia entre mirar por curiosidad y VIGILAR está en la repetición y en el disimulo.',
  },
  {
    id: 'retrocede',
    gesto: 'retrocede',
    corto: 'Retrocedió al ver el control y volvió a entrar',
    largo: 'Llegó a la puerta, vio el módulo abierto, dio media vuelta hasta los baños y volvió cinco minutos después.',
    leccion: 'Salir del flujo y reingresar es de los pocos indicadores que casi nunca tienen explicación inocente.',
  },
  {
    id: 'equipaje_duracion',
    gesto: 'quieto',
    corto: 'El equipaje no cuadra con el viaje declarado',
    largo: 'Declara veintiún días de turismo y recogió una sola maleta de cabina. O al revés: tres días y cuatro bultos.',
    leccion: 'Contradicción verificable entre el documento y el hecho físico. Se mide, no se intuye.',
  },
  {
    id: 'boleto_efectivo',
    gesto: 'quieto',
    corto: 'Boleto comprado ayer, en efectivo, por un tercero',
    largo: 'Tarjeta de embarque emitida hace menos de 24 horas, pagada en efectivo y a nombre de una agencia que no es la suya.',
    leccion: 'El dato está en el papel, no en la persona. Es el indicador documental más citado por las aduanas del mundo.',
  },
  {
    id: 'ruta_ilogica',
    gesto: 'quieto',
    corto: 'Ruta absurdamente cara para el viaje que dice hacer',
    largo: 'Tres escalas y el doble de precio para un viaje de ocio de cuatro días, existiendo un vuelo directo más barato.',
    leccion: 'La ruta ilógica no acusa a nadie por sí sola, pero es una pregunta que hay que hacer.',
  },
  {
    id: 'corta_llamada',
    gesto: 'telefono',
    corto: 'Corta la llamada en seco al acercarse al control',
    largo: 'Hablaba por teléfono mirando al suelo; al entrar en la zona de aduanas cortó a media frase y guardó el aparato.',
    leccion: 'El cambio brusco de conducta AL CRUZAR el umbral del control es lo observable, no la llamada.',
  },
  {
    id: 'usa_terceros',
    gesto: 'pegado',
    corto: 'Se pega a una familia con la que no viaja',
    largo: 'Se colocó junto a una familia con niños, a distancia de parecer del grupo, sin cruzar una palabra con ellos en diez minutos.',
    leccion: 'Usar a terceros como pantalla es una técnica conocida, y se detecta por la ausencia de interacción.',
  },
];

/**
 * Distractores: conductas llamativas con explicación inocente. Son el corazón
 * pedagógico del minijuego — sin ellos «nervioso» seguiría significando
 * «culpable», que es exactamente el reflejo que hay que romper.
 */
export const CONDUCTAS_DISTRACTORAS = [
  {
    id: 'primer_vuelo',
    gesto: 'nervioso',
    corto: 'Muy nervioso: mira todo y pregunta a todos',
    largo: 'Se detiene en cada cartel, pregunta a dos personas dónde recoger el equipaje y vuelve a preguntar lo mismo.',
    leccion: 'Es su primer vuelo. El miedo al trámite es masivo y no distingue: mucha gente honesta suda frente a un uniforme.',
  },
  {
    id: 'conexion',
    gesto: 'apurado',
    corto: 'Sudando y con prisa evidente',
    largo: 'Llegó corriendo desde la puerta 14 con una conexión de cuarenta minutos y el pasaporte en la boca.',
    leccion: 'La prisa tiene una causa comprobable en el itinerario. Compruébala antes de convertirla en sospecha.',
  },
  {
    id: 'nino',
    gesto: 'nino',
    corto: 'Agobiada, no logra controlar la situación',
    largo: 'Viaja con un niño que lleva veinte minutos llorando, dos bolsas y un cochecito que no cierra.',
    leccion: 'El agobio no es ocultamiento. Confundirlos es el error más frecuente del oficial novato.',
  },
  {
    id: 'idioma',
    gesto: 'confundido',
    corto: 'No entiende las indicaciones y se queda parado',
    largo: 'Se sale del flujo y se queda quieto mirando los carteles: no entiende el idioma de la señalización.',
    leccion: 'Quedarse parado por no entender NO es evadir. La barrera idiomática se resuelve con un intérprete, no con un acta.',
  },
  {
    id: 'mudanza',
    gesto: 'quieto',
    corto: 'Muchísimo equipaje para una persona sola',
    largo: 'Cinco bultos y una caja. Trae el menaje de casa: se está mudando de vuelta al país y lo declara.',
    leccion: 'El volumen por sí solo no dice nada. Lo dice el volumen CONTRADICIENDO lo declarado.',
  },
  {
    id: 'dolor',
    gesto: 'quieto',
    corto: 'Camina raro y evita apoyar el peso',
    largo: 'Cojea y se apoya en el carrito: viene de una operación de rodilla y lleva la férula bajo el pantalón.',
    leccion: 'Una marcha anómala tiene mil causas médicas. Nunca es, por sí sola, motivo de derivación.',
  },
];

/**
 * Los criterios PROHIBIDOS. Están en la interfaz a propósito: el jugador tiene
 * que verlos, elegirlos alguna vez y recibir el rechazo. Un cartel al inicio no
 * enseña; un supervisor devolviéndote el acta, sí.
 */
export const CRITERIOS_PROHIBIDOS = [
  { id: 'piel', texto: 'Por su color de piel', respuesta: 'El color de piel no es un indicador. Es un rasgo. Este acta no sale de aquí.' },
  { id: 'ropa', texto: 'Por su forma de vestir', respuesta: 'Vestir distinto no es conducta. Media terminal viste distinto de ti.' },
  { id: 'origen', texto: 'Por su nacionalidad u origen', respuesta: 'Derivar por nacionalidad es discriminación, y además no funciona: los perfiles se copian y se rotan.' },
  { id: 'edad', texto: 'Por su edad', respuesta: 'Hay correos de 19 años y de 70. La edad no filtra nada y sí te hace perder al resto.' },
  { id: 'religion', texto: 'Por símbolos religiosos', respuesta: 'Eso no es perfilamiento. Eso es un problema legal para ti y para la institución.' },
  { id: 'acento', texto: 'Por su acento o su idioma', respuesta: 'No entender el idioma del cartel no es ocultar nada. Pide un intérprete.' },
  { id: 'corazonada', texto: 'Corazonada — me da mala espina', respuesta: 'Una corazonada no se escribe en un acta. Si no sabes qué viste, no viste nada.', suave: true },
];

const PALETA_ROPA = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0x2ec4b6, 0xe76fa1, 0xd9d9d9, 0x4a4a55];
const PALETA_PIEL = [0xf0c8a0, 0xe8b58a, 0xc79b76, 0xa9825e, 0x8a6244, 0x6b4a30];
const PALETA_PELO = [0x14100c, 0x2a1c12, 0x5a3a20, 0x9a9a9a, 0xd8c48a, 0x3a332c];
const NOMBRES = ['Viajero A', 'Viajero B', 'Viajero C', 'Viajero D', 'Viajero E', 'Viajero F', 'Viajero G', 'Viajero H', 'Viajero I'];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const barajar = (a) => [...a].sort(() => Math.random() - 0.5);

/**
 * Sortea el aspecto de una persona.
 *
 * **Esta función no recibe el rol del personaje, y nunca debe recibirlo.** Es la
 * garantía técnica de la regla 1: la apariencia y la culpabilidad se sortean por
 * separado, así que ningún rasgo correlaciona con nada. Si algún día alguien
 * necesita pasarle el rol, lo que está mal es lo que quiere hacer con él.
 */
function sortearApariencia() {
  return {
    colorRopa: rnd(PALETA_ROPA),
    colorPiel: rnd(PALETA_PIEL),
    colorPelo: rnd(PALETA_PELO),
    altura: 0.88 + Math.random() * 0.24,
    equipaje: rnd(['maleta', 'mochila', 'bolsa', 'carrito', 'ninguno', 'maleta', 'mochila']),
    colorEquipaje: rnd(PALETA_ROPA),
    sombrero: Math.random() < 0.22,
  };
}

/**
 * Arma una sala de llegadas.
 *
 * @param {number} cantidad   personas en la sala (5 en móvil, 7 en escritorio)
 * @param {number} objetivos  cuántas llevan conducta válida (1 normalmente)
 */
export function generarSala({ cantidad = 7, objetivos = 1 } = {}) {
  const validas = barajar(CONDUCTAS_VALIDAS).slice(0, objetivos);
  const distract = barajar(CONDUCTAS_DISTRACTORAS);
  const nombres = barajar(NOMBRES).slice(0, cantidad);

  const gente = [];
  for (let i = 0; i < cantidad; i++) {
    const esObjetivo = i < objetivos;
    const conducta = esObjetivo ? validas[i] : distract[(i - objetivos) % distract.length];
    gente.push({
      id: `p${i}`,
      nombre: nombres[i],
      // ← el sorteo de aspecto ocurre AQUÍ, ciego al valor de `esObjetivo`.
      aspecto: sortearApariencia(),
      conducta,
      esObjetivo,
      observado: false,
    });
  }

  // Se barajan las posiciones para que el objetivo no caiga siempre primero.
  const mezclada = barajar(gente);
  mezclada.forEach((p, i) => { p.slot = i; });
  return {
    gente: mezclada,
    objetivo: mezclada.find((p) => p.esObjetivo)?.id ?? null,
    total: cantidad,
  };
}

/**
 * Las opciones del formulario de derivación para una persona concreta: su
 * conducta real, dos conductas de otras personas (para que elegir no sea
 * trivial) y los criterios prohibidos, siempre presentes.
 */
export function opcionesDeMotivo(persona, sala) {
  const otras = sala.gente
    .filter((p) => p.id !== persona.id)
    .map((p) => p.conducta)
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const señuelos = barajar(otras).slice(0, 2).map((c) => ({
    id: c.id, texto: c.corto, tipo: 'ajeno', leccion: c.leccion,
  }));

  return barajar([
    { id: persona.conducta.id, texto: persona.conducta.corto, tipo: 'propio', leccion: persona.conducta.leccion },
    ...señuelos,
    ...barajar(CRITERIOS_PROHIBIDOS).slice(0, 3).map((c) => ({
      id: c.id, texto: c.texto, tipo: 'prohibido', respuesta: c.respuesta, suave: !!c.suave,
    })),
  ]);
}
