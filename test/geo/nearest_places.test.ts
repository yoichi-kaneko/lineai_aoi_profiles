import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { layoutLocations } from "../../src/image/plot_locations";
import {
  NEAREST_RADIUS_KM,
  chooseCenter,
  selectNearestPlaces,
} from "../../src/geo/nearest_places";
import {
  MIN_SEPARATION_PX,
  type Entry,
  type Place,
  groupPlaces,
  haversineKm,
  parseEntriesJson,
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

describe("chooseCenter", () => {
  it("0件はエラーにする", () => {
    expect(() => chooseCenter([])).toThrow("1件もありません");
  });

  it("地点の多い地域にある実在の地点を中心にする（東京に多数・遠征先に少数）", () => {
    const places = loadPlaces("tokyo_many_far_few.json");
    expect(places[chooseCenter(places)].placeId).toMatch(/^tokyo-/);
  });

  it("地点の多い地域にある実在の地点を中心にする（東京に少数・遠征先に多数）", () => {
    const places = loadPlaces("tokyo_few_far_many.json");
    expect(places[chooseCenter(places)].placeId).toMatch(/^alps-/);
  });

  it("訪問回数ではなく異なる地点の数で密度を測る", () => {
    // 1地点へ10回より、近接する3地点へ1回ずつのほうを中心に選ぶ
    const places = groupPlaces([
      ...Array.from({ length: 10 }, () => ({ lat: 35.0, lng: 139.0, placeId: "often" })),
      { lat: 36.0, lng: 139.0, placeId: "a" },
      { lat: 36.001, lng: 139.0, placeId: "b" },
      { lat: 36.002, lng: 139.0, placeId: "c" },
    ]);
    expect(places[chooseCenter(places)].placeId).toBe("b");
  });

  it("密度が同じなら訪問回数の多い地点を中心にする", () => {
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0, placeId: "once" },
      { lat: 36.0, lng: 139.0, placeId: "twice" },
      { lat: 36.0, lng: 139.0, placeId: "twice" },
    ]);
    expect(places[chooseCenter(places)].placeId).toBe("twice");
  });
});

describe("selectNearestPlaces", () => {
  it("0件なら空の結果を返す", () => {
    expect(selectNearestPlaces([], 12)).toEqual({
      center: null,
      centerSource: "auto",
      groups: [],
      outsideRadius: 0,
      absorbed: 0,
      cut: 0,
    });
  });

  it("半径外の地点は、点数が上限に満たなくても加えない", () => {
    const places = loadPlaces("tokyo_few_far_many.json");
    const result = selectNearestPlaces(places, 12);
    expect(result.outsideRadius).toBe(3);
    for (const group of result.groups) {
      for (const member of group.members) {
        expect(haversineKm(result.center!, places[member])).toBeLessThanOrEqual(
          NEAREST_RADIUS_KM,
        );
      }
    }
  });

  it("半径内の候補が上限に満たなければ、その数だけ返す", () => {
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.05, lng: 139.05 },
      { lat: 35.1, lng: 139.0 },
      { lat: 38.0, lng: 141.0 },
    ]);
    const result = selectNearestPlaces(places, 12);
    expect(result.groups).toHaveLength(3);
    expect(result.outsideRadius).toBe(1);
  });

  it("中心から近い順に選び、上限を超えた地点は描かない", () => {
    const places = loadPlaces("rail_line.json");
    const result = selectNearestPlaces(places, 12);
    expect(result.groups).toHaveLength(12);
    expect(result.cut).toBeGreaterThan(0);
    const selected = new Set(result.groups.map((group) => group.representative));
    const selectedDistance = Math.max(
      ...[...selected].map((index) => haversineKm(result.center!, places[index])),
    );
    for (const place of places) {
      if (!result.groups.some((group) => group.members.includes(place.index))) {
        expect(haversineKm(result.center!, place)).toBeGreaterThanOrEqual(
          selectedDistance,
        );
      }
    }
  });

  it("選んだ点と重なる地点はその点に吸収し、描画後も点が重ならない", () => {
    const places = loadPlaces("tokyo_repeats.json");
    const result = selectNearestPlaces(places, 12);
    expect(result.absorbed).toBeGreaterThan(0);
    const pixels = layoutLocations(result.groups.map((group) => places[group.representative]));
    for (let i = 0; i < pixels.length; i++) {
      for (let j = i + 1; j < pixels.length; j++) {
        expect(
          Math.hypot(pixels[i].x - pixels[j].x, pixels[i].y - pixels[j].y),
        ).toBeGreaterThanOrEqual(MIN_SEPARATION_PX - EPSILON);
      }
    }
  });

  it.each([
    "tokyo_wide.json",
    "tokyo_many_far_few.json",
    "multi_regions.json",
    "single_outlier.json",
  ])("%s: 選択・吸収・上限超過・半径外の件数が地点数と一致する", (name) => {
    const places = loadPlaces(name);
    const result = selectNearestPlaces(places, 12);
    const members = result.groups.reduce((sum, group) => sum + group.members.length, 0);
    expect(members).toBe(result.groups.length + result.absorbed);
    expect(members + result.cut + result.outsideRadius).toBe(places.length);
    expect(result.groups.length).toBeLessThanOrEqual(12);
  });

  it("入力順を入れ替えても同じ結果になる", () => {
    const entries = loadEntries("tokyo_wide.json");
    expect(selectNearestPlaces(groupPlaces([...entries].reverse()), 12)).toEqual(
      selectNearestPlaces(groupPlaces(entries), 12),
    );
  });

  it("中心を省略すると、自動判定した実在の地点の座標を中心として返す", () => {
    const places = loadPlaces("tokyo_few_far_many.json");
    const result = selectNearestPlaces(places, 12);
    const centerPlace = places[chooseCenter(places)];
    expect(result.centerSource).toBe("auto");
    expect(result.center).toEqual({ lat: centerPlace.lat, lng: centerPlace.lng });
  });
});

describe("selectNearestPlaces（中心の指定）", () => {
  it("指定した座標を中心に、自動判定では範囲外になる地域の地点を選ぶ", () => {
    // 自動判定では遠征先（alps-）が中心になる分布で、東京の地点を中心に指定する
    const places = loadPlaces("tokyo_few_far_many.json");
    const tokyo = places.find((place) => place.placeId?.startsWith("tokyo-"))!;
    const result = selectNearestPlaces(places, 12, {
      center: { lat: tokyo.lat, lng: tokyo.lng },
    });
    expect(result.centerSource).toBe("specified");
    expect(result.center).toEqual({ lat: tokyo.lat, lng: tokyo.lng });
    expect(result.groups.length).toBeGreaterThan(0);
    for (const group of result.groups) {
      expect(places[group.representative].placeId).toMatch(/^tokyo-/);
    }
  });

  it("入力に無い座標も中心にでき、描く点はその近くの実在の地点から選ぶ", () => {
    const places = groupPlaces([
      { lat: 35.0, lng: 139.0, placeId: "near" },
      { lat: 35.1, lng: 139.0, placeId: "middle" },
      { lat: 35.2, lng: 139.0, placeId: "far" },
      { lat: 36.0, lng: 139.0, placeId: "outside" },
    ]);
    const result = selectNearestPlaces(places, 2, { center: { lat: 34.95, lng: 139.0 } });
    expect(result.groups.map((group) => places[group.representative].placeId)).toEqual([
      "near",
      "middle",
    ]);
    expect(result.cut).toBe(1);
    expect(result.outsideRadius).toBe(1);
  });

  it("指定した中心の半径内に地点が無ければ、0点で返す", () => {
    const places = loadPlaces("tokyo_wide.json");
    const result = selectNearestPlaces(places, 12, { center: { lat: 43.0, lng: 141.3 } });
    expect(result.groups).toEqual([]);
    expect(result.outsideRadius).toBe(places.length);
    expect(result.absorbed).toBe(0);
    expect(result.cut).toBe(0);
  });

  it("地点が0件でも、指定した中心をそのまま返す", () => {
    expect(selectNearestPlaces([], 12, { center: { lat: 35.0, lng: 139.0 } })).toMatchObject({
      center: { lat: 35.0, lng: 139.0 },
      centerSource: "specified",
      groups: [],
    });
  });
});
