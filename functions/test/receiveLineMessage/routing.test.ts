import { describe, expect, it } from "vitest";
import { findTriggerMode } from "../../src/receiveLineMessage/routing";

describe("findTriggerMode", () => {
  it.each([
    ["下山しました", "off_mountain"],
    ["無事下山です", "off_mountain"],
    ["登山開始します", "up_mountain"],
    ["山小屋に着いた", "stay_mountain"],
  ])("%s を %s に振り分ける", (text, expected) => {
    expect(findTriggerMode(text)).toBe(expected);
  });

  it("前方一致しない文は振り分けない", () => {
    expect(findTriggerMode("今日は下山の予定")).toBeNull();
    expect(findTriggerMode("評価 4 よかった")).toBeNull();
  });
});
