/**
 * 層1: 予備クロップ（座標指定・範囲スライス）の範囲計算テスト
 *
 * 画像 I/O を含まない純粋な計算のみを対象にする。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLICE_STEP,
  MAX_SLICE_COUNT,
  MIN_SLICE_STEP,
  planSlices,
  resolveCropRect,
} from "../../src/yamap/image_region/region_plan.js";

/** 2026-07-28 の聖山レポートと同じサイズ */
const IMAGE = { width: 1690, height: 11020 };

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`成功を期待したが失敗した: ${result.error}`);
  return result.value;
}

function expectError(
  result: { ok: true; value: unknown } | { ok: false; error: string },
): string {
  if (result.ok) throw new Error("失敗を期待したが成功した");
  return result.error;
}

describe("resolveCropRect", () => {
  it("x を省略すると全幅で切り出す", () => {
    const rect = expectOk(resolveCropRect(IMAGE, { top: 4504, bottom: 6149 }));

    expect(rect).toEqual({ left: 0, top: 4504, width: 1690, height: 1645 });
  });

  it("x を指定すると横方向も絞れる", () => {
    const rect = expectOk(
      resolveCropRect(IMAGE, { top: 100, bottom: 200, left: 300, right: 900 }),
    );

    expect(rect).toEqual({ left: 300, top: 100, width: 600, height: 100 });
  });

  it("画像の下端を超える bottom は画像内へ収める", () => {
    const rect = expectOk(resolveCropRect(IMAGE, { top: 10000, bottom: 99999 }));

    expect(rect.top + rect.height).toBe(IMAGE.height);
  });

  it("bottom が top 以下なら失敗する", () => {
    expect(expectError(resolveCropRect(IMAGE, { top: 500, bottom: 500 })))
      .toContain("終了y座標");
  });

  it("top が画像の高さを超えたら失敗する", () => {
    expect(expectError(resolveCropRect(IMAGE, { top: 20000, bottom: 20100 })))
      .toContain("画像の高さ");
  });

  it("負の座標は失敗する", () => {
    expect(expectError(resolveCropRect(IMAGE, { top: -1, bottom: 100 })))
      .toContain("負の値");
  });

  it("right が画像の幅ぴったりなら成功する", () => {
    const rect = expectOk(
      resolveCropRect(IMAGE, { top: 100, bottom: 200, left: 0, right: IMAGE.width }),
    );

    expect(rect.width).toBe(IMAGE.width);
  });

  it("right が画像の幅を超えたら失敗する", () => {
    expect(
      expectError(
        resolveCropRect(IMAGE, { top: 100, bottom: 200, left: 0, right: IMAGE.width + 1 }),
      ),
    ).toContain("画像の幅");
  });
});

describe("planSlices", () => {
  it("省略時は画像全体を既定の刻みで分割する", () => {
    const slices = expectOk(planSlices({ width: 1690, height: 4000 }));

    expect(slices).toHaveLength(Math.ceil(4000 / DEFAULT_SLICE_STEP));
    expect(slices[0].top).toBe(0);
    expect(slices[0].height).toBe(DEFAULT_SLICE_STEP);
  });

  it("最後の1枚は範囲の終端で打ち切る", () => {
    const slices = expectOk(
      planSlices(IMAGE, { from: 2469, to: 5269, step: 1000 }),
    );

    expect(slices.map((slice) => [slice.top, slice.height])).toEqual([
      [2469, 1000],
      [3469, 1000],
      [4469, 800],
    ]);
  });

  it("スライスは範囲を隙間なく覆う", () => {
    const slices = expectOk(planSlices(IMAGE, { from: 1000, to: 5000, step: 700 }));

    expect(slices[0].top).toBe(1000);
    expect(slices.at(-1)!.top + slices.at(-1)!.height).toBe(5000);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].top).toBe(slices[i - 1].top + slices[i - 1].height);
    }
  });

  it("横方向は常に全幅", () => {
    const slices = expectOk(planSlices(IMAGE, { from: 0, to: 3000 }));

    for (const slice of slices) {
      expect(slice.left).toBe(0);
      expect(slice.width).toBe(IMAGE.width);
    }
  });

  it("上限を超える枚数になる場合は、必要な刻み高さを添えて失敗する", () => {
    const error = expectError(planSlices(IMAGE, { step: MIN_SLICE_STEP }));

    expect(error).toContain(`上限${MAX_SLICE_COUNT}枚`);
    // 提示された刻み高さなら通ること
    const suggested = Math.ceil(IMAGE.height / MAX_SLICE_COUNT);
    expect(expectOk(planSlices(IMAGE, { step: suggested })).length)
      .toBeLessThanOrEqual(MAX_SLICE_COUNT);
  });

  it("刻み高さが小さすぎる場合は失敗する", () => {
    expect(expectError(planSlices(IMAGE, { step: MIN_SLICE_STEP - 1 })))
      .toContain(`${MIN_SLICE_STEP}px以上`);
  });

  it("範囲が画像外なら失敗する", () => {
    expect(expectError(planSlices(IMAGE, { from: 99999 })))
      .toContain("画像の高さ");
  });
});
