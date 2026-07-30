import gsap from 'gsap';
import { audio } from '../audio/AudioEngine.js';

/**
 * Paneles — apertura y cierre con masa, para TODO el juego (ADR-009 · juice).
 *
 * Nació dentro de `ui/HUD.js` para el aeropuerto y se extrajo aquí en cuanto los
 * niveles 2 y 3 necesitaron lo mismo: sus tarjetas de resumen y de final también
 * aparecían con un interruptor.
 *
 * Tres cuidados que NO son opcionales (aprendidos rompiéndolo):
 *
 * 1. `clearProps` al terminar. Muchos paneles llevan su `transform` en la hoja
 *    de estilos — centrados con `translate(-50%,-50%)`, rotados, desplazados— y
 *    esos valores CAMBIAN entre media queries. Si GSAP deja un transform inline,
 *    el CSS pierde el control y al girar el teléfono el panel se descoloca. En
 *    cuanto acaba la animación se devuelve el mando a la hoja de estilos.
 *
 * 2. Respaldo por temporizador. El estado no puede depender del `onComplete` de
 *    GSAP: con la pestaña en segundo plano el navegador estrangula el `rAF`, el
 *    tween no avanza y un panel a medio cerrar se queda bloqueando el juego.
 *
 * 3. Reapertura durante el cierre. Algunos paneles se refrescan cada pocos
 *    cientos de milisegundos (el interrogatorio, cada 350 ms). Sin protección,
 *    el respaldo del cierre volvería a ocultar el panel recién abierto. Por eso
 *    el cierre guarda su temporizador EN EL NODO y la apertura lo cancela.
 *
 * La clase de ocultación es configurable porque el aeropuerto usa `oculto` y los
 * niveles 2 y 3 usan `hidden`.
 */

/**
 * @param {HTMLElement} el
 * @param {object} [o]
 * @param {number}  [o.y]      desplazamiento inicial en píxeles
 * @param {number}  [o.scale]  escala inicial
 * @param {number}  [o.duration]
 * @param {boolean} [o.sfx]    roce de audio al abrir
 * @param {string}  [o.clase]  clase de ocultación ('oculto' | 'hidden')
 */
export function abrirPanel(el, { y = 16, scale = 0.95, duration = 0.44, sfx = true, clase = 'oculto' } = {}) {
  if (!el) return;
  clearTimeout(el.__cierre);
  el.__cierre = null;
  const estabaOculto = el.classList.contains(clase);
  el.classList.remove(clase);
  gsap.killTweensOf(el);
  if (!estabaOculto) {
    // Refresco de contenido (o reapertura a media salida): se devuelve el estilo
    // al CSS sin animar. Nada de rebotes en cada actualización.
    gsap.set(el, { clearProps: 'transform,opacity' });
    return;
  }
  if (sfx) audio.panel(true);
  gsap.fromTo(el,
    { opacity: 0, y, scale },
    {
      opacity: 1, y: 0, scale: 1, duration, ease: 'back.out(1.7)', overwrite: 'auto',
      onComplete: () => gsap.set(el, { clearProps: 'transform,opacity' }),
    });
}

export function cerrarPanel(el, { y = 12, scale = 0.97, duration = 0.2, sfx = false, clase = 'oculto' } = {}) {
  if (!el || el.classList.contains(clase)) return;
  // Cierre YA en marcha. Sin esta guarda, un panel que se conmuta desde el bucle
  // de render (los avisos de proximidad del muelle lo hacen cada frame) crearía
  // un `setTimeout` nuevo por fotograma durante los 270 ms del cierre, dejando
  // decenas de temporizadores huérfanos y reiniciando la animación sin parar.
  if (el.__cierre) return;
  if (sfx) audio.panel(false);
  const fin = () => {
    if (!el.__cierre) return;      // la apertura ganó la carrera: no ocultamos
    clearTimeout(el.__cierre);
    el.__cierre = null;
    el.classList.add(clase);
    gsap.set(el, { clearProps: 'transform,opacity' });
  };
  gsap.killTweensOf(el);
  el.__cierre = setTimeout(fin, duration * 1000 + 70);
  gsap.to(el, { opacity: 0, y, scale, duration, ease: 'power2.in', onComplete: fin });
}

/** Atajo para los niveles 2 y 3, que ocultan con la clase `hidden`. */
export const abrirHidden = (el, o = {}) => abrirPanel(el, { ...o, clase: 'hidden' });
export const cerrarHidden = (el, o = {}) => cerrarPanel(el, { ...o, clase: 'hidden' });

/**
 * VELOS a pantalla completa (portadas, resúmenes, desenlaces): los que llevan
 * `position:absolute; inset:0`.
 *
 * Existen como par propio porque durante un tiempo fueron la EXCEPCIÓN declarada
 * al sistema — se conmutaban con `classList` a mano — y el motivo era correcto:
 * un velo que ocupa toda la pantalla no puede desplazarse ni escalarse, porque
 * al hacerlo despega de los bordes y deja ver el canvas desnudo por la franja
 * que destapa. Pero salirse del sistema por eso costaba las tres garantías que
 * el sistema da: apertura y cierre por el mismo camino, respaldo por
 * temporizador y `clearProps` al terminar.
 *
 * La solución no era la excepción, era el parámetro: `y: 0, scale: 1` deja un
 * fundido PURO de opacidad. El velo no se mueve un píxel y sigue dentro del
 * sistema. Lo que se anima con masa es la tarjeta de dentro, como siempre.
 */
export const abrirVelo = (el, o = {}) =>
  abrirPanel(el, { y: 0, scale: 1, duration: 0.5, sfx: false, ...o, clase: 'hidden' });
export const cerrarVelo = (el, o = {}) =>
  cerrarPanel(el, { y: 0, scale: 1, duration: 0.3, ...o, clase: 'hidden' });

/**
 * Entrada escalonada de una lista (documentos, sellos, filas de un resumen).
 * Devuelve el tween por si alguien quiere encadenarlo.
 */
export function cascada(nodos, { y = 22, duration = 0.4, stagger = 0.07 } = {}) {
  if (!nodos?.length) return null;
  return gsap.from(nodos, {
    opacity: 0, y, duration, ease: 'back.out(1.5)', stagger,
    onComplete() { gsap.set(this.targets(), { clearProps: 'transform,opacity' }); },
  });
}
