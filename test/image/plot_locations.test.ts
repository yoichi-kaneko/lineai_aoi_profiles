import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import {
  CANVAS_SIZE,
  DOT_RADIUS,
  MAX_LATITUDE,
  MAX_LOCATIONS,
  MIN_PROJECTED_SPAN,
  PADDING,
  type Location,
  buildPlotSvg,
  computeFit,
  layoutLocations,
  parseArgs,
  parseLocationsJson,
  projectWebMercator,
  renderLocationPlot,
  resolveInputPath,
  resolveOutputPath,
  validateLocations,
} from "../../src/image/plot_locations";

/** このテストファイル（test/image/）から2階層上がプロジェクトルート */
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** 架空の座標だけで作ったフィクスチャ（実在のチェックイン由来ではない） */
const FIXTURE_DIR = "test/fixtures/image/plot_locations";

const CENTER = CANVAS_SIZE / 2;
const USABLE_SIZE = CANVAS_SIZE - 2 * PADDING;
/** 浮動小数点の誤差を許す幅（px） */
const EPSILON = 1e-6;

function loadFixture(name: string): Location[] {
  return parseLocationsJson(
    readFileSync(path.join(PROJECT_ROOT, FIXTURE_DIR, name), "utf-8"),
  );
}

function expectInsideMargin(pixels: { x: number; y: number }[]): void {
  for (const pixel of pixels) {
    expect(pixel.x).toBeGreaterThanOrEqual(PADDING - EPSILON);
    expect(pixel.x).toBeLessThanOrEqual(CANVAS_SIZE - PADDING + EPSILON);
    expect(pixel.y).toBeGreaterThanOrEqual(PADDING - EPSILON);
    expect(pixel.y).toBeLessThanOrEqual(CANVAS_SIZE - PADDING + EPSILON);
  }
}

describe("validateLocations", () => {
  it("{ lat, lng } の配列を受け付け、余分なプロパティは捨てる", () => {
    expect(
      validateLocations([
        { lat: 35.0, lng: 139.0, name: "架空の地点" },
        { lat: 35.1, lng: 139.2 },
      ]),
    ).toEqual([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.1, lng: 139.2 },
    ]);
  });

  it(`上限の${MAX_LOCATIONS}件までは受け付ける`, () => {
    const locations = Array.from({ length: MAX_LOCATIONS }, (_, i) => ({
      lat: 35 + i * 0.01,
      lng: 139 + i * 0.01,
    }));
    expect(validateLocations(locations)).toHaveLength(MAX_LOCATIONS);
  });

  it("範囲の端（経度±180・Webメルカトルの緯度上限）は受け付ける", () => {
    expect(() => validateLocations([{ lat: MAX_LATITUDE, lng: 180 }])).not.toThrow();
    expect(() => validateLocations([{ lat: -MAX_LATITUDE, lng: -180 }])).not.toThrow();
  });

  it.each([
    ["配列でない", { lat: 35, lng: 139 }, "配列にしてください"],
    ["0件", [], "1件もありません"],
    [
      `${MAX_LOCATIONS + 1}件以上`,
      Array.from({ length: MAX_LOCATIONS + 1 }, () => ({ lat: 35, lng: 139 })),
      `最大${MAX_LOCATIONS}件`,
    ],
    ["要素がオブジェクトでない", [[35, 139]], "1件目が { lat, lng } の形式ではありません"],
    ["要素が null", [null], "1件目が { lat, lng } の形式ではありません"],
    ["lat の欠落", [{ lng: 139 }], "1件目の lat がありません"],
    ["lng の欠落", [{ lat: 35 }], "1件目の lng がありません"],
    ["数値以外の lat", [{ lat: "35.0", lng: 139 }], "1件目の lat が数値ではありません"],
    ["非有限の lng", [{ lat: 35, lng: Infinity }], "1件目の lng が有限の数値ではありません"],
    ["NaN の lat", [{ lat: NaN, lng: 139 }], "1件目の lat が有限の数値ではありません"],
    ["経度が範囲外", [{ lat: 35, lng: 180.5 }], "1件目の lng が -180〜180 の範囲外です"],
    ["緯度が Webメルカトルの範囲外", [{ lat: 85.1, lng: 139 }], "1件目の lat が Webメルカトル"],
    [
      "日付変更線をまたぐ（経度の幅が180度超）",
      [
        { lat: 0, lng: 179 },
        { lat: 0, lng: -179 },
      ],
      "日付変更線",
    ],
  ])("%s ならエラーにする", (_label, input, message) => {
    expect(() => validateLocations(input)).toThrow(message);
  });

  it("何件目で失敗したかを示す", () => {
    expect(() =>
      validateLocations([
        { lat: 35, lng: 139 },
        { lat: 35, lng: 139 },
        { lat: 35, lng: "139" },
      ]),
    ).toThrow("3件目の lng が数値ではありません");
  });

  it("エラー文に座標の値を含めない", () => {
    expect(() =>
      validateLocations([
        { lat: 35.123456, lng: 139.654321 },
        { lat: 89.987654, lng: 139.654321 },
      ]),
    ).toThrow(/^(?!.*(35\.123456|139\.654321|89\.987654)).*$/);
  });
});

describe("parseLocationsJson", () => {
  it("JSON を解釈して検証済みの配列を返す", () => {
    expect(parseLocationsJson('[{ "lat": 35.0, "lng": 139.0 }]')).toEqual([
      { lat: 35.0, lng: 139.0 },
    ]);
  });

  it("JSON として壊れていれば、入力の断片（座標）を含めずにエラーにする", () => {
    let message = "";
    try {
      parseLocationsJson('[{ "lat": 35.123456, "lng": 139.654321 ');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("入力ファイルを JSON として解釈できません");
  });
});

describe("projectWebMercator", () => {
  it("原点（緯度0・経度0）は投影面の原点になる", () => {
    // tan(π/4) が厳密に1にならないため、Y には 1e-9m 程度の誤差が乗る
    const point = projectWebMercator({ lat: 0, lng: 0 });
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("経度180度は X = πR になる", () => {
    expect(projectWebMercator({ lat: 0, lng: 180 }).x).toBeCloseTo(Math.PI * 6378137, 3);
  });

  it("東ほど X が、北ほど Y が大きく、赤道を挟んで対称になる", () => {
    const north = projectWebMercator({ lat: 35, lng: 139 });
    const south = projectWebMercator({ lat: -35, lng: 139 });
    const east = projectWebMercator({ lat: 35, lng: 140 });
    expect(east.x).toBeGreaterThan(north.x);
    expect(north.y).toBeGreaterThan(0);
    expect(south.y).toBeCloseTo(-north.y, 6);
  });
});

describe("computeFit", () => {
  it("1点なら、その点を中心に最小投影範囲で倍率を決める", () => {
    const fit = computeFit([{ x: 100, y: 200 }]);
    expect(fit).toEqual({
      centerX: 100,
      centerY: 200,
      scale: USABLE_SIZE / MIN_PROJECTED_SPAN,
    });
  });

  it("縦横のうち長いほうの幅で倍率を決める", () => {
    const fit = computeFit([
      { x: 0, y: 0 },
      { x: 20000, y: 5000 },
    ]);
    expect(fit.centerX).toBe(10000);
    expect(fit.centerY).toBe(2500);
    expect(fit.scale).toBeCloseTo(USABLE_SIZE / 20000, 12);
  });

  it("0件は拒否する", () => {
    expect(() => computeFit([])).toThrow();
  });
});

describe("layoutLocations", () => {
  it("1点なら画像の中央に置く", () => {
    const [pixel] = layoutLocations([{ lat: 35.0, lng: 139.0 }]);
    expect(pixel.x).toBeCloseTo(CENTER, 9);
    expect(pixel.y).toBeCloseTo(CENTER, 9);
  });

  it("全点が同一座標なら、ずらさずに中央へ重ねる", () => {
    const pixels = layoutLocations([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.0, lng: 139.0 },
      { lat: 35.0, lng: 139.0 },
    ]);
    for (const pixel of pixels) {
      expect(pixel.x).toBeCloseTo(CENTER, 9);
      expect(pixel.y).toBeCloseTo(CENTER, 9);
    }
  });

  it("北を上、東を右に置く", () => {
    const [southWest, northEast] = layoutLocations([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.1, lng: 139.2 },
    ]);
    expect(northEast.x).toBeGreaterThan(southWest.x);
    expect(northEast.y).toBeLessThan(southWest.y);
  });

  it("東西一列なら縦は中央に揃え、横は余白の内側いっぱいに広げる", () => {
    const pixels = layoutLocations([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.0, lng: 139.3 },
      { lat: 35.0, lng: 139.1 },
    ]);
    for (const pixel of pixels) {
      expect(pixel.y).toBeCloseTo(CENTER, 9);
    }
    expect(pixels[0].x).toBeCloseTo(PADDING, 9);
    expect(pixels[1].x).toBeCloseTo(CANVAS_SIZE - PADDING, 9);
  });

  it("南北一列なら横は中央に揃え、縦は余白の内側いっぱいに広げる（北が上）", () => {
    const pixels = layoutLocations([
      { lat: 35.0, lng: 139.0 },
      { lat: 35.3, lng: 139.0 },
    ]);
    for (const pixel of pixels) {
      expect(pixel.x).toBeCloseTo(CENTER, 9);
    }
    expect(pixels[0].y).toBeCloseTo(CANVAS_SIZE - PADDING, 9);
    expect(pixels[1].y).toBeCloseTo(PADDING, 9);
  });

  it("縦横に共通の倍率を使い、投影後の縦横比を保つ", () => {
    const locations = [
      { lat: 35.0, lng: 139.0 },
      { lat: 35.2, lng: 139.6 },
    ];
    const [a, b] = locations.map(projectWebMercator);
    const [pa, pb] = layoutLocations(locations);
    const projectedRatio = (b.x - a.x) / (b.y - a.y);
    const pixelRatio = (pb.x - pa.x) / (pa.y - pb.y);
    expect(pixelRatio).toBeCloseTo(projectedRatio, 9);
  });

  it("ごく近い点だけなら、最小投影範囲で拡大を抑える", () => {
    const locations = [
      { lat: 35.0, lng: 139.0 },
      { lat: 35.0, lng: 139.001 },
    ];
    const [a, b] = locations.map(projectWebMercator);
    const [pa, pb] = layoutLocations(locations);
    expect(b.x - a.x).toBeLessThan(MIN_PROJECTED_SPAN);
    expect(pb.x - pa.x).toBeCloseTo(
      ((b.x - a.x) * USABLE_SIZE) / MIN_PROJECTED_SPAN,
      9,
    );
    expect(pb.x - pa.x).toBeLessThan(USABLE_SIZE);
  });

  it(`最大${MAX_LOCATIONS}件でも全点が余白の内側に収まる`, () => {
    const locations = Array.from({ length: MAX_LOCATIONS }, (_, i) => ({
      lat: 35 + Math.sin(i) * 0.4,
      lng: 139 + Math.cos(i * 1.7) * 0.9,
    }));
    const pixels = layoutLocations(locations);
    expect(pixels).toHaveLength(MAX_LOCATIONS);
    expectInsideMargin(pixels);
  });

  it.each(["near_only.json", "near_and_far.json"])(
    "フィクスチャ %s の全点が余白の内側に収まる",
    (name) => {
      expectInsideMargin(layoutLocations(loadFixture(name)));
    },
  );

  it("遠方の地点が混じると近場の点は密集する（認識済みの課題）", () => {
    const spread = (pixels: { x: number; y: number }[]) =>
      Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x));
    // near_and_far.json の先頭6件は near_only.json の先頭6件と同じ地点
    const nearOnly = layoutLocations(loadFixture("near_only.json")).slice(0, 6);
    const withFar = layoutLocations(loadFixture("near_and_far.json")).slice(0, 6);
    expect(spread(withFar)).toBeLessThan(spread(nearOnly) / 10);
  });

  it("同じ入力なら同じ配置になる", () => {
    const locations = loadFixture("near_and_far.json");
    expect(layoutLocations(locations)).toEqual(layoutLocations(locations));
  });
});

describe("buildPlotSvg", () => {
  it("640x640 の黒背景に、点ごとの白い円を小数座標のまま置く", () => {
    const svg = buildPlotSvg([
      { x: 100.25, y: 200.75 },
      { x: 320, y: 320 },
    ]);
    expect(svg).toContain(`width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"`);
    expect(svg).toContain('fill="#000000"');
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain(`<circle cx="100.25" cy="200.75" r="${DOT_RADIUS}" fill="#ffffff"/>`);
  });
});

describe("renderLocationPlot", () => {
  async function readRaw(png: Buffer) {
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const brightness = (x: number, y: number) =>
      data[(Math.floor(y) * info.width + Math.floor(x)) * info.channels];
    return { info, brightness };
  }

  it("640x640 の PNG を生成し、点の位置は白、それ以外は黒になる", async () => {
    const locations = [
      { lat: 35.0, lng: 139.0 },
      { lat: 35.1, lng: 139.2 },
    ];
    const png = await renderLocationPlot(locations);
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(CANVAS_SIZE);
    expect(metadata.height).toBe(CANVAS_SIZE);

    const { brightness } = await readRaw(png);
    for (const pixel of layoutLocations(locations)) {
      expect(brightness(pixel.x, pixel.y)).toBeGreaterThan(250);
    }
    expect(brightness(0, 0)).toBe(0);
    expect(brightness(CANVAS_SIZE - 1, CANVAS_SIZE - 1)).toBe(0);
    expect(brightness(CENTER, CENTER)).toBe(0);
  });

  it("同じ入力なら同じ PNG になる", async () => {
    const locations = loadFixture("near_only.json");
    const first = await renderLocationPlot(locations);
    const second = await renderLocationPlot(locations);
    expect(first.equals(second)).toBe(true);
  });
});

describe("parseArgs", () => {
  it("入力 JSON と出力 PNG の位置引数2つを受け取る", () => {
    expect(parseArgs(["tmp/plot_locations.json", "tmp/location_plot.png"])).toEqual({
      inputPath: "tmp/plot_locations.json",
      outputPath: "tmp/location_plot.png",
    });
  });

  it("出力の拡張子は大文字小文字を問わず .png を受け付ける", () => {
    expect(parseArgs(["in.json", "tmp/OUT.PNG"]).outputPath).toBe("tmp/OUT.PNG");
  });

  it("引数が足りなければエラーにする", () => {
    expect(() => parseArgs(["tmp/plot_locations.json"])).toThrow("パスを指定してください");
  });

  it("引数が多すぎればエラーにする", () => {
    expect(() => parseArgs(["a.json", "tmp/b.png", "c"])).toThrow("引数が多すぎます");
  });

  it("出力が .png でなければエラーにする", () => {
    expect(() => parseArgs(["a.json", "tmp/b.jpg"])).toThrow(".png で指定してください");
  });

  it("オプションは受け付けない", () => {
    expect(() => parseArgs(["a.json", "tmp/b.png", "--size", "800"])).toThrow(
      "不明なオプションです: --size",
    );
  });
});

describe("resolveInputPath", () => {
  it("プロジェクトルート内のファイルは実体パスで返す", () => {
    const relative = `${FIXTURE_DIR}/near_only.json`;
    expect(resolveInputPath(relative)).toBe(
      realpathSync(path.resolve(PROJECT_ROOT, relative)),
    );
  });

  it("../ でプロジェクトルートの外へ出るパスは拒否する", () => {
    expect(() => resolveInputPath("../outside.json")).toThrow(
      "プロジェクトルート内のパスを指定してください",
    );
  });

  it("プロジェクトルート外の絶対パスは拒否する", () => {
    expect(() =>
      resolveInputPath(path.resolve(PROJECT_ROOT, "..", "outside.json")),
    ).toThrow("プロジェクトルート内のパスを指定してください");
  });

  it("存在しないファイルは拒否する", () => {
    expect(() => resolveInputPath(`${FIXTURE_DIR}/missing.json`)).toThrow(
      "入力ファイルが存在しません",
    );
  });
});

describe("resolveOutputPath", () => {
  // リポジトリの tmp/ に触れないよう、一時ディレクトリをプロジェクトルートに見立てる
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "plot-locations-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("tmp/ 配下の相対パスを実体パスで返す（tmp/ が無ければ作る）", () => {
    expect(resolveOutputPath("tmp/location_plot.png", root)).toBe(
      path.join(realpathSync(path.join(root, "tmp")), "location_plot.png"),
    );
  });

  it("tmp/ 配下のサブディレクトリは作ってから返す", () => {
    const resolved = resolveOutputPath("tmp/plots/location_plot.png", root);
    expect(existsSync(path.join(root, "tmp", "plots"))).toBe(true);
    expect(resolved).toBe(
      path.join(realpathSync(path.join(root, "tmp", "plots")), "location_plot.png"),
    );
  });

  it("tmp/ 配下の絶対パスも受け付ける", () => {
    mkdirSync(path.join(root, "tmp"));
    const absolute = path.join(root, "tmp", "location_plot.png");
    expect(resolveOutputPath(absolute, root)).toBe(
      path.join(realpathSync(path.join(root, "tmp")), "location_plot.png"),
    );
  });

  it.each([
    ["プロジェクトルート直下", "location_plot.png"],
    ["tmp/ 以外のディレクトリ", "assets/location_plot.png"],
    ["../ による tmp/ からの脱出", "tmp/../location_plot.png"],
    ["tmp/ そのもの", "tmp"],
  ])("%s は拒否する", (_label, outputPath) => {
    expect(() => resolveOutputPath(outputPath, root)).toThrow("tmp/ 配下のパスを指定してください");
  });

  it("拒否したときはディレクトリを作らない", () => {
    expect(() => resolveOutputPath("assets/location_plot.png", root)).toThrow();
    expect(existsSync(path.join(root, "assets"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "tmp/ 自体がプロジェクト外を指すシンボリックリンクなら拒否する",
    () => {
      const outsideDir = mkdtempSync(path.join(os.tmpdir(), "plot-locations-outside-"));
      try {
        symlinkSync(outsideDir, path.join(root, "tmp"));
        expect(() => resolveOutputPath("tmp/location_plot.png", root)).toThrow(
          "tmp/ 配下のパスを指定してください",
        );
        expect(existsSync(path.join(outsideDir, "location_plot.png"))).toBe(false);
      } finally {
        // ディレクトリを指すリンクは recursive が無いと拒否される。リンク先はたどらず、リンクだけを消す
        rmSync(path.join(root, "tmp"), { recursive: true, force: true });
        rmSync(outsideDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "出力先のダングリングシンボリックリンク（tmp/ 外）を拒否する",
    () => {
      const tmpDir = path.join(root, "tmp");
      mkdirSync(tmpDir);
      const danglingTarget = path.join(root, "outside-missing.png");
      const linkPath = path.join(tmpDir, "location_plot.png");
      symlinkSync(danglingTarget, linkPath);
      expect(existsSync(linkPath)).toBe(false);
      expect(() => resolveOutputPath("tmp/location_plot.png", root)).toThrow(
        "tmp/ 配下のパスを指定してください",
      );
      expect(existsSync(danglingTarget)).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "出力先が tmp/ 外を指すシンボリックリンクなら拒否する",
    () => {
      const outsideDir = mkdtempSync(path.join(os.tmpdir(), "plot-locations-secret-"));
      try {
        const secretPath = path.join(outsideDir, "secret.png");
        writeFileSync(secretPath, "secret");
        const tmpDir = path.join(root, "tmp");
        mkdirSync(tmpDir);
        symlinkSync(secretPath, path.join(tmpDir, "location_plot.png"));
        expect(() => resolveOutputPath("tmp/location_plot.png", root)).toThrow(
          "tmp/ 配下のパスを指定してください",
        );
        expect(readFileSync(secretPath, "utf-8")).toBe("secret");
      } finally {
        rmSync(path.join(root, "tmp", "location_plot.png"), { force: true });
        rmSync(outsideDir, { recursive: true, force: true });
      }
    },
  );
});
