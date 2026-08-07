import * as THREE from 'three';
import gsap from 'gsap';
import { makeGooglyEyes } from './GooglyEyes.js';
import { disposeObject } from '../core/Disposal.js';

/**
 * SalaLlegadas — el grupo de viajeros del **perfilamiento**
 * (`02 - Diseño/13 - Perfilamiento sin sesgo.md`).
 *
 * A diferencia de `AmbientNPCs` (decorado que recircula y al que nadie mira),
 * esta gente es **jugable**: cada persona tiene una conducta propia que se ve a
 * distancia, un aro de selección y una hitbox generosa para el dedo.
 *
 * La animación es la mitad del minijuego. El jugador tiene que poder sospechar
 * ANTES de abrir ninguna ficha, solo mirando la sala: quien vigila el módulo
 * mueve la cabeza distinto de quien está perdido, y quien se pega a una familia
 * ocupa el espacio distinto de quien viaja con ella. Si eso no se leyera en el
 * cuerpo, el minijuego sería una lista de textos con dibujitos detrás.
 *
 * El aspecto llega ya sorteado desde `gameplay/indicadores.js`, y llega **ciego
 * al rol**: aquí no se toma ni una sola decisión visual en función de si la
 * persona es el objetivo. Esa separación es la garantía antisesgo del sistema.
 */

const CONDUCTAS_ANIM = new Set(['evita', 'vigila', 'retrocede', 'telefono', 'pegado',
  'nervioso', 'apurado', 'nino', 'confundido', 'quieto']);

export class SalaLlegadas {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} base  centro del grupo en el mundo
   */
  constructor(scene, base = new THREE.Vector3(0, 0, -10.5)) {
    this.scene = scene;
    this.base = base.clone();
    this.group = new THREE.Group();
    this.group.position.copy(base);
    scene.add(this.group);
    this.personas = [];
    this.#decorado();
  }

  /** El semáforo aduanero al fondo: el destino hacia el que camina todo el mundo. */
  #decorado() {
    const marco = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.4, metalness: 0.8 });

    for (const [x, texto, color] of [[-3.6, 'NADA QUE DECLARAR', '#1f7a46'], [3.6, 'BIENES A DECLARAR', '#8e1a1f']]) {
      for (const sx of [-1.15, 1.15]) {
        const poste = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), marco);
        poste.position.set(x + sx, 1.25, -3.2);
        this.group.add(poste);
      }
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#ffffff';
      g.font = 'bold 40px "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.fillText(texto, 256, 62);
      g.font = 'bold 20px monospace';
      g.fillText(x < 0 ? 'NOTHING TO DECLARE' : 'GOODS TO DECLARE', 256, 98);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const cartel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.08),
        new THREE.MeshStandardMaterial({
          map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x000000,
        }));
      cartel.position.set(x, 2.25, -3.2);
      this.group.add(cartel);
      this._texturas = this._texturas ?? [];
      this._texturas.push(tx);
    }

    // Luz de apoyo: sin esto el grupo queda en la penumbra del fondo del hall.
    this.luz = new THREE.PointLight(0xdce8f8, 14, 16, 1.7);
    this.luz.position.set(0, 3.4, 1.2);
    this.group.add(this.luz);
  }

  /** Construye a las personas del operativo. */
  montar(sala) {
    this.limpiar();
    const n = sala.gente.length;
    sala.gente.forEach((datos, i) => {
      const p = this.#persona(datos);
      // Distribución en dos hileras irregulares: un grupo, no una formación.
      const fila = i % 2;
      const cx = (i - (n - 1) / 2) * 1.1 + (Math.random() - 0.5) * 0.34;
      p.group.position.set(cx, 0, fila * 1.5 + (Math.random() - 0.5) * 0.45);
      // Miran HACIA la cámara (el mirador está en su camino), con variación.
      // Si mirasen a los carteles del fondo, el jugador vería siete espaldas y
      // no podría leer ni una sola de las conductas — que es todo el minijuego.
      p.group.rotation.y = (Math.random() - 0.5) * 1.5;
      p.home = p.group.position.clone();
      this.group.add(p.group);
      this.personas.push(p);

      p.group.scale.setScalar(0.001);
      gsap.to(p.group.scale, {
        x: datos.aspecto.altura, y: datos.aspecto.altura, z: datos.aspecto.altura,
        duration: 0.5, delay: 0.08 * i, ease: 'back.out(1.7)',
      });
    });
    return this.personas;
  }

  #persona(datos) {
    const a = datos.aspecto;
    const g = new THREE.Group();
    const ropa = new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.colorRopa).offsetHSL(0, 0.18, 0.04), roughness: 0.85,
    });
    const piel = new THREE.MeshStandardMaterial({ color: a.colorPiel, roughness: 0.6 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.6, 5, 12), ropa);
    body.position.y = 0.86;
    body.castShadow = true;

    const head = new THREE.Group();
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.142, 16, 13), piel);
    craneo.castShadow = true;
    const pelo = new THREE.Mesh(
      new THREE.SphereGeometry(0.148, 14, 11, 0, Math.PI * 2, 0, 1.05),
      new THREE.MeshStandardMaterial({ color: a.colorPelo, roughness: 0.95 }),
    );
    pelo.position.y = 0.012;
    const ojitos = makeGooglyEyes({ radio: 0.04, separacion: 0.047, pupila: 0.011 });
    ojitos.group.position.set(0, 0.02, 0.115);
    head.add(craneo, pelo, ojitos.group);
    if (a.sombrero) {
      const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.012, 14), ropa);
      ala.position.y = 0.12;
      const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.11, 14), ropa);
      copa.position.y = 0.18;
      head.add(ala, copa);
    }
    head.position.y = 1.52;

    const brazos = [];
    for (const side of [-1, 1]) {
      const brazo = new THREE.Group();
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.44, 4, 8), ropa);
      limb.position.y = -0.25;
      const mano = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 7), piel);
      mano.position.y = -0.5;
      brazo.add(limb, mano);
      brazo.position.set(side * 0.235, 1.26, 0);
      brazo.rotation.z = side * 0.1;
      brazo.userData.baseZ = side * 0.1;
      g.add(brazo);
      brazos.push(brazo);
    }

    const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.9 }));
    piernas.position.y = 0.28;

    g.add(body, head, piernas);

    // Equipaje: forma y tamaño sorteados aparte, como todo lo demás.
    if (a.equipaje !== 'ninguno') {
      const eqMat = new THREE.MeshStandardMaterial({ color: a.colorEquipaje, roughness: 0.65 });
      let eq;
      if (a.equipaje === 'mochila') {
        eq = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.16), eqMat);
        eq.position.set(0, 0.95, -0.22);
      } else if (a.equipaje === 'bolsa') {
        eq = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), eqMat);
        eq.scale.set(1, 0.85, 0.7);
        eq.position.set(0.3, 0.42, 0);
      } else if (a.equipaje === 'carrito') {
        eq = new THREE.Group();
        const caja = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.3), eqMat);
        caja.position.y = 0.4;
        const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.3, metalness: 0.85 }));
        barra.position.set(0, 0.62, -0.12);
        barra.rotation.x = 0.35;
        eq.add(caja, barra);
        eq.position.set(0.36, 0, 0.1);
      } else {
        eq = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.46, 0.2), eqMat);
        eq.position.set(0.33, 0.25, 0);
      }
      eq.castShadow = true;
      g.add(eq);
    }

    // Aro de selección (apagado) y hitbox amplia para el dedo.
    const aro = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 28),
      new THREE.MeshBasicMaterial({ color: 0xe0952a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    aro.rotation.x = -Math.PI / 2;
    aro.position.y = 0.02;
    g.add(aro);

    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.85, 0.85),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.92;
    hit.userData.personaId = datos.id;
    g.add(hit);

    // Marca de "derivado" (cruz roja flotante), oculta hasta que se marca.
    const marca = this.#marcaDerivado();
    marca.position.y = 2.05;
    marca.visible = false;
    g.add(marca);

    return {
      id: datos.id, datos, group: g, body, head, brazos, ojitos, aro, hit, marca,
      gesto: CONDUCTAS_ANIM.has(datos.conducta.gesto) ? datos.conducta.gesto : 'quieto',
      fase: Math.random() * 10,
      home: null,
    };
  }

  #marcaDerivado() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#e04a3c';
    g.lineWidth = 9;
    g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(38, 38); g.lineTo(90, 90); g.moveTo(90, 38); g.lineTo(38, 90); g.stroke();
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    this._texturas = this._texturas ?? [];
    this._texturas.push(tx);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
    s.scale.setScalar(0.45);
    return s;
  }

  hitTest(raycaster) {
    const hits = raycaster.intersectObjects(this.personas.map((p) => p.hit), false);
    return hits.length ? hits[0].object.userData.personaId : null;
  }

  resaltar(id) {
    for (const p of this.personas) {
      gsap.to(p.aro.material, { opacity: p.id === id ? 0.9 : 0, duration: 0.22, overwrite: 'auto' });
    }
  }

  apagarResaltes() {
    for (const p of this.personas) gsap.to(p.aro.material, { opacity: 0, duration: 0.22, overwrite: 'auto' });
  }

  marcarDerivado(id) {
    const p = this.personas.find((x) => x.id === id);
    if (!p) return;
    p.marca.visible = true;
    gsap.fromTo(p.marca.scale, { x: 1.4, y: 1.4, z: 1.4 },
      { x: 0.45, y: 0.45, z: 0.45, duration: 0.55, ease: 'back.out(2.2)' });
  }

  /** Cámara: el mirador sobre la sala. */
  get vistaMirador() {
    // A 5,5 m el grupo se salía por los dos lados del encuadre y las personas de
    // los extremos quedaban cortadas. Desde aquí entran los siete con aire.
    return {
      pos: [this.base.x, 3.7, this.base.z + 7.8],
      look: [this.base.x, 1.2, this.base.z + 0.7],
      fov: 48, focus: 7.4, aperture: 0.00012,
    };
  }

  /** Cámara: observación cercana de una persona. */
  vistaPersona(id) {
    const p = this.personas.find((x) => x.id === id);
    if (!p) return this.vistaMirador;
    const w = new THREE.Vector3().copy(p.group.position).add(this.base);
    // Plano entero: a 2,5 m con 34° la persona no cabía en el cuadro, y las
    // conductas que hay que leer (agacharse, marcar el paso, desplazarse de
    // carril) ocurren de cuerpo completo. Aquí entra de pies a cabeza.
    return {
      pos: [w.x + 0.25, 2.05, w.z + 3.7],
      look: [w.x, 1.05, w.z],
      fov: 36, focus: 3.7, aperture: 0.00034,
    };
  }

  update(dt, t) {
    for (const p of this.personas) {
      const ph = p.fase;
      // Respiración y peso: base común de todos.
      p.body.scale.y = 1 + Math.sin(t * 1.5 + ph) * 0.012;
      p.body.rotation.z = Math.sin(t * 0.5 + ph) * 0.03;
      p.head.position.y = 1.52 + Math.sin(t * 1.3 + ph) * 0.006;
      p.ojitos.update(dt, t + ph);
      for (const b of p.brazos) b.rotation.z += (b.userData.baseZ - b.rotation.z) * Math.min(1, dt * 4);

      // Y ahora la conducta, que es lo que el jugador tiene que leer.
      switch (p.gesto) {
        case 'vigila': {
          // Mira al frente… y de reojo al módulo, en ráfagas cortas y repetidas.
          const ciclo = (t * 0.55 + ph) % 1;
          const mirando = ciclo > 0.72;
          p.head.rotation.y += ((mirando ? -0.85 : Math.sin(t * 0.3 + ph) * 0.15) - p.head.rotation.y) * Math.min(1, dt * 7);
          p.ojitos.setMirada(mirando ? -0.8 : 0, 0);
          break;
        }
        case 'evita': {
          // Se desplaza lateralmente en pasos: sale del carril, vuelve, sale.
          const desvio = Math.sin(t * 0.32 + ph) > 0.55 ? -0.8 : 0;
          p.group.position.x += (p.home.x + desvio - p.group.position.x) * Math.min(1, dt * 1.1);
          p.group.rotation.y += ((desvio * 0.7) - p.group.rotation.y) * Math.min(1, dt * 2);
          break;
        }
        case 'retrocede': {
          // Avanza hacia el control y da media vuelta antes de llegar.
          const ciclo = (Math.sin(t * 0.24 + ph) + 1) / 2;
          p.group.position.z += (p.home.z - ciclo * 1.5 - p.group.position.z) * Math.min(1, dt * 1.4);
          p.group.rotation.y += ((ciclo > 0.55 ? Math.PI : 0) - p.group.rotation.y) * Math.min(1, dt * 2.2);
          break;
        }
        case 'telefono': {
          // Mano a la oreja; la baja de golpe cada cierto tiempo.
          const hablando = Math.sin(t * 0.42 + ph) > -0.2;
          const b = p.brazos[1];
          b.rotation.z += ((hablando ? -2.1 : b.userData.baseZ) - b.rotation.z) * Math.min(1, dt * (hablando ? 5 : 12));
          p.head.rotation.y += ((hablando ? 0.25 : 0) - p.head.rotation.y) * Math.min(1, dt * 4);
          break;
        }
        case 'pegado': {
          // Se arrima a su vecino de la izquierda sin interactuar con él.
          const vecino = this.personas.find((o) => o !== p && Math.abs(o.home.z - p.home.z) < 0.9
            && o.home.x < p.home.x);
          const objetivoX = vecino ? vecino.group.position.x + 0.72 : p.home.x;
          p.group.position.x += (objetivoX - p.group.position.x) * Math.min(1, dt * 0.7);
          p.head.rotation.y += (Math.sin(t * 0.2 + ph) * 0.1 - p.head.rotation.y) * Math.min(1, dt * 3);
          break;
        }
        case 'nervioso': {
          // Cabeza en todas direcciones, rápido: el pánico honesto del novato.
          p.head.rotation.y = Math.sin(t * 1.9 + ph) * 0.9;
          p.head.rotation.x = Math.sin(t * 1.3 + ph * 2) * 0.22;
          p.ojitos.setTemblor(0.4);
          break;
        }
        case 'apurado': {
          // Marca el paso sin avanzar, se balancea, mira el reloj.
          p.group.position.y = Math.abs(Math.sin(t * 5.5 + ph)) * 0.035;
          const b = p.brazos[0];
          const mirando = Math.sin(t * 0.7 + ph) > 0.6;
          b.rotation.z += ((mirando ? -1.6 : b.userData.baseZ) - b.rotation.z) * Math.min(1, dt * 6);
          p.head.rotation.x += ((mirando ? 0.45 : 0) - p.head.rotation.x) * Math.min(1, dt * 6);
          break;
        }
        case 'nino': {
          // Se agacha una y otra vez hacia alguien que no llega a su altura.
          const agachada = (Math.sin(t * 0.5 + ph) + 1) / 2;
          p.body.rotation.x = agachada * 0.55;
          p.head.rotation.x = agachada * 0.65;
          p.head.position.y = 1.52 - agachada * 0.26;
          for (const b of p.brazos) b.rotation.z += ((b.userData.baseZ - agachada * 0.5 * Math.sign(b.userData.baseZ)) - b.rotation.z) * Math.min(1, dt * 4);
          break;
        }
        case 'confundido': {
          // Quieto, mirando arriba a los carteles, girando muy despacio.
          p.head.rotation.x = -0.35 + Math.sin(t * 0.5 + ph) * 0.1;
          p.group.rotation.y += Math.sin(t * 0.18 + ph) * dt * 0.4;
          break;
        }
        default:
          p.head.rotation.y = Math.sin(t * 0.35 + ph) * 0.4;
          break;
      }
    }
  }

  limpiar() {
    for (const p of this.personas) {
      gsap.killTweensOf(p.group.scale);
      gsap.killTweensOf(p.group.position);
      gsap.killTweensOf(p.marca.scale);
      disposeObject(p.group, true);
      this.group.remove(p.group);
    }
    this.personas = [];
  }

  dispose() {
    this.limpiar();
    disposeObject(this.group, true);
    this.scene.remove(this.group);
    for (const t of this._texturas ?? []) t.dispose();
  }
}
