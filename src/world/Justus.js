import * as THREE from 'three';
import gsap from 'gsap';
import { makeGooglyEyes } from './GooglyEyes.js';

/**
 * Justus — el K-9 veterano, ahora en escena (Visión §13).
 * Pastor procedural: torso con grupa caída, cuello, hocico afinado, mancha de
 * lomo, cola articulada de dos segmentos y chaleco K-9. Respira, mueve las
 * orejas, vigila la fila; al llamarlo trota hasta el objetivo, se DETIENE a
 * distancia de trabajo (jamás atraviesa el equipaje) y estira el cuello para
 * olfatear. Si marca, se SIENTA y ladra — la señal real de detección.
 */

const PELAJE = 0x4a3826;
const PELAJE_CLARO = 0x8a6a45;
const LOMO = 0x2c2015;        // la "silla de montar" oscura del pastor
const CHALECO = 0x1c2a3a;

export class Justus {
  constructor(scene, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.#build();

    // Su puesto: al costado izquierdo del mostrador, mirando la fila que llega.
    this.home = new THREE.Vector3(-1.7, 0, -0.9);
    this.group.position.copy(this.home);
    this.group.rotation.y = 0.35;

    this.ocupado = false;
    this.alertaAlta = false;
    this.phase = Math.random() * 10;
  }

  #build() {
    const pelaje = new THREE.MeshStandardMaterial({ color: PELAJE, roughness: 0.9 });
    const pelajeClaro = new THREE.MeshStandardMaterial({ color: PELAJE_CLARO, roughness: 0.9 });
    const lomo = new THREE.MeshStandardMaterial({ color: LOMO, roughness: 0.95 });
    const chaleco = new THREE.MeshStandardMaterial({ color: CHALECO, roughness: 0.6 });

    // Torso: pecho alto, grupa ligeramente caída (silueta de pastor).
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 6, 12), pelaje);
    torso.rotation.z = Math.PI / 2;
    torso.rotation.y = 0;
    torso.castShadow = true;
    const grupa = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), pelaje);
    grupa.position.set(0, -0.02, -0.2);
    grupa.castShadow = true;
    // Mancha oscura del lomo.
    const silla = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), lomo);
    silla.scale.set(1, 0.8, 1.9);
    silla.position.set(0, 0.03, -0.04);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.22), chaleco);
    vest.position.set(0, 0.02, 0.07);
    vest.castShadow = true;
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshBasicMaterial({ map: this.#makeVestTag() }));
    placa.position.set(0, 0.045, 0.185);
    placa.rotation.x = -0.35;
    this.body.add(torso, grupa, silla, vest, placa);
    this.body.position.y = 0.42;
    this.body.rotation.x = 0.06; // pecho arriba, grupa abajo

    // Cuello: conecta pecho y cabeza (antes la cabeza flotaba).
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.2, 10), pelaje);
    this.neck.position.set(0, 0.55, 0.22);
    this.neck.rotation.x = 0.7;
    this.neck.castShadow = true;

    // Cabeza: cráneo + stop + hocico afinado + trufa.
    this.head = new THREE.Group();
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), pelaje);
    craneo.scale.set(0.92, 0.95, 1.1);
    const hocico = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.14, 10), pelajeClaro);
    hocico.rotation.x = Math.PI / 2;
    hocico.position.set(0, -0.03, 0.12);
    const trufa = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 }));
    trufa.position.set(0, -0.026, 0.19);
    // Mandíbula clara.
    const mandibula = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), pelajeClaro);
    mandibula.scale.set(0.9, 0.6, 1.1);
    mandibula.position.set(0, -0.055, 0.06);
    this.ears = [];
    for (const sx of [-0.05, 0.05]) {
      const oreja = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.095, 6), pelaje);
      oreja.position.set(sx, 0.095, -0.015);
      oreja.rotation.x = -0.12;
      oreja.rotation.z = sx * 3;
      this.head.add(oreja);
      this.ears.push(oreja);
    }
    // Ojos saltones de perro cartoon (ADR-004): hasta el veterano los tiene.
    this.googly = makeGooglyEyes({ radio: 0.032, separacion: 0.042, pupila: 0.009 });
    this.googly.group.position.set(0, 0.035, 0.062);
    this.head.add(this.googly.group);
    // Cejas claras por encima de los globos (la expresión del pastor).
    for (const sx of [-0.042, 0.042]) {
      const ceja = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), pelajeClaro);
      ceja.scale.set(1.5, 0.5, 0.8);
      ceja.position.set(sx, 0.082, 0.062);
      this.head.add(ceja);
    }
    const cicatriz = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.04), pelajeClaro);
    cicatriz.position.set(-0.045, 0.062, 0.05);
    cicatriz.rotation.y = 0.4;
    this.head.add(craneo, hocico, trufa, mandibula, cicatriz);
    this.head.position.set(0, 0.68, 0.32);
    this.headHome = this.head.position.clone();

    // Patas con corvejón sugerido (cilindro superior + inferior fino).
    this.legs = [];
    for (const [sx, sz] of [[-0.075, 0.15], [0.075, 0.15], [-0.075, -0.17], [0.075, -0.17]]) {
      const pata = new THREE.Group();
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.2, 8), pelaje);
      sup.position.y = -0.09;
      const inf = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.2, 8), pelajeClaro);
      inf.position.y = -0.26;
      const garra = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), pelajeClaro);
      garra.scale.set(1, 0.5, 1.4);
      garra.position.set(0, -0.36, 0.015);
      pata.add(sup, inf, garra);
      pata.position.set(sx, 0.38, sz);
      pata.children.forEach((m) => { m.castShadow = true; });
      this.group.add(pata);
      this.legs.push(pata);
    }

    // Cola articulada: dos segmentos con caída natural.
    this.tail = new THREE.Group();
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.014, 0.16, 6), pelaje);
    t1.position.y = -0.08;
    this.tailTip = new THREE.Group();
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.006, 0.14, 6), lomo);
    t2.position.y = -0.07;
    this.tailTip.add(t2);
    this.tailTip.position.y = -0.16;
    this.tail.add(t1, this.tailTip);
    this.tail.position.set(0, 0.46, -0.34);
    this.tail.rotation.x = 0.8;

    this.group.add(this.body, this.neck, this.head, this.tail);
  }

  #makeVestTag() {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = '#1c2a3a';
    g.fillRect(0, 0, 96, 48);
    g.strokeStyle = '#d8b34a';
    g.strokeRect(3, 3, 90, 42);
    g.fillStyle = '#d8b34a';
    g.font = 'bold 24px monospace';
    g.textAlign = 'center';
    g.fillText('K-9', 48, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Rutina de trabajo. El perro se detiene a DISTANCIA DE TRABAJO del objetivo
   * (0.45 m) y estira cuello y cabeza hacia él: nunca atraviesa la geometría.
   */
  olfatear({ objetivo, insistente = false }) {
    if (this.ocupado) return Promise.resolve();
    this.ocupado = true;

    // Punto del objetivo (equipaje a los pies del pasajero / la persona misma)…
    const target = objetivo === 'persona'
      ? new THREE.Vector3(-0.3, 0.9, -1.5)
      : new THREE.Vector3(-0.45, 0.35, -1.45);
    // …y el punto donde el PERRO se planta: retirado hacia su lado (izquierda/frente).
    const standDir = new THREE.Vector3(-0.8, 0, 0.55).normalize();
    const stand = new THREE.Vector3(target.x, 0, target.z).addScaledVector(standDir, 0.5);

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.ocupado = false;
          resolve();
        },
      });

      // 1) Orienta y trota hasta el punto de trabajo (no hasta el objetivo).
      const angulo = Math.atan2(target.x - stand.x, target.z - stand.z);
      const anguloMarcha = Math.atan2(stand.x - this.group.position.x, stand.z - this.group.position.z);
      tl.to(this.group.rotation, { y: anguloMarcha, duration: 0.35, ease: 'power2.out' });
      tl.to(this.group.position, { x: stand.x, z: stand.z, duration: 1.2, ease: 'power1.inOut' }, '<0.1');
      // Encara el objetivo ya plantado.
      tl.to(this.group.rotation, { y: angulo, duration: 0.35, ease: 'power2.inOut' });

      // 2) Estira cuello y baja (o sube) la cabeza hacia el objetivo, sin moverse del sitio.
      const headY = objetivo === 'persona' ? 0.78 : 0.3;
      tl.to(this.head.position, { y: headY, z: 0.46, duration: 0.5, ease: 'power2.inOut' });
      tl.to(this.head.rotation, { x: objetivo === 'persona' ? -0.2 : 0.5, duration: 0.5 }, '<');
      tl.to(this.neck.rotation, { x: objetivo === 'persona' ? 0.3 : 1.15, duration: 0.5 }, '<');

      // 3) Olfateo: micro-cabeceos + barrido lateral de trufa (sin desplazar el cuerpo).
      tl.call(() => this.audio.olfateo());
      tl.to(this.head.position, { y: `+=${0.04}`, duration: 0.12, repeat: 5, yoyo: true, ease: 'sine.inOut' });
      tl.to(this.head.rotation, { y: 0.35, duration: 0.5, ease: 'sine.inOut' });
      tl.call(() => this.audio.olfateo());
      tl.to(this.head.rotation, { y: -0.35, duration: 0.7, ease: 'sine.inOut' });
      tl.to(this.head.position, { y: `+=${0.04}`, duration: 0.12, repeat: 3, yoyo: true, ease: 'sine.inOut' });
      tl.to(this.head.rotation, { y: 0, duration: 0.3 });

      if (objetivo === 'nada') {
        tl.call(() => this.audio.justus(false));
        tl.add(this.#tlCabezaNeutra());
      } else {
        // 4) EL MARCAJE: cabeza alta, se SIENTA (grupa al suelo), ladra y sostiene.
        tl.add(this.#tlCabezaNeutra());
        tl.to(this.body.rotation, { x: -0.5, duration: 0.45, ease: 'power2.inOut' });
        tl.to(this.body.position, { y: 0.33, duration: 0.45 }, '<');
        tl.to([this.legs[2].rotation, this.legs[3].rotation], { x: -1.1, duration: 0.45, ease: 'power2.inOut' }, '<');
        tl.to(this.head.position, { y: 0.74, duration: 0.4 }, '<');
        tl.call(() => this.audio.justus(true));
        tl.to(this.head.position, { y: '+=0.03', duration: 0.09, repeat: insistente ? 5 : 3, yoyo: true, ease: 'power2.out' });
        if (insistente) {
          tl.call(() => this.audio.justus(true));
          tl.to(this.head.position, { y: '+=0.03', duration: 0.09, repeat: 3, yoyo: true });
        }
        tl.to({}, { duration: 0.7 }); // sostiene la señal: no se aparta
        tl.to(this.body.rotation, { x: 0.06, duration: 0.5, ease: 'power2.inOut' });
        tl.to(this.body.position, { y: 0.42, duration: 0.5 }, '<');
        tl.to([this.legs[2].rotation, this.legs[3].rotation], { x: 0, duration: 0.5 }, '<');
      }

      // 5) Vuelve a su puesto.
      const anguloCasa = Math.atan2(this.home.x - stand.x, this.home.z - stand.z);
      tl.to(this.group.rotation, { y: anguloCasa, duration: 0.35, ease: 'power2.out' });
      tl.to(this.group.position, { x: this.home.x, z: this.home.z, duration: 1.3, ease: 'power1.inOut' }, '<0.1');
      tl.to(this.group.rotation, { y: 0.35, duration: 0.5, ease: 'power2.inOut' });
    });
  }

  #tlCabezaNeutra() {
    const tl = gsap.timeline();
    tl.to(this.head.position, { x: 0, y: this.headHome.y, z: this.headHome.z, duration: 0.5, ease: 'power2.inOut' });
    tl.to(this.head.rotation, { x: 0, y: 0, duration: 0.5 }, '<');
    tl.to(this.neck.rotation, { x: 0.7, duration: 0.5 }, '<');
    return tl;
  }

  /** Corta cualquier rutina y devuelve a Justus a su puesto (cambio de pasajero). */
  reset() {
    gsap.killTweensOf([
      this.group.position, this.group.rotation,
      this.head.position, this.head.rotation,
      this.neck.rotation, this.body.rotation, this.body.position,
      this.legs[2].rotation, this.legs[3].rotation,
    ]);
    this.ocupado = false;
    gsap.to(this.group.position, { x: this.home.x, z: this.home.z, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(this.group.rotation, { y: 0.35, duration: 0.6 });
    gsap.to(this.head.position, { x: 0, y: this.headHome.y, z: this.headHome.z, duration: 0.5 });
    gsap.to(this.head.rotation, { x: 0, y: 0, duration: 0.5 });
    gsap.to(this.neck.rotation, { x: 0.7, duration: 0.5 });
    gsap.to(this.body.rotation, { x: 0.06, duration: 0.5 });
    gsap.to(this.body.position, { y: 0.42, duration: 0.5 });
    gsap.to([this.legs[2].rotation, this.legs[3].rotation], { x: 0, duration: 0.5 });
  }

  /** Gruñido de vigilancia cuando el pasajero entra en banda crítica de estrés. */
  setAlerta(activa) {
    if (activa === this.alertaAlta) return;
    this.alertaAlta = activa;
    if (activa && !this.ocupado) {
      this.audio.justus(true);
      gsap.to(this.head.rotation, { y: -0.4, duration: 0.6, ease: 'power2.out' });
    } else if (!this.ocupado) {
      gsap.to(this.head.rotation, { y: 0, duration: 0.8, ease: 'power2.inOut' });
    }
  }

  update(dt, t) {
    const ph = this.phase;

    // Respiración de costillar (corta y alta en alerta).
    const rate = this.alertaAlta ? 1.4 : 0.55;
    this.body.scale.y = 1 + Math.sin(t * Math.PI * 2 * rate + ph) * 0.03;
    this.body.scale.z = 1 + Math.sin(t * Math.PI * 2 * rate + ph) * 0.02;

    // Cola de dos segmentos: péndulo con retardo en la punta; rígida en alerta.
    if (this.alertaAlta) {
      this.tail.rotation.z = 0;
      this.tail.rotation.x = 0.35;
      this.tailTip.rotation.z = 0;
    } else {
      this.tail.rotation.x = 0.8;
      this.tail.rotation.z = Math.sin(t * 3 + ph) * 0.3;
      this.tailTip.rotation.z = Math.sin(t * 3 + ph - 0.6) * 0.35;
    }

    // Orejas: giran solas hacia los ruidos.
    for (const [i, oreja] of this.ears.entries()) {
      oreja.rotation.x = -0.12 + Math.sin(t * 0.7 + ph + i * 2.1) * 0.1 +
        (Math.random() < 0.004 ? 0.4 : 0);
    }

    // En reposo la cabeza barre la fila; trabajando la maneja GSAP.
    if (!this.ocupado && !this.alertaAlta) {
      this.head.rotation.y = Math.sin(t * 0.25 + ph) * 0.5;
    }

    // Ojos googly: fijos y firmes en alerta, curiosos en reposo.
    this.googly.setTemblor(this.alertaAlta ? 0.15 : 0);
    this.googly.setMirada(Math.sin(t * 0.4 + ph) * 0.4, this.ocupado ? -0.5 : 0);
    this.googly.update(dt, t);

    // Trote: remo de patas + rebote solo mientras trabaja.
    if (this.ocupado) {
      for (const [i, pata] of this.legs.entries()) {
        // Las traseras no reman si está sentado (las maneja el timeline).
        if (i >= 2 && Math.abs(this.body.rotation.x + 0.5) < 0.2) continue;
        pata.rotation.x = Math.sin(t * 13 + i * Math.PI * 0.5) * 0.35;
      }
      this.group.position.y = Math.abs(Math.sin(t * 13)) * 0.018;
    } else {
      for (const pata of this.legs) pata.rotation.x *= 1 - Math.min(1, dt * 8);
      this.group.position.y = 0;
    }
  }
}
