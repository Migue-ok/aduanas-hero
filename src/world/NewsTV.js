import * as THREE from 'three';
import gsap from 'gsap';

/**
 * NewsTV — el televisor viejo de la pared donde el turno te pasa la factura.
 * Caja CRT montada en un pilar; la pantalla es un ShaderMaterial que mezcla
 * la textura del noticiero (canvas) con estática, scanlines, curvatura de tubo
 * y rolling bar. Al encenderse: estática pura → la señal "engancha" → texto.
 *
 * Las consecuencias diferidas (`02 - Diseño/02 - Sistema de Consecuencias.md`)
 * se leen aquí, en escena — nunca en un popup.
 */

const SCREEN_SHADER = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uTime;
    uniform float uStatic;   // 1 = solo nieve · 0 = señal limpia
    uniform float uOn;       // brillo del tubo (0 apagado)
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      // Curvatura del tubo.
      vec2 c = vUv - 0.5;
      vec2 uv = vUv + c * dot(c, c) * 0.22;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // Jitter horizontal de sincronía cuando hay estática.
      float jitter = (hash(vec2(floor(uv.y * 90.0), floor(uTime * 24.0))) - 0.5) * 0.03 * uStatic;
      vec3 img = texture2D(uMap, uv + vec2(jitter, 0.0)).rgb;

      // Nieve.
      float snow = hash(uv * vec2(320.0, 240.0) + fract(uTime) * 63.0);
      vec3 color = mix(img, vec3(snow), clamp(uStatic, 0.0, 1.0));

      // Rolling bar (la franja que sube en los CRT mal sintonizados).
      float bar = smoothstep(0.0, 0.12, abs(fract(uTime * 0.14) - uv.y));
      color *= 0.82 + 0.18 * bar;

      // Scanlines + fósforo verde-azulado de tubo barato.
      color *= 0.85 + 0.15 * sin(uv.y * 480.0);
      color *= vec3(0.92, 1.05, 1.0);

      // Viñeta de tubo.
      color *= smoothstep(0.62, 0.2, dot(c, c));

      gl_FragColor = vec4(color * uOn, 1.0);
    }
  `,
};

export class NewsTV {
  constructor(scene, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Pilar de montaje + carcasa CRT con rejilla.
    const pilar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.7 }),
    );
    pilar.position.set(0, 3.5, -0.35);
    const carcasa = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.15, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.65 }),
    );
    carcasa.castShadow = true;

    // Canvas del contenido.
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.texture },
        uTime: { value: 0 },
        uStatic: { value: 1 },
        uOn: { value: 0.06 }, // en reposo: tubo casi apagado con nieve tenue
      },
      vertexShader: SCREEN_SHADER.vertex,
      fragmentShader: SCREEN_SHADER.fragment,
    });
    const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.98), this.material);
    pantalla.position.z = 0.43;
    carcasa.add(pantalla);
    carcasa.position.set(0, 2.45, 0.15);
    carcasa.rotation.x = 0.12; // inclinado hacia abajo, como todo TV de aeropuerto

    this.group.add(pilar, carcasa);
    this.group.position.set(4.15, 0, -5.8);
    this.group.rotation.y = -0.5; // gira hacia el puesto

    this.#paintIdle();
  }

  #paintIdle() {
    const g = this.ctx;
    g.fillStyle = '#050608';
    g.fillRect(0, 0, 512, 384);
    this.texture.needsUpdate = true;
  }

  /** Pinta el noticiero: cabecera de canal + titulares. */
  #paintNews(titulares) {
    const g = this.ctx;
    g.fillStyle = '#0a1018';
    g.fillRect(0, 0, 512, 384);

    // Cabecera del canal.
    g.fillStyle = '#a31f27';
    g.fillRect(0, 0, 512, 58);
    g.fillStyle = '#f2e8d8';
    g.font = 'bold 30px Georgia';
    g.fillText('NOTICIERO 24H', 18, 40);
    g.font = '13px monospace';
    g.textAlign = 'right';
    g.fillText('EN VIVO ●', 494, 38);
    g.textAlign = 'left';

    // Titulares con salto de línea manual.
    g.fillStyle = '#dfe6ee';
    g.font = '21px Georgia';
    let y = 100;
    for (const titular of titulares) {
      for (const linea of this.#wrap(titular, 44)) {
        g.fillText(linea, 20, y);
        y += 28;
      }
      y += 14;
      if (y > 330) break;
    }

    // Cintillo inferior.
    g.fillStyle = '#d08a1d';
    g.fillRect(0, 344, 512, 40);
    g.fillStyle = '#10131a';
    g.font = 'bold 17px monospace';
    g.fillText('AEROPUERTO · CONTROL DE ADUANAS · ÚLTIMA HORA', 14, 370);

    this.texture.needsUpdate = true;
  }

  #wrap(texto, ancho) {
    const palabras = texto.split(' ');
    const lineas = [];
    let actual = '';
    for (const p of palabras) {
      if ((actual + ' ' + p).length > ancho) { lineas.push(actual); actual = p; }
      else actual = actual ? `${actual} ${p}` : p;
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  /** Enciende el televisor: estática → señal → titulares. */
  encender(titulares) {
    this.#paintNews(titulares);
    this.audio.estatica(true);
    const u = this.material.uniforms;
    gsap.killTweensOf(u.uOn);
    gsap.killTweensOf(u.uStatic);
    u.uStatic.value = 1;
    gsap.to(u.uOn, { value: 1.15, duration: 0.35, ease: 'power4.out' });
    // La señal tarda en "enganchar", con dos reenganches falsos: drama de CRT.
    const tl = gsap.timeline();
    tl.to(u.uStatic, { value: 0.25, duration: 1.1, ease: 'power2.inOut' });
    tl.to(u.uStatic, { value: 0.7, duration: 0.15 });
    tl.to(u.uStatic, { value: 0.06, duration: 0.8, ease: 'power2.out' });
  }

  apagar() {
    this.audio.estatica(false);
    const u = this.material.uniforms;
    const tl = gsap.timeline();
    tl.to(u.uStatic, { value: 1, duration: 0.2 });
    tl.to(u.uOn, { value: 0.06, duration: 0.3, ease: 'power3.in' });
    tl.call(() => this.#paintIdle());
  }

  update(dt, t) {
    this.material.uniforms.uTime.value = t;
  }
}
