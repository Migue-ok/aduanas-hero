import { SceneManager } from './core/SceneManager.js';

/**
 * main — punto de entrada (ADR-006).
 * Antes este archivo ERA el aeropuerto (ahora en `scenes/AirportScene.js`).
 * Hoy solo levanta el SceneManager, que muestra el menú de niveles y carga la
 * escena elegida por import dinámico.
 */
const manager = new SceneManager();
manager.showMenu();

window.__AH_MANAGER = manager; // gancho de depuración (inofensivo en prod)
