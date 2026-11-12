import * as THREE from "three";
import { mulberry32 } from "../textures";
import { LAYER } from "./card";
import { pixelRatio, pointScale } from "./particles";

const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
uniform float uPixelRatio;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.4) + aPhase * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aSize * uScale * uPixelRatio / -mv.z, 1.0);
}
`;

const starFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
}
`;

const nebulaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** 値ノイズを重ねた、ごく暗い星雲と、画面中央に寄せた淡い光。 */
const nebulaFragment = /* glsl */ `
uniform float uTime;
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
  vec2 p = vUv * vec2(6.0, 3.4) + vec2(uTime * 0.004, 0.0);
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

/** 星空と星雲。ループの切れ目でも消さずに残す背景。 */
export class Background {
  readonly group = new THREE.Group();
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly nebulaMaterial: THREE.ShaderMaterial;

  constructor() {
    const rand = mulberry32(42);
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color("#ffffff"), new THREE.Color("#a8e6ff"), new THREE.Color("#c9b8ff")];
    for (let i = 0; i < count; i++) {
      const z = -20 - rand() * 50;
      const spread = (12.4 - z) * 0.364;
      positions.set([(rand() * 2 - 1) * spread * 3.2, (rand() * 2 - 1) * spread * 1.2, z], i * 3);
      sizes[i] = rand() < 0.05 ? 0.42 : 0.12 + rand() * 0.16;
      phases[i] = rand();
      const c = palette[Math.floor(rand() * palette.length)]!;
      const k = 0.35 + rand() * 0.65;
      colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: { uTime: { value: 0 }, uScale: pointScale, uPixelRatio: pixelRatio },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geometry, this.starMaterial);
    stars.renderOrder = LAYER.background + 1;
    stars.frustumCulled = false;

    this.nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: nebulaVertex,
      fragmentShader: nebulaFragment,
      uniforms: { uTime: { value: 0 } },
      depthWrite: false,
    });
    const nebula = new THREE.Mesh(new THREE.PlaneGeometry(300, 170), this.nebulaMaterial);
    nebula.position.z = -90;
    nebula.renderOrder = LAYER.background;

    this.group.add(nebula, stars);
  }

  update(time: number): void {
    this.starMaterial.uniforms.uTime!.value = time;
    this.nebulaMaterial.uniforms.uTime!.value = time;
  }
}
