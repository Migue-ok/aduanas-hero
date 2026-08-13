import * as THREE from 'three';

/**
 * RayoApuntado — la línea que dice A QUÉ le vas a disparar.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * El Centro Postal apunta con auto-target: el bulto elegido es el más cercano
 * dentro de un cono frontal (ADR-013 §6). El sistema funciona, pero era INVISIBLE
 * — con tres cintas llenas de cajas moviéndose, el jugador no tenía forma de
 * saber cuál de ellas se iba a llevar el pulso hasta después de dispararlo. En
 * un nivel a contrarreloj, donde disparar a una caja limpia castiga, eso es
 * pedirle que adivine.
 *
 * Ahora hay tres señales, y ninguna es texto:
 *
 *  1. **El rayo**: un haz fino del color de la herramienta empuñada, del oficial
 *     al bulto. Dice a la vez «a este» y «con esta».
 *  2. **El anillo** bajo el bulto, que lo separa de sus vecinos aunque el haz
 *     quede escorzado por la cámara en tres cuartos.
 *  3. **El pulso** del propio haz, para que se lea como algo cargado y a punto
 *     de salir, no como una barra estática de decoración.
 *
 * Es aditivo y sin sombras: se ve sobre cualquier fondo y no cuesta luces (el
 * presupuesto móvil son 4 RectAreaLight y no las toca).
 */
export class RayoApuntado {
  constructor(scene) {
    this.scene = scene;

    // Cilindro de altura 1 con el origen en su BASE: así basta escalar en Y con
    // la distancia y orientarlo, sin recalcular geometría en cada fotograma.
    const geo = new THREE.CylinderGeometry(0.035, 0.012, 1, 6, 1, true);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x4fd0e0, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.haz = new THREE.Mesh(geo, this.mat);
    this.haz.visible = false;
    this.haz.renderOrder = 5;

    // Anillo en el suelo, plano y mirando hacia arriba.
    const anilloGeo = new THREE.RingGeometry(0.42, 0.56, 22);
    anilloGeo.rotateX(-Math.PI / 2);
    this.matAnillo = new THREE.MeshBasicMaterial({
      color: 0x4fd0e0, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.anillo = new THREE.Mesh(anilloGeo, this.matAnillo);
    this.anillo.visible = false;
    this.anillo.renderOrder = 5;

    scene.add(this.haz, this.anillo);
    this._dir = new THREE.Vector3();
    this._eje = new THREE.Vector3(0, 1, 0);
  }

  /** El haz toma el color de la herramienta empuñada. */
  setColor(hex) {
    this.mat.color.setHex(hex);
    this.matAnillo.color.setHex(hex);
  }

  /**
   * @param {THREE.Vector3|null} desde  hombro del oficial (null = sin objetivo)
   * @param {THREE.Vector3|null} hasta  centro del bulto apuntado
   * @param {number} t                  tiempo, para el pulso
   * @param {number} carga              0..1 — 1 = escáner listo, 0 = recargando
   */
  apuntar(desde, hasta, t = 0, carga = 1) {
    if (!desde || !hasta) {
      this.haz.visible = false;
      this.anillo.visible = false;
      return;
    }
    this._dir.subVectors(hasta, desde);
    const largo = this._dir.length();
    if (largo < 0.001) { this.haz.visible = false; this.anillo.visible = false; return; }

    this.haz.visible = true;
    this.haz.position.copy(desde);
    this.haz.scale.set(1, largo, 1);
    // Orientar el eje Y del cilindro a lo largo del vector.
    this.haz.quaternion.setFromUnitVectors(this._eje, this._dir.normalize());

    // Respira. Y con el escáner recargando baja de intensidad: el propio rayo
    // dice si se puede disparar ya, sin un indicador aparte.
    const pulso = 0.42 + Math.sin(t * 7) * 0.12;
    this.mat.opacity = pulso * (0.35 + carga * 0.65);

    this.anillo.visible = true;
    this.anillo.position.set(hasta.x, 0.03, hasta.z);
    const escala = 1 + Math.sin(t * 4) * 0.06;
    this.anillo.scale.setScalar(escala);
    this.matAnillo.opacity = (0.35 + carga * 0.4) * (0.8 + Math.sin(t * 4) * 0.2);
  }

  dispose() {
    this.scene.remove(this.haz, this.anillo);
    this.haz.geometry.dispose();
    this.anillo.geometry.dispose();
    this.mat.dispose();
    this.matAnillo.dispose();
  }
}
