import { describe, expect, it } from "vitest";
import {
  ADOPT_MARGIN,
  REPRESENT_TOLERANCE_PX,
  type SelectionMetrics,
  chooseMethod,
  evaluateSelection,
} from "../../src/geo/evaluate_selection";
import { type PlaceGroup, groupPlaces } from "../../src/geo/places";

function metrics(score: number): SelectionMetrics {
  return {
    pointCount: 1,
    represented: score,
    detail: 1,
    legibility: 1,
    minSpacingPx: null,
    score,
  };
}

function single(indices: number[]): PlaceGroup[] {
  return indices.map((index) => ({ representative: index, members: [index] }));
}

describe("evaluateSelection", () => {
  it("点が無ければ評価値0を返す", () => {
    const places = groupPlaces([{ lat: 35, lng: 139 }]);
    expect(evaluateSelection(places, [], 12)).toEqual({
      pointCount: 0,
      represented: 0,
      detail: 0,
      legibility: 0,
      minSpacingPx: null,
      score: 0,
    });
  });

  it("全地点を重ならずに描けば評価値1になる", () => {
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.1, lng: 139.1 },
      { lat: 35.2, lng: 139.0 },
    ]);
    const result = evaluateSelection(places, single([0, 1, 2]), 12);
    expect(result).toMatchObject({ pointCount: 3, represented: 1, detail: 1, legibility: 1, score: 1 });
    expect(result.minSpacingPx).toBeGreaterThan(REPRESENT_TOLERANCE_PX);
  });

  it("1点だけなら点の間隔は null になる", () => {
    const places = groupPlaces([{ lat: 35, lng: 139 }]);
    expect(evaluateSelection(places, single([0]), 12).minSpacingPx).toBeNull();
  });

  it("描いた点の近くに無い地点は、代表できていないものとして数える", () => {
    // 3地点のうち2点だけを描く。描かない1点は描画範囲の外（遠方）にある
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.05, lng: 139.05 },
      { lat: 38.0, lng: 141.0 },
    ]);
    const result = evaluateSelection(places, single([0, 1]), 12);
    expect(result.represented).toBeCloseTo(2 / 3);
    expect(result.detail).toBeCloseTo(2 / 3);
    expect(result.score).toBeCloseTo((2 / 3) * Math.sqrt(2 / 3));
  });

  it("集約先ではなく、描画後の最寄りの点までの距離で判定する", () => {
    // 描いた点のすぐ隣の地点は、どの点へ割り当てたかに関わらず代表できているとみなす
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.00001, lng: 139.0 },
      { lat: 35.2, lng: 139.2 },
    ]);
    const groups: PlaceGroup[] = [
      { representative: 0, members: [0] },
      { representative: 2, members: [1, 2] },
    ];
    expect(evaluateSelection(places, groups, 12).represented).toBe(1);
  });

  it("細かさは、上限と地点数の小さいほうに対する点の数で測る", () => {
    const places = groupPlaces(
      Array.from({ length: 20 }, (_, i) => ({ lat: 35 + i * 0.01, lng: 139 })),
    );
    expect(evaluateSelection(places, single([0, 5, 10, 15, 19]), 10).detail).toBeCloseTo(0.5);
  });

  it("重なって描かれる点があれば見やすさを下げる", () => {
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.00001, lng: 139.0 },
      { lat: 35.2, lng: 139.2 },
    ]);
    const result = evaluateSelection(places, single([0, 1, 2]), 12);
    expect(result.legibility).toBeCloseTo(1 / 3);
    expect(result.score).toBeCloseTo(1 / 3);
  });
});

describe("chooseMethod", () => {
  it("② が ③ を ADOPT_MARGIN 以上上回れば ② を採る", () => {
    expect(chooseMethod(metrics(0.5), metrics(0.5 + ADOPT_MARGIN))).toBe("nearest");
  });

  it("差が ADOPT_MARGIN 未満なら第一候補の ③ を採る", () => {
    expect(chooseMethod(metrics(0.5), metrics(0.5 + ADOPT_MARGIN / 2))).toBe("cluster");
    expect(chooseMethod(metrics(0.5), metrics(0.5))).toBe("cluster");
    expect(chooseMethod(metrics(0.8), metrics(0.5))).toBe("cluster");
  });
});
