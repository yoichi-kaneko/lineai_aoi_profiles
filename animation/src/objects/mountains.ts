import * as THREE from "three";
import { DESIGN_DISTANCE } from "../layout";
import { mulberry32 } from "../textures";
import { LAYER } from "./card";

interface LayerSpec {
  /** 奥行き。小さいほど遠く、スクロール時の動きもゆっくりに見える。 */
  z: number;
  /** 稜線の平均的な高さ（画面上の座標）。 */
  top: number;
  amplitude: number;
  frequency: number;
  seed: number;
  spacing: number;
  rows: number;
  opacity: number;
}

const LAYERS: readonly LayerSpec[] = [
  { z: -14, top: -2.05, amplitude: 0.95, frequency: 0.42, seed: 5, spacing: 1.1, rows: 6, opacity: 0.34 },
  { z: -7, top: -2.65, amplitude: 0.8, frequency: 0.55, seed: 9, spacing: 0.75, rows: 6, opacity: 0.55 },
  { z: -2.5, top: -3.3, amplitude: 0.55, frequency: 0.75, seed: 13, spacing: 0.5, rows: 5, opacity: 0.8 },
];

/** ワールド座標での山並みの範囲（スクロール量と横長画面を見込んだ幅）。 */
const X_MIN = -34;
const X_MAX = 92;
/** 山の裾（画面上の座標）。縦長画面でも下端が切れないよう深めに取る。 */
const BOTTOM = -8;

const LINE_COLOR = new THREE.Color("#2aa8ff");

function createNoise(seed: number): (x: number) => number {
  const rand = mulberry32(seed);
  const lattice = Array.from({ length: 256 }, () => rand());
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = lattice[((i % 256) + 256) % 256]!;
    const b = lattice[(((i + 1) % 256) + 256) % 256]!;
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

const depthFactor = (z: number): number => DESIGN_DISTANCE / (DESIGN_DISTANCE - z);

/** 画面下部のワイヤーフレームの山並み。光の線の進行（スクロール）に合わせて横へ流れる。 */
export class Mountains {
  readonly group = new THREE.Group();
  private readonly lineMaterials: THREE.LineBasicMaterial[] = [];
  private readonly ridgeMaterials: THREE.LineBasicMaterial[] = [];
  private readonly fillMaterials: THREE.MeshBasicMaterial[] = [];

  constructor() {
    LAYERS.forEach((spec, index) => this.buildLayer(spec, index));
  }

  private buildLayer(spec: LayerSpec, index: number): void {
    const noise = createNoise(spec.seed);
    const ridged = createNoise(spec.seed + 100);
    const rand = mulberry32(spec.seed + 7);
    const factor = depthFactor(spec.z);
    const cols = Math.ceil((X_MAX - X_MIN) / spec.spacing);

    const ridgeAt = (x: number): number => {
      const s = x * factor * spec.frequency;
      const base = noise(s) * 0.6 + noise(s * 2.1 + 17) * 0.28 + noise(s * 4.3 + 41) * 0.12;
      const peak = 1 - Math.abs(ridged(s * 1.3 + 5) * 2 - 1);
      return spec.top + spec.amplitude * ((base - 0.5) * 1.5 + peak * 0.7 - 0.35);
    };

    // 頂点の格子（行 0 が裾、行 rows が稜線）
    const grid: THREE.Vector3[][] = [];
    for (let j = 0; j <= spec.rows; j++) {
      const t = j / spec.rows;
      const f = 1 - (1 - t) ** 1.5;
      const z = spec.z + (1 - t) * 1.2;
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= cols; i++) {
        const jitter = j > 0 && j < spec.rows ? (rand() - 0.5) * spec.spacing * 0.4 : 0;
        const x = X_MIN + i * spec.spacing + jitter;
        const yScreen = BOTTOM + (ridgeAt(x) - BOTTOM) * f;
        row.push(new THREE.Vector3(x, yScreen / depthFactor(z), z));
      }
      grid.push(row);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const brightness = (j: number) => (1 - (1 - j / spec.rows) ** 1.5) ** 2.4;
    const push = (i1: number, j1: number, i2: number, j2: number) => {
      const a = grid[j1]![i1]!;
      const b = grid[j2]![i2]!;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const ba = brightness(j1);
      const bb = brightness(j2);
      colors.push(LINE_COLOR.r * ba, LINE_COLOR.g * ba, LINE_COLOR.b * ba);
      colors.push(LINE_COLOR.r * bb, LINE_COLOR.g * bb, LINE_COLOR.b * bb);
    };
    for (let j = 0; j <= spec.rows; j++) {
      for (let i = 0; i <= cols; i++) {
        if (i < cols) push(i, j, i + 1, j);
        if (j < spec.rows) {
          push(i, j, i, j + 1);
          if (i < cols) {
            if ((i + j) % 2 === 0) push(i, j, i + 1, j + 1);
            else push(i + 1, j, i, j + 1);
          }
        }
      }
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    lineGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.userData.baseOpacity = spec.opacity;

    // 稜線を一段明るく
    const ridgeRow = grid[spec.rows]!;
    const ridgeGeometry = new THREE.BufferGeometry().setFromPoints(ridgeRow);
    const ridgeMaterial = new THREE.LineBasicMaterial({
      color: "#c4f3ff",
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const ridge = new THREE.Line(ridgeGeometry, ridgeMaterial);

    // 稜線より下を暗く塗り、奥の層や星を隠す
    const fillPositions: number[] = [];
    const bottomRow = grid[0]!;
    for (let i = 0; i < cols; i++) {
      const b0 = bottomRow[i]!;
      const b1 = bottomRow[i + 1]!;
      const t0 = ridgeRow[i]!;
      const t1 = ridgeRow[i + 1]!;
      fillPositions.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, b1.x, b1.y, b1.z);
      fillPositions.push(b1.x, b1.y, b1.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z);
    }
    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fillPositions, 3));
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: "#02060f",
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);

    const order = LAYER.mountains + index * 3;
    fill.renderOrder = order;
    lines.renderOrder = order + 1;
    ridge.renderOrder = order + 2;
    for (const object of [fill, lines, ridge]) object.frustumCulled = false;

    this.group.add(fill, lines, ridge);
    this.lineMaterials.push(lineMaterial);
    this.ridgeMaterials.push(ridgeMaterial);
    this.fillMaterials.push(fillMaterial);
  }

  update(scroll: number, opacity: number): void {
    this.group.position.x = -scroll;
    this.group.visible = opacity > 0.001;
    LAYERS.forEach((spec, i) => {
      this.lineMaterials[i]!.opacity = spec.opacity * opacity;
      this.ridgeMaterials[i]!.opacity = Math.min(1, spec.opacity * 1.25) * opacity;
      this.fillMaterials[i]!.opacity = 0.9 * opacity;
    });
  }
}
