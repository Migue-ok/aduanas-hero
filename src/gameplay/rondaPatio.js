/**
 * rondaPatio — los datos del Nivel 5 · Ronda de Patio.
 *
 * Separado de la escena por la misma razón que `encomiendas.js` lo está de la
 * suya: el contenido aduanero es lo que más se va a retocar y no debería obligar
 * a releer un bucle de render para cambiar una frase.
 *
 * ── La regla del nivel ─────────────────────────────────────────────────────
 * Cada bulto sospechoso tiene UNA anomalía, y cada anomalía tiene:
 *   · un ICONO que se ve al revelarla con el escáner,
 *   · un TITULAR corto (lo que el oficial anotaría),
 *   · una LECCIÓN de una frase con el procedimiento real detrás.
 * El jugador puede jugar sin leer la lección — pero el que la lee entiende por
 * qué ese bulto no cuadraba, que es de lo que va el juego (Visión §26).
 */

/** Anomalías reales del control de carga. Una por bulto. */
export const ANOMALIAS = Object.freeze([
  {
    id: 'peso',
    icono: '⚖',
    titular: 'Peso real muy por encima del declarado',
    leccion: 'Un contenedor que pesa de más suele traer mercancía no declarada debajo de la '
      + 'declarada. El peso es el dato más difícil de falsificar: la báscula no negocia.',
  },
  {
    id: 'precinto',
    icono: '🔒',
    titular: 'Precinto con número distinto al del manifiesto',
    leccion: 'El precinto es la firma del contenedor. Si el número no coincide con el papel, '
      + 'la carga se abrió en algún punto del viaje y nadie lo anotó.',
  },
  {
    id: 'ruta',
    icono: '🧭',
    titular: 'Ruta con escala injustificada',
    leccion: 'Una carga que da un rodeo caro sin motivo comercial suele estar cambiando de '
      + 'identidad por el camino: cada escala es una oportunidad de repapelar.',
  },
  {
    id: 'doblefondo',
    icono: '▚',
    titular: 'Densidad anómala en una pared',
    leccion: 'Un doble fondo se delata por la densidad, no por la vista: la pared devuelve '
      + 'una lectura que no corresponde al material declarado.',
  },
  {
    id: 'olor',
    icono: '🐕',
    titular: 'Justus marcó y se sentó',
    leccion: 'Cuando el can se sienta, no está avisando: está afirmando. Marca la puerta de '
      + 'entrada al caso, pero la marca sola nunca cierra un acta.',
  },
  {
    id: 'valor',
    icono: '💱',
    titular: 'Valor declarado por debajo del de mercado',
    leccion: 'Subvaluar es declarar menos para tributar menos. Se detecta comparando lo '
      + 'declarado con el valor real de esa mercancía en ese origen.',
  },
]);

export const ANOMALIA_POR_ID = Object.fromEntries(ANOMALIAS.map((a) => [a.id, a]));

/** Orígenes con sabor local, para que cada bulto suene a expediente real. */
const ORIGENES = ['Shanghái', 'Callao', 'Guayaquil', 'Manzanillo', 'Valparaíso', 'Panamá',
  'Cartagena', 'Busan', 'Rotterdam', 'Iquique'];
const CARGAS = ['Repuestos de moto', 'Textil confeccionado', 'Cerámica decorativa',
  'Juguetería', 'Herramienta manual', 'Calzado deportivo', 'Café en grano',
  'Electrodoméstico menor', 'Vidriería', 'Cableado eléctrico'];

/**
 * El MAPA. Se lee como se ve (ver `TileMap`):
 *   . asfalto · | línea pintada · # nave · , suelo de almacén
 *   = muelle · ~ agua · O farola · T caseta · G pata de grúa
 *   + verja · v vía de camiones · o oficina
 *
 * ── El recinto y por qué está así repartido ────────────────────────────────
 * 64×44 tiles: más del triple que el patio de la primera versión, porque con el
 * dash el mapa pequeño se cruzaba en cuatro segundos y el cronómetro dejaba de
 * apretar. Cinco zonas con carácter propio, para que uno sepa DÓNDE está sin
 * mirar un minimapa:
 *
 *   · **Muelle** (norte, contra el agua) — grúas y descarga. Es el fondo del
 *     escenario y encierra el mapa sin paredes invisibles.
 *   · **Explanada** (centro) — el patio abierto donde se corre. Aquí el dash es
 *     la diferencia entre llegar y no llegar.
 *   · **Nave** (oeste) — interior, con su suelo propio. Refugio y referencia.
 *   · **Vía de camiones** (este) — por donde se van los que no revisas.
 *   · **Oficina y verja** (sur) — el borde administrativo. Por la verja escapan
 *     los contrabandistas, así que mirar al sur es mirar al peligro.
 */
export const MAPA = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '================================================================',
  '..G..........G..........G..........G..........G..........G......',
  '................................................................',
  '.....|..........|..........|..........|..........|..........|...',
  '................................................................',
  '#############...................................................',
  '#,,,,,,,,,,,#..........O..........O..........O..........O.......',
  '#,,,,,,,,,,,#...................................................',
  '#,,,,,,,,,,,,...................................................',
  '#,,,,,,,,,,,#.....|..........|..........|..........|..........|.',
  '#,,,,,,,,,,,#...................................................',
  '#,,,,,,,,,,,,...................................................',
  '#,,,,,,,,,,,#...................................................',
  '#############...................................................',
  '................................................................',
  '..........|..........|..........|..........|..........|.........',
  '................................................................',
  '.......................................................vvvvvvvvv',
  '.......................................................vvvvvvvvv',
  '.......................................................vvvvvvvvv',
  '................................................................',
  '.....|..........|..........|..........|..........|..............',
  '................................................................',
  '..........O..........O..........O..........O..........O.........',
  '................................................................',
  '################........................########################',
  '#,,,,,,,,,,,,,,#........................#,,,,,,,,,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,,,,........................,,,,,,,,,,,,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,,,#........................#,,,,,,,,,,,,,,,,,,,,,,#',
  '################........................########################',
  '................................................................',
  '......|..........|..........|..........|..........|.............',
  '................................................................',
  '..........................ooo...................................',
  '..........................ooo...................................',
  '................................................................',
  '.....O..........O..........O..........O..........O..........O...',
  '................................................................',
  '++++++++++++++++++++++++++++..++++++++++++++++++++++++++++++++++',
  '................................................................',
  '................................................................',
];

/** Punto de aparición del oficial, en tiles. Centro de la explanada. */
export const INICIO = { cx: 30, cy: 24 };

/** Por dónde se escapan los que huyen: el hueco de la verja del sur. */
export const FUGA = { cx: 29, cy: 42 };

/**
 * Genera los bultos de una ronda.
 *
 * Reparto deliberado: algo menos de la mitad son sospechosos. Con demasiados, el
 * escáner deja de ser una decisión y pasa a ser un barrido; con muy pocos, la
 * ronda se hace de vacío y aburre. Y ninguno aparece dentro de la nave: el
 * interior es refugio y punto de referencia, no zona de trabajo.
 */
export function generarRonda(n = 9, rnd = Math.random) {
  const sitios = [];
  for (let cy = 4; cy < MAPA.length - 3; cy += 1) {
    for (let cx = 1; cx < MAPA[cy].length - 1; cx += 1) {
      if (MAPA[cy][cx] !== '.') continue;
      // Separación mínima: bultos pegados se tapan entre sí y el escáner los
      // revelaría todos de un pulso, que es justo la decisión que se quiere.
      if (sitios.some((s) => Math.abs(s.cx - cx) < 3 && Math.abs(s.cy - cy) < 3)) continue;
      sitios.push({ cx, cy });
    }
  }
  // Barajado con la fuente de azar que se le pase (así una semilla lo hace fijo).
  for (let i = sitios.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [sitios[i], sitios[j]] = [sitios[j], sitios[i]];
  }

  const bultos = [];
  const sospechosos = Math.max(3, Math.round(n * 0.45));
  for (let i = 0; i < n && i < sitios.length; i += 1) {
    const s = sitios[i];
    const sucio = i < sospechosos;
    bultos.push({
      id: `B${i}`,
      cx: s.cx,
      cy: s.cy,
      color: Math.floor(rnd() * 6),
      tipo: TIPOS_BULTO[Math.floor(rnd() * TIPOS_BULTO.length)],
      guia: `CT-${1000 + Math.floor(rnd() * 8999)}`,
      origen: ORIGENES[Math.floor(rnd() * ORIGENES.length)],
      carga: CARGAS[Math.floor(rnd() * CARGAS.length)],
      anomalia: sucio ? ANOMALIAS[Math.floor(rnd() * ANOMALIAS.length)] : null,
      // Uno de cada tres sospechosos trae quien lo vigile. No todos: si siempre
      // hubiera alguien al lado, el fugitivo sería el delator y sobraría el
      // escáner. Así la persecución es una sorpresa, no un sistema de aviso.
      vigilado: sucio && rnd() < 0.34,
      revelado: false,
      marcado: false,
    });
  }
  // Se barajan otra vez para que los sospechosos no queden agrupados al inicio.
  for (let i = bultos.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [bultos[i], bultos[j]] = [bultos[j], bultos[i]];
  }
  return bultos;
}

/** Las cinco siluetas de bulto. Ver `engine2d/Bultos.js`. */
export const TIPOS_BULTO = ['contenedor', 'contenedor', 'pale', 'bidones', 'sacos', 'huacal'];

/** Duración de la ronda. Sube con el patio grande: hay mucho más que recorrer. */
export const DURACION = 130;
/** Alcance del pulso de escaneo, en tiles. */
export const RADIO_ESCANER = 4.2;
/** Segundos de recarga del escáner. */
export const RECARGA_ESCANER = 1.5;
/** Segundos de recarga del dash. */
export const RECARGA_DASH = 0.9;
