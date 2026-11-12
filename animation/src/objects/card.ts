import * as THREE from "three";
import { createGlowTexture, createRingTexture } from "../textures";

/** 描画順。透明なオブジェクトは renderOrder の小さいものから描かれる。 */
export const LAYER = {
  background: 0,
  mountains: 10,
  beam: 20,
  glow: 30,
  particles: 35,
  card: 40,
  cardTop: 50,
  chip: 60,
  ripple: 70,
} as const;

/** テクスチャを貼った板。位置・拡大率・不透明度をまとめて設定する。 */
export class Card {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(
    texture: THREE.Texture,
    width: number,
    height: number,
    renderOrder: number = LAYER.card,
    blending: THREE.Blending = THREE.NormalBlending,
  ) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    this.mesh.renderOrder = renderOrder;
  }

  set(x: number, y: number, scale: number, opacity: number): void {
    this.mesh.position.set(x, y, this.mesh.position.z);
    this.mesh.scale.setScalar(Math.max(scale, 1e-4));
    this.mesh.material.opacity = opacity;
    this.mesh.visible = opacity > 0.001 && scale > 0.001;
  }

  setPosition(v: THREE.Vector2): void {
    this.mesh.position.set(v.x, v.y, this.mesh.position.z);
  }
}

let glowTexture: THREE.Texture | null = null;
let ringTexture: THREE.Texture | null = null;

/** 加算合成で光る玉。 */
export function createGlow(color: THREE.ColorRepresentation, size: number, renderOrder: number = LAYER.glow): Card {
  glowTexture ??= createGlowTexture();
  const card = new Card(glowTexture, size, size, renderOrder, THREE.AdditiveBlending);
  card.mesh.material.color = new THREE.Color(color);
  return card;
}

/** 加算合成で光る、目盛り付きのリング。 */
export function createRing(color: THREE.ColorRepresentation, size: number, renderOrder: number = LAYER.glow): Card {
  ringTexture ??= createRingTexture();
  const card = new Card(ringTexture, size, size, renderOrder, THREE.AdditiveBlending);
  card.mesh.material.color = new THREE.Color(color);
  return card;
}

/** 2次ベジェ曲線上の点。 */
export function bezier(
  from: THREE.Vector2,
  control: THREE.Vector2,
  to: THREE.Vector2,
  t: number,
  target: THREE.Vector2 = new THREE.Vector2(),
): THREE.Vector2 {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return target.set(a * from.x + b * control.x + c * to.x, a * from.y + b * control.y + c * to.y);
}
