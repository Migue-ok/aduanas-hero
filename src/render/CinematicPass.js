import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * CinematicPass — la "lente" del juego en un solo pase GLSL:
 * viñeta física, aberración cromática sutil, grano animado, distorsión de lente
 * y un tinte frío institucional que se intensifica con la tensión (`uTension`).
 */
const CinematicShader = {
  name: 'CinematicShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uTension: { value: 0 },      // 0..1 — sube en interrogatorios y clímax
    uVignette: { value: 0.85 },
    uAberration: { value: 0.0016 },
    uGrain: { value: 0.045 },
    uDistortion: { value: 0.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uTension;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uDistortion;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      // Distorsión de lente (barrel) muy leve, crece un poco con la tensión.
      vec2 uv = vUv + centered * r2 * uDistortion * (1.0 + uTension * 0.6);

      // Aberración cromática radial: los canales se separan hacia el borde.
      float ab = uAberration * (1.0 + uTension * 1.5);
      vec2 dir = centered * (1.0 + r2);
      float rC = texture2D(tDiffuse, uv + dir * ab).r;
      float gC = texture2D(tDiffuse, uv).g;
      float bC = texture2D(tDiffuse, uv - dir * ab).b;
      vec3 color = vec3(rC, gC, bC);

      // Tinte frío institucional; con tensión, las sombras se enfrían más.
      color = mix(color, color * vec3(0.94, 0.99, 1.06), 0.6 + uTension * 0.3);

      // Viñeta suave que respira con la tensión.
      float vig = smoothstep(0.95, uVignette - uTension * 0.22, r2 * 1.9);
      color *= mix(0.55, 1.0, vig);

      // Grano animado (film grain barato pero vivo).
      float grain = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 61.7) - 0.5;
      color += grain * uGrain * (0.7 + uTension * 0.8);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class CinematicPass extends ShaderPass {
  constructor() {
    super(CinematicShader);
  }

  update(dt, tension) {
    this.uniforms.uTime.value += dt;
    // El pase persigue la tensión objetivo con inercia: nada salta de golpe.
    const current = this.uniforms.uTension.value;
    this.uniforms.uTension.value += (tension - current) * Math.min(1, dt * 2.5);
  }
}
