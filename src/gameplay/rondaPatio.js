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
 *   = muelle · ~ agua · O farola · T caseta
 *
 * Diseño del recinto, y por qué: un patio ancho al centro donde se corre y se
 * usa el dash, la nave a la izquierda para que haya interior y exterior, el
 * muelle al norte contra el agua (da fondo y encierra el mapa sin paredes
 * invisibles) y la caseta al sureste como punto de referencia.
 */
export const MAPA = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '======================================',
  '.....................................#',
  '.O.........|.........|.........|.....#',
  '.....................................#',
  '###########..........................#',
  '#,,,,,,,,,#..........................#',
  '#,,,,,,,,,#....|.........|.........|.#',
  '#,,,,,,,,,,..........................#',
  '#,,,,,,,,,#..........................#',
  '#,,,,,,,,,#.........O.........O......#',
  '###########..........................#',
  '.....................................#',
  '.....|.........|.........|...........#',
  '.....................................#',
  '.............................TTT.....#',
  '.............................TTT.....#',
  '.....................................#',
  '######################################',
];

/** Punto de aparición del oficial, en tiles. */
export const INICIO = { cx: 18, cy: 14 };

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
  for (let cy = 3; cy < 19; cy += 1) {
    for (let cx = 1; cx < 37; cx += 1) {
      const t = MAPA[cy][cx];
      const dentroNave = cx < 11 && cy > 5 && cy < 13;
      if (t === '.' && !dentroNave) sitios.push({ cx, cy });
    }
  }
  // Barajado con la fuente de azar que se le pase (así una semilla lo hace fijo).
  for (let i = sitios.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [sitios[i], sitios[j]] = [sitios[j], sitios[i]];
  }

  const bultos = [];
  const sospechosos = Math.max(3, Math.round(n * 0.45));
  for (let i = 0; i < n; i += 1) {
    const s = sitios[i * 3 % sitios.length] ?? sitios[i];
    const sucio = i < sospechosos;
    bultos.push({
      id: `B${i}`,
      cx: s.cx,
      cy: s.cy,
      color: i % 6,
      guia: `CT-${1000 + Math.floor(rnd() * 8999)}`,
      origen: ORIGENES[Math.floor(rnd() * ORIGENES.length)],
      carga: CARGAS[Math.floor(rnd() * CARGAS.length)],
      anomalia: sucio ? ANOMALIAS[Math.floor(rnd() * ANOMALIAS.length)] : null,
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

/** Duración de la ronda. Regla de Oro #4: sesión móvil corta. */
export const DURACION = 95;
/** Alcance del pulso de escaneo, en tiles. */
export const RADIO_ESCANER = 4.2;
/** Segundos de recarga del escáner. */
export const RECARGA_ESCANER = 1.5;
/** Segundos de recarga del dash. */
export const RECARGA_DASH = 0.9;
