import { describe, expect, it } from "vitest";
import { MAX_LATITUDE, computeFit } from "../../src/image/plot_locations";
import {
  MAX_ENTRIES,
  MIN_SEPARATION_PX,
  groupPlaces,
  haversineKm,
  minSeparationFor,
  parseEntries,
  parseEntriesJson,
} from "../../src/geo/places";

describe("parseEntries", () => {
  it("{ lat, lng, placeId? } の配列を受け付け、その他のプロパティは捨てる", () => {
    expect(
      parseEntries([
        { lat: 35.0, lng: 139.0, placeId: "fixture-01", name: "架空の地点" },
        { lat: 35.1, lng: 139.2 },
      ]),
    ).toEqual({
      entries: [
        { lat: 35.0, lng: 139.0, placeId: "fixture-01" },
        { lat: 35.1, lng: 139.2 },
      ],
      invalidCount: 0,
    });
  });

  it("0件の配列はエラーにせず、空の結果を返す", () => {
    expect(parseEntries([])).toEqual({ entries: [], invalidCount: 0 });
  });

  it(`上限の${MAX_ENTRIES}件までは受け付ける`, () => {
    const entries = Array.from({ length: MAX_ENTRIES }, () => ({ lat: 35, lng: 139 }));
    expect(parseEntries(entries).entries).toHaveLength(MAX_ENTRIES);
  });

  it("範囲の端（経度±180・Webメルカトルの緯度上限）は受け付ける", () => {
    expect(parseEntries([{ lat: MAX_LATITUDE, lng: 180 }]).invalidCount).toBe(0);
    expect(parseEntries([{ lat: -MAX_LATITUDE, lng: -180 }]).invalidCount).toBe(0);
  });

  it.each([
    ["要素が null", null],
    ["要素が配列", [35, 139]],
    ["lat の欠落", { lng: 139 }],
    ["lng の欠落", { lat: 35 }],
    ["文字列の lat", { lat: "35.0", lng: 139 }],
    ["NaN の lat", { lat: NaN, lng: 139 }],
    ["非有限の lng", { lat: 35, lng: Infinity }],
    ["経度が範囲外", { lat: 35, lng: 180.5 }],
    ["緯度が Webメルカトルの範囲外", { lat: 85.1, lng: 139 }],
    ["数値の placeId", { lat: 35, lng: 139, placeId: 12 }],
    ["空文字の placeId", { lat: 35, lng: 139, placeId: "" }],
  ])("%s は除外し、件数だけを数える", (_label, item) => {
    expect(parseEntries([{ lat: 35.5, lng: 139.5 }, item])).toEqual({
      entries: [{ lat: 35.5, lng: 139.5 }],
      invalidCount: 1,
    });
  });

  it("配列でなければエラーにする", () => {
    expect(() => parseEntries({ lat: 35, lng: 139 })).toThrow("配列にしてください");
  });

  it(`${MAX_ENTRIES + 1}件以上はエラーにする`, () => {
    const entries = Array.from({ length: MAX_ENTRIES + 1 }, () => ({ lat: 35, lng: 139 }));
    expect(() => parseEntries(entries)).toThrow(`最大${MAX_ENTRIES}件`);
  });

  it("日付変更線をまたぐ（経度の幅が180度超）入力はエラーにする", () => {
    expect(() =>
      parseEntries([
        { lat: 0, lng: 179 },
        { lat: 0, lng: -179 },
      ]),
    ).toThrow("日付変更線");
  });

  it("除外した要素は経度の幅の判定に含めない", () => {
    expect(
      parseEntries([
        { lat: 0, lng: 179 },
        { lat: "0", lng: -179 },
      ]).invalidCount,
    ).toBe(1);
  });
});

describe("parseEntriesJson", () => {
  it("JSON を解釈して検証済みの入力を返す", () => {
    expect(parseEntriesJson('[{ "lat": 35.5, "lng": 139.5 }]').entries).toEqual([
      { lat: 35.5, lng: 139.5 },
    ]);
  });

  it("JSON として壊れていれば、入力の断片（座標）を含めずにエラーにする", () => {
    let message = "";
    try {
      parseEntriesJson('[{ "lat": 35.123456, "lng": 139.654321 ');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("入力ファイルを JSON として解釈できません");
  });
});

describe("groupPlaces", () => {
  it("同じ placeId の入力を1地点にまとめ、件数を visits に数える", () => {
    const places = groupPlaces([
      { lat: 35.1, lng: 139.1, placeId: "a" },
      { lat: 35.2, lng: 139.2, placeId: "b" },
      { lat: 35.1, lng: 139.1, placeId: "a" },
    ]);
    expect(places.map(({ placeId, visits }) => ({ placeId, visits }))).toEqual([
      { placeId: "a", visits: 2 },
      { placeId: "b", visits: 1 },
    ]);
  });

  it("placeId が無ければ、緯度経度が完全に一致する入力を1地点にまとめる", () => {
    const places = groupPlaces([
      { lat: 35.1, lng: 139.1 },
      { lat: 35.1, lng: 139.1 },
      { lat: 35.1, lng: 139.1001 },
    ]);
    expect(places.map(({ lng, visits }) => ({ lng, visits }))).toEqual([
      { lng: 139.1, visits: 2 },
      { lng: 139.1001, visits: 1 },
    ]);
  });

  it("座標が同じでも placeId が異なれば別の地点として扱う", () => {
    expect(
      groupPlaces([
        { lat: 35.1, lng: 139.1, placeId: "a" },
        { lat: 35.1, lng: 139.1, placeId: "b" },
        { lat: 35.1, lng: 139.1 },
      ]),
    ).toHaveLength(3);
  });

  it("同じ placeId で座標が食い違えば、最も多い座標を使う", () => {
    const [place] = groupPlaces([
      { lat: 35.2, lng: 139.2, placeId: "a" },
      { lat: 35.1, lng: 139.1, placeId: "a" },
      { lat: 35.2, lng: 139.2, placeId: "a" },
    ]);
    expect(place).toMatchObject({ lat: 35.2, lng: 139.2, visits: 3 });
  });

  it("緯度・経度の順に並べて通し番号を振り、投影面の座標を持たせる", () => {
    const places = groupPlaces([
      { lat: 35.3, lng: 139.0 },
      { lat: 35.1, lng: 139.5 },
      { lat: 35.1, lng: 139.2 },
    ]);
    expect(places.map(({ index, lat, lng }) => ({ index, lat, lng }))).toEqual([
      { index: 0, lat: 35.1, lng: 139.2 },
      { index: 1, lat: 35.1, lng: 139.5 },
      { index: 2, lat: 35.3, lng: 139.0 },
    ]);
    expect(places[1].x).toBeGreaterThan(places[0].x);
    expect(places[2].y).toBeGreaterThan(places[0].y);
  });

  it("入力順を入れ替えても同じ結果になる", () => {
    const entries = [
      { lat: 35.2, lng: 139.2, placeId: "a" },
      { lat: 35.1, lng: 139.1 },
      { lat: 35.2, lng: 139.2, placeId: "a" },
      { lat: 35.3, lng: 139.3, placeId: "b" },
      { lat: 35.1, lng: 139.1 },
    ];
    expect(groupPlaces([...entries].reverse())).toEqual(groupPlaces(entries));
  });
});

describe("haversineKm", () => {
  it("同じ地点なら0になる", () => {
    expect(haversineKm({ lat: 35.68, lng: 139.76 }, { lat: 35.68, lng: 139.76 })).toBe(0);
  });

  it("緯度1度はおよそ111km になる", () => {
    expect(haversineKm({ lat: 35, lng: 139 }, { lat: 36, lng: 139 })).toBeCloseTo(111.2, 0);
  });
});

describe("minSeparationFor", () => {
  it("自動フィットの倍率で MIN_SEPARATION_PX を投影面の距離へ換算する", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20000, y: 5000 },
    ];
    expect(minSeparationFor(points)).toBeCloseTo(MIN_SEPARATION_PX / computeFit(points).scale);
  });
});
