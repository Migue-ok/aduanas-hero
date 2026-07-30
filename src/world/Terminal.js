import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { colgarEntorno } from '../render/Entorno.js';
import { quality } from '../core/Device.js';

/**
 * Terminal — el aeropuerto como organismo.
 * Todo es procedural: suelo pulido que refleja, fluorescentes fríos con RectAreaLight,
 * panel de vuelos que cambia, cinta transportadora en marcha, cristales, puertas
 * automáticas, cámara PTZ que gira y una noche con aviones al fondo.
 * El aeropuerto existe con o sin el jugador.
 */
export class Terminal {
  constructor(scene, gl) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    RectAreaLightUniformsLib.init();

    // Entorno HDR procedural: da reflejos PBR a metales y suelo.
    //
    // Los tres `dispose()` de abajo no son ceremonia: el generador se queda con
    // 12 geometrías de plano y su render target de ping-pong, y la sala con su
    // caja y sus materiales. Como aquí se hornea UNA vez y el resultado ya está
    // en `scene.environment`, todo eso es basura desde el instante siguiente.
    //
    // El render target sí se guarda: es lo único que puede liberar el PMREM más
    // tarde. Soltar `scene.environment` (que es su `.texture`) no hace nada —
    // el listener de three vive en el target, no en la textura. `disposeScene`
    // busca ese `__pmremTarget` a propósito.
    const pmrem = new THREE.PMREMGenerator(gl);
    const sala = new RoomEnvironment();
    const target = pmrem.fromScene(sala, 0.04);
    scene.environment = target.texture;
    scene.__pmremTarget = target;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
    sala.dispose();

    // Atmósfera cartoon (ADR-004): menos niebla, fondo más vivo.
    scene.fog = new THREE.FogExp2(0x141b28, 0.016);
    scene.background = new THREE.Color(0x0e1420);

    this.#buildFloorAndCeiling();
    this.#buildLighting();
    this.#buildBooth();
    this.#buildConveyor();
    this.#buildGlassWall();
    this.#buildDepartureBoard();
    this.#buildQueueBarriers();
    this.#buildPTZ();
    this.#buildDoors();

    this.t = 0;
  }

  // ── Suelo y techo ────────────────────────────────────────────────────────
  #buildFloorAndCeiling() {
    const tile = this.#makeTileTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        map: tile,
        color: 0x9aa3ad,
        roughness: 0.12,
        metalness: 0.25,
      }),
    );
    // El suelo pulido es lo que vende el aeropuerto: reflejo propio, no el
    // ambiente plano del nivel (su `envMapIntensity: 1.2` tampoco se aplicaba).
    colgarEntorno(floor.material, this.scene, 1.35);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.9 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.2;
    this.group.add(ceiling);
  }

  #makeTileTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#8d949c';
    g.fillRect(0, 0, 512, 512);
    // Baldosas grandes con junta oscura y variación sutil de tono.
    const n = 4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 138 + Math.floor(Math.random() * 14);
        g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
        g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(10, 10);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }

  // ── Iluminación fría de aeropuerto ───────────────────────────────────────
  #buildLighting() {
    this.flickerLights = [];
    // Tiras fluorescentes: caja emisiva en toda la sala; RectAreaLight REAL solo
    // cerca del puesto (son muy caras por fragmento — 3 como MÁXIMO ABSOLUTO).
    const conLuzReal = new Set(['0,1', '-6,1', '6,1']);
    for (let x = -12; x <= 12; x += 6) {
      for (let z = -14; z <= 6; z += 5) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.06, 0.35),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xdfeaff,
            emissiveIntensity: 2.4,
          }),
        );
        strip.position.set(x, 4.15, z);
        this.group.add(strip);

        let areaLight = null;
        if (conLuzReal.has(`${x},${z}`)) {
          areaLight = new THREE.RectAreaLight(0xd9e6ff, 10, 2.6, 0.35);
          areaLight.position.copy(strip.position);
          areaLight.rotation.x = -Math.PI / 2;
          this.group.add(areaLight);
        }
        // Uno de cada tantos parpadea casi imperceptiblemente: vida eléctrica.
        if (Math.random() < 0.22) this.flickerLights.push({ strip, light: areaLight, phase: Math.random() * 10 });
      }
    }

    // Luz clave del puesto: dura, con sombra — el pasajero queda "bajo la lámpara".
    this.keyLight = new THREE.SpotLight(0xe8f0ff, 55, 14, Math.PI / 5.5, 0.45, 1.6);
    this.keyLight.position.set(0.6, 3.9, 0.4);
    this.keyLight.target.position.set(0, 1.2, -1.5);
    this.keyLight.castShadow = true;
    // Presupuesto por dispositivo, no una constante a pelo (ADR-008): es la
    // ÚNICA sombra dinámica del nivel y la que enfoca al pasajero durante todo
    // el turno, así que un 1024² fijo obligaba al teléfono a renderizar 16×
    // más téxeles de sombra que los que el resto del juego le concede
    // (`quality.spotShadowMap` = 256 en móvil, 1024 en escritorio).
    this.keyLight.shadow.mapSize.set(quality.spotShadowMap, quality.spotShadowMap);
    this.group.add(this.keyLight, this.keyLight.target);

    // Relleno general: más cálido y generoso que en la era "thriller" (ADR-004).
    this.group.add(new THREE.AmbientLight(0x4a5266, 1.9));

    // Acento de alerta lejano (rojo institucional que rota, tipo baliza).
    this.beacon = new THREE.PointLight(0xff2a1a, 0, 9, 1.8);
    this.beacon.position.set(-7, 3.2, -10);
    this.group.add(this.beacon);
  }

  // ── El puesto de control ────────────────────────────────────────────────
  #buildBooth() {
    const brushed = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.35, metalness: 0.85 });
    const darkLam = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.2 });

    // Tablero del mostrador: laminado oscuro con reflejo (aquí viven documentos
    // y sellos, y es la superficie que el jugador mira durante todo el turno).
    // Su `envMapIntensity: 1.1` llevaba tiempo sin aplicarse — ver `Entorno.js`.
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 1.15), colgarEntorno(
      new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.22, metalness: 0.35 }),
      this.scene, 1.35,
    ));
    top.position.set(0, 1.02, 0.35);
    top.castShadow = top.receiveShadow = true;
    this.group.add(top);
    this.deskTop = top;

    const front = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.08), brushed);
    front.position.set(0, 0.5, -0.2);
    front.castShadow = true;
    this.group.add(front);

    // Mampara de cristal con marco de aluminio (transmisión real).
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.3, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0xdfefff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.4,
      }),
    );
    glass.position.set(0, 1.95, -0.25);
    this.group.add(glass);
    for (const sx of [-1.12, 1.12]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), brushed);
      post.position.set(sx, 1.9, -0.25);
      this.group.add(post);
    }

    // Monitor del oficial (CRT institucional, mira hacia el jugador).
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.05), darkLam);
    monitor.position.set(-0.85, 1.35, 0.55);
    monitor.rotation.y = 0.5;
    this.group.add(monitor);
    this.monitorScreen = this.#makeMonitorScreen();
    this.monitorScreen.position.set(-0.842, 1.35, 0.582);
    this.monitorScreen.rotation.y = 0.5;
    this.group.add(this.monitorScreen);

    // Lámpara de escritorio cálida — el único acento cálido del puesto.
    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), brushed);
    lampArm.position.set(1.05, 1.3, 0.7);
    lampArm.rotation.z = 0.5;
    this.group.add(lampArm);
    const lamp = new THREE.PointLight(0xffd9a0, 2.2, 2.4, 2.0);
    lamp.position.set(0.9, 1.5, 0.65);
    this.group.add(lamp);
  }

  #makeMonitorScreen() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 192;
    this.monitorCtx = c.getContext('2d');
    this.monitorTexture = new THREE.CanvasTexture(c);
    this.monitorTexture.colorSpace = THREE.SRGBColorSpace;
    this.#paintMonitor(0);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.36),
      new THREE.MeshStandardMaterial({
        map: this.monitorTexture, emissive: 0xffffff, emissiveMap: this.monitorTexture, emissiveIntensity: 0.9,
        color: 0x000000,
      }),
    );
  }

  #paintMonitor(t) {
    const g = this.monitorCtx;
    g.fillStyle = '#03140c';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#1fdc82';
    g.font = '11px monospace';
    g.fillText('SUNAT · CONTROL LLEGADAS', 8, 18);
    g.fillText(`PUESTO 07  ·  ${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`, 8, 36);
    g.fillStyle = '#0d5c38';
    for (let i = 0; i < 8; i++) g.fillRect(8, 50 + i * 16, 180 + Math.sin(t * 0.7 + i) * 30, 8);
    // Scanlines.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 192; y += 3) g.fillRect(0, y, 256, 1);
  }

  // ── Cinta transportadora al fondo ───────────────────────────────────────
  #buildConveyor() {
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.08, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 }),
    );
    belt.position.set(-6.5, 0.65, -6.5);
    belt.rotation.y = 0.25;
    this.group.add(belt);
    this.beltRef = belt;

    // Maletas rodando por la cinta (pool que recircula).
    this.bags = [];
    const bagColors = [0x5a3324, 0x22303f, 0x3a3a3a, 0x5c1f24, 0x1f4030];
    for (let i = 0; i < 6; i++) {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 + Math.random() * 0.2, 0.3 + Math.random() * 0.15, 0.25),
        new THREE.MeshStandardMaterial({ color: bagColors[i % bagColors.length], roughness: 0.7 }),
      );
      bag.castShadow = true;
      bag.userData.offset = i * 1.6;
      this.group.add(bag);
      this.bags.push(bag);
    }
  }

  // ── Cristalera con la noche y los aviones ───────────────────────────────
  #buildGlassWall() {
    const night = this.#makeNightTexture();
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 7),
      new THREE.MeshBasicMaterial({ map: night, fog: false }),
    );
    wall.position.set(0, 3, -18);
    this.group.add(wall);

    // Montantes de aluminio de la cristalera.
    const mullion = new THREE.MeshStandardMaterial({ color: 0x565c66, roughness: 0.4, metalness: 0.9 });
    for (let x = -20; x <= 20; x += 4) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), mullion);
      m.position.set(x, 3, -17.8);
      this.group.add(m);
    }

    // Luces de un avión que rueda a lo lejos, en bucle largo.
    this.planeLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.09),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    );
    this.planeLight.position.set(-20, 2.2, -17.5);
    this.group.add(this.planeLight);
  }

  #makeNightTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 160;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, '#050912');
    grad.addColorStop(0.75, '#0a1322');
    grad.addColorStop(1, '#121d2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 160);
    // Pista y luces lejanas.
    for (let i = 0; i < 90; i++) {
      g.fillStyle = Math.random() < 0.2 ? '#ffb85c' : '#5c7ca0';
      const y = 120 + Math.random() * 30;
      g.fillRect(Math.random() * 1024, y, 2, 2);
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }

  // ── Panel de salidas/llegadas ───────────────────────────────────────────
  #buildDepartureBoard() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    this.boardCtx = c.getContext('2d');
    this.boardTexture = new THREE.CanvasTexture(c);
    this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    this.boardRows = this.#randomBoardRows();
    this.#paintBoard();

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 2.3),
      new THREE.MeshStandardMaterial({
        map: this.boardTexture, emissiveMap: this.boardTexture, emissive: 0xffffff,
        emissiveIntensity: 0.75, color: 0x000000,
      }),
    );
    board.position.set(7.5, 3.0, -12);
    board.rotation.y = -0.35;
    this.group.add(board);
    this.boardTimer = 0;
  }

  #randomBoardRows() {
    const ciudades = ['MIAMI', 'MADRID', 'BOGOTÁ', 'SANTIAGO', 'PANAMÁ', 'LA PAZ', 'B. AIRES', 'MÉXICO DF', 'ATLANTA', 'SAO PAULO'];
    const estados = ['ARRIBÓ', 'EN PISTA', 'DEMORADO', 'ARRIBÓ', 'CONFIRMADO'];
    return Array.from({ length: 7 }, () => ({
      vuelo: `${['LA', 'AV', 'CM', 'IB', 'AA'][Math.floor(Math.random() * 5)]}${100 + Math.floor(Math.random() * 899)}`,
      ciudad: ciudades[Math.floor(Math.random() * ciudades.length)],
      hora: `0${Math.floor(Math.random() * 5)}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`,
      estado: estados[Math.floor(Math.random() * estados.length)],
    }));
  }

  #paintBoard() {
    const g = this.boardCtx;
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffb200';
    g.font = 'bold 20px monospace';
    g.fillText('LLEGADAS · ARRIVALS', 16, 30);
    g.font = '17px monospace';
    this.boardRows.forEach((r, i) => {
      const y = 66 + i * 27;
      g.fillStyle = '#e8c46a';
      g.fillText(r.hora, 16, y);
      g.fillText(r.vuelo, 96, y);
      g.fillText(r.ciudad, 190, y);
      g.fillStyle = r.estado === 'DEMORADO' ? '#ff5c4a' : '#7ce87c';
      g.fillText(r.estado, 380, y);
    });
    this.boardTexture.needsUpdate = true;
  }

  // ── Fila: postes y cintas ───────────────────────────────────────────────
  #buildQueueBarriers() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.25, metalness: 0.95 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x7a1f24, roughness: 0.7 });
    for (const [x0, z0, x1, z1] of [
      [-1.4, -2.4, -1.4, -7], [1.4, -2.4, 1.4, -7], [-1.4, -7, -3.4, -9], [1.4, -7, 3.4, -9],
    ]) {
      for (const [x, z] of [[x0, z0], [x1, z1]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.95), steel);
        post.position.set(x, 0.48, z);
        post.castShadow = true;
        this.group.add(post);
      }
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.012), strap);
      belt.position.set((x0 + x1) / 2, 0.85, (z0 + z1) / 2);
      belt.rotation.y = -Math.atan2(dz, dx);
      this.group.add(belt);
    }
  }

  // ── Cámara PTZ de seguridad ─────────────────────────────────────────────
  #buildPTZ() {
    this.ptz = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.4 }),
    );
    dome.rotation.x = Math.PI;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.05, 0.09);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    led.position.set(0.06, -0.02, 0.1);
    this.ptz.add(dome, lens, led);
    this.ptz.position.set(-2.6, 3.6, -1.8);
    this.group.add(this.ptz);
    this.ptzLed = led;
  }

  // ── Puertas automáticas laterales ───────────────────────────────────────
  #buildDoors() {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xcfe0ee, transmission: 0.85, roughness: 0.08, thickness: 0.02, transparent: true,
    });
    this.doorL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 0.04), glassMat);
    this.doorR = this.doorL.clone();
    this.doorL.position.set(-9.5, 1.2, -4);
    this.doorR.position.set(-8.4, 1.2, -4);
    this.group.add(this.doorL, this.doorR);
    this.doorBaseL = -9.5;
    this.doorBaseR = -8.4;
  }

  update(dt, t) {
    this.t = t;

    // Fluorescentes que titilan (vida eléctrica, casi subliminal).
    for (const f of this.flickerLights) {
      const flick = Math.random() < 0.003 ? 0.35 : 1;
      const wave = 0.95 + Math.sin(t * 11 + f.phase) * 0.03;
      f.strip.material.emissiveIntensity = 2.4 * flick * wave;
      if (f.light) f.light.intensity = 10 * flick * wave;
    }

    // Maletas recirculando por la cinta.
    for (const bag of this.bags) {
      const s = ((t * 0.35 + bag.userData.offset) % 9) - 4.5;
      bag.position.set(-6.5 + Math.cos(0.25) * s, 0.85, -6.5 - Math.sin(0.25) * s);
      bag.rotation.y = 0.25 + Math.sin(t + bag.userData.offset) * 0.02; // vibración de cinta
    }

    // PTZ barre la sala; el LED late.
    this.ptz.rotation.y = Math.sin(t * 0.15) * 1.1;
    this.ptzLed.material.color.setScalar(0);
    this.ptzLed.material.color.r = 0.6 + Math.sin(t * 3) * 0.4;

    // Panel de llegadas: refresca filas cada ~14 s con "flip".
    this.boardTimer += dt;
    if (this.boardTimer > 14) {
      this.boardTimer = 0;
      this.boardRows.shift();
      this.boardRows.push(this.#randomBoardRows()[0]);
      this.#paintBoard();
    }

    // Monitor del oficial: reloj y barras vivos (refresco barato a ~4 fps).
    if ((t * 4 | 0) !== ((t - dt) * 4 | 0)) {
      this.#paintMonitor(t);
      this.monitorTexture.needsUpdate = true;
    }

    // Puertas automáticas en ciclo largo.
    const doorPhase = Math.max(0, Math.sin(t * 0.18));
    const open = THREE.MathUtils.smoothstep(doorPhase, 0.7, 0.95) * 0.9;
    this.doorL.position.x = this.doorBaseL - open;
    this.doorR.position.x = this.doorBaseR + open;

    // Avión rodando al otro lado del cristal (bucle de ~80 s).
    const px = ((t * 0.5) % 44) - 22;
    this.planeLight.position.x = px;
    this.planeLight.material.color.setHex(Math.sin(t * 8) > 0.7 ? 0xff4444 : 0xffffff);
  }
}
