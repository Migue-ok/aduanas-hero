import * as THREE from 'three';
import gsap from 'gsap';
import { bus, Señal } from '../core/EventBus.js';

/**
 * XRayView — el monitor donde la maleta confiesa
 * (`02 - Diseño/05 - Mecanica - Escaneo de Rayos X.md`).
 *
 * Escena ortográfica propia con shaders GLSL:
 *  - cada silueta es un SDF (rect/blob/lámina) con densidad acumulativa aditiva
 *    y la paleta pseudocolor estándar: naranja=orgánico · azul=metal · verde=mixto ·
 *    negro opaco=zona ciega;
 *  - pase final de monitor: scanlines, ruido electrónico, viñeta de tubo.
 *
 * Controles: arrastrar la maleta · rueda = zoom · contraste O/I · clic = marcar silueta.
 */

const ITEM_SHADER = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    uniform int uForma;      // 0 rect · 1 blob · 2 lámina
    uniform int uMaterial;   // 0 orgánico · 1 inorgánico · 2 mixto · 3 denso
    uniform int uContraste;  // 0 normal · 1 realza orgánico · 2 realza inorgánico
    uniform float uTime;
    uniform float uMarcada;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    void main() {
      vec2 p = vUv - 0.5;
      float d; // "espesor" atravesado: 1 en el centro, 0 en el borde
      if (uForma == 0) {
        vec2 q = abs(p) - vec2(0.42, 0.4);
        d = 1.0 - smoothstep(-0.12, 0.02, max(q.x, q.y));
      } else if (uForma == 1) {
        float wobble = noise(p * 5.0 + float(uMaterial)) * 0.12;
        d = 1.0 - smoothstep(0.18, 0.46 + wobble, length(p * vec2(1.0, 1.15)));
      } else {
        // Lámina: densidad brutal y homogénea con capas finas (fajos, doble fondo).
        float capas = 0.85 + sin(vUv.y * 90.0) * 0.08;
        vec2 q = abs(p) - vec2(0.46, 0.42);
        d = (1.0 - smoothstep(-0.05, 0.01, max(q.x, q.y))) * capas;
      }
      if (d <= 0.003) discard;

      // Paleta pseudocolor de la industria (ley global, 06-Arte).
      vec3 col;
      float dens;
      if (uMaterial == 0)      { col = vec3(1.0, 0.55, 0.10); dens = 0.55; }  // orgánico
      else if (uMaterial == 1) { col = vec3(0.16, 0.36, 1.0); dens = 0.75; }  // metal
      else if (uMaterial == 2) { col = vec3(0.22, 0.82, 0.40); dens = 0.6; }  // mixto
      else                     { col = vec3(0.05, 0.06, 0.10); dens = 1.6; }  // denso → casi negro

      // Densidad irregular interna: el material "habla" (restauraciones, masas).
      float irregular = noise(vUv * 14.0 + float(uMaterial) * 7.0);
      dens *= 0.8 + irregular * 0.5;

      // Contraste orgánico/inorgánico: el kit del operador.
      float atten = 1.0;
      if (uContraste == 1 && uMaterial != 0) atten = 0.18;
      if (uContraste == 2 && uMaterial != 1 && uMaterial != 3) atten = 0.18;

      float density = d * dens * atten;
      vec3 outCol = mix(vec3(0.9, 0.95, 1.0), col, clamp(density * 1.4, 0.0, 1.0));
      // El denso se traga la luz: zona ciega.
      if (uMaterial == 3) outCol = mix(outCol, vec3(0.01, 0.01, 0.02), clamp(density, 0.0, 0.96));

      // Marca del operador: borde pulsante ámbar.
      if (uMarcada > 0.5) {
        float edge = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.1, 0.35, d));
        outCol += vec3(1.0, 0.75, 0.1) * edge * (0.6 + sin(uTime * 6.0) * 0.4);
      }

      gl_FragColor = vec4(outCol, clamp(density, 0.0, 0.96));
    }
  `,
};

const MONITOR_SHADER = {
  vertex: ITEM_SHADER.vertex,
  fragment: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      // Scanlines + ruido electrónico + viñeta de tubo, en aditivo sobre la imagen.
      float scan = sin(vUv.y * 700.0) * 0.03;
      float noise = (hash(vUv * 900.0 + fract(uTime) * 37.0) - 0.5) * 0.05;
      vec2 c = vUv - 0.5;
      float vig = smoothstep(0.75, 0.35, dot(c, c));
      float sweep = smoothstep(0.0, 0.02, abs(fract(uTime * 0.11) - vUv.y)) * 0.0 +
                    (1.0 - smoothstep(0.0, 0.03, abs(fract(uTime * 0.11) - vUv.y))) * 0.06;
      gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * (scan + noise + sweep), 1.0 - vig);
    }
  `,
};

export class XRayView {
  constructor(gl) {
    this.gl = gl;
    this.active = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdfe8f2); // fondo "aire" del monitor real
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    this.camera.position.z = 2;

    this.bag = new THREE.Group();
    this.scene.add(this.bag);

    // Pase de monitor encima de todo.
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: MONITOR_SHADER.vertex,
        fragmentShader: MONITOR_SHADER.fragment,
        transparent: true,
        depthTest: false,
      }),
    );
    overlay.renderOrder = 99;
    overlay.position.z = 1;
    this.scene.add(overlay);
    this.overlay = overlay;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.itemMeshes = [];
    this.contraste = 0;
    this.zoom = 1;
    this.dragging = false;

    this.#bindInput();
  }

  /** Carga la maleta del caso actual. */
  open(caso, onMark) {
    this.caso = caso;
    this.onMark = onMark;
    this.active = true;
    this.contraste = 0;
    this.zoom = 1;
    this.bag.position.set(0, 0, 0);
    this.bag.scale.setScalar(1);

    for (const m of this.itemMeshes) this.bag.remove(m);
    this.itemMeshes = [];

    // Carcasa de la maleta: silueta mixta tenue que envuelve todo.
    const shell = this.#makeItem({ forma: 'rect', material: 'mixto', x: 0.5, y: 0.5, w: 0.86, h: 0.62 }, true);
    shell.material.uniforms.uMarcada.value = 0;
    this.bag.add(shell);
    this.itemMeshes.push(shell);

    for (const item of caso.xray.items) {
      const mesh = this.#makeItem(item, false);
      this.bag.add(mesh);
      this.itemMeshes.push(mesh);
    }
    // Entrada de la maleta por la banda: desliza desde la izquierda.
    this.bag.position.x = -1.2;
    gsap.to(this.bag.position, { x: 0, duration: 1.6, ease: 'power2.out' });
    bus.emit(Señal.ESCANEO_INICIADO, { caso_id: caso.id });
  }

  close() {
    this.active = false;
    bus.emit(Señal.ESCANEO_FINALIZADO, {
      caso_id: this.caso?.id,
      marcas: this.itemMeshes.filter((m) => m.userData.marcada).map((m) => m.userData.etiqueta),
    });
  }

  #makeItem(item, esCarcasa) {
    const formaIdx = { rect: 0, blob: 1, lamina: 2 }[item.forma] ?? 0;
    const matIdx = { organico: 0, inorganico: 1, mixto: 2, denso: 3 }[item.material] ?? 2;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(item.w, item.h),
      new THREE.ShaderMaterial({
        uniforms: {
          uForma: { value: formaIdx },
          uMaterial: { value: matIdx },
          uContraste: { value: 0 },
          uTime: { value: 0 },
          uMarcada: { value: 0 },
        },
        vertexShader: ITEM_SHADER.vertex,
        fragmentShader: ITEM_SHADER.fragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.position.set(item.x - 0.5, 0.5 - item.y, esCarcasa ? -0.1 : Math.random() * 0.1);
    mesh.userData = { ...item, esCarcasa, marcada: false };
    if (esCarcasa) mesh.material.opacity = 0.4;
    return mesh;
  }

  setContraste(modo) {
    this.contraste = modo;
    for (const m of this.itemMeshes) m.material.uniforms.uContraste.value = modo;
  }

  #bindInput() {
    const canvas = this.gl.domElement;
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.6, 3.5);
      gsap.to(this.bag.scale, { x: this.zoom, y: this.zoom, duration: 0.35, ease: 'power2.out' });
    }, { passive: true });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY, bx: this.bag.position.x, by: this.bag.position.y, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || !this.dragging) return;
      const dx = (e.clientX - this.dragStart.x) / window.innerHeight;
      const dy = (e.clientY - this.dragStart.y) / window.innerHeight;
      if (Math.abs(dx) + Math.abs(dy) > 0.004) this.dragStart.moved = true;
      this.bag.position.x = this.dragStart.bx + dx;
      this.bag.position.y = this.dragStart.by - dy;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      this.dragging = false;
      if (this.dragStart?.moved) return; // fue arrastre, no clic
      this.#tryMark(e);
    });
  }

  #tryMark(e) {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.itemMeshes.filter((m) => !m.userData.esCarcasa));
    if (!hits.length) return;
    const mesh = hits[0].object;
    if (mesh.userData.marcada) return;
    mesh.userData.marcada = true;
    mesh.material.uniforms.uMarcada.value = 1;
    bus.emit(Señal.SILUETA_MARCADA, {
      caso_id: this.caso.id,
      etiqueta: mesh.userData.etiqueta,
      señal: mesh.userData.señal ?? null,
    });
    this.onMark?.(mesh.userData);
  }

  update(dt, t) {
    if (!this.active) return;
    this.overlay.material.uniforms.uTime.value = t;
    for (const m of this.itemMeshes) m.material.uniforms.uTime.value = t;
    // El encuadre respira apenas: hasta el monitor tiene pulso.
    this.camera.position.x = Math.sin(t * 0.4) * 0.002;
    this.gl.render(this.scene, this.camera);
  }
}
