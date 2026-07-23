/**
 * Device — un único sitio donde el juego decide "¿esto es un móvil?" y qué
 * presupuesto gráfico puede permitirse (ADR-008).
 *
 * Regla: NADA de userAgent sniffing para la jugabilidad — se detecta el TACTO
 * (que es lo que decide si hay joystick) y se usa el tamaño de pantalla + los
 * núcleos/memoria para decidir la CALIDAD. Un portátil táctil recibe controles
 * táctiles pero calidad de escritorio; un móvil recibe ambos recortes.
 */

/**
 * Override de QA: `?touch=1` fuerza el mando virtual y `?movil=1` fuerza además
 * el presupuesto gráfico reducido — así se prueba la experiencia móvil desde un
 * escritorio sin emulador. `?touch=0` la desactiva.
 */
const qs = new URLSearchParams(location.search);
const forzado = (clave) => (qs.has(clave) ? qs.get(clave) !== '0' : null);

export const isTouch = forzado('touch')
  ?? ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/** Móvil "de verdad": táctil + pantalla chica (o UA de teléfono/tablet). */
export const isMobile = forzado('movil') ?? (isTouch && (
  Math.min(window.screen.width, window.screen.height) <= 900
  || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
));

/** Equipo modesto: pocos núcleos o poca RAM (aplica también a portátiles viejos). */
const modesto = (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4;

export const quality = {
  mobile: isMobile,
  /** Nunca pasar de 1.25 en móvil: el sobrecalentamiento mata la sesión. */
  pixelRatio: isMobile ? Math.min(window.devicePixelRatio, 1.25) : Math.min(window.devicePixelRatio, 2),
  /** Mapas de sombra: 512 en móvil, 1024 en equipos modestos, 2048 en PC. */
  shadowMap: isMobile ? 512 : (modesto ? 1024 : 2048),
  /** Sombra de foco (linterna): más barata todavía. */
  spotShadowMap: isMobile ? 256 : 1024,
  /** Partículas del rastro de olfato. */
  particulasOlfato: isMobile ? 350 : 900,
  /** Segmentos del plano de agua de Chimbote. */
  aguaSegmentos: isMobile ? 64 : 120,
  /** Confeti del gran final. */
  confeti: isMobile ? 40 : 90,
  /** Cajas del allanamiento. */
  cajasAllanamiento: isMobile ? 22 : 32,
  /** Antialias por hardware: caro en GPU móvil (el pixelRatio bajo ya suaviza). */
  antialias: !isMobile,
};

/**
 * Raycaster con "dedo gordo": en táctil se amplía el umbral de puntos/líneas.
 * Los objetos con malla siguen usando intersección exacta, pero ampliamos el
 * radio efectivo de los pequeños mediante hitboxes invisibles en las escenas.
 */
export function tuneRaycaster(raycaster) {
  if (isTouch) {
    raycaster.params.Points.threshold = 0.3;
    raycaster.params.Line.threshold = 0.2;
  }
  return raycaster;
}
