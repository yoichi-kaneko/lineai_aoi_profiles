import * as THREE from "three";
import { mulberry32 } from "../textures";
import { bezier, LAYER } from "./card";

/**
 * 点の大きさをワールド座標の単位で指定するための係数。
 * 画面の高さ（px）/ (2 * tan(fov/2)) を main.ts がリサイズのたびに設定する。
 */
export const pointScale = { value: 600 };
export const pixelRatio = { value: 1 };

const vertexShader = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale * uPixelRatio / -mv.z;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(uColor * a * vAlpha * uOpacity * 1.6, 1.0);
}
`;

export function createPointsMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uScale: pointScale,
      uPixelRatio: pixelRatio,
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

/** from から to へ曲線に沿って流れる光の粒。データの受け渡しを表す。 */
export class Stream {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly count: number;
  private readonly offsets: Float32Array;
  private readonly jitter: Float32Array;
  private readonly sizes: Float32Array;
  private readonly speed: number;
  private readonly control = new THREE.Vector2();
  private readonly tmp = new THREE.Vector2();

  constructor(color: THREE.ColorRepresentation, options: { count?: number; size?: number; speed?: number; seed?: number } = {}) {
    const { count = 36, size = 0.09, speed = 0.7, seed = 1 } = options;
    this.count = count;
    this.speed = speed;
    const rand = mulberry32(seed);
    this.offsets = new Float32Array(count).map(() => rand());
    this.jitter = new Float32Array(count).map(() => rand() * 2 - 1);
    this.sizes = new Float32Array(count).map(() => size * (0.5 + rand() * 0.8));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.points = new THREE.Points(geometry, createPointsMaterial(color));
    this.points.frustumCulled = false;
    this.points.renderOrder = LAYER.particles;
  }

  /**
   * @param intensity 0 で非表示。
   * @param bend from→to の中点を法線方向へずらす量（曲がり具合）。
   */
  update(time: number, intensity: number, from: THREE.Vector2, to: THREE.Vector2, bend = 0.6, spread = 0.18): void {
    this.points.visible = intensity > 0.001;
    if (!this.points.visible) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    this.control.set((from.x + to.x) / 2 + nx * bend, (from.y + to.y) / 2 + ny * bend);

    const position = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = this.points.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      const u = (time * this.speed + this.offsets[i]!) % 1;
      bezier(from, this.control, to, u, this.tmp);
      const wobble = Math.sin(u * Math.PI) * this.jitter[i]! * spread;
      position.setXYZ(i, this.tmp.x + nx * wobble, this.tmp.y + ny * wobble, 0);
      alpha.setX(i, intensity * Math.sin(u * Math.PI) ** 0.7);
    }
    position.needsUpdate = true;
    alpha.needsUpdate = true;
  }
}
