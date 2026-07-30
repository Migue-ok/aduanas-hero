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
  /**
   * Partículas del rastro de olfato. Se pudo subir al migrar la animación al
   * vertex shader: ya no cuestan CPU, solo relleno de pantalla. En móvil se
   * sube poco a propósito — el aditivo con textura es caro en fill rate.
   */
  particulasOlfato: isMobile ? 460 : 1500,
  /** Motas de polvo suspendido (todo el movimiento va en el vertex shader). */
  motas: isMobile ? 140 : 420,
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
 * `?touch=1` fuerza además la CAPA CSS táctil marcando el `<body>`.
 *
 * Por qué hace falta: toda la remediación de contraste para móvil vive en
 * `@media (pointer: coarse)`, y ese media query **no hay forma de activarlo
 * desde un Chrome de escritorio**. Resultado: la parte del HUD que más falla en
 * teléfonos era justo la única que no se podía mirar durante el desarrollo — y
 * así fue como llegó a producción un interrogatorio con tinta oscura sobre
 * cristal oscuro. Con `?touch=1` esas mismas reglas se aplican por clase y se
 * pueden revisar en pantalla grande.
 *
 * En un dispositivo táctil de verdad la clase también se pone, y es inofensiva:
 * las reglas por clase y las del media query son idénticas.
 */
if (typeof document !== 'undefined') {
  const marcar = () => document.body?.classList.toggle('qa-tactil', isTouch);
  if (document.body) marcar();
  else document.addEventListener('DOMContentLoaded', marcar, { once: true });
}

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
