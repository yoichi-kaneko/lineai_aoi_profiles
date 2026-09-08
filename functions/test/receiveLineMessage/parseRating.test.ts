import { describe, expect, it } from "vitest";
import { parseRatingBody } from "../../src/receiveLineMessage/parseRating";

describe("parseRatingBody", () => {
  it.each([
    ["4 構図は好き。背景が少し寂しい", { score: 4, target_date: null, target_id: null, comment: "構図は好き。背景が少し寂しい" }],
    ["2026-06-12 5 ルリが可愛い", { score: 5, target_date: "2026-06-12", target_id: null, comment: "ルリが可愛い" }],
    ["構図がいい", { score: null, target_date: null, target_id: null, comment: "構図がいい" }],
    ["6 範囲外スコア", { score: null, target_date: null, target_id: null, comment: "6 範囲外スコア" }],
    ["2026-06-12　4　全角空白", { score: 4, target_date: "2026-06-12", target_id: null, comment: "全角空白" }],
    ["", { score: null, target_date: null, target_id: null, comment: "" }],
  ])("%s を寛容に解釈する", (input, expected) => {
    expect(parseRatingBody(input)).toEqual(expected);
  });

  it("既定では #<ID> を対象指定として解釈せず、コメントへ残す", () => {
    expect(parseRatingBody("#night-2210 4 よい")).toEqual({
      score: null,
      target_date: null,
      target_id: null,
      comment: "#night-2210 4 よい",
    });
  });

  describe("allowTargetId", () => {
    it.each([
      ["#night-2210 5 ルリが可愛い", { score: 5, target_date: null, target_id: "night-2210", comment: "ルリが可愛い" }],
      ["＃talk-2135 4 全角シャープ", { score: 4, target_date: null, target_id: "talk-2135", comment: "全角シャープ" }],
      ["2026-06-12 #talk-2135 3 日付と併記", { score: 3, target_date: "2026-06-12", target_id: "talk-2135", comment: "日付と併記" }],
      ["#talk-2135 2026-06-12 3 順不同", { score: 3, target_date: "2026-06-12", target_id: "talk-2135", comment: "順不同" }],
      ["#night-2210 スコア無し", { score: null, target_date: null, target_id: "night-2210", comment: "スコア無し" }],
      ["#日本語ID 4 IDとして解釈しない", { score: null, target_date: null, target_id: null, comment: "#日本語ID 4 IDとして解釈しない" }],
    ])("%s を解釈する", (input, expected) => {
      expect(parseRatingBody(input, { allowTargetId: true })).toEqual(expected);
    });

    it("スコアより後の #<ID> はコメントとして残す", () => {
      expect(parseRatingBody("4 #night-2210 の一枚", { allowTargetId: true })).toEqual({
        score: 4,
        target_date: null,
        target_id: null,
        comment: "#night-2210 の一枚",
      });
    });
  });
});
