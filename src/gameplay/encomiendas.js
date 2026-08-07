/**
 * encomiendas — los datos del Nivel 4 · Centro Postal (ADR-013).
 *
 * Aquí no se renderiza nada ni se toca el DOM: solo vive el CONTENIDO. La escena
 * lee de aquí y la UI también, igual que `gameplay/cases.js` sirve al Nivel 1.
 *
 * ── La regla que ordena todo este archivo ─────────────────────────────────
 * Cada paquete sospechoso lleva UN síntoma, y el síntoma es lo único que el
 * jugador ve antes de decidir. De ahí salen las tres invariantes:
 *
 *   1. Un paquete sin síntoma está limpio, y eso es información —no ausencia de
 *      información—. Dispararle es un falso positivo, y por eso se castiga.
 *   2. El síntoma NO dice qué herramienta usar: describe lo que se ve. Traducir
 *      «la caja pesa poco para lo que declara» → balanza es el trabajo del
 *      jugador, y lo enseña el Códice. Ahí está la deducción (Regla de Oro #1).
 *   3. La herramienta equivocada no castiga: solo cuesta segundos. Castigarla
 *      convertiría el nivel en memorizar una tabla en vez de leer una caja.
 *
 * Límite de contenido (Visión §28): se describe cómo SE DETECTA una anomalía,
 * jamás cómo se fabrica. Ni una línea de este archivo sirve de manual.
 */

/**
 * Las cuatro herramientas del cinturón. El índice ES la tecla (1–4).
 *
 * ── El campo `familia` es la pieza didáctica del nivel ─────────────────────
 * Cuatro herramientas con nombres técnicos («densímetro», «lupa documental»)
 * no le dicen NADA a quien entra por primera vez: se prueban las cuatro a ver
 * cuál suena. La familia reduce cada una a un sustantivo que el jugador ya
 * entiende —la forma, el papel, el olor, el peso— y convierte la deducción en
 * una sola pregunta: «¿de qué habla el síntoma?».
 *
 *   «PESA MÁS DE LO QUE DECLARA»        → habla del PESO    → balanza
 *   «CIFRA REESCRITA EN LA GUÍA»        → habla del PAPEL   → lupa
 *   «BULTO DENSO EN UNA ESQUINA»        → habla de la FORMA → rayos X
 *   «JUSTUS SE SIENTA JUNTO AL BULTO»   → habla del OLOR    → el can
 *
 * La familia se imprime en la hotbar, bajo el nombre, y es lo que Justus
 * enseña en el tutorial. Sin ella el nivel se juega a prueba y error.
 */
export const HERRAMIENTAS = Object.freeze([
  {
    id: 'rayosx',
    tecla: 'Digit1',
    nombre: 'RAYOS X',
    familia: 'la forma',
    icono: '▚',
    color: 0x4fd0e0,
    css: '#4fd0e0',
    revela: 'Dobles fondos y densidades que no cuadran con lo declarado.',
    pista: 'Úsala cuando el síntoma habla de la FORMA: bultos, contornos, paredes, lo que hay DENTRO.',
    leccion: 'Ese síntoma habla de lo que hay DENTRO de la caja. Eso lo ve la máquina de rayos X: '
      + 'tecla 1. Mira la forma, no el papel.',
  },
  {
    id: 'lupa',
    tecla: 'Digit2',
    nombre: 'LUPA',
    familia: 'el papel',
    icono: '🔍',
    color: 0xe0952a,
    css: '#e0952a',
    revela: 'Guías de remisión adulteradas y remitentes que se repiten.',
    pista: 'Úsala cuando el síntoma habla del PAPEL: guías, cifras corregidas, letra repetida, remitentes.',
    leccion: 'Ese síntoma no está en la caja, está en el PAPEL que la acompaña. Para los documentos, '
      + 'la lupa: tecla 2.',
  },
  {
    id: 'justus',
    tecla: 'Digit3',
    nombre: 'JUSTUS',
    familia: 'el olor',
    icono: '🐕',
    color: 0xd9784f,
    css: '#d9784f',
    revela: 'Sustancias reguladas. No es infalible: también marca comida.',
    pista: 'Úsalo cuando el síntoma habla del OLOR: si el can reaccionó, verifícalo con el can.',
    leccion: 'Ahí hablo yo, jefe. Cuando el síntoma dice que reaccioné a algo, verifícalo conmigo: '
      + 'tecla 3. Pero ojo, que yo también marco comida.',
  },
  {
    id: 'balanza',
    tecla: 'Digit4',
    nombre: 'BALANZA',
    familia: 'el peso',
    icono: '⚖',
    color: 0x8ac926,
    css: '#8ac926',
    revela: 'Subvaluación: peso y volumen declarados contra los reales.',
    pista: 'Úsala cuando el síntoma habla del PESO o del VALOR: kilos que no cuadran, precios imposibles.',
    leccion: 'Ese síntoma habla de KILOS o de PRECIO. Eso se resuelve pesando: balanza, tecla 4.',
  },
]);

export const HERRAMIENTA_POR_ID = Object.freeze(
  Object.fromEntries(HERRAMIENTAS.map((h) => [h.id, h])),
);

/**
 * Los expedientes de La Red que asoman por el correo.
 *
 * No se inventa antagonista nuevo: son las piezas ya canónicas de
 * `03 - Mundo y Narrativa/02 - Historia Principal` — la agencia fachada
 * «Viajes Meridiano», la letra repetida y el método del Sastre— vistas desde el
 * régimen postal en vez de desde el mostrador de llegadas.
 */
export const EXPEDIENTES = Object.freeze({
  meridiano: {
    id: 'meridiano',
    nombre: 'VIAJES MERIDIANO',
    color: '#e0952a',
    resumen: 'La agencia fachada ya no solo compra pasajes: ahora despacha encomiendas.',
    ficha: 'Las guías salen todas de la misma mano —la letra repetida que ya viste en las '
      + 'declaraciones del aeropuerto— y los remitentes cambian de nombre pero no de caligrafía.',
  },
  sastre: {
    id: 'sastre',
    nombre: 'EL PATRÓN DEL SASTRE',
    color: '#8a5cc0',
    resumen: 'Rutas, pesos y horarios demasiado perfectos para ser casualidad.',
    ficha: 'El Sastre no falsifica: optimiza. Todos sus envíos caen justo por debajo del umbral '
      + 'que dispara una revisión. El error no está en un paquete, está en la serie.',
  },
  hormiga: {
    id: 'hormiga',
    nombre: 'COMERCIO HORMIGA',
    color: '#4f9dd9',
    resumen: 'Pequeños infractores sin vínculo con La Red. Existen y también cuentan.',
    ficha: 'No todo lo que interceptas es una trama. Buena parte del trabajo real son envíos '
      + 'mal declarados por gente que quiso ahorrarse el arancel. Se decomisa igual, pero no arma acta de red.',
  },
});

/**
 * Catálogo de síntomas. `dominio` es la herramienta que lo revela — pero el
 * jugador no lo lee aquí, lo deduce del texto (invariante 2 de la cabecera).
 *
 * Todos comparten el MISMO icono, «⚠», y eso no es pereza gráfica: el chip que
 * flota sobre el paquete es lo único que se ve a diez metros, y darle un icono
 * por dominio —una placa para rayos X, una lupa para el papel— convertiría la
 * lectura en reconocimiento de iconos. El jugador dispararía la herramienta que
 * dibuja el chip sin haber leído nunca qué le pasa a la caja, y el nivel entero
 * dejaría de ser deducción para ser emparejar formas. El texto es el dato.
 */
export const SINTOMAS = Object.freeze({
  perfil_denso: {
    id: 'perfil_denso', dominio: 'rayosx', icono: '⚠',
    etiqueta: 'BULTO DENSO EN UNA ESQUINA',
    lectura: 'La caja se hunde de un lado: hay algo compacto donde debería haber tela.',
  },
  pared_gruesa: {
    id: 'pared_gruesa', dominio: 'rayosx', icono: '⚠',
    etiqueta: 'PARED MÁS GRUESA DE LO NORMAL',
    lectura: 'El cartón mide el doble en un solo lateral. Por fuera nada; por dentro, otra cosa.',
  },
  silueta_rigida: {
    id: 'silueta_rigida', dominio: 'rayosx', icono: '⚠',
    etiqueta: 'CONTORNO RÍGIDO BAJO EL EMBALAJE',
    lectura: 'Declara peluches y no cede al tacto en ninguna cara.',
  },
  cifra_reescrita: {
    id: 'cifra_reescrita', dominio: 'lupa', icono: '⚠',
    etiqueta: 'CIFRA REESCRITA EN LA GUÍA',
    lectura: 'El peso declarado está corregido encima de otro número.',
  },
  misma_letra: {
    id: 'misma_letra', dominio: 'lupa', icono: '⚠',
    etiqueta: 'LA MISMA LETRA QUE OTRA GUÍA',
    lectura: 'Dos remitentes distintos y una sola caligrafía. Ya la habías visto.',
  },
  remitente_fantasma: {
    id: 'remitente_fantasma', dominio: 'lupa', icono: '⚠',
    etiqueta: 'REMITENTE SIN DIRECCIÓN VERIFICABLE',
    lectura: 'El domicilio del remitente es un lote sin numeración.',
  },
  can_marca: {
    id: 'can_marca', dominio: 'justus', icono: '⚠',
    etiqueta: 'JUSTUS SE SIENTA JUNTO AL BULTO',
    lectura: 'La marca pasiva del can: se sienta y no se mueve. Algo hay.',
  },
  can_insiste: {
    id: 'can_insiste', dominio: 'justus', icono: '⚠',
    etiqueta: 'EL CAN VUELVE AL MISMO PAQUETE',
    lectura: 'Pasó de largo dos veces y a la tercera se plantó.',
  },
  peso_no_cuadra: {
    id: 'peso_no_cuadra', dominio: 'balanza', icono: '⚠',
    etiqueta: 'PESA MÁS DE LO QUE DECLARA',
    lectura: 'La guía dice dos kilos y el bulto se nota de cinco.',
  },
  valor_irrisorio: {
    id: 'valor_irrisorio', dominio: 'balanza', icono: '⚠',
    etiqueta: 'VALOR DECLARADO INVEROSÍMIL',
    lectura: 'Cincuenta unidades de electrónica declaradas en doce dólares.',
  },
  volumen_hueco: {
    id: 'volumen_hueco', dominio: 'balanza', icono: '⚠',
    etiqueta: 'DEMASIADO LIVIANA PARA SU TAMAÑO',
    lectura: 'Un bulto de este volumen declarando repuestos no puede pesar tan poco.',
  },
});

/**
 * El paquete de comida: Justus marca, y no hay delito.
 *
 * Es la pieza más importante del nivel para la honestidad del sistema. Un perro
 * detector real marca comida, perfume y restos de otros envíos. Si el juego
 * premiara siempre la marca del can, enseñaría lo contrario de lo que enseña un
 * manejador: que el animal decide. Aquí la marca abre la puerta y nada más.
 *
 * Nota de diseño: NO se castiga. Un señuelo bien leído cuesta segundos, que en
 * un nivel cronometrado ya es un precio. Castigarlo sería castigar por hacer
 * exactamente lo que el procedimiento manda: verificar la marca.
 */
export const SENUELO_COMIDA = Object.freeze({
  id: 'olor_comida', dominio: 'justus', icono: '⚠', senuelo: true,
  etiqueta: 'JUSTUS OLFATEA CON INSISTENCIA',
  lectura: 'Se acerca, huele fuerte y sigue. No llega a sentarse.',
});

/** Fichas del Códice. Se desbloquean jugando: `llave` dice con qué. */
export const CODICE = Object.freeze([
  {
    id: 'guia_remision', llave: 'inicio', grupo: 'Términos',
    termino: 'Guía de remisión',
    texto: 'Documento que acompaña al envío y declara qué contiene, cuánto pesa, quién lo manda y '
      + 'quién lo recibe. Es el papel contra el que se contrasta TODO lo demás. Sin guía no hay '
      + 'comparación posible, y sin comparación no hay aforo.',
  },
  {
    id: 'regimen_postal', llave: 'inicio', grupo: 'Términos',
    termino: 'Régimen de envíos postales',
    texto: 'Régimen aduanero simplificado para paquetería internacional: menos trámite a cambio de '
      + 'límites de peso y valor. Esa simplificación es justamente lo que lo vuelve atractivo para '
      + 'quien quiere mover algo sin que nadie lo mire de cerca.',
  },
  {
    id: 'aforo', llave: 'inicio', grupo: 'Términos',
    termino: 'Aforo',
    texto: 'El reconocimiento del envío por parte de la autoridad aduanera. Puede ser documentario '
      + '(solo papeles) o físico (se abre el bulto). Tu pulso de escaneo es un aforo no intrusivo: '
      + 'mira sin romper el precinto.',
  },
  {
    id: 'subvaluacion', llave: 'balanza', grupo: 'Términos',
    termino: 'Subvaluación',
    texto: 'Declarar un valor menor al real para pagar menos tributos. No siempre viene sola: un '
      + 'envío subvaluado suele estar también mal descrito. Se detecta comparando el valor y el peso '
      + 'declarados con lo que el bulto es de verdad.',
  },
  {
    id: 'doble_fondo', llave: 'rayosx', grupo: 'Términos',
    termino: 'Doble fondo',
    texto: 'Cavidad oculta dentro del embalaje. En imagen se lee como una densidad que no corresponde '
      + 'al contenido declarado o como una pared demasiado gruesa. No se busca el objeto: se busca la '
      + 'INCOHERENCIA entre lo que dice el papel y lo que muestra la imagen.',
  },
  {
    id: 'marca_pasiva', llave: 'justus', grupo: 'Justus',
    termino: 'Marca pasiva del can',
    texto: 'Justus no rasca ni muerde: se sienta y se queda quieto. Esa es la marca. Pero un can '
      + 'detector también responde a comida y a residuos de olor de otros envíos, así que la marca '
      + 'es un motivo para mirar, nunca una conclusión.',
  },
  {
    id: 'evidencia_cruzada', llave: 'inicio', grupo: 'Procedimiento',
    termino: 'Evidencia cruzada',
    texto: 'Dos pruebas de naturaleza distinta apuntando al mismo expediente. Es lo que hace que un '
      + 'acta se sostenga en revisión. Una sola señal, por buena que sea, se cae: siempre hay una '
      + 'explicación alternativa para un dato aislado.',
  },
  {
    id: 'meridiano', llave: 'meridiano', grupo: 'La Red',
    termino: 'Viajes Meridiano',
    texto: EXPEDIENTES.meridiano.ficha,
  },
  {
    id: 'sastre', llave: 'sastre', grupo: 'La Red',
    termino: 'El Sastre',
    texto: EXPEDIENTES.sastre.ficha,
  },
  {
    id: 'hormiga', llave: 'hormiga', grupo: 'La Red',
    termino: 'Comercio hormiga',
    texto: EXPEDIENTES.hormiga.ficha,
  },
]);

// ── Piezas para componer paquetes ───────────────────────────────────────────

const LIMPIOS = [
  { declarado: 'Ropa de segundo uso', remitente: 'M. Quispe', origen: 'Madrid (España)', kg: 3.4 },
  { declarado: 'Libros escolares', remitente: 'Editorial Antares', origen: 'Bogotá (Colombia)', kg: 5.1 },
  { declarado: 'Repuestos de bicicleta', remitente: 'Ciclos Ayala', origen: 'Santiago (Chile)', kg: 2.7 },
  { declarado: 'Muestras de café', remitente: 'Coop. Alto Mayo', origen: 'Quito (Ecuador)', kg: 1.2 },
  { declarado: 'Artesanía de cerámica', remitente: 'Taller Chulucanas', origen: 'Guayaquil (Ecuador)', kg: 4.0 },
  { declarado: 'Documentos notariales', remitente: 'Estudio Prado & Asoc.', origen: 'Miami (EE. UU.)', kg: 0.4 },
  { declarado: 'Repuesto de lavadora', remitente: 'ServiTec del Norte', origen: 'Panamá', kg: 6.2 },
  { declarado: 'Juguetes de madera', remitente: 'Doña Rosa Vargas', origen: 'La Paz (Bolivia)', kg: 2.2 },
  { declarado: 'Suplementos deportivos', remitente: 'NutriFit Import', origen: 'Miami (EE. UU.)', kg: 3.8 },
  { declarado: 'Piezas de reloj', remitente: 'Relojería Berna', origen: 'Zúrich (Suiza)', kg: 0.9 },
];

let contadorGuia = 4180;
const nuevaGuia = () => `GR-${++contadorGuia}-${String(Math.floor(Math.random() * 900) + 100)}`;

const DESTINOS = [
  'J. Ramírez · Lince, Lima', 'Comercial Tres Ríos · Callao', 'A. Huamán · Trujillo',
  'Distrib. San Blas · Cusco', 'L. Farfán · Arequipa', 'Bazar El Sol · Chiclayo',
  'R. Ccahuana · Juliaca', 'Import. Delta · Surquillo, Lima',
];
const alAzar = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Guion de las tres oleadas.
 *
 * Es CURADO, no procedural, y por dos motivos concretos:
 *
 * 1. La enseñanza está escalonada. La oleada 1 solo trae síntomas de rayos X y
 *    de lupa; Justus entra en la 2; la balanza en la 3. Las cuatro herramientas
 *    están disponibles desde el primer segundo —nada se «desbloquea»— pero el
 *    jugador se topa con un dominio nuevo por oleada, que es como se aprende.
 * 2. La Mesa de Peritaje necesita que exista un acta armable. Cada oleada
 *    garantiza al menos dos sospechosos del MISMO expediente con dominios
 *    DISTINTOS. Con generación aleatoria eso se cumple «casi siempre», y «casi»
 *    significa que a alguien le tocará una partida sin acta posible.
 *
 * Lo que sí se aleatoriza: el orden de aparición, el carril y los paquetes
 * limpios de relleno. La textura cambia; la lección, no.
 */
const GUION = [
  {
    nombre: 'PRIMER FLUJO · CLASIFICACIÓN MATINAL',
    duracion: 78,
    limpios: 4,
    briefing: 'Llegó la valija de la madrugada. Contrasta cada guía con el bulto: lo que no cuadra, se para.',
    sospechosos: [
      {
        sintoma: 'perfil_denso', expediente: 'meridiano',
        declarado: 'Prendas de vestir', remitente: 'TEXTILES DEL SUR E.I.R.L.', origen: 'Iquique (Chile)',
        kg: 2.0, kgReal: 5.3,
        hallazgo: 'Doble fondo bajo la ropa',
        detalle: 'La guía declaraba 2 kg de prendas; la imagen muestra una masa compacta de 5,3 kg en una esquina.',
        evidencia: 'Placa de rayos X con densidad anómala',
      },
      {
        sintoma: 'misma_letra', expediente: 'meridiano',
        declarado: 'Material publicitario', remitente: 'PROMOTORA ANDES SAC', origen: 'Iquique (Chile)',
        kg: 1.6, kgReal: 1.6,
        hallazgo: 'Guía escrita por la misma mano que la anterior',
        detalle: 'Dos remitentes con razón social distinta y una sola caligrafía: es el patrón de Viajes Meridiano.',
        evidencia: 'Cotejo caligráfico de dos guías',
      },
      {
        sintoma: 'pared_gruesa', expediente: 'hormiga',
        declarado: 'Cuadernos y útiles', remitente: 'A. Solórzano', origen: 'Tacna',
        kg: 4.2, kgReal: 7.8,
        hallazgo: 'Lateral reforzado con mercancía no declarada',
        detalle: 'El cartón mide el doble en una sola cara. No es una red: es comercio hormiga, y también se decomisa.',
        evidencia: 'Placa de rayos X con pared reforzada',
      },
    ],
  },
  {
    nombre: 'SEGUNDO FLUJO · VALIJA INTERNACIONAL',
    duracion: 84,
    limpios: 4,
    senuelos: 1,
    briefing: 'Justus baja a la nave. Recuerda: su marca abre la puerta, no cierra el caso.',
    sospechosos: [
      {
        sintoma: 'can_marca', expediente: 'meridiano',
        declarado: 'Café tostado en grano', remitente: 'CAFETALERA MERIDIANO', origen: 'Bogotá (Colombia)',
        kg: 3.0, kgReal: 3.4,
        hallazgo: 'Sustancia regulada entre el grano',
        detalle: 'El can se sentó y no se movió. El café es un enmascarante clásico de olor, y aquí lo era.',
        evidencia: 'Marca pasiva del can sobre el bulto',
      },
      {
        sintoma: 'remitente_fantasma', expediente: 'meridiano',
        declarado: 'Repuestos electrónicos', remitente: 'MERIDIANO LOGISTIC EIRL', origen: 'Panamá',
        kg: 2.4, kgReal: 2.4,
        hallazgo: 'Remitente inexistente en el domicilio declarado',
        detalle: 'La dirección del remitente es un lote sin numeración. Tercera razón social, misma agencia.',
        evidencia: 'Verificación de domicilio del remitente',
      },
      {
        sintoma: 'silueta_rigida', expediente: 'sastre',
        declarado: 'Peluches infantiles', remitente: 'JUGUETERÍA EL ARCO', origen: 'Miami (EE. UU.)',
        kg: 1.9, kgReal: 4.6,
        hallazgo: 'Piezas metálicas dentro del relleno',
        detalle: 'Un envío de peluches no tiene un contorno rígido en las seis caras.',
        evidencia: 'Placa de rayos X con contorno rígido',
      },
      {
        sintoma: 'can_insiste', expediente: 'hormiga',
        declarado: 'Productos de limpieza', remitente: 'R. Zeballos', origen: 'Arica (Chile)',
        kg: 5.5, kgReal: 5.5,
        hallazgo: 'Precursor químico sin autorización',
        detalle: 'Pasó de largo dos veces y a la tercera se plantó. La insistencia del can también es lectura.',
        evidencia: 'Marca reiterada del can',
      },
    ],
  },
  {
    nombre: 'TERCER FLUJO · CIERRE DE TURNO',
    duracion: 90,
    limpios: 4,
    senuelos: 1,
    briefing: 'Última tanda antes de que salga el camión. El patrón del Sastre está en los números.',
    sospechosos: [
      {
        sintoma: 'valor_irrisorio', expediente: 'sastre',
        declarado: '50 auriculares inalámbricos', remitente: 'IMPORT DELTA SAC', origen: 'Shenzhen (China)',
        kg: 4.1, kgReal: 4.1, valor: 12,
        hallazgo: 'Subvaluación del 90 % del valor real',
        detalle: 'Cincuenta unidades declaradas en 12 dólares. El bulto está bien descrito; el valor, no.',
        evidencia: 'Contraste de valor declarado y de mercado',
      },
      {
        sintoma: 'peso_no_cuadra', expediente: 'sastre',
        declarado: 'Muestras textiles', remitente: 'DELTA TRADING PERÚ', origen: 'Shenzhen (China)',
        kg: 2.0, kgReal: 6.7,
        hallazgo: 'Carga comercial encubierta como muestra',
        detalle: 'Justo por debajo del umbral que dispara revisión. El error del Sastre nunca está en un paquete: está en la serie.',
        evidencia: 'Acta de pesaje: declarado 2 kg, real 6,7 kg',
      },
      {
        sintoma: 'cifra_reescrita', expediente: 'sastre',
        declarado: 'Accesorios de telefonía', remitente: 'DELTA TRADING PERÚ', origen: 'Panamá',
        kg: 1.8, kgReal: 1.8,
        hallazgo: 'Peso corregido a mano sobre la guía',
        detalle: 'El 6 original está reescrito como 1. Adulterar la guía es infracción por sí sola.',
        evidencia: 'Guía de remisión con enmendadura',
      },
      {
        sintoma: 'volumen_hueco', expediente: 'hormiga',
        declarado: 'Repuestos de motor', remitente: 'Mecánica Los Olivos', origen: 'Iquique (Chile)',
        kg: 9.0, kgReal: 1.4,
        hallazgo: 'Bulto vacío usado para inflar un despacho',
        detalle: 'Nueve kilos declarados en una caja que se levanta con dos dedos. Sobra peso en el papel, no en la caja.',
        evidencia: 'Acta de pesaje: declarado 9 kg, real 1,4 kg',
      },
      {
        sintoma: 'can_marca', expediente: 'meridiano',
        declarado: 'Snacks importados', remitente: 'MERIDIANO FOODS', origen: 'Bogotá (Colombia)',
        kg: 2.6, kgReal: 2.9,
        hallazgo: 'Sustancia regulada en envases sellados',
        detalle: 'La cuarta razón social de Meridiano en dos turnos. El hilo está entero.',
        evidencia: 'Marca pasiva del can sobre el bulto',
      },
    ],
  },
];

export const TOTAL_OLEADAS = GUION.length;

/**
 * Instancia una oleada lista para jugar.
 *
 * Devuelve objetos NUEVOS en cada llamada: la escena les cuelga estado vivo
 * (posición, malla, resuelto…) y compartir la referencia entre partidas dejaría
 * el guion contaminado con los restos de la anterior.
 *
 * @param {number} indice  0-based
 */
export function generarOleada(indice) {
  const g = GUION[Math.min(indice, GUION.length - 1)];
  const lista = [];

  for (const s of g.sospechosos) {
    const sintoma = SINTOMAS[s.sintoma];
    lista.push({
      id: `${indice}-S${lista.length}`,
      guia: nuevaGuia(),
      remitente: s.remitente,
      origen: s.origen,
      destino: alAzar(DESTINOS),
      declarado: s.declarado,
      pesoDeclarado: s.kg,
      pesoReal: s.kgReal ?? s.kg,
      valorDeclarado: s.valor ?? null,
      sintoma,
      dominio: sintoma.dominio,
      expediente: s.expediente,
      hallazgo: s.hallazgo,
      detalle: s.detalle,
      evidencia: s.evidencia,
      senuelo: false,
      limpio: false,
    });
  }

  for (let i = 0; i < (g.senuelos ?? 0); i++) {
    lista.push({
      id: `${indice}-C${i}`,
      guia: nuevaGuia(),
      remitente: 'Familia Ccopa Mamani',
      origen: 'Buenos Aires (Argentina)',
      destino: alAzar(DESTINOS),
      declarado: 'Alfajores y yerba mate',
      pesoDeclarado: 3.2,
      pesoReal: 3.2,
      valorDeclarado: null,
      sintoma: SENUELO_COMIDA,
      dominio: 'justus',
      expediente: null,
      hallazgo: 'Comida. El can marcó el olor, no una sustancia',
      detalle: 'Un can detector responde también a comida. Verificar la marca es el procedimiento: '
        + 'te costó segundos y evitó abrir el paquete de una familia.',
      evidencia: null,
      senuelo: true,
      limpio: true,
    });
  }

  const pool = [...LIMPIOS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < g.limpios; i++) {
    const base = pool[i % pool.length];
    lista.push({
      id: `${indice}-L${i}`,
      guia: nuevaGuia(),
      remitente: base.remitente,
      origen: base.origen,
      destino: alAzar(DESTINOS),
      declarado: base.declarado,
      pesoDeclarado: base.kg,
      pesoReal: base.kg,
      valorDeclarado: null,
      sintoma: null,
      dominio: null,
      expediente: null,
      hallazgo: null,
      detalle: null,
      evidencia: null,
      senuelo: false,
      limpio: true,
    });
  }

  // Barajado con una condición: el primer paquete de la primerísima oleada NUNCA
  // es limpio. Estrenar el nivel disparándole a una caja inocente enseña la
  // lección correcta por el camino más amargo posible, y encima antes de que el
  // jugador haya visto un solo síntoma con el que comparar.
  lista.sort(() => Math.random() - 0.5);
  if (indice === 0 && lista[0].limpio) {
    const j = lista.findIndex((p) => !p.limpio);
    if (j > 0) [lista[0], lista[j]] = [lista[j], lista[0]];
  }

  return {
    indice,
    nombre: g.nombre,
    briefing: g.briefing,
    duracion: g.duracion,
    encomiendas: lista,
    sospechosos: lista.filter((p) => !p.limpio).length,
  };
}

/**
 * Los tres requisitos del acta, evaluados uno a uno y en vivo.
 *
 * Existe separado de `evaluarActa` por una razón de enseñanza, no de código:
 * el veredicto final dice SI el acta se sostiene, pero no enseña a construirla.
 * Probando el nivel, la queja fue exactamente esa — «uno mezcla piezas como un
 * rompecabezas y no entiende qué está haciendo». Con los requisitos desglosados,
 * el panel puede ir marcándolos conforme el jugador coloca pruebas, y la regla
 * se aprende haciéndola en vez de leyéndola.
 *
 * @param {object[]} piezas
 * @returns {{clave: string, texto: string, ayuda: string, ok: boolean}[]}
 */
export function requisitosActa(piezas) {
  const expedientes = new Set(piezas.map((p) => p.expediente));
  const dominios = new Set(piezas.map((p) => p.dominio));
  return [
    {
      clave: 'dos',
      texto: 'Al menos DOS pruebas',
      ayuda: 'Un dato aislado siempre tiene otra explicación posible.',
      ok: piezas.length >= 2,
    },
    {
      clave: 'mismo',
      texto: 'Todas del MISMO expediente',
      ayuda: 'Un acta acredita un caso concreto, no una sospecha general.',
      ok: piezas.length > 0 && expedientes.size === 1,
    },
    {
      clave: 'distinta',
      texto: 'De DISTINTA naturaleza',
      ayuda: 'Dos pruebas del mismo tipo son la misma prueba repetida.',
      ok: dominios.size >= 2,
    },
  ];
}

/**
 * Qué le pasa al envío según cómo salga el acta. Es la consecuencia real, en
 * lenguaje llano: sin esto, firmar era un botón que sumaba puntos y nada más.
 */
export function consecuenciaActa(solida) {
  return solida
    ? {
      titulo: 'EL ACTA SE SOSTIENE',
      que: 'La mercancía queda incautada y el expediente pasa a la fiscalía con las pruebas '
        + 'cruzadas adjuntas. El remitente tendrá que explicarse.',
      leccion: 'Así se cierra un caso de verdad: no con una corazonada, sino con dos hechos '
        + 'distintos que apuntan al mismo sitio.',
    }
    : {
      titulo: 'EL ACTA SE CAE EN REVISIÓN',
      que: 'El supervisor la devuelve por falta de sustento. La mercancía se libera y vuelve a '
        + 'circular; el remitente queda avisado de que lo estás mirando.',
      leccion: 'No perdiste por no encontrar nada: perdiste por no poder demostrarlo. En aduanas, '
        + 'lo que no se sostiene por escrito no ocurrió.',
    };
}

/**
 * Veredicto de un acta armada en la Mesa de Peritaje.
 *
 * La regla es una sola frase y es la tesis del nivel: **dos pruebas de distinta
 * naturaleza sobre el mismo expediente**. Todo lo demás se cae.
 *
 * @param {object[]} piezas  evidencias colocadas en el acta
 * @returns {{solida: boolean, motivo: string, expediente: string|null}}
 */
export function evaluarActa(piezas) {
  if (piezas.length < 2) {
    return {
      solida: false,
      expediente: null,
      motivo: 'Una sola prueba no sostiene un acta: siempre hay otra explicación para un dato aislado.',
    };
  }
  const expedientes = new Set(piezas.map((p) => p.expediente));
  if (expedientes.size > 1) {
    return {
      solida: false,
      expediente: null,
      motivo: 'Mezclaste pruebas de expedientes distintos. Un acta acredita UN caso, no una sospecha general.',
    };
  }
  const dominios = new Set(piezas.map((p) => p.dominio));
  if (dominios.size < 2) {
    return {
      solida: false,
      expediente: [...expedientes][0] ?? null,
      motivo: 'Dos pruebas de la misma naturaleza son la misma prueba dos veces. Falta evidencia CRUZADA.',
    };
  }
  const exp = [...expedientes][0];
  return {
    solida: true,
    expediente: exp,
    motivo: `Evidencia cruzada sobre ${EXPEDIENTES[exp]?.nombre ?? 'el expediente'}: `
      + `${dominios.size} pruebas de distinta naturaleza. El acta se sostiene.`,
  };
}
