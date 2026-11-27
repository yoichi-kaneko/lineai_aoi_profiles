import { describe, expect, it } from "vitest";
import { realpathSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ANCHORS,
  assertEmbeddableUrl,
  assertPositionInsideBase,
  assertQrFitsSize,
  cardSizeFor,
  defaultQrSizeFor,
  parseArgs,
  resolveAnchorPosition,
  resolveBaseImagePath,
} from "../../src/image/embed_qr";

/** このテストファイル（test/image/）から2階層上がプロジェクトルート */
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

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

  it("top-left は --size を省略すると既定より小さい QR にする", () => {
    const parsed = parseArgs([
      "tmp/gpt_image_1.png",
      "https://yamap.com/activities/1",
      "--anchor",
      "top-left",
    ]);
    expect(parsed.anchor).toBe("top-left");
    expect(parsed.qrSize).toBe(140);
  });

  it("top-left でも --size を指定すればその値を使う", () => {
    const parsed = parseArgs([
      "tmp/gpt_image_1.png",
      "https://yamap.com/activities/1",
      "--size",
      "160",
      "--anchor",
      "top-left",
    ]);
    expect(parsed.qrSize).toBe(160);
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

  it("top-left は左上隅に置き、既定の大きさなら表題の文字と写真枠にかからない", () => {
    const topLeftCard = cardSizeFor(defaultQrSizeFor("top-left"));
    const position = resolveAnchorPosition("top-left", topLeftCard, REPORT_BASE);
    expect(position).toEqual({ left: 28, top: 28 });
    // report_template.png の表題「登山レポート」の文字の左端（x=217 付近）と写真枠の上端（y=205 付近）
    expect(position.left + topLeftCard).toBeLessThan(217);
    expect(position.top + topLeftCard).toBeLessThan(205);
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

  it("いずれのアンカーも既定の大きさでベース画像の内側に収まる", () => {
    for (const anchor of ANCHORS) {
      const anchorCard = cardSizeFor(defaultQrSizeFor(anchor));
      const position = resolveAnchorPosition(anchor, anchorCard, REPORT_BASE);
      expect(() =>
        assertPositionInsideBase(position, anchorCard, REPORT_BASE),
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

describe("assertQrFitsSize", () => {
  // 誤り訂正レベル Q で version 39（173 モジュール）になり、クワイエットゾーン込みで 181px 必要
  const longUrl = `https://example.com/${"a".repeat(1500)}`;

  it("YAMAP のレポート URL は top-left の既定サイズに収まる", () => {
    expect(() =>
      assertQrFitsSize(
        "https://yamap.com/activities/45591468",
        defaultQrSizeFor("top-left"),
      ),
    ).not.toThrow();
  });

  it("収まらない長さの URL では、必要な --size を案内して止める", () => {
    expect(() => assertQrFitsSize(longUrl, defaultQrSizeFor("top-left"))).toThrow(
      /--size 181 以上/,
    );
    expect(() => assertQrFitsSize(longUrl, 181)).not.toThrow();
  });
});

describe("resolveBaseImagePath", () => {
  it("プロジェクトルート内の実在ファイルを解決する", () => {
    // 期待値も同じ手順で組み立てる。パス区切りは OS 依存（Windows は `\`）のため、
    // `/` を含む正規表現で照合すると Windows で落ちる。
    const expected = realpathSync(
      path.resolve(PROJECT_ROOT, "assets", "images", "report_template.png"),
    );

    expect(resolveBaseImagePath("assets/images/report_template.png")).toBe(expected);
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
