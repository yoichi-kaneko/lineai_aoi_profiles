import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  filterDocsByType,
  parseArgs,
  parseTypeFilter,
  resolveDateRange,
  resolveOptions,
} from "../../src/firebase/get_docs.js";

describe("parseArgs", () => {
  it("位置引数とオプションを分けて返す", () => {
    expect(parseArgs(["2026-08-09", "2026-08-16", "--collection", "song_logs"])).toEqual({
      positionals: ["2026-08-09", "2026-08-16"],
      flags: { collection: ["song_logs"] },
    });
  });

  it("--key=value 形式を受け付ける", () => {
    expect(parseArgs(["--collection=image_logs"]).flags).toEqual({ collection: ["image_logs"] });
  });

  it("同じキーの繰り返し指定を出現順の配列で保持する", () => {
    expect(parseArgs(["--type", "line_text", "--type=line_image"]).flags).toEqual({
      type: ["line_text", "line_image"],
    });
  });

  it("値を伴わないオプションは空文字として扱う", () => {
    expect(parseArgs(["--type", "--collection", "notes"]).flags).toEqual({
      type: [""],
      collection: ["notes"],
    });
  });
});

describe("parseTypeFilter", () => {
  it("指定がなければ undefined を返す（全件取得）", () => {
    expect(parseTypeFilter([], "notes")).toBeUndefined();
  });

  it("カンマ区切りを分解し、前後の空白を取り除く", () => {
    expect(parseTypeFilter([" line_text , line_image "], "notes")).toEqual([
      "line_text",
      "line_image",
    ]);
  });

  it("空白区切りも受け付ける（PowerShell が引用符なしのカンマ区切りを空白で渡すため）", () => {
    expect(parseTypeFilter(["line_text line_image"], "notes")).toEqual([
      "line_text",
      "line_image",
    ]);
  });

  it("繰り返し指定とカンマ区切りを合わせて重複を取り除く", () => {
    expect(parseTypeFilter(["line_text,from_aoi", "line_text", "line_image"], "notes")).toEqual([
      "line_text",
      "from_aoi",
      "line_image",
    ]);
  });

  it.each([[""], [" "], [",,"]])("実質空の指定 %o は ArgumentError を投げる", (raw) => {
    expect(() => parseTypeFilter([raw], "notes")).toThrow(ArgumentError);
  });

  it("notes では NOTE_TYPE にない type を拒否する", () => {
    expect(() => parseTypeFilter(["line_text,image_log"], "notes")).toThrow(/image_log/);
  });

  it("notes 以外のコレクションでは NOTE_TYPE 検証をバイパスする", () => {
    expect(parseTypeFilter(["image_log"], "image_logs")).toEqual(["image_log"]);
  });
});

describe("resolveDateRange", () => {
  it("dateFrom の 0:00:00.000 から dateTo の 23:59:59.999 までを返す", () => {
    const { startDate, endDate } = resolveDateRange("2026-08-09", "2026-08-16");

    expect(startDate).toEqual(new Date(2026, 7, 9, 0, 0, 0, 0));
    expect(endDate).toEqual(new Date(2026, 7, 16, 23, 59, 59, 999));
  });

  it("うるう年の2月29日を受け付ける", () => {
    expect(resolveDateRange("2024-02-29", "2024-02-29").startDate).toEqual(
      new Date(2024, 1, 29, 0, 0, 0, 0)
    );
  });

  it.each([
    ["形式が不正な dateFrom", "2026-8-9", "2026-08-16"],
    ["形式が不正な dateTo", "2026-08-09", "2026/08/16"],
  ])("%sは ArgumentError を投げる", (_label, dateFrom, dateTo) => {
    expect(() => resolveDateRange(dateFrom, dateTo)).toThrow(/YYYY-MM-DD/);
  });

  it.each([
    ["実在しない日付", "2026-02-30", "2026-03-01"],
    ["平年の2月29日", "2026-02-01", "2026-02-29"],
  ])("%sは ArgumentError を投げる", (_label, dateFrom, dateTo) => {
    expect(() => resolveDateRange(dateFrom, dateTo)).toThrow(ArgumentError);
  });
});

describe("resolveOptions", () => {
  it("コレクション未指定なら notes を既定にし、type 絞り込みは付かない", () => {
    const options = resolveOptions(["2026-08-16", "2026-08-16"]);

    expect(options.collection).toBe("notes");
    expect(options.types).toBeUndefined();
  });

  it("--type の絞り込みを取り込む", () => {
    const options = resolveOptions([
      "2026-08-09",
      "2026-08-16",
      "--type",
      "line_text,line_image,from_aoi",
    ]);

    expect(options.types).toEqual(["line_text", "line_image", "from_aoi"]);
  });

  it("--collection と --type を併用できる", () => {
    const options = resolveOptions([
      "2026-08-09",
      "2026-08-16",
      "--collection",
      "image_logs",
      "--type",
      "image_log",
    ]);

    expect(options.collection).toBe("image_logs");
    expect(options.types).toEqual(["image_log"]);
  });

  it.each([
    ["dateFrom も dateTo も無い", []],
    ["dateTo が無い", ["2026-08-16"]],
    ["日付がオプションの後ろに1つだけ", ["--type", "line_text", "2026-08-16"]],
  ])("%s場合は使用方法つきの ArgumentError を投げる", (_label, argv) => {
    expect(() => resolveOptions(argv)).toThrow(
      expect.objectContaining({ name: "ArgumentError", showUsage: true })
    );
  });
});

describe("filterDocsByType", () => {
  const docs = [
    { id: "1", type: "line_text" },
    { id: "2", type: "night_handover" },
    { id: "3", type: "line_image" },
    { id: "4" },
  ];

  it("指定がなければ全件を返す", () => {
    expect(filterDocsByType(docs)).toEqual(docs);
  });

  it("指定した type のみを取得順のまま返す", () => {
    expect(filterDocsByType(docs, ["line_image", "line_text"])).toEqual([
      { id: "1", type: "line_text" },
      { id: "3", type: "line_image" },
    ]);
  });

  it("type を持たないドキュメントは絞り込み時に除外する", () => {
    expect(filterDocsByType(docs, ["line_text"])).not.toContainEqual({ id: "4" });
  });

  it("一致するものがなければ空配列を返す", () => {
    expect(filterDocsByType(docs, ["off_mountain"])).toEqual([]);
  });
});
