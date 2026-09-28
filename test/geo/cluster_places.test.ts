import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { layoutLocations } from "../../src/image/plot_locations";
import { clusterPlaces } from "../../src/geo/cluster_places";
import {
  MIN_SEPARATION_PX,
  type Entry,
  type Place,
  type PlaceGroup,
  groupPlaces,
  parseEntriesJson,
  projectedDistance,
} from "../../src/geo/places";

/** このテストファイル（test/geo/）から2階層上がプロジェクトルート */
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** 架空の座標だけで作ったフィクスチャ（実在のチェックイン由来ではない） */
const FIXTURE_DIR = "test/fixtures/geo/select_locations";
/** 浮動小数点の誤差を許す幅（px） */
const EPSILON = 1e-6;

function loadEntries(name: string): Entry[] {
  return parseEntriesJson(readFileSync(path.join(PROJECT_ROOT, FIXTURE_DIR, name), "utf-8"))
    .entries;
}

function loadPlaces(name: string): Place[] {
  return groupPlaces(loadEntries(name));
}

/** 代表地点だけを plot_locations と同じ条件で描いたときの、最も近い2点の間隔（px） */
function minRenderedSpacing(places: Place[], groups: PlaceGroup[]): number {
  const pixels = layoutLocations(groups.map((group) => places[group.representative]));
  let min = Infinity;
  for (let i = 0; i < pixels.length; i++) {
    for (let j = i + 1; j < pixels.length; j++) {
      min = Math.min(min, Math.hypot(pixels[i].x - pixels[j].x, pixels[i].y - pixels[j].y));
    }
  }
  return min;
}

/** 全地点がちょうど1つの集合に属しているか */
function expectPartition(places: Place[], groups: PlaceGroup[]): void {
  const members = groups.flatMap((group) => group.members).sort((a, b) => a - b);
  expect(members).toEqual(places.map((place) => place.index));
  for (const group of groups) {
    expect(group.members).toContain(group.representative);
  }
}

describe("clusterPlaces", () => {
  it("0件なら空の配列を返す", () => {
    expect(clusterPlaces([], 12)).toEqual([]);
  });

  it("上限以下で重ならない地点は、そのまま1点ずつ残す", () => {
    const places = loadPlaces("bay_split.json");
    expect(places).toHaveLength(12);
    const groups = clusterPlaces(places, 12);
    expect(groups).toHaveLength(12);
    expect(groups.every((group) => group.members.length === 1)).toBe(true);
  });

  it("上限以下でも、描画後に重なる地点は統合する", () => {
    const places = loadPlaces("tokyo_repeats.json");
    expect(places.length).toBeLessThan(12);
    const groups = clusterPlaces(places, 12);
    expect(groups.length).toBeLessThan(places.length);
    expectPartition(places, groups);
    expect(minRenderedSpacing(places, groups)).toBeGreaterThanOrEqual(
      MIN_SEPARATION_PX - EPSILON,
    );
  });

  it.each([
    "tokyo_wide.json",
    "tokyo_many_far_few.json",
    "tokyo_few_far_many.json",
    "multi_regions.json",
    "rail_line.json",
    "single_outlier.json",
  ])("%s: 上限以下の点へ集約し、全地点を割り当て、描画後も点が重ならない", (name) => {
    const places = loadPlaces(name);
    const groups = clusterPlaces(places, 12);
    expect(groups.length).toBeLessThanOrEqual(12);
    expectPartition(places, groups);
    expect(minRenderedSpacing(places, groups)).toBeGreaterThanOrEqual(
      MIN_SEPARATION_PX - EPSILON,
    );
  });

  it("上限を1にすれば全地点を1点にまとめる", () => {
    const places = loadPlaces("multi_regions.json");
    const groups = clusterPlaces(places, 1);
    expect(groups).toHaveLength(1);
    expectPartition(places, groups);
  });

  it("代表は重心に最も近い実在の地点で、重心（湾の上など）そのものにはしない", () => {
    // 湾を挟んだ2地域を1点へまとめると、重心は湾の上に来る
    const places = loadPlaces("bay_split.json");
    const [group] = clusterPlaces(places, 1);
    const centroid = {
      x: places.reduce((sum, place) => sum + place.x, 0) / places.length,
      y: places.reduce((sum, place) => sum + place.y, 0) / places.length,
    };
    const nearestToCentroid = [...places].sort(
      (a, b) => projectedDistance(a, centroid) - projectedDistance(b, centroid),
    )[0];
    expect(group.representative).toBe(nearestToCentroid.index);
    expect(projectedDistance(places[group.representative], centroid)).toBeGreaterThan(0);
  });

  it("移動経路に沿った地点が1つの巨大な集合へ連鎖しない", () => {
    // 約2km間隔の26駅を12点へまとめる。単連結のように端から連鎖すると偏った集合ができる
    const places = loadPlaces("rail_line.json");
    const groups = clusterPlaces(places, 12);
    expect(groups).toHaveLength(12);
    expect(Math.max(...groups.map((group) => group.members.length))).toBeLessThanOrEqual(4);
  });

  it("全地点が同じ座標なら1点にまとめる", () => {
    const places = groupPlaces(
      Array.from({ length: 5 }, (_, i) => ({ lat: 35.68, lng: 139.76, placeId: `p${i}` })),
    );
    expect(places).toHaveLength(5);
    expect(clusterPlaces(places, 12)).toHaveLength(1);
  });

  it("入力順を入れ替えても同じ結果になる", () => {
    const entries = loadEntries("tokyo_wide.json");
    expect(clusterPlaces(groupPlaces([...entries].reverse()), 12)).toEqual(
      clusterPlaces(groupPlaces(entries), 12),
    );
  });
});
