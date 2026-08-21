import { describe, expect, it } from "vitest";
import {
  assertEmbeddableUrl,
  assertPositionInsideBase,
  cardSizeFor,
  parseArgs,
  resolveAnchorPosition,
  resolveBaseImagePath,
} from "../../src/image/embed_qr";

/** 綴葉モードで実際に扱うレポート画像のサイズ（generate_image.ts が固定） */
const REPORT_BASE = { width: 1536, height: 1024 };

describe("parseArgs", () => {
  it("位置引数2つだけなら既定のアンカーとサイズを返す", () => {
    const parsed = parseArgs([
      "tmp/gpt_image_1.png",
      "https://yamap.com/activities/45591468",
    ]);
    expect(parsed).toEqual({
      basePath: "tmp/gpt_image_1.png",
      url: "https://yamap.com/activities/45591468",
      anchor: "bottom-right",
      qrSize: 190,
    });
  });

  it("--anchor と --size を解釈する", () => {
    const parsed = parseArgs([
      "tmp/gpt_image_1.png",
      "https://yamap.com/activities/1",
      "--anchor",
      "photo-bottom-right",
      "--size",
      "150",
    ]);
    expect(parsed.anchor).toBe("photo-bottom-right");
    expect(parsed.qrSize).toBe(150);
  });

  it("オプションが位置引数より先に来ても解釈できる", () => {
    const parsed = parseArgs([
      "--anchor",
      "bottom-left",
      "tmp/gpt_image_1.png",
      "https://yamap.com/activities/1",
    ]);
    expect(parsed.anchor).toBe("bottom-left");
    expect(parsed.basePath).toBe("tmp/gpt_image_1.png");
  });

  it("未定義のアンカーを拒否する", () => {
    expect(() =>
      parseArgs([
        "tmp/a.png",
        "https://yamap.com/activities/1",
        "--anchor",
        "top-right",
      ]),
    ).toThrow(/--anchor/);
  });

  it("範囲外・非整数のサイズを拒否する", () => {
    for (const size of ["119", "401", "190.5", "abc"]) {
      expect(() =>
        parseArgs(["tmp/a.png", "https://yamap.com/activities/1", "--size", size]),
      ).toThrow(/--size/);
    }
  });

  it("不明なオプション・引数の過不足を拒否する", () => {
    expect(() =>
      parseArgs(["tmp/a.png", "https://yamap.com/activities/1", "--out", "x.png"]),
    ).toThrow(/不明なオプション/);
    expect(() => parseArgs(["tmp/a.png"])).toThrow(/URL/);
    expect(() =>
      parseArgs(["tmp/a.png", "https://yamap.com/activities/1", "extra"]),
    ).toThrow(/引数が多すぎます/);
  });
});

describe("assertEmbeddableUrl", () => {
  it("http/https の URL を通す", () => {
    expect(assertEmbeddableUrl("https://yamap.com/activities/45591468")).toBe(
      "https://yamap.com/activities/45591468",
    );
    expect(assertEmbeddableUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("URL として解釈できない値・http 以外のスキームを拒否する", () => {
    expect(() => assertEmbeddableUrl("yamap.com/activities/1")).toThrow(/URL/);
    expect(() => assertEmbeddableUrl("file:///etc/passwd")).toThrow(/http/);
    expect(() => assertEmbeddableUrl("javascript:alert(1)")).toThrow(/http/);
  });
});

describe("resolveAnchorPosition", () => {
  const cardSize = cardSizeFor(190);

  it("カードは QR 本体に上下左右の余白を加えた大きさになる", () => {
    expect(cardSize).toBe(218);
  });

  it("bottom-right は右下隅から等距離に置く", () => {
    const position = resolveAnchorPosition("bottom-right", cardSize, REPORT_BASE);
    expect(position).toEqual({ left: 1290, top: 778 });
    expect(REPORT_BASE.width - (position.left + cardSize)).toBe(
      REPORT_BASE.height - (position.top + cardSize),
    );
  });

  it("bottom-left は左下隅に置く", () => {
    const position = resolveAnchorPosition("bottom-left", cardSize, REPORT_BASE);
    expect(position).toEqual({ left: 28, top: 778 });
  });

  it("photo-bottom-right は代表写真フレームの内側右下に置く", () => {
    const position = resolveAnchorPosition(
      "photo-bottom-right",
      cardSize,
      REPORT_BASE,
    );
    expect(position).toEqual({ left: 574, top: 454 });
  });

  it("いずれのアンカーもベース画像の内側に収まる", () => {
    for (const anchor of ["bottom-right", "bottom-left", "photo-bottom-right"] as const) {
      const position = resolveAnchorPosition(anchor, cardSize, REPORT_BASE);
      expect(() =>
        assertPositionInsideBase(position, cardSize, REPORT_BASE),
      ).not.toThrow();
    }
  });

  it("ベース画像の寸法が変わっても比率で追従する", () => {
    const doubled = { width: 3072, height: 2048 };
    const position = resolveAnchorPosition("bottom-right", cardSize, doubled);
    expect(position).toEqual({ left: 3072 - 56 - cardSize, top: 2048 - 56 - cardSize });
  });
});

describe("assertPositionInsideBase", () => {
  it("はみ出す配置を拒否する", () => {
    const cardSize = cardSizeFor(400);
    const small = { width: 300, height: 300 };
    const position = resolveAnchorPosition("bottom-right", cardSize, small);
    expect(() => assertPositionInsideBase(position, cardSize, small)).toThrow(
      /はみ出します/,
    );
  });
});

describe("resolveBaseImagePath", () => {
  it("プロジェクトルート内の実在ファイルを解決する", () => {
    expect(resolveBaseImagePath("assets/images/report_template.png")).toMatch(
      /assets\/images\/report_template\.png$/,
    );
  });

  it("プロジェクトルート外への脱出を拒否する", () => {
    expect(() => resolveBaseImagePath("../../etc/passwd")).toThrow(
      /プロジェクトルート内/,
    );
    expect(() => resolveBaseImagePath("/etc/passwd")).toThrow(/プロジェクトルート内/);
  });

  it("存在しないファイルを拒否する", () => {
    expect(() => resolveBaseImagePath("tmp/does_not_exist.png")).toThrow(
      /存在しません/,
    );
  });
});
