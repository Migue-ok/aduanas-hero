import * as THREE from 'three';
import gsap from 'gsap';

/**
 * EfectosHerramienta — cada pulso se VE distinto según con qué lo dispares.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * En el primer corte las cuatro herramientas compartían efecto: un haz y un
 * anillo, solo cambiaba el color. Probándolo, el jugador no distinguía si
 * estaba pasando rayos X o pesando el bulto, y eso hunde justo la mecánica que
 * sostiene el nivel — si las herramientas no se sienten distintas, elegir la
 * correcta deja de importar. Aquí cada una tiene su gesto:
 *
 *   rayos X  → la caja se vuelve transparente y enseña un núcleo denso dentro
 *   lupa     → una lente baja sobre el bulto y despliega la guía de papel
 *   Justus   → ondas de olor que salen del bulto hacia arriba
 *   balanza  → dos platillos que se desequilibran bajo la caja
 *
 * ── Cómo se paga ───────────────────────────────────────────────────────────
 * UN grupo por efecto, construido una sola vez y reposicionado en cada disparo.
 * Con un pulso cada 0,4 s, crear y tirar geometría por disparo sería basura
 * constante — exactamente lo que `core/Disposal.js` existe para evitar.
 * Todos nacen invisibles y vuelven a estarlo al acabar su tween.
 */
export class EfectosHerramienta {
  constructor(scene) {
    this.scene = scene;
    this.grupos = {};
    this._tweens = [];

    this.#rayosX();
    this.#lupa();
    this.#olfato();
    this.#balanza();

    for (const g of Object.values(this.grupos)) {
      g.visible = false;
      scene.add(g);
    }
  }

  // ── Rayos X: la caja se vuelve cristal y enseña lo que lleva dentro ───────
  #rayosX() {
    const g = new THREE.Group();
    // Carcasa translúcida: el "cristal" que sustituye visualmente al cartón.
    this.rxCarcasa = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x4fd0e0, transparent: true, opacity: 0.22,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    // Aristas: lo que hace que se lea como una radiografía y no como una nube.
    this.rxAristas = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x9beef8, transparent: true, opacity: 0.9 }),
    );
    // El hallazgo: una masa densa, roja, descentrada. Es la lectura entera del
    // efecto — «hay algo ahí donde no debería haberlo».
    this.rxNucleo = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.95 }),
    );
    this.rxNucleo.position.set(0.22, -0.14, 0.1);
    // Línea de barrido: el plano del escáner recorriendo el bulto.
    this.rxBarrido = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.05),
      new THREE.MeshBasicMaterial({
        color: 0xd8fbff, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    g.add(this.rxCarcasa, this.rxAristas, this.rxNucleo, this.rxBarrido);
    this.grupos.rayosx = g;
  }

  // ── Lupa: la lente baja y la guía de papel se despliega ───────────────────
  #lupa() {
    const g = new THREE.Group();
    this.lpAro = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.055, 8, 26),
      new THREE.MeshStandardMaterial({
        color: 0xe0952a, emissive: 0xe0952a, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.6,
      }),
    );
    this.lpCristal = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffe3ad, transparent: true, opacity: 0.3,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    this.lpMango = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.7 }),
    );
    this.lpMango.position.set(0.36, -0.36, 0);
    this.lpMango.rotation.z = Math.PI / 4;
    // La guía de remisión: una hoja que se despliega al lado con sus renglones.
    this.lpHoja = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.86),
      new THREE.MeshBasicMaterial({
        map: hojaGuia(), transparent: true, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    this.lpHoja.position.set(-0.85, 0.1, 0);
    g.add(this.lpAro, this.lpCristal, this.lpMango, this.lpHoja);
    this.grupos.lupa = g;
  }

  // ── Justus: ondas de olor subiendo desde el bulto ─────────────────────────
  #olfato() {
    const g = new THREE.Group();
    this.olfAnillos = [];
    for (let i = 0; i < 3; i++) {
      const anillo = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.035, 6, 22),
        new THREE.MeshBasicMaterial({
          color: 0xd9784f, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      anillo.rotation.x = -Math.PI / 2;   // horizontales: suben como el humo
      g.add(anillo);
      this.olfAnillos.push(anillo);
    }
    // Huella del can en el suelo: la marca pasiva, la que dice «me senté aquí».
    this.olfHuella = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({
        map: huellaPerro(), transparent: true, opacity: 0, depthWrite: false,
      }),
    );
    this.olfHuella.rotation.x = -Math.PI / 2;
    g.add(this.olfHuella);
    this.grupos.justus = g;
  }

  // ── Balanza: dos platillos que se desequilibran ───────────────────────────
  #balanza() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: 0x8ac926, emissive: 0x3d5c10, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.5,
    });
    this.blMastil = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), metal);
    this.blMastil.position.y = 0.35;
    this.blBrazo = new THREE.Group();
    this.blBrazo.position.y = 0.7;
    const barra = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), metal);
    this.blBrazo.add(barra);
    this.blPlatos = [];
    for (const dx of [-0.7, 0.7]) {
      const plato = new THREE.Group();
      const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.045, 14), metal);
      const cuerda = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), metal);
      cuerda.position.y = 0.15;
      plato.add(disco, cuerda);
      plato.position.set(dx, -0.3, 0);
      this.blBrazo.add(plato);
      this.blPlatos.push(plato);
    }
    g.add(this.blMastil, this.blBrazo);
    this.grupos.balanza = g;
  }

  /**
   * Lanza el efecto de una herramienta sobre un bulto.
   *
   * @param {string} id      'rayosx' | 'lupa' | 'justus' | 'balanza'
   * @param {THREE.Vector3} pos  centro del paquete
   * @param {number} alto    alto del paquete (para apoyar lo que va al suelo)
   * @param {boolean} exito  si reveló algo (los efectos rematan distinto)
   */
  disparar(id, pos, alto = 0.9, exito = true) {
    const g = this.grupos[id];
    if (!g) return;
    g.position.copy(pos);
    g.visible = true;
    const matar = (t) => { this._tweens.push(t); return t; };
    const fin = () => { g.visible = false; };

    if (id === 'rayosx') {
      const s = alto * 1.55;
      this.rxCarcasa.scale.setScalar(s);
      this.rxAristas.scale.setScalar(s);
      this.rxNucleo.visible = exito;
      gsap.killTweensOf([this.rxCarcasa.material, this.rxAristas.material,
        this.rxNucleo.material, this.rxBarrido.position, this.rxBarrido.material]);
      matar(gsap.fromTo(this.rxCarcasa.material, { opacity: 0.34 },
        { opacity: 0, duration: 1.1, ease: 'power2.in', onComplete: fin }));
      matar(gsap.fromTo(this.rxAristas.material, { opacity: 1 }, { opacity: 0, duration: 1.1 }));
      matar(gsap.fromTo(this.rxNucleo.material, { opacity: 0 },
        { opacity: 0.95, duration: 0.28, yoyo: true, repeat: 3 }));
      // El barrido cruza el bulto de abajo arriba: es lo que da la sensación de
      // que la máquina está LEYENDO y no solo iluminando.
      matar(gsap.fromTo(this.rxBarrido.position, { y: -s / 2 }, { y: s / 2, duration: 0.75, ease: 'none' }));
      matar(gsap.fromTo(this.rxBarrido.material, { opacity: 0.9 }, { opacity: 0, duration: 0.75 }));
      return;
    }

    if (id === 'lupa') {
      gsap.killTweensOf([g.position, g.scale, this.lpAro.material,
        this.lpCristal.material, this.lpHoja.material, this.lpHoja.scale]);
      matar(gsap.fromTo(g.scale, { x: 1.9, y: 1.9, z: 1.9 },
        { x: 1, y: 1, z: 1, duration: 0.42, ease: 'back.out(2)' }));
      matar(gsap.fromTo(g.position, { y: pos.y + 1.5 },
        { y: pos.y + 0.15, duration: 0.42, ease: 'power3.out' }));
      matar(gsap.fromTo(this.lpCristal.material, { opacity: 0.42 },
        { opacity: 0, duration: 1.25, delay: 0.4, ease: 'power2.in', onComplete: fin }));
      matar(gsap.fromTo(this.lpAro.material, { opacity: 1 }, { opacity: 0, duration: 1.25, delay: 0.4 }));
      // La hoja solo se despliega si de verdad había algo escrito que mirar.
      this.lpHoja.visible = exito;
      if (exito) {
        matar(gsap.fromTo(this.lpHoja.scale, { x: 0.1, y: 0.1 },
          { x: 1, y: 1, duration: 0.4, delay: 0.15, ease: 'back.out(2.2)' }));
        matar(gsap.fromTo(this.lpHoja.material, { opacity: 1 },
          { opacity: 0, duration: 0.5, delay: 1.1 }));
      }
      return;
    }

    if (id === 'justus') {
      g.position.y = pos.y - alto / 2;
      gsap.killTweensOf(this.olfAnillos.flatMap((a) => [a.position, a.scale, a.material]));
      gsap.killTweensOf([this.olfHuella.material, this.olfHuella.scale]);
      this.olfAnillos.forEach((a, i) => {
        matar(gsap.fromTo(a.position, { y: 0 },
          { y: 1.5, duration: 1.15, delay: i * 0.16, ease: 'power1.out' }));
        matar(gsap.fromTo(a.scale, { x: 0.5, y: 0.5, z: 0.5 },
          { x: 1.7, y: 1.7, z: 1.7, duration: 1.15, delay: i * 0.16, ease: 'power1.out' }));
        matar(gsap.fromTo(a.material, { opacity: 0.85 },
          { opacity: 0, duration: 1.15, delay: i * 0.16,
            onComplete: i === this.olfAnillos.length - 1 ? fin : undefined }));
      });
      // La huella solo aparece cuando el can MARCA de verdad (no en el señuelo).
      this.olfHuella.visible = exito;
      this.olfHuella.position.y = -pos.y + 0.03;   // sobre el suelo, no sobre la cinta
      if (exito) {
        matar(gsap.fromTo(this.olfHuella.material, { opacity: 0.95 },
          { opacity: 0, duration: 1.5, ease: 'power2.in' }));
        matar(gsap.fromTo(this.olfHuella.scale, { x: 0.4, y: 0.4, z: 0.4 },
          { x: 1.2, y: 1.2, z: 1.2, duration: 0.5, ease: 'back.out(2)' }));
      }
      return;
    }

    if (id === 'balanza') {
      g.position.y = pos.y - alto / 2 - 0.1;
      gsap.killTweensOf([g.scale, this.blBrazo.rotation, this.blPlatos[0].position, this.blPlatos[1].position]);
      matar(gsap.fromTo(g.scale, { x: 0.2, y: 0.2, z: 0.2 },
        { x: 1, y: 1, z: 1, duration: 0.34, ease: 'back.out(2.4)' }));
      // El desequilibrio ES el dato: si hay hallazgo, el brazo se va a un lado
      // y se queda ahí. Si no, oscila y se estabiliza en horizontal.
      const inclina = exito ? 0.34 : 0;
      matar(gsap.fromTo(this.blBrazo.rotation, { z: -0.3 },
        { z: inclina, duration: 1.1, ease: 'elastic.out(1, 0.4)' }));
      this.blPlatos.forEach((p, i) => {
        const signo = i === 0 ? 1 : -1;
        matar(gsap.fromTo(p.position, { y: -0.3 },
          { y: -0.3 + signo * inclina * 0.7, duration: 1.1, ease: 'elastic.out(1, 0.4)' }));
      });
      matar(gsap.to(g.scale, {
        x: 0.2, y: 0.2, z: 0.2, duration: 0.3, delay: 1.35, ease: 'back.in(2)', onComplete: fin,
      }));
    }
  }

  dispose() {
    for (const t of this._tweens) t.kill();
    this._tweens.length = 0;
    // Las mallas cuelgan de la escena: `disposeScene` barre geometrías y
    // materiales. Aquí solo hay que soltar las texturas de canvas propias.
    this.lpHoja?.material.map?.dispose();
    this.olfHuella?.material.map?.dispose();
  }
}

/** Guía de remisión dibujada a canvas: renglones, sello y una cifra corregida. */
function hojaGuia() {
  const c = document.createElement('canvas');
  c.width = 132; c.height = 172;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f2e6';
  g.fillRect(0, 0, 132, 172);
  g.strokeStyle = '#c9bfa6';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 126, 166);
  g.fillStyle = '#2f3a46';
  g.fillRect(12, 14, 62, 7);            // cabecera
  g.fillStyle = '#7a8794';
  for (let i = 0; i < 8; i++) g.fillRect(12, 34 + i * 13, 60 + Math.random() * 46, 4);
  // La cifra corregida: el detalle que el jugador está buscando.
  g.fillStyle = '#b03a2e';
  g.fillRect(78, 112, 34, 16);
  g.strokeStyle = '#b03a2e';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(78, 128); g.lineTo(112, 112); g.stroke();
  // Sello redondo
  g.strokeStyle = '#2f6fb0';
  g.lineWidth = 3;
  g.beginPath(); g.arc(98, 40, 18, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Huella de can: almohadilla y cuatro dedos, sobre transparencia. */
function huellaPerro() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#d9784f';
  g.beginPath(); g.ellipse(32, 40, 14, 12, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, r] of [[16, 22, 5.5], [26, 16, 6], [38, 16, 6], [48, 22, 5.5]]) {
    g.beginPath(); g.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
