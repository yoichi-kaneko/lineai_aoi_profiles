import { describe, expect, it } from "vitest";
import { parseSongFeedback } from "../../src/receiveLineMessage/parseSongFeedback";

describe("parseSongFeedback", () => {
  it.each([
    ["楽曲評価 4 歌詞の余韻が好き", { kind: "rating", score: 4, target_date: null, comment: "歌詞の余韻が好き" }],
    ["音楽評価 2026-07-05 5 サビの解放感がよい", { kind: "rating", score: 5, target_date: "2026-07-05", comment: "サビの解放感がよい" }],
    ["楽曲評価 静かな曲調が沁みた", { kind: "rating", score: null, target_date: null, comment: "静かな曲調が沁みた" }],
    ["楽曲評価 6 範囲外スコア", { kind: "rating", score: null, target_date: null, comment: "6 範囲外スコア" }],
  ])("%s を構造化する", (input, expected) => {
    expect(parseSongFeedback(input)).toEqual(expected);
  });

  it("日常文は振り分けない", () => {
    expect(parseSongFeedback("音楽フェスに行ってきた")).toBeNull();
    expect(parseSongFeedback("評価 4 構図が良い")).toBeNull();
  });
});
