/** アニメーション1周の長さ（秒）。この時間で 0 秒へ戻ってループする。 */
export const LOOP_DURATION = 40;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** t が [start, end] のどこにいるかを 0〜1 で返す（範囲外はクランプ）。 */
export const seg = (t: number, start: number, end: number): number =>
  clamp01((t - start) / (end - start));

/** start から fadeIn 秒で 1 になり、end の fadeOut 秒前から 0 へ戻る窓関数。 */
export const fadeWindow = (
  t: number,
  start: number,
  end: number,
  fadeIn = 0.4,
  fadeOut = 0.4,
): number => Math.min(seg(t, start, start + fadeIn), 1 - seg(t, end - fadeOut, end));

export type Easing = (x: number) => number;

export const ease = {
  linear: (x: number) => x,
  inCubic: (x: number) => x * x * x,
  outCubic: (x: number) => 1 - (1 - x) ** 3,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  inOutSine: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
} satisfies Record<string, Easing>;

/** [時刻, 値, そのキーへ向かう区間のイージング] の並び。 */
export type Keyframe = readonly [time: number, value: number, easing?: Easing];

/** キーフレーム列を時刻 t で補間する。最初のキーより前は先頭、最後より後は末尾の値。 */
export function keyframes(t: number, keys: readonly Keyframe[]): number {
  const first = keys[0];
  if (!first) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1]!;
    const next = keys[i]!;
    if (t <= next[0]) {
      const easing = next[2] ?? ease.inOutCubic;
      return lerp(prev[1], next[1], easing(seg(t, prev[0], next[0])));
    }
  }
  return keys[keys.length - 1]![1];
}

/** デバッグ表示に使うフェーズの区切り。 */
export const PHASES: readonly { start: number; name: string }[] = [
  { start: 0, name: "1. 光の線が伸びる" },
  { start: 2.0, name: "2. /run_aoi_daily 起動" },
  { start: 4.0, name: "3. night モード" },
  { start: 5.4, name: "4. 光の線が右へ（以後は進み続ける）" },
  { start: 8.4, name: "5. 情報収集" },
  { start: 12.6, name: "6. ガイドライン・設定資料の読み込み" },
  { start: 15.6, name: "7. プロンプト考案" },
  { start: 22.0, name: "8. 画像生成 AI へ" },
  { start: 25.6, name: "9. 画像の生成" },
  { start: 31.6, name: "10. 画像の返却" },
  { start: 34.0, name: "11. チャットへ送信" },
  { start: 38.1, name: "12. フェードアウト" },
];

export function phaseNameAt(t: number): string {
  let name = PHASES[0]!.name;
  for (const phase of PHASES) {
    if (t >= phase.start) name = phase.name;
  }
  return name;
}
