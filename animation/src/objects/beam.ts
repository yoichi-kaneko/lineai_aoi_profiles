import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * 光の線。uv.x が線の長さ方向、uv.y が太さ方向。
 * s（= uOffset + uv.x * uLength）は線に沿った距離で、流れるパルスや消去の基準に使う。
 */
const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPhase;
uniform float uOffset;
uniform float uLength;
uniform float uDraw;
uniform float uErase;
uniform float uPulse;
uniform float uHead;
uniform float uCoreWidth;
varying vec2 vUv;

void main() {
  if (vUv.x > uDraw) discard;
  float s = uOffset + vUv.x * uLength;
  float d = abs(vUv.y - 0.5) * 2.0;
  float core = exp(-pow(d / uCoreWidth, 2.0));
  float glow = exp(-pow(d / 0.42, 2.0)) * 0.26 + exp(-d * 3.0) * 0.06;

  float ph = fract((s - uPhase * 2.4) / 1.7);
  float pulse = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.05, 0.32, ph));

  float headS = uOffset + uDraw * uLength;
  float head = exp(-max(headS - s, 0.0) * 1.6) * uHead;
  float erase = smoothstep(uErase, uErase + 0.8, s);

  float body = core * (0.9 + pulse * uPulse * 1.8 + head * 1.6)
             + glow * (1.0 + pulse * uPulse * 0.9 + head);
  vec3 color = mix(uColor, vec3(1.0), clamp(core * 0.55 + head * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(color * body * uOpacity * erase, 1.0);
}
`;

export function createBeamMaterial(color: THREE.ColorRepresentation, coreWidth = 0.1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uPhase: { value: 0 },
      uOffset: { value: 0 },
      uLength: { value: 1 },
      uDraw: { value: 1 },
      uErase: { value: -1e4 },
      uPulse: { value: 1 },
      uHead: { value: 1 },
      uCoreWidth: { value: coreWidth },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

export interface BeamState {
  opacity: number;
  /** パルスの流れの位相。大きくなる向きに流れる（逆向きに流すときは減らす）。 */
  phase: number;
  /** 描き終えている割合（0〜1）。 */
  draw?: number;
  /** 線に沿った距離 s がこれより小さい部分を消す。 */
  erase?: number;
  head?: number;
}

function applyState(material: THREE.ShaderMaterial, state: BeamState): void {
  const u = material.uniforms;
  u.uOpacity!.value = state.opacity;
  u.uPhase!.value = state.phase;
  u.uDraw!.value = state.draw ?? 1;
  u.uErase!.value = state.erase ?? -1e4;
  u.uHead!.value = state.head ?? 1;
}

/** 水平にまっすぐ伸びる本線。s はワールド座標の x と一致させる。 */
export class StraightBeam {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(color: THREE.ColorRepresentation, thickness = 0.7) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, thickness), createBeamMaterial(color));
    this.mesh.frustumCulled = false;
  }

  update(startX: number, headX: number, y: number, state: BeamState): void {
    const length = Math.max(headX - startX, 1e-3);
    this.mesh.position.set((startX + headX) / 2, y, 0);
    this.mesh.scale.set(length, 1, 1);
    const u = this.mesh.material.uniforms;
    u.uOffset!.value = startX;
    u.uLength!.value = length;
    applyState(this.mesh.material, state);
    this.mesh.visible = state.opacity > 0.001;
  }
}

/** 2次ベジェ曲線に沿った帯状の枝線。端点は毎フレーム差し替えられる。 */
export class CurveBeam {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly segments: number;
  private readonly thickness: number;
  private readonly curve = new THREE.QuadraticBezierCurve(new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2());
  private length = 1;

  constructor(color: THREE.ColorRepresentation, thickness = 0.55, segments = 64) {
    this.segments = segments;
    this.thickness = thickness;
    const count = (segments + 1) * 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2);
    for (let i = 0; i <= segments; i++) {
      uv.set([i / segments, 0, i / segments, 1], i * 4);
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const index: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, createBeamMaterial(color, 0.12));
    this.mesh.frustumCulled = false;
  }

  /** 曲線全体の長さ（消去の基準 s の最大値）。 */
  get curveLength(): number {
    return this.length;
  }

  setCurve(from: THREE.Vector2, control: THREE.Vector2, to: THREE.Vector2): void {
    this.curve.v0.copy(from);
    this.curve.v1.copy(control);
    this.curve.v2.copy(to);
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = new THREE.Vector2();
    const tangent = new THREE.Vector2();
    const half = this.thickness / 2;
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      this.curve.getPoint(t, p);
      this.curve.getTangent(t, tangent);
      const nx = -tangent.y * half;
      const ny = tangent.x * half;
      position.setXYZ(i * 2, p.x - nx, p.y - ny, 0);
      position.setXYZ(i * 2 + 1, p.x + nx, p.y + ny, 0);
    }
    position.needsUpdate = true;
    this.length = this.curve.getLength();
    this.mesh.material.uniforms.uLength!.value = this.length;
  }

  /** from から to へ、まっすぐな線を張る。 */
  setLine(from: THREE.Vector2, to: THREE.Vector2): void {
    this.setCurve(from, new THREE.Vector2().addVectors(from, to).multiplyScalar(0.5), to);
  }

  update(state: BeamState): void {
    applyState(this.mesh.material, state);
    this.mesh.visible = state.opacity > 0.001 && (state.draw ?? 1) > 0.001;
  }
}
