/**
 * Pixel — utilidades para dibujar arte 2D por código.
 *
 * ── Por qué procedural y no ficheros PNG ────────────────────────────────────
 * Todo el arte de Aduanas Hero se genera con código (ADR-004): los personajes
 * cápsula, el aeropuerto, la nave postal. Un nivel 2D con spritesheets sueltos
 * rompería esa coherencia y, sobre todo, ataría el juego a que alguien redibuje
 * un PNG cada vez que cambie una paleta. Aquí los sprites se PINTAN una sola vez
 * en lienzos fuera de pantalla al cargar el nivel y a partir de ahí se estampan
 * con `drawImage`, que es la operación más barata que tiene Canvas 2D.
 *
 * El resultado es pixel art de verdad: se dibuja en una rejilla pequeña (16×24
 * para un personaje) y se escala con `imageSmoothingEnabled = false`, así que
 * cada píxel del diseño acaba siendo un cuadrado nítido en pantalla.
 */

/** Crea un lienzo fuera de pantalla del tamaño pedido, sin suavizado. */
export function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** Rectángulo en coordenadas de píxel de diseño. */
export function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/**
 * Paleta del nivel. Los nombres describen la FUNCIÓN, no el color, para que
 * cambiar la hora del día sea cambiar este objeto y nada más.
 */
export const PAL = {
  // Suelo del patio. Sube un punto respecto al primer corte: con las farolas
  // repartidas, un asfalto más oscuro dejaba el patio en penumbra plana y los
  // bultos flotando sobre nada.
  asfalto: '#464f5f',
  asfaltoOscuro: '#3e4655',
  linea: '#c9a227',
  // Almacén
  suelo: '#4a4640',
  sueloAlt: '#454139',
  pared: '#5c6470',
  paredAlta: '#6d7787',
  // Contenedores (los colores del puerto de verdad)
  cont: ['#b4453c', '#2f6ea8', '#3f8c5a', '#c08a2e', '#8a5ba8', '#3f8c8c'],
  contSombra: 'rgba(0,0,0,0.32)',
  // Oficial
  piel: '#e8b58a',
  pielSombra: '#c9946c',
  uniforme: '#2f4a6b',
  uniformeAlto: '#3d5f86',
  chaleco: '#e8d44a',
  gorra: '#22354d',
  bota: '#22262e',
  // Interfaz en el mundo
  ok: '#3fc47f',
  alerta: '#e0952a',
  mal: '#e04a3c',
  escaner: '#4fd0e0',
  sombra: 'rgba(0,0,0,0.35)',
};

/** Tamaño del tile en píxeles de diseño. Todo el mapa se mide en esta unidad. */
export const TILE = 16;
