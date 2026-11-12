/**
 * 画面設計の基準。z = 0 の平面上に 16 × 9 の枠を想定し、
 * どの縦横比でもこの枠が収まるようにカメラの距離を決める。
 */
export const FRAME_WIDTH = 16;
export const FRAME_HEIGHT = 9;
export const CAMERA_FOV = 40;

const halfFovTan = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);

/** 16:9 以上の横長画面でのカメラ距離（奥行きのある物体の配置計算に使う）。 */
export const DESIGN_DISTANCE = FRAME_HEIGHT / 2 / halfFovTan;

/** 枠全体が収まるカメラ距離。 */
export function fitDistance(aspect: number): number {
  const byHeight = FRAME_HEIGHT / 2 / halfFovTan;
  const byWidth = FRAME_WIDTH / 2 / (halfFovTan * aspect);
  return Math.max(byHeight, byWidth);
}

/** 点の大きさをワールド単位で指定するための係数（画面の高さ px / (2 tan(fov/2))）。 */
export function pointScaleFor(viewportHeight: number): number {
  return viewportHeight / (2 * halfFovTan);
}
