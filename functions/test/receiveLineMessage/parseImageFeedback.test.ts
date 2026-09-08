import { describe, expect, it } from "vitest";
import { parseImageFeedback } from "../../src/receiveLineMessage/parseImageFeedback";

describe("parseImageFeedback", () => {
  it.each([
    ["評価 4 構図は好き。背景が少し寂しい", { kind: "rating", score: 4, target_date: null, target_image_id: null, comment: "構図は好き。背景が少し寂しい" }],
    ["評価 2026-06-12 5 ルリが可愛い", { kind: "rating", score: 5, target_date: "2026-06-12", target_image_id: null, comment: "ルリが可愛い" }],
    ["傾向 最近バストアップ正面が続いている", { kind: "trend", score: null, target_date: null, target_image_id: null, comment: "最近バストアップ正面が続いている" }],
    ["評価 構図がいい", { kind: "rating", score: null, target_date: null, target_image_id: null, comment: "構図がいい" }],
    ["評価 6 範囲外スコア", { kind: "rating", score: null, target_date: null, target_image_id: null, comment: "6 範囲外スコア" }],
  ])("%s を構造化する", (input, expected) => {
    expect(parseImageFeedback(input)).toEqual(expected);
  });

  it.each([
    ["評価 #talk-2135 5 ルリと一緒の一枚がよい", { kind: "rating", score: 5, target_date: null, target_image_id: "talk-2135", comment: "ルリと一緒の一枚がよい" }],
    ["評価 2026-06-12 #night-2210 4 夜の情景がよい", { kind: "rating", score: 4, target_date: "2026-06-12", target_image_id: "night-2210", comment: "夜の情景がよい" }],
  ])("%s は画像IDを取り出す", (input, expected) => {
    expect(parseImageFeedback(input)).toEqual(expected);
  });

  // モード名だけの略記（`#night` など）も同じ経路で target_image_id に入る。
  // パーサーは略記かどうかを判別せず、対象日のログの mode との突き合わせは review_image_feedback 側で行う。
  it.each([
    ["評価 #night 4 夜の情景がよい", { kind: "rating", score: 4, target_date: null, target_image_id: "night", comment: "夜の情景がよい" }],
    ["評価 #talk 5 依頼どおりの一枚", { kind: "rating", score: 5, target_date: null, target_image_id: "talk", comment: "依頼どおりの一枚" }],
    ["評価 2026-06-12 #off_mountain 3 山の情景が薄い", { kind: "rating", score: 3, target_date: "2026-06-12", target_image_id: "off_mountain", comment: "山の情景が薄い" }],
  ])("%s はモード名の略記をそのまま画像IDとして取り出す", (input, expected) => {
    expect(parseImageFeedback(input)).toEqual(expected);
  });

  it("傾向FBは画像IDを取らずコメントとして残す", () => {
    expect(parseImageFeedback("傾向 #talk-2135 のような構図が続いている")).toEqual({
      kind: "trend",
      score: null,
      target_date: null,
      target_image_id: null,
      comment: "#talk-2135 のような構図が続いている",
    });
  });

  it("対象外の文は null を返す", () => {
    expect(parseImageFeedback("楽曲評価 5 最高")).toBeNull();
    expect(parseImageFeedback("評価者です")).not.toBeNull();
  });
});
