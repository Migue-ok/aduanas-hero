import * as THREE from 'three';
import { quality } from '../core/Device.js';

/**
 * Motas — el polvo que flota en los conos de luz.
 *
 * Es el detalle más barato que existe para que un interior deje de parecer una
 * maqueta: aire con cuerpo. Una terminal de aeropuerto de madrugada y un almacén
 * de galería tienen polvo suspendido; sin él el vacío entre la cámara y la
 * pared se lee como cristal.
 *
 * DECISIÓN TÉCNICA: todo el movimiento vive en el VERTEX SHADER. El bucle de
 * juego solo actualiza un uniform (`uTime`) por frame — cero trabajo de CPU,
 * cero reescritura del buffer de posiciones, cero presión sobre el GC. Cada
 * mota lleva su semilla y su fase en atributos, así que ninguna se mueve igual
 * que otra, y el reciclado es un `mod()` sobre la altura: cuando una sale por
 * arriba reaparece por abajo sin que nadie tenga que enterarse en JavaScript.
 *
 * El material es aditivo y sin escritura de profundidad: las motas SUMAN luz
 * donde hay luz. Fuera del haz apenas se ven, que es justo el comportamiento
 * real del polvo — y lo que hace que el efecto lea como iluminación y no como
 * una capa de puntos pegada encima.
 */

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uAlto;      // altura del volumen: define el reciclado vertical
  uniform float uTam;       // tamaño base en píxeles a 1 m
  attribute float aSemilla; // 0..1 — desincroniza a cada mota
  attribute float aEscala;  // 0.4..1.6 — variedad de calibre
  varying float vBrillo;

  void main() {
    vec3 p = position;

    // Deriva: sube lento y ondea. Frecuencias distintas por eje para que la
    // trayectoria nunca se lea como un círculo.
    float t = uTime * (0.05 + aSemilla * 0.07);
    p.y = mod(p.y + uTime * (0.018 + aSemilla * 0.03) + aSemilla * uAlto, uAlto);
    p.x += sin(t * 2.3 + aSemilla * 31.0) * 0.22;
    p.z += cos(t * 1.7 + aSemilla * 17.0) * 0.22;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;

    // Centelleo: una mota real gira y capta la luz de forma intermitente.
    vBrillo = 0.45 + 0.55 * pow(abs(sin(uTime * (0.6 + aSemilla) + aSemilla * 44.0)), 3.0);

    // DESVANECIDO DE CERCANÍA — sin esto el efecto arruina la escena.
    // El volumen de polvo envuelve a la cámara, así que siempre hay motas a 30 cm
    // del ojo; con mezcla aditiva y tamaño proporcional a 1/distancia, cada una
    // se convierte en un borrón enorme y cientos de ellas superpuestas lavan la
    // imagen entera de blanco. Además es lo que pasa de verdad: a un palmo de la
    // cara no distingues una mota, y lo que hay más allá de diez metros ya no
    // devuelve luz suficiente. Se desvanece por los dos extremos.
    vBrillo *= smoothstep(0.7, 2.4, dist) * (1.0 - smoothstep(9.0, 16.0, dist));

    // Y con techo de tamaño: ninguna mota puede ocupar media pantalla.
    gl_PointSize = clamp(uTam * aEscala * (1.0 / max(0.4, dist)), 1.0, 13.0);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacidad;
  varying float vBrillo;

  void main() {
    // Disco suave sin textura: más barato que un sprite y sin banda de alfa.
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float a = (1.0 - r2 * 4.0);
    a *= a;                                   // caída cuadrática: núcleo y halo
    gl_FragColor = vec4(uColor, a * vBrillo * uOpacidad);
  }`;

export class Motas {
  /**
   * @param {THREE.Scene} scene
   * @param {object} o
   * @param {THREE.Vector3} [o.centro]  centro del volumen
   * @param {number} [o.ancho]  · [o.alto] · [o.fondo]  dimensiones del volumen
   * @param {number} [o.cantidad]  por defecto, el presupuesto del dispositivo
   * @param {number} [o.color]     tinte (el polvo toma el color de la luz)
   * @param {number} [o.opacidad]
   * @param {number} [o.tam]       calibre base
   */
  constructor(scene, {
    centro = new THREE.Vector3(0, 1.6, 0),
    ancho = 12, alto = 4, fondo = 12,
    cantidad = quality.motas,
    color = 0xdfe8f5,
    // Valores AFINADOS MIRANDO LA PANTALLA, no calculados. Los primeros
    // (opacidad 0.5, tamaño 26) convertían el aeropuerto en una lechada blanca:
    // el polvo debe insinuarse en los haces de luz, no protagonizar el plano.
    opacidad = 0.2,
    tam = 9,
  } = {}) {
    const n = Math.max(1, cantidad | 0);
    const pos = new Float32Array(n * 3);
    const semilla = new Float32Array(n);
    const escala = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * ancho;
      pos[i * 3 + 1] = Math.random() * alto;      // el shader recicla con mod()
      pos[i * 3 + 2] = (Math.random() - 0.5) * fondo;
      semilla[i] = Math.random();
      // Sesgo hacia lo pequeño: unas pocas motas gordas y muchas finas leen
      // mucho mejor que un tamaño medio uniforme.
      escala[i] = 0.4 + Math.random() ** 2 * 1.2;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aSemilla', new THREE.BufferAttribute(semilla, 1));
    this.geo.setAttribute('aEscala', new THREE.BufferAttribute(escala, 1));
    // Sin bounding sphere automática: las motas se mueven en el shader y el
    // frustum culling las haría parpadear al borde del encuadre.
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(ancho, alto, fondo));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlto: { value: alto },
        uTam: { value: tam * (quality.mobile ? 0.8 : 1) },
        uColor: { value: new THREE.Color(color) },
        uOpacidad: { value: opacidad },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,           // no tapan nada: son aire
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.position.copy(centro);
    this.points.position.y -= alto / 2;
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.scene = scene;
  }

  /** Contrato de `Engine.add()`: una asignación de uniform y nada más. */
  update(dt, t) {
    this.mat.uniforms.uTime.value = t ?? (this.mat.uniforms.uTime.value + dt);
  }

  /** Densidad del aire: 0 apaga el efecto sin destruir nada. */
  set opacidad(v) { this.mat.uniforms.uOpacidad.value = v; }
  get opacidad() { return this.mat.uniforms.uOpacidad.value; }

  dispose() {
    this.scene?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
    this.scene = null;
  }
}
