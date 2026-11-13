import { clamp01, ease, keyframes, LOOP_DURATION, type Keyframe } from "./timeline";

/*
 * 光の線の進み方。
 * /run_aoi_daily が起動して night モードが決まったあと（6 秒前後）から、
 * チャットへの送信を終える 38 秒前後まで、光の線は止まらずに進み続ける。
 * カメラは先端を追いかけるため、先端とそれに連なるノードは画面内に留まり、
 * 背景・山並み・光の線の本体だけが左へ流れていく。
 */

/** 巡航中の進む速さ（ワールド座標の単位 / 秒）。 */
export const CRUISE_SPEED = 1.05;

/** 進み始める時刻と、止まり終える時刻。 */
export const MOVE_START = 5.6;
export const MOVE_END = 38.4;

/** 進む速さの時間変化。起動直後は勢いよく伸び、/run_aoi_daily を画面外へ送ってから巡航に落ち着く。 */
const SPEED_KEYS: readonly Keyframe[] = [
  [MOVE_START, 0],
  [6.6, 4.2, ease.inOutSine],
  [7.6, 4.2],
  [8.8, CRUISE_SPEED, ease.inOutSine],
  [37.6, CRUISE_SPEED],
  [MOVE_END, 0, ease.inOutSine],
];

/** 画面上での先端の x。起動直後は先へ飛び出し、カメラが追いつくと中央に戻る。 */
const HEAD_SCREEN_KEYS: readonly Keyframe[] = [
  [0.5, -15],
  [3.2, -1.5, ease.outCubic],
  [5.4, -1.5],
  [6.8, 2.6, ease.inOutSine],
  [8.9, 0, ease.inOutCubic],
];

const STEP = 1 / 120;
const SAMPLES = Math.ceil(LOOP_DURATION / STEP) + 1;

/** 速さを積分した移動量を、あらかじめ刻みごとに求めておく。 */
const SCROLL_TABLE = (() => {
  const table = new Float64Array(SAMPLES);
  let previous = keyframes(0, SPEED_KEYS);
  for (let i = 1; i < SAMPLES; i++) {
    const speed = keyframes(i * STEP, SPEED_KEYS);
    table[i] = table[i - 1]! + ((previous + speed) / 2) * STEP;
    previous = speed;
  }
  return table;
})();

/** 時刻 t までに画面（カメラ）が進んだ量（ワールド座標の単位）。 */
export function scrollAt(t: number): number {
  const x = clamp01(t / LOOP_DURATION) * (SAMPLES - 1);
  const i = Math.floor(x);
  const a = SCROLL_TABLE[i]!;
  const b = SCROLL_TABLE[Math.min(i + 1, SAMPLES - 1)]!;
  return a + (b - a) * (x - i);
}

/** 光の線の先端の、画面上の x。 */
export function headScreenAt(t: number): number {
  return keyframes(t, HEAD_SCREEN_KEYS);
}

/** 光の線の先端の、ワールド座標の x。 */
export function headWorldAt(t: number): number {
  return scrollAt(t) + headScreenAt(t);
}

/** 止まり終えたときの移動量。 */
export const SCROLL_END = scrollAt(LOOP_DURATION);
