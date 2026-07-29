/**
 * 座標指定クロップ／範囲スライスの切り出し範囲を組み立てる。
 *
 * 画像 I/O を含まない純粋な計算に切り出してあるため、画像なしでテストできる
 * （test/yamap/image_region.test.ts）。
 */

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImageSize = { width: number; height: number };

/** スライスの既定の刻み高さ。判読性と枚数のバランスから経験的に決めた値 */
export const DEFAULT_SLICE_STEP = 1400;

/** 刻み高さの下限。細かすぎると枚数が増えて Read のコストが跳ね上がる */
export const MIN_SLICE_STEP = 200;

/**
 * 1回のスライスで出力する上限枚数。
 * 切り出した画像は Read で読むことになるため、無制限に出すとコンテキストを圧迫する。
 */
export const MAX_SLICE_COUNT = 20;

export type PlanResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): PlanResult<T> {
  return { ok: false, error };
}

/** 縦方向の範囲を検証し、画像内に収まる [top, bottom) を返す */
function resolveVerticalRange(
  image: ImageSize,
  top: number,
  bottom: number,
): PlanResult<{ top: number; bottom: number }> {
  if (!Number.isInteger(top) || !Number.isInteger(bottom)) {
    return fail("y座標は整数で指定してください");
  }
  if (top < 0) {
    return fail(`開始y座標が負の値です: ${top}`);
  }
  if (top >= image.height) {
    return fail(
      `開始y座標が画像の高さを超えています: ${top}（画像の高さ: ${image.height}）`,
    );
  }
  if (bottom <= top) {
    return fail(`終了y座標は開始y座標より大きくしてください: ${top} → ${bottom}`);
  }

  return { ok: true, value: { top, bottom: Math.min(bottom, image.height) } };
}

export type CropOptions = {
  top: number;
  bottom: number;
  /** 省略時は画像の左端 */
  left?: number;
  /** 省略時は画像の右端 */
  right?: number;
};

/**
 * 座標指定クロップの矩形を決める。
 *
 * x 座標は省略可。YAMAP のレポートは全幅の縦長スクリーンショットであり、
 * 横方向を切り詰める必要はほぼないため、既定は全幅とする。
 */
export function resolveCropRect(
  image: ImageSize,
  options: CropOptions,
): PlanResult<Rect> {
  const vertical = resolveVerticalRange(image, options.top, options.bottom);
  if (!vertical.ok) return vertical;

  const left = options.left ?? 0;
  const right = options.right ?? image.width;

  if (!Number.isInteger(left) || !Number.isInteger(right)) {
    return fail("x座標は整数で指定してください");
  }
  if (left < 0) {
    return fail(`開始x座標が負の値です: ${left}`);
  }
  if (left >= image.width) {
    return fail(
      `開始x座標が画像の幅を超えています: ${left}（画像の幅: ${image.width}）`,
    );
  }
  if (right <= left) {
    return fail(`終了x座標は開始x座標より大きくしてください: ${left} → ${right}`);
  }

  return {
    ok: true,
    value: {
      left,
      top: vertical.value.top,
      width: Math.min(right, image.width) - left,
      height: vertical.value.bottom - vertical.value.top,
    },
  };
}

export type SliceOptions = {
  /** 省略時は画像の上端 */
  from?: number;
  /** 省略時は画像の下端 */
  to?: number;
  /** 省略時は DEFAULT_SLICE_STEP */
  step?: number;
};

/**
 * 範囲スライスの矩形一覧を決める。
 *
 * 指定範囲を step ごとに等分し、最後の1枚は範囲の終端で打ち切る。
 * 横方向は常に全幅（位置を探すための用途であり、横を切る意味がないため）。
 */
export function planSlices(
  image: ImageSize,
  options: SliceOptions = {},
): PlanResult<Rect[]> {
  const step = options.step ?? DEFAULT_SLICE_STEP;

  if (!Number.isInteger(step)) {
    return fail("刻み高さは整数で指定してください");
  }
  if (step < MIN_SLICE_STEP) {
    return fail(`刻み高さは${MIN_SLICE_STEP}px以上にしてください: ${step}`);
  }

  const vertical = resolveVerticalRange(
    image,
    options.from ?? 0,
    options.to ?? image.height,
  );
  if (!vertical.ok) return vertical;

  const { top, bottom } = vertical.value;
  const count = Math.ceil((bottom - top) / step);

  if (count > MAX_SLICE_COUNT) {
    return fail(
      `出力枚数が上限を超えます: ${count}枚（上限${MAX_SLICE_COUNT}枚）。`
        + ` 範囲を狭めるか、刻み高さを${Math.ceil((bottom - top) / MAX_SLICE_COUNT)}px以上にしてください`,
    );
  }

  const slices: Rect[] = [];
  for (let y = top; y < bottom; y += step) {
    slices.push({
      left: 0,
      top: y,
      width: image.width,
      height: Math.min(step, bottom - y),
    });
  }

  return { ok: true, value: slices };
}
