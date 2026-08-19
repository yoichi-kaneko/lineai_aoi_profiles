import { describe, expect, it } from "vitest";
import { parseRatingBody } from "../../src/receiveLineMessage/parseRating";

describe("parseRatingBody", () => {
  it.each([
    ["4 構図は好き。背景が少し寂しい", { score: 4, target_date: null, comment: "構図は好き。背景が少し寂しい" }],
    ["2026-06-12 5 ルリが可愛い", { score: 5, target_date: "2026-06-12", comment: "ルリが可愛い" }],
    ["構図がいい", { score: null, target_date: null, comment: "構図がいい" }],
    ["6 範囲外スコア", { score: null, target_date: null, comment: "6 範囲外スコア" }],
    ["2026-06-12　4　全角空白", { score: 4, target_date: "2026-06-12", comment: "全角空白" }],
    ["", { score: null, target_date: null, comment: "" }],
  ])("%s を寛容に解釈する", (input, expected) => {
    expect(parseRatingBody(input)).toEqual(expected);
  });
});
