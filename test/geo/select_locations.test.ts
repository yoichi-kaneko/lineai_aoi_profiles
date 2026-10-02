import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MAX_LOCATIONS, validateLocations } from "../../src/image/plot_locations";
import { type Entry, parseEntries, parseEntriesJson } from "../../src/geo/places";
import {
  DEFAULT_MAX_POINTS,
  parseArgs,
  parseCenter,
  selectLocations,
} from "../../src/geo/select_locations";

/** このテストファイル（test/geo/）から2階層上がプロジェクトルート */
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** 架空の座標だけで作ったフィクスチャ（実在のチェックイン由来ではない） */
const FIXTURE_DIR = "test/fixtures/geo/select_locations";
const AUTO = { maxPoints: DEFAULT_MAX_POINTS, method: "auto" } as const;

function loadFixture(name: string) {
  return parseEntriesJson(readFileSync(path.join(PROJECT_ROOT, FIXTURE_DIR, name), "utf-8"));
}

/** シード固定の擬似乱数（mulberry32） */
function seededRandom(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("selectLocations", () => {
  it.each([
    ["tokyo_wide.json", "cluster"],
    ["tokyo_repeats.json", "cluster"],
    ["tokyo_many_far_few.json", "cluster"],
    ["tokyo_few_far_many.json", "cluster"],
    ["multi_regions.json", "cluster"],
    ["rail_line.json", "cluster"],
    ["bay_split.json", "cluster"],
    ["single_outlier.json", "nearest"],
  ])("%s では %s を採用する", (name, method) => {
    const result = selectLocations(loadFixture(name), AUTO);
    expect(result.summary.method).toBe(method);
    expect(result.summary.pointCount).toBe(result.points.length);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.length).toBeLessThanOrEqual(MAX_LOCATIONS);
  });

  it("単独の遠方点で都内が1点に潰れる週は、評価の差が開いて ② を採る", () => {
    const { summary } = selectLocations(loadFixture("single_outlier.json"), AUTO);
    expect(summary.cluster?.pointCount).toBe(2);
    expect(summary.nearest?.pointCount).toBe(12);
    expect(summary.nearest?.outsideRadius).toBe(1);
    expect(summary.reason).toContain("②を採用");
  });

  it("出力する点はすべて入力にある実在の地点で、plot_locations へそのまま渡せる", () => {
    for (const name of ["multi_regions.json", "single_outlier.json", "bay_split.json"]) {
      const parsed = loadFixture(name);
      const { points } = selectLocations(parsed, AUTO);
      for (const point of points) {
        expect(
          parsed.entries.some((entry) => entry.lat === point.lat && entry.lng === point.lng),
        ).toBe(true);
      }
      expect(validateLocations(points)).toHaveLength(points.length);
    }
  });

  it("③ では全地点・全入力をいずれかの点に対応づける", () => {
    const parsed = loadFixture("tokyo_many_far_few.json");
    const result = selectLocations(parsed, { ...AUTO, method: "cluster" });
    expect(result.points.reduce((sum, point) => sum + point.places, 0)).toBe(
      result.summary.input.places,
    );
    expect(result.points.reduce((sum, point) => sum + point.visits, 0)).toBe(
      parsed.entries.length,
    );
    expect(result.summary.cluster?.merged).toBe(
      result.summary.input.places - result.points.length,
    );
  });

  it("同じ施設への反復は visits に、まとめた地点の数は places に残す", () => {
    const { points } = selectLocations(
      parseEntries([
        { lat: 35.0, lng: 139.0, placeId: "a" },
        { lat: 35.0, lng: 139.0, placeId: "a" },
        { lat: 35.0, lng: 139.0, placeId: "a" },
        { lat: 36.0, lng: 139.0, placeId: "b" },
      ]),
      AUTO,
    );
    expect(points).toEqual([
      { lat: 35.0, lng: 139.0, placeId: "a", places: 1, visits: 3 },
      { lat: 36.0, lng: 139.0, placeId: "b", places: 1, visits: 1 },
    ]);
  });

  it("--method の指定があれば評価によらずその方式を採る", () => {
    const parsed = loadFixture("single_outlier.json");
    const cluster = selectLocations(parsed, { ...AUTO, method: "cluster" });
    expect(cluster.summary.method).toBe("cluster");
    expect(cluster.points).toHaveLength(2);
    expect(cluster.summary.reason).toContain("--method cluster");
    const nearest = selectLocations(loadFixture("rail_line.json"), { ...AUTO, method: "nearest" });
    expect(nearest.summary.method).toBe("nearest");
  });

  it("点の上限を指定できる", () => {
    const result = selectLocations(loadFixture("tokyo_wide.json"), { ...AUTO, maxPoints: 5 });
    expect(result.points.length).toBeLessThanOrEqual(5);
    expect(result.summary.cluster?.pointCount).toBeLessThanOrEqual(5);
    expect(result.summary.nearest?.pointCount).toBeLessThanOrEqual(5);
  });

  it("有効な地点が無ければ、点を返さず method を none にする", () => {
    for (const parsed of [parseEntries([]), parseEntries([{ lat: "35", lng: 139 }, null])]) {
      const result = selectLocations(parsed, AUTO);
      expect(result.points).toEqual([]);
      expect(result.summary).toMatchObject({
        method: "none",
        pointCount: 0,
        cluster: null,
        nearest: null,
      });
    }
  });

  it("1地点だけなら、その地点を1点で返す", () => {
    const result = selectLocations(parseEntries([{ lat: 35.68, lng: 139.76 }]), AUTO);
    expect(result.points).toEqual([{ lat: 35.68, lng: 139.76, places: 1, visits: 1 }]);
    expect(result.summary.method).toBe("cluster");
  });

  it("不正な要素を除外した件数を要約に残す", () => {
    const { summary } = selectLocations(loadFixture("invalid_entries.json"), AUTO);
    expect(summary.input).toEqual({ entries: 8, invalid: 5, places: 3 });
    expect(summary.pointCount).toBe(3);
  });

  it("要約には座標も placeId も含めない", () => {
    const parsed = loadFixture("tokyo_many_far_few.json");
    const text = JSON.stringify(selectLocations(parsed, AUTO).summary);
    for (const entry of parsed.entries) {
      expect(text).not.toContain(String(entry.lat));
      expect(text).not.toContain(String(entry.lng));
      if (entry.placeId) {
        expect(text).not.toContain(entry.placeId);
      }
    }
  });

  it("入力順を入れ替えても、選ぶ点と要約は変わらない", () => {
    const parsed = loadFixture("multi_regions.json");
    const random = seededRandom(42);
    const shuffled: Entry[] = [...parsed.entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    expect(selectLocations({ ...parsed, entries: shuffled }, AUTO)).toEqual(
      selectLocations(parsed, AUTO),
    );
  });

  it("--center を指定すると、② はその座標を中心に選ぶ", () => {
    // 自動判定では遠征先が中心になる分布で、東京の地点を中心に指定する
    const parsed = loadFixture("tokyo_few_far_many.json");
    const tokyo = parsed.entries.find((entry) => entry.placeId?.startsWith("tokyo-"))!;
    const result = selectLocations(parsed, {
      ...AUTO,
      method: "nearest",
      center: { lat: tokyo.lat, lng: tokyo.lng },
    });
    expect(result.summary.nearest?.centerSource).toBe("specified");
    expect(result.points.length).toBeGreaterThan(0);
    for (const point of result.points) {
      expect(point.placeId).toMatch(/^tokyo-/);
    }
    expect(selectLocations(parsed, AUTO).summary.nearest?.centerSource).toBe("auto");
  });

  it("--center の半径内に地点が無く --method nearest なら、点を返さず理由を残す", () => {
    const result = selectLocations(loadFixture("tokyo_wide.json"), {
      ...AUTO,
      method: "nearest",
      center: { lat: 43.0, lng: 141.3 },
    });
    expect(result.points).toEqual([]);
    expect(result.summary.method).toBe("nearest");
    expect(result.summary.pointCount).toBe(0);
    expect(result.summary.reason).toContain("描ける点はありません");
  });

  it("--center の半径内に地点が無い場合、auto では ③ を採る", () => {
    const result = selectLocations(loadFixture("tokyo_wide.json"), {
      ...AUTO,
      center: { lat: 43.0, lng: 141.3 },
    });
    expect(result.summary.method).toBe("cluster");
    expect(result.summary.nearest?.pointCount).toBe(0);
    expect(result.points.length).toBeGreaterThan(0);
  });

  it("要約には --center の座標も含めない", () => {
    const center = { lat: 35.123456, lng: 139.654321 };
    const text = JSON.stringify(
      selectLocations(loadFixture("tokyo_wide.json"), { ...AUTO, center }).summary,
    );
    expect(text).not.toContain(String(center.lat));
    expect(text).not.toContain(String(center.lng));
  });

  it("上限の1000件（すべて別の地点）でも上限以下の点を選べる", () => {
    const random = seededRandom(1000);
    const entries = Array.from({ length: 1000 }, () => ({
      lat: 35.55 + random() * 0.25,
      lng: 139.55 + random() * 0.35,
    }));
    const result = selectLocations(parseEntries(entries), AUTO);
    expect(result.summary.input.places).toBe(1000);
    expect(result.points.length).toBeLessThanOrEqual(MAX_LOCATIONS);
  });
});

describe("parseArgs", () => {
  it("入力 JSON と出力 JSON の位置引数2つを受け取り、既定は auto・上限12点", () => {
    expect(parseArgs(["tmp/in.json", "tmp/out.json"])).toEqual({
      inputPath: "tmp/in.json",
      outputPath: "tmp/out.json",
      method: "auto",
      maxPoints: DEFAULT_MAX_POINTS,
    });
  });

  it("--method と --max-points を、空白区切りと = のどちらでも受け付ける", () => {
    expect(
      parseArgs(["--method", "nearest", "tmp/in.json", "tmp/out.JSON", "--max-points=8"]),
    ).toMatchObject({ method: "nearest", maxPoints: 8, outputPath: "tmp/out.JSON" });
    expect(parseArgs(["tmp/in.json", "tmp/out.json", "--method=cluster"]).method).toBe(
      "cluster",
    );
  });

  it("--center を「緯度,経度」で受け付ける（空白区切り・= の両方、負の値も可）", () => {
    expect(parseArgs(["tmp/in.json", "tmp/out.json", "--center", "35.6586,139.7454"])).toEqual({
      inputPath: "tmp/in.json",
      outputPath: "tmp/out.json",
      method: "auto",
      maxPoints: DEFAULT_MAX_POINTS,
      center: { lat: 35.6586, lng: 139.7454 },
    });
    expect(parseArgs(["tmp/in.json", "tmp/out.json", "--center=-33.85, 151.2"]).center).toEqual({
      lat: -33.85,
      lng: 151.2,
    });
  });

  it.each([
    [["tmp/in.json"], "パスを指定してください"],
    [["tmp/in.json", "tmp/out.json", "extra"], "引数が多すぎます"],
    [["tmp/in.json", "tmp/out.png"], ".json で指定してください"],
    [["tmp/in.json", "tmp/out.json", "--method", "random"], "--method は"],
    [["tmp/in.json", "tmp/out.json", "--method"], "--method の値を指定してください"],
    [["tmp/in.json", "tmp/out.json", "--max-points", "0"], "--max-points は 1〜12"],
    [["tmp/in.json", "tmp/out.json", "--max-points", "13"], "--max-points は 1〜12"],
    [["tmp/in.json", "tmp/out.json", "--max-points", "2.5"], "--max-points は 1〜12"],
    [["tmp/in.json", "tmp/out.json", "--radius", "10"], "不明なオプションです"],
    [["tmp/in.json", "tmp/out.json", "--center"], "--center の値を指定してください"],
    [["tmp/in.json", "tmp/out.json", "--center", "35.6"], "--center は「緯度,経度」"],
  ])("%j はエラーにする", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it("不明なオプションの = 付き指定では、エラー文に値を含めない", () => {
    const argv = ["tmp/in.json", "tmp/out.json", "--centre=35.6,139.7"];
    expect(() => parseArgs(argv)).toThrow("不明なオプションです: --centre");
    try {
      parseArgs(argv);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("35.6");
      expect(message).not.toContain("139.7");
      expect(message).not.toContain("=");
    }
  });
});

describe("parseCenter", () => {
  it.each([
    ["35.6586,139.7454", { lat: 35.6586, lng: 139.7454 }],
    [" 35 , 139 ", { lat: 35, lng: 139 }],
    ["+35.,-.5", { lat: 35, lng: -0.5 }],
    ["85.05112878,180", { lat: 85.05112878, lng: 180 }],
  ])("%j を解釈する", (value, expected) => {
    expect(parseCenter(value)).toEqual(expected);
  });

  it.each([
    "35.6",
    "35.6,139.7,10",
    ",139.7",
    "35.6,",
    "abc,139.7",
    "1e1,139.7",
    "0x10,139.7",
    "Infinity,139.7",
    "85.1,139.7",
    "35.6,180.1",
  ])("%j はエラーにし、エラー文に値を含めない", (value) => {
    expect(() => parseCenter(value)).toThrow("--center は「緯度,経度」");
    try {
      parseCenter(value);
    } catch (error) {
      expect((error as Error).message).not.toContain(value);
    }
  });
});
