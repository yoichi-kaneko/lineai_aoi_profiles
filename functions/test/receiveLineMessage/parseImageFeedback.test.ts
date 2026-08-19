import { describe, expect, it } from "vitest";
import { parseImageFeedback } from "../../src/receiveLineMessage/parseImageFeedback";

describe("parseImageFeedback", () => {
  it.each([
    ["評価 4 構図は好き。背景が少し寂しい", { kind: "rating", score: 4, target_date: null, comment: "構図は好き。背景が少し寂しい" }],
    ["評価 2026-06-12 5 ルリが可愛い", { kind: "rating", score: 5, target_date: "2026-06-12", comment: "ルリが可愛い" }],
    ["傾向 最近バストアップ正面が続いている", { kind: "trend", score: null, target_date: null, comment: "最近バストアップ正面が続いている" }],
    ["評価 構図がいい", { kind: "rating", score: null, target_date: null, comment: "構図がいい" }],
    ["評価 6 範囲外スコア", { kind: "rating", score: null, target_date: null, comment: "6 範囲外スコア" }],
  ])("%s を構造化する", (input, expected) => {
    expect(parseImageFeedback(input)).toEqual(expected);
  });

  it("対象外の文は null を返す", () => {
    expect(parseImageFeedback("楽曲評価 5 最高")).toBeNull();
    expect(parseImageFeedback("評価者です")).not.toBeNull();
  });
});
