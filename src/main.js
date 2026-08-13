import { SceneManager } from './core/SceneManager.js';
// Se importa por su EFECTO: marca el <body> con `qa-tactil` cuando hay dedo (o
// cuando `?touch=1` lo fuerza). Antes esto solo ocurría al cargar una escena por
// import dinámico, así que el propio menú de niveles se quedaba sin la capa de
// contraste táctil — justo la pantalla que ve primero quien juega en el móvil.
import './core/Device.js';
// El notch del iPhone en apaisado queda en un LATERAL y se comía la columna
// izquierda de todos los HUD. Se aplica una vez, para el juego entero.
import { aplicarSafeArea } from './ui/safeArea.js';

aplicarSafeArea();

/**
 * main — punto de entrada (ADR-006).
 * Antes este archivo ERA el aeropuerto (ahora en `scenes/AirportScene.js`).
 * Hoy solo levanta el SceneManager, que muestra el menú de niveles y carga la
 * escena elegida por import dinámico.
 */
const manager = new SceneManager();
manager.showMenu();

window.__AH_MANAGER = manager; // gancho de depuración (inofensivo en prod)
