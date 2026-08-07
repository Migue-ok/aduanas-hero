/**
 * estilos.js — utilidades de CSS para los HUD que se auto-inyectan.
 *
 * Existe por un problema muy concreto y muy caro de descubrir tarde: toda la
 * adaptación táctil del proyecto vive en `@media (pointer: coarse)`, y ese media
 * query **no se puede activar desde un Chrome de escritorio**. Por eso el
 * proyecto mantiene una segunda vía —la clase `qa-tactil` que pone `?touch=1`—
 * explicada en `core/Device.js`.
 *
 * Escribir cada bloque compacto dos veces a mano es exactamente el tipo de
 * duplicación que se desincroniza en la primera corrección. Aquí se escribe una
 * vez, con el token `@S` delante de cada selector, y se emite por las dos vías.
 *
 * @example
 *   compacto(`
 *     @S .cr-ficha { width: 240px; }
 *     @S .cr-ind   { font-size: 10px; }
 *   `)
 */
export function compacto(reglas) {
  const sinToken = reglas.replaceAll('@S ', '');
  const conClase = reglas.replaceAll('@S ', 'body.qa-tactil ');
  return `@media (pointer: coarse), (max-width: 900px) {\n${sinToken}\n}\n${conClase}`;
}
