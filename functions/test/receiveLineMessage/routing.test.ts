import { describe, expect, it } from "vitest";
import { findTriggerMode, requiresTargetDoc } from "../../src/receiveLineMessage/routing";

describe("findTriggerMode", () => {
  it.each([
    ["下山しました", "off_mountain"],
    ["無事下山です", "off_mountain"],
    ["登山開始します", "up_mountain"],
    ["山小屋に着いた", "stay_mountain"],
    ["碧衣、明日の天気を教えて", "talk"],
    ["碧衣さん、こんばんは", "talk"],
  ])("%s を %s に振り分ける", (text, expected) => {
    expect(findTriggerMode(text)).toBe(expected);
  });

  it("前方一致しない文は振り分けない", () => {
    expect(findTriggerMode("今日は下山の予定")).toBeNull();
    expect(findTriggerMode("評価 4 よかった")).toBeNull();
    expect(findTriggerMode("今日も碧衣に助けられた")).toBeNull();
    expect(findTriggerMode(" 碧衣、天気は？")).toBeNull();
  });
});

describe("requiresTargetDoc", () => {
  it("talk だけが対象文書の受け渡しを必要とする", () => {
    expect(requiresTargetDoc("talk")).toBe(true);
    expect(requiresTargetDoc("off_mountain")).toBe(false);
    expect(requiresTargetDoc("up_mountain")).toBe(false);
    expect(requiresTargetDoc("stay_mountain")).toBe(false);
  });
});
