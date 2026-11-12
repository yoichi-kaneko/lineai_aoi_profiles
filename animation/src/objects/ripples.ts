import * as THREE from "three";
import { ease, seg } from "../timeline";
import { LAYER } from "./card";

export interface RippleEvent {
  time: number;
  x: number;
  y: number;
  size: number;
  color?: THREE.ColorRepresentation;
  duration?: number;
}

/** 接続・到着の瞬間に広がる光の輪。発生時刻と位置はあらかじめ決めておく。 */
export class Ripples {
  readonly group = new THREE.Group();
  private readonly items: { event: RippleEvent; mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> }[];

  constructor(events: readonly RippleEvent[]) {
    const geometry = new THREE.RingGeometry(0.94, 1, 96);
    this.items = events.map((event) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: event.color ?? "#8ff0ff",
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.position.set(event.x, event.y, 0);
      mesh.renderOrder = LAYER.ripple;
      this.group.add(mesh);
      return { event, mesh };
    });
  }

  update(t: number): void {
    for (const { event, mesh } of this.items) {
      const p = seg(t, event.time, event.time + (event.duration ?? 0.9));
      const active = p > 0 && p < 1;
      mesh.visible = active;
      if (!active) continue;
      mesh.scale.setScalar(event.size * (0.15 + 0.85 * ease.outCubic(p)));
      mesh.material.opacity = (1 - p) ** 1.5;
    }
  }
}
