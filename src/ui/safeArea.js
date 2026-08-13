/**
 * safeArea — que el notch no se coma la interfaz.
 *
 * ── El problema, reportado desde un iPhone 12 ───────────────────────────────
 * El juego se juega en apaisado, y en apaisado el notch del iPhone queda en un
 * LATERAL. Toda la columna izquierda del HUD —la barra de integridad del Centro
 * Postal, la cabecera del canal rojo, la ficha del pasajero— vivía en
 * `left: 14px`, es decir, justo debajo del recorte de la cámara. El jugador
 * literalmente no podía leerla.
 *
 * `TouchControls` ya usaba `env(safe-area-inset-*)` para el mando, pero era el
 * único: los cinco HUD del juego colocaban sus paneles con píxeles fijos.
 *
 * ── Por qué una hoja aparte y no un arreglo en cada archivo ─────────────────
 * Los HUD se inyectan su propio CSS al montarse, así que una corrección repartida
 * exigiría tocar cinco ficheros y acordarse de hacerlo en el sexto. Esto es una
 * corrección de PLATAFORMA, no de diseño de cada panel: encoge los contenedores
 * raíz y, como todo lo demás se posiciona dentro de ellos, se aparta solo.
 *
 * Los velos a pantalla completa se compensan con márgenes negativos: un modal
 * que oscurece la escena tiene que llegar al borde físico, notch incluido, o se
 * ve una franja sin atenuar en el lateral.
 */

const ID = 'ah-safe-area';

const CSS = `
:root {
  --safe-l: env(safe-area-inset-left, 0px);
  --safe-r: env(safe-area-inset-right, 0px);
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
}

/* Los contenedores de interfaz se encogen hasta la zona segura. Todo lo que
   llevan dentro está posicionado contra ellos, así que se aparta del notch sin
   tocar una sola regla de los paneles. */
#hud-root, #cp-hud, #port-hud, #raid-hud, #marcador, #pause-root, #perfilamiento {
  left: var(--safe-l) !important;
  right: var(--safe-r) !important;
}

/* Excepción: lo que oscurece la pantalla entera tiene que seguir llegando al
   borde físico. Si no, queda una franja luminosa justo en el notch. */
.cp-velo, .cp-peritaje, .cp-panel, .cp-fallo,
.pz-overlay, #consecuencia, .pf-motivo, .pf-informe {
  margin-left: calc(-1 * var(--safe-l));
  margin-right: calc(-1 * var(--safe-r));
}
`;

/**
 * Inyecta las reglas una sola vez. Idempotente: se puede llamar desde cada
 * nivel sin comprobar nada.
 */
export function aplicarSafeArea() {
  if (typeof document === 'undefined' || document.getElementById(ID)) return;
  const s = document.createElement('style');
  s.id = ID;
  s.textContent = CSS;
  // Al final del `<head>` para ganarle a las hojas que los HUD inyectan al
  // montarse; de ahí también el `!important` de los desplazamientos.
  document.head.appendChild(s);
}
