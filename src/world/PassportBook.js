import * as THREE from 'three';
import gsap from 'gsap';

/**
 * PassportBook — el pasaporte abierto sobre el mostrador, con hojas que se
 * pasan ARRASTRANDO el mouse (no con clic): cada página es una bisagra real
 * en el lomo; el arrastre controla el ángulo y, al soltar, la hoja cae hacia
 * el lado que le corresponde con física de papel (GSAP + sonido).
 *
 * La página de sellos es la que importa: llegar a ella con los ojos abiertos
 * registra la señal documental del caso (si existe).
 */

const PAGE_W = 0.115;
const PAGE_H = 0.155;

export class PassportBook {
  constructor(scene, camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // Tapas abiertas (vinilo granate).
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE_W * 2 + 0.012, 0.006, PAGE_H + 0.012),
      new THREE.MeshStandardMaterial({ color: 0x5e181d, roughness: 0.65 }),
    );
    cover.castShadow = cover.receiveShadow = true;
    this.group.add(cover);

    this.pages = [];        // pivotes de hoja, de la primera a la última
    this.paginaActual = 0;  // hojas ya pasadas a la izquierda
    this.dragging = null;

    // El libro vive en el lado izquierdo del tablero, girado hacia el oficial.
    this.group.position.set(-0.42, 1.062, 0.5);
    this.group.rotation.y = 0.18;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.#bindInput();
  }

  /** Construye las hojas para el caso y muestra el libro. */
  abrir(caso, onSeñalSellos) {
    this.onSeñalSellos = onSeñalSellos;
    this.señalDisparada = false;

    for (const p of this.pages) this.group.remove(p);
    this.pages = [];
    this.paginaActual = 0;

    const perfil = caso.perfil;
    const docPasaporte = caso.documentos.find((d) => d.id === 'pasaporte');
    this.señalId = docPasaporte?.lineas.find((l) => l.señal)?.señal ?? null;

    // Contenidos: [datos] · [visados en blanco] · [SELLOS]. 3 hojas = 6 caras.
    const caras = [
      this.#texturaDatos(perfil),
      this.#texturaVacia('VISAS'),
      this.#texturaVacia('VISAS'),
      this.#texturaVacia('ENTRADAS / SALIDAS'),
      this.#texturaSellos(caso),
      this.#texturaVacia('OBSERVACIONES'),
    ];

    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      // DoubleSide: la hoja debe verse también una vez pasada al lado izquierdo.
      const paper = new THREE.MeshStandardMaterial({ map: caras[i * 2], roughness: 0.85, side: THREE.DoubleSide });
      const paperBack = new THREE.MeshStandardMaterial({ map: caras[i * 2 + 1], roughness: 0.85, side: THREE.DoubleSide });

      const front = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W, PAGE_H), paper);
      front.rotation.x = -Math.PI / 2;                 // tumbada, mirando arriba
      front.position.set(PAGE_W / 2, 0.0004, 0);       // micro-separación: sin z-fighting
      const back = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W, PAGE_H), paperBack);
      back.rotation.x = Math.PI / 2;                   // el reverso mira abajo
      back.rotation.y = Math.PI;                       // texto no espejado al voltear
      back.position.set(PAGE_W / 2, -0.0004, 0);

      pivot.add(front, back);
      pivot.position.y = 0.004 + (3 - i) * 0.0012;     // grosor del taco
      pivot.userData.indice = i;
      this.group.add(pivot);
      this.pages.push(pivot);
    }
    this.group.visible = true;
  }

  cerrar() {
    this.group.visible = false;
    this.dragging = null;
  }

  // ── Texturas de página ──────────────────────────────────────────────────
  #canvas(draw) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 342;
    const g = c.getContext('2d');
    g.fillStyle = '#cfc6ae'; // crema apagado: bajo la luz clave no debe reventar a blanco
    g.fillRect(0, 0, 256, 342);
    // Guilloché barato: líneas de seguridad.
    g.strokeStyle = 'rgba(120,100,140,0.12)';
    for (let y = 0; y < 342; y += 7) {
      g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(128, y + 5, 256, y); g.stroke();
    }
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  #texturaDatos(perfil) {
    return this.#canvas((g) => {
      g.fillStyle = '#3a2c3a';
      g.font = 'bold 15px monospace';
      g.fillText('REPÚBLICA DEL PERÚ', 42, 34);
      g.font = '12px monospace';
      g.fillText('PASAPORTE / PASSPORT', 58, 52);
      // Foto: retrato mínimo con el color de piel/pelo del actor.
      g.fillStyle = `#${perfil.colorPiel.toString(16).padStart(6, '0')}`;
      g.fillRect(24, 76, 76, 92);
      g.fillStyle = `#${perfil.colorPelo.toString(16).padStart(6, '0')}`;
      g.fillRect(24, 76, 76, 26);
      g.strokeStyle = '#3a2c3a';
      g.strokeRect(24, 76, 76, 92);
      g.fillStyle = '#2c2418';
      g.font = '13px monospace';
      g.fillText(perfil.nombre.toUpperCase(), 116, 96);
      g.fillText(`EDAD: ${perfil.edad}`, 116, 118);
      g.fillText('NAC.: PERÚ', 116, 140);
      g.font = '11px monospace';
      g.fillText('P<PER' + perfil.nombre.replace(/\s/g, '<').toUpperCase() + '<<<<<<', 24, 200);
      g.fillText('7462519<<PER<<<<<<<<<<<<<<<<<<<02', 24, 218);
    });
  }

  #texturaVacia(titulo) {
    return this.#canvas((g) => {
      g.fillStyle = 'rgba(60,50,70,0.5)';
      g.font = 'bold 13px monospace';
      g.fillText(titulo, 24, 34);
    });
  }

  #texturaSellos(caso) {
    // La página que habla: densidad de sellos según el caso.
    const cantidad = { 'CASO-101': 5, 'CASO-102': 1, 'CASO-103': 1, 'CASO-104': 6 }[caso.id] ?? 3;
    return this.#canvas((g) => {
      g.fillStyle = 'rgba(60,50,70,0.5)';
      g.font = 'bold 13px monospace';
      g.fillText('ENTRADAS / SALIDAS', 24, 34);
      const tintas = ['#31518a', '#8a3131', '#3a6a3a', '#6a4a8a'];
      for (let i = 0; i < cantidad; i++) {
        g.save();
        g.translate(60 + (i % 2) * 110 + Math.random() * 14, 90 + Math.floor(i / 2) * 78 + Math.random() * 10);
        g.rotate((Math.random() - 0.5) * 0.5);
        const tinta = tintas[i % tintas.length];
        g.strokeStyle = tinta;
        g.globalAlpha = 0.75;
        g.lineWidth = 2.5;
        g.strokeRect(-44, -24, 88, 48);
        g.beginPath(); g.ellipse(0, 0, 42, 22, 0, 0, 7); g.stroke();
        g.fillStyle = tinta;
        g.font = 'bold 11px monospace';
        g.textAlign = 'center';
        g.fillText(caso.id === 'CASO-101' ? 'MIAMI · USA' : 'INMIGRACIÓN', 0, -6);
        g.font = '10px monospace';
        g.fillText(`0${1 + (i % 9)} JUL 2026`, 0, 10);
        g.restore();
      }
    });
  }

  // ── Interacción: arrastrar la hoja ──────────────────────────────────────
  #bindInput() {
    const el = document.getElementById('gl');
    el.addEventListener('pointerdown', (e) => {
      if (!this.group.visible) return;
      const page = this.#pick(e);
      if (!page) return;
      const i = page.userData.indice;
      // Solo la hoja superior de cada lado responde: la actual (ida) o la anterior (vuelta).
      if (i !== this.paginaActual && i !== this.paginaActual - 1) return;
      this.dragging = { page, startX: e.clientX, startAngle: page.rotation.z };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const delta = (e.clientX - this.dragging.startX) / window.innerWidth;
      // Arrastrar a la izquierda pasa la hoja (ángulo 0 → π).
      const angle = THREE.MathUtils.clamp(this.dragging.startAngle - delta * 5.2, 0, Math.PI);
      this.dragging.page.rotation.z = angle;
      // La hoja "se comba" al vuelo: escala X que respira con el ángulo.
      const comba = 1 - Math.sin(angle) * 0.12;
      this.dragging.page.scale.x = comba;
    });
    el.addEventListener('pointerup', () => {
      if (!this.dragging) return;
      const { page } = this.dragging;
      this.dragging = null;
      const cae = page.rotation.z > Math.PI / 2 ? Math.PI : 0;
      gsap.to(page.rotation, {
        z: cae, duration: 0.45, ease: 'power2.out',
        onComplete: () => {
          this.audio.papel();
          const i = page.userData.indice;
          if (cae === Math.PI && i === this.paginaActual) this.paginaActual++;
          if (cae === 0 && i === this.paginaActual - 1) this.paginaActual--;
          this.#checkSellos();
        },
      });
      gsap.to(page.scale, { x: 1, duration: 0.45, ease: 'power2.out' });
    });
  }

  /** La cara de SELLOS es la 5.ª (dorso de la hoja 2): visible con 2 hojas pasadas. */
  #checkSellos() {
    if (this.señalDisparada || !this.señalId) return;
    if (this.paginaActual >= 2) {
      this.señalDisparada = true;
      this.onSeñalSellos?.(this.señalId);
    }
  }

  #pick(e) {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pages, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && obj.userData.indice === undefined) obj = obj.parent;
    return obj;
  }
}
