/**
 * equipajes.js — el set de maletas del Canal Rojo (`02 - Diseño/12 - Canal Rojo y Sala Intrusiva`).
 *
 * Regla de diseño que gobierna todo este archivo: **el tamaño no es decoración**.
 * Una maleta de cabina de 20" que pesa 19 kg es una anomalía en sí misma, y un
 * maletón de 32" con 8 kg también. El jugador tiene que aprender a leer la
 * relación VOLUMEN ↔ PESO, que es exactamente el primer reflejo de un inspector
 * real cuando levanta un bulto en el módulo de inspección secundaria.
 *
 * Y la regla que lo hace juego: **una sola apertura**. En el canal rojo el
 * oficial no vacía la bodega entera; abre lo que puede justificar. Aquí eso se
 * traduce en la decisión más tensa del nivel.
 *
 * Nada de esto señala a personas: los indicios son propiedades físicas del
 * bulto, verificables y neutrales (Visión §28 y el criterio antisesgo del
 * perfilamiento, `gameplay/perfilamiento.js`).
 */

/**
 * Catálogo de bultos. `dims` en metros [ancho, alto, fondo]; `densidadNormal`
 * es el kg/dm³ esperable de ese formato lleno de ropa — el número contra el que
 * el juego contrasta el peso de la balanza.
 */
export const TIPOS_BULTO = {
  cabina: { etiqueta: 'Maleta de cabina 20"', tipo: 'rigida', dims: [0.35, 0.54, 0.22], densidadNormal: 0.17 },
  mediana: { etiqueta: 'Maleta mediana 24"', tipo: 'rigida', dims: [0.44, 0.67, 0.27], densidadNormal: 0.16 },
  grande: { etiqueta: 'Maleta grande 28"', tipo: 'blanda', dims: [0.51, 0.79, 0.31], densidadNormal: 0.15 },
  maleton: { etiqueta: 'Maletón rígido 32"', tipo: 'rigida', dims: [0.57, 0.90, 0.35], densidadNormal: 0.14 },
  mochila: { etiqueta: 'Mochila de viaje 45 L', tipo: 'blanda', dims: [0.32, 0.52, 0.25], densidadNormal: 0.16 },
  bolso: { etiqueta: 'Bolso de mano', tipo: 'blanda', dims: [0.44, 0.29, 0.22], densidadNormal: 0.15 },
  caja: { etiqueta: 'Caja de cartón precintada', tipo: 'caja', dims: [0.48, 0.40, 0.40], densidadNormal: 0.20 },
  rafia: { etiqueta: 'Bulto de rafia atado con pita', tipo: 'bolsa', dims: [0.46, 0.42, 0.34], densidadNormal: 0.19 },
};

/** Volumen en dm³ (litros) del bulto: la referencia contra la que se pesa. */
export function litros(clave) {
  const [w, h, d] = TIPOS_BULTO[clave].dims;
  return Math.round(w * h * d * 1000);
}

/**
 * Indicios físicos observables. `duro: true` = apunta a ocultamiento deliberado;
 * `duro: false` = llamativo pero con explicación inocente (los distractores, que
 * son los que enseñan a NO abrir por la primera rareza que aparece).
 */
const INDICIOS_DUROS = [
  { id: 'peso', texto: 'Pesa muy por encima de lo que cabe en su volumen', leccion: 'Densidad anómala: el primer indicador objetivo del oficio. Ropa pesa ~0,15 kg por litro; el doble no es ropa.' },
  { id: 'forro', texto: 'Costura del forro rehecha a mano, hilo de otro color', leccion: 'Los compartimentos ocultos se cierran a mano. La costura industrial es uniforme; la reciente, nunca.' },
  { id: 'bisagras', texto: 'Tornillos de bisagra con marcas de destornillador recientes', leccion: 'Una maleta desmontada y vuelta a montar deja marcas frescas sobre metal viejo.' },
  { id: 'fondo', texto: 'El fondo interior queda 4 cm más alto que el exterior', leccion: 'Doble fondo: la diferencia entre la medida externa y la interna no se puede disimular.' },
  { id: 'ruedas', texto: 'Carcasa muy rayada pero ruedas y tiradores nuevos', leccion: 'Maleta reutilizada y reforzada: se cambia lo que se rompe al cargarla con sobrepeso oculto.' },
  { id: 'precinto', texto: 'Precinto de plastificado cortado y vuelto a sellar', leccion: 'El plastificado de origen es continuo. Un corte limpio y re-sellado se hizo después del check-in.' },
  { id: 'sonido', texto: 'Al inclinarla, algo se desplaza en bloque, no suelto', leccion: 'La ropa se reacomoda; una masa compacta se mueve de una pieza.' },
];

const INDICIOS_BLANDOS = [
  { id: 'olor_comida', texto: 'Huele intensamente a comida casera', leccion: 'Olor fuerte ≠ ocultamiento. Explica un marcaje del can sin explicar un delito.' },
  { id: 'etiquetas', texto: 'Tres etiquetas de ruta viejas sin retirar', leccion: 'Señal de viajero frecuente, no de contrabando. Se cruza con el pasaporte, no con la apertura.' },
  { id: 'cinta', texto: 'Envuelta en film plástico de aeropuerto', leccion: 'El film es un servicio comercial legítimo: protege el equipaje. Muy común y nada concluyente.' },
  { id: 'candado', texto: 'Candado TSA puesto por el pasajero', leccion: 'Un candado normalizado es lo contrario a esconder: es cooperar con el control.' },
  { id: 'roto', texto: 'Asa lateral rota, reparada con cinta', leccion: 'Desgaste de bodega. Muy visible y casi siempre irrelevante.' },
  { id: 'liviana', texto: 'Pesa notablemente MENOS de lo que su tamaño sugiere', leccion: 'Ir liviano no es sospechoso por sí solo; se cruza con la duración declarada del viaje.' },
];

/** Lo que puede aparecer dentro. `perro` = si un can detector puede marcarlo. */
const HALLAZGOS = {
  dinero: {
    titulo: 'DIVISAS NO DECLARADAS',
    texto: 'Bajo el forro lateral, fajos de billetes plastificados y repartidos para no formar bulto: USD 74 300.',
    perro: true,
    leccion: 'Los canes de divisas marcan la tinta y el papel moneda. Superar USD 10 000 sin declarar es infracción aduanera: el dinero no está prohibido, ocultarlo sí.',
    puntos: 'divisas',
  },
  mercancia: {
    titulo: 'MERCANCÍA COMERCIAL SIN DECLARAR',
    texto: 'Sesenta teléfonos nuevos con precinto de fábrica, envueltos en ropa usada para simular efectos personales.',
    perro: false,
    leccion: 'Cantidad comercial camuflada como uso personal. No es un delito de sangre: es tributo evadido, y se resuelve con aforo y cobro.',
    puntos: 'mercancia',
  },
  fauna: {
    titulo: 'FAUNA SILVESTRE VIVA',
    texto: 'Doble fondo ventilado con tubos de tela: seis crías vivas, sedadas. El veterinario del aeropuerto ya viene.',
    perro: true,
    leccion: 'Tráfico de especies (CITES). El indicador clave es siempre el mismo: un fondo interior más alto que el exterior.',
    puntos: 'fauna',
  },
  patrimonio: {
    titulo: 'BIEN CULTURAL DE LA NACIÓN',
    texto: 'Entre seis «réplicas certificadas», una pieza con densidad irregular y restauraciones: es auténtica.',
    perro: false,
    leccion: 'El patrimonio sale del país escondido entre copias legales. La radiografía y el peso lo delatan antes que el papel.',
    puntos: 'patrimonio',
  },
  sustancia: {
    titulo: 'INDICIOS DE SUSTANCIA CONTROLADA',
    texto: 'Paredes laterales con grosor irregular y olor químico a solvente. Esto ya no es competencia de Aduanas.',
    perro: true,
    leccion: 'Aquí termina el trabajo del canal rojo y empieza el de DIRANDRO: la revisión intrusiva se hace en sala restringida y con acta.',
    puntos: 'sustancia',
    derivaDirandro: true,
  },
  nada: {
    titulo: 'SIN NOVEDAD',
    texto: 'Ropa, un cargador, dos libros y una bolsa de dulces. Nada más.',
    perro: false,
    leccion: 'Abrir la equivocada cuesta: gastaste tu única apertura y la persona tiene que volver a armar su equipaje delante de la fila.',
    puntos: 'nada',
  },
};

const COLORES_BULTO = [0x2c3542, 0x5a2f28, 0x3d3a34, 0x1f3b32, 0x4a3a50, 0x6a6257, 0x27313f, 0x7a4a2a];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const barajar = (a) => [...a].sort(() => Math.random() - 0.5);

/**
 * Arma un operativo de Canal Rojo.
 *
 * @param {object} opts
 * @param {string} opts.tipo      clave de HALLAZGOS para el bulto positivo
 * @param {number} opts.cantidad  bultos en la mesa (4 en móvil, 5–6 en escritorio)
 * @param {string} [opts.titular] nombre del pasajero derivado
 */
export function generarOperativo({ tipo = 'dinero', cantidad = 5, titular = 'Pasajero derivado' } = {}) {
  const hallazgo = HALLAZGOS[tipo] ?? HALLAZGOS.dinero;
  const claves = barajar(Object.keys(TIPOS_BULTO)).slice(0, cantidad);
  // `tipo: 'nada'` es un operativo SIN hallazgo, y es deliberado: cuando el
  // jugador deriva a alguien que no traía nada, el canal rojo tiene que
  // devolverle exactamente eso. Es la lección que ningún texto enseña igual de
  // bien — abrir a fondo y encontrar ropa doblada delante de la fila.
  const vacio = tipo === 'nada';
  const iPositivo = vacio ? -1 : Math.floor(Math.random() * cantidad);
  const durosBarajados = barajar(INDICIOS_DUROS);
  const blandosBarajados = barajar(INDICIOS_BLANDOS);
  let blandoCursor = 0;

  const bultos = claves.map((clave, i) => {
    const t = TIPOS_BULTO[clave];
    const vol = litros(clave);
    const esPositivo = i === iPositivo;

    // El peso: la pista silenciosa. El positivo va cargado; el resto, normal…
    // salvo UNO que va anormalmente liviano, para que "raro" no sea sinónimo
    // de "culpable" y el jugador tenga que pensar en vez de buscar el outlier.
    const factor = esPositivo ? 1.7 + Math.random() * 0.5
      : (i === (iPositivo + 2) % cantidad ? 0.55 : 0.85 + Math.random() * 0.3);
    const pesoReal = Math.round(vol * t.densidadNormal * factor * 10) / 10;
    const pesoEsperado = Math.round(vol * t.densidadNormal * 10) / 10;

    const indicios = esPositivo
      ? [{ ...durosBarajados[0], duro: true }, { ...durosBarajados[1], duro: true },
        { ...blandosBarajados[blandoCursor++ % blandosBarajados.length], duro: false }]
      : [{ ...blandosBarajados[blandoCursor++ % blandosBarajados.length], duro: false },
        ...(Math.random() < 0.35
          ? [{ ...blandosBarajados[blandoCursor++ % blandosBarajados.length], duro: false }] : [])];

    return {
      id: `bulto-${i}`,
      clave,
      etiqueta: t.etiqueta,
      tipo: t.tipo,
      dims: t.dims,
      color: COLORES_BULTO[(i * 3 + Math.floor(Math.random() * 3)) % COLORES_BULTO.length],
      volumen: vol,
      pesoReal,
      pesoEsperado,
      indicios: barajar(indicios),
      esPositivo,
      contenido: esPositivo ? hallazgo : HALLAZGOS.nada,
      // Código de facturación: el número que ve el jugador en la etiqueta 3D.
      codigo: `${rnd(['LA', 'AV', 'CM', 'AA'])}${100 + Math.floor(Math.random() * 899)}-${String(Math.floor(Math.random() * 900) + 100)}`,
    };
  });

  // ── El mapa de olor del K-9 ───────────────────────────────────────────────
  // La positiva quema, sus vecinas de mesa tienen olor por contacto y una
  // tercera da un falso positivo honesto (comida, medicinas, restos de billetes
  // que pasaron por la misma caja fuerte). Un can señala OLORES, no delitos.
  const calores = bultos.map(() => 0.06 + Math.random() * 0.1);
  if (!vacio) {
    calores[iPositivo] = 1;
    if (bultos[iPositivo - 1]) calores[iPositivo - 1] = 0.3 + Math.random() * 0.12;
    if (bultos[iPositivo + 1]) calores[iPositivo + 1] = 0.3 + Math.random() * 0.12;
  }
  // El falso positivo honesto. En un operativo vacío se queda en «interés» y
  // nunca llega a marcaje (0,9): el perro no se sienta si no hay nada — pero sí
  // puede interesarse por un tarro de ají, y ese es justo el matiz que hay que
  // aprender a no confundir con una prueba.
  if (hallazgo.perro || vacio) {
    const candidatos = bultos.map((_, i) => i).filter((i) => vacio || Math.abs(i - iPositivo) > 1);
    if (candidatos.length) {
      const falso = rnd(candidatos);
      calores[falso] = vacio ? 0.42 + Math.random() * 0.16 : 0.55 + Math.random() * 0.12;
      bultos[falso].falsoPositivo = true;
      // Y se le pone el indicio que lo explica, para que la contradicción sea
      // resoluble y no una trampa.
      if (!bultos[falso].indicios.some((x) => x.id === 'olor_comida')) {
        bultos[falso].indicios.push({ ...INDICIOS_BLANDOS[0], duro: false });
      }
    }
  }
  // Coherencia entre lo que se VE y lo que HACE el perro: un bulto que huele a
  // comida casera no puede salir «nada» en el registro de olfato. Si el jugador
  // pilla esa contradicción, deja de creerle al juego — y con razón.
  bultos.forEach((b, i) => {
    if (b.indicios.some((x) => x.id === 'olor_comida')) calores[i] = Math.max(calores[i], 0.36);
    b.calor = calores[i];
  });

  return {
    titular,
    tipo,
    hallazgo,
    bultos,
    vacio,
    positivo: vacio ? null : bultos[iPositivo].id,
    // El brief que ve el jugador al entrar al módulo.
    brief: {
      dinero: 'El semáforo marcó ROJO. El can de divisas alertó en la faja. Tienes una sola apertura.',
      mercancia: 'Derivado a canal rojo por presunción de mercancía comercial. Una sola apertura autorizada.',
      fauna: 'Alerta de la unidad ambiental: posible fauna viva en el equipaje. Una sola apertura.',
      patrimonio: 'Control de salida: presunción de bien cultural entre las piezas declaradas.',
      sustancia: 'Perfil de riesgo alto. Si aparece indicio de sustancia, esto pasa a DIRANDRO.',
      nada: 'Derivado por decisión del oficial de puesto. No hay alerta previa de la unidad canina.',
    }[tipo] ?? 'Inspección secundaria. Una sola apertura autorizada.',
  };
}
