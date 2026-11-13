import * as THREE from "three";
import { DESIGN_DISTANCE } from "../layout";
import { mulberry32 } from "../textures";
import { LAYER } from "./card";
import { pixelRatio, pointScale } from "./particles";

/**
 * 漂う光の粒。粒ごとの速さでゆっくり流れつつ、光の線の進行（uTravel）ぶん後ろへ流れる。
 * 奥にある粒ほど画面上の動きは小さくなる。見える範囲より広い箱の中で折り返すため、
 * 粒が画面内で途切れて見えることはない。
 */
const dustVertex = /* glsl */ `
attribute vec2 aVelocity;
attribute float aSize;
attribute float aPhase;
attribute float aShape;
attribute vec3 aColor;
uniform float uTime;
uniform float uTravel;
uniform float uDepthOrigin;
uniform float uScale;
uniform float uPixelRatio;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vShape = aShape;
  vAlpha = 0.55 + 0.45 * sin(uTime * (0.35 + aPhase * 0.6) + aPhase * 37.0);

  float depth = uDepthOrigin - position.z;
  vec2 span = vec2(2.8, 1.7) * depth;
  vec2 p = position.xy + aVelocity * uTime - vec2(uTravel, 0.0);
  p = mod(p + span * 0.5, span) - span * 0.5;

  vec4 mv = modelViewMatrix * vec4(p, position.z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aSize * uScale * uPixelRatio / -mv.z, 1.0);
}
`;

const dustFragment = /* glsl */ `
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float soft = smoothstep(0.5, 0.0, length(c));
  soft *= soft;
  float pixel = smoothstep(0.5, 0.3, max(abs(c.x), abs(c.y)));
  float a = mix(soft, pixel * 0.8, vShape);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

const nebulaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** 値ノイズを重ねた、ごく暗い星雲と、画面中央に寄せた淡い光。光の線の進行に合わせて模様が流れる。 */
const nebulaFragment = /* glsl */ `
uniform float uTime;
uniform float uTravel;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec2 p = vUv * vec2(6.0, 3.4) + vec2(uTime * 0.004 + uTravel * 0.02, 0.0);
  float n = fbm(p + fbm(p * 0.7) * 1.6);
  vec3 deep = vec3(0.0010, 0.0016, 0.0055);
  vec3 violet = vec3(0.012, 0.004, 0.026);
  vec3 teal = vec3(0.0, 0.014, 0.024);
  vec3 col = deep + violet * smoothstep(0.45, 0.85, n) + teal * smoothstep(0.55, 0.95, fbm(p * 1.7 + 9.0));
  float center = exp(-pow(length((vUv - vec2(0.5, 0.52)) * vec2(1.6, 2.6)), 2.0) * 2.2);
  col += vec3(0.0, 0.010, 0.020) * center;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 漂う光の粒と星雲。ループの切れ目でも消さずに残す背景。 */
export class Background {
  readonly group = new THREE.Group();
  private readonly dustMaterial: THREE.ShaderMaterial;
  private readonly nebulaMaterial: THREE.ShaderMaterial;

  constructor() {
    const rand = mulberry32(42);
    const count = 320;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 2);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const shapes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color("#7fe8ff"), new THREE.Color("#b9a8ff"), new THREE.Color("#dff6ff")];
    for (let i = 0; i < count; i++) {
      const z = -16 - rand() * 44;
      const depth = DESIGN_DISTANCE - z;
      // 画面上での大きさ・速さで決め、奥行きに応じてワールド座標へ換算する
      const toWorld = depth / DESIGN_DISTANCE;
      positions.set([(rand() - 0.5) * 2.8 * depth, (rand() - 0.5) * 1.7 * depth, z], i * 3);
      velocities.set([-(0.04 + rand() * 0.12) * toWorld, (0.01 + rand() * 0.05) * toWorld], i * 2);
      sizes[i] = (rand() < 0.08 ? 0.11 : 0.035 + rand() * 0.05) * toWorld;
      phases[i] = rand();
      shapes[i] = rand() < 0.25 ? 1 : 0;
      const c = palette[Math.floor(rand() * palette.length)]!;
      const k = 0.35 + rand() * 0.6;
      colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 2));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aShape", new THREE.BufferAttribute(shapes, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    this.dustMaterial = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uDepthOrigin: { value: DESIGN_DISTANCE },
        uScale: pointScale,
        uPixelRatio: pixelRatio,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geometry, this.dustMaterial);
    dust.renderOrder = LAYER.background + 1;
    dust.frustumCulled = false;

    this.nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: nebulaVertex,
      fragmentShader: nebulaFragment,
      uniforms: { uTime: { value: 0 }, uTravel: { value: 0 } },
      depthWrite: false,
    });
    const nebula = new THREE.Mesh(new THREE.PlaneGeometry(300, 170), this.nebulaMaterial);
    nebula.position.z = -90;
    nebula.renderOrder = LAYER.background;

    this.group.add(nebula, dust);
  }

  /**
   * @param time 経過時間（秒）。ループとは無関係に進み続ける。
   * @param travel 光の線が進んだ量の累計。ループの切れ目でも巻き戻らない値を渡す。
   */
  update(time: number, travel: number): void {
    this.dustMaterial.uniforms.uTime!.value = time;
    this.dustMaterial.uniforms.uTravel!.value = travel;
    this.nebulaMaterial.uniforms.uTime!.value = time;
    this.nebulaMaterial.uniforms.uTravel!.value = travel;
  }
}
