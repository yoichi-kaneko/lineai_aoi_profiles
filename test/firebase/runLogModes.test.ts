import { describe, expect, it } from "vitest";
import {
  RUN_LOG_MODE,
  isRunLogMode,
  isWeeklyRunWindowInTokyoTime,
  resolveDailyRunLogModeFromTokyoTime,
} from "../../src/firebase/runLogModes.js";

describe("firebase/runLogModes", () => {
  it("定義済み mode のみを受け付ける", () => {
    for (const value of Object.values(RUN_LOG_MODE)) {
      expect(isRunLogMode(value)).toBe(true);
    }
    expect(isRunLogMode("off_mountain")).toBe(false);
  });

  it.each([
    ["2026-08-19T17:59:00Z", null],
    ["2026-08-19T18:00:00Z", RUN_LOG_MODE.MORNING],
    ["2026-08-20T03:00:00Z", RUN_LOG_MODE.NOON],
    ["2026-08-20T05:59:00Z", RUN_LOG_MODE.NOON],
    ["2026-08-20T06:00:00Z", null],
    ["2026-08-20T11:00:00Z", RUN_LOG_MODE.NIGHT],
    ["2026-08-20T14:59:00Z", RUN_LOG_MODE.NIGHT],
    ["2026-08-20T15:00:00Z", null],
  ])("%s の Tokyo 時刻境界を判定する", (iso, expected) => {
    expect(resolveDailyRunLogModeFromTokyoTime(new Date(iso))).toBe(expected);
  });

  it.each([
    ["2026-10-04T14:59:00Z", false], // 日曜 23:59
    ["2026-10-04T15:00:00Z", true], // 月曜 00:00
    ["2026-10-04T19:59:00Z", true], // 月曜 04:59
    ["2026-10-04T20:00:00Z", false], // 月曜 05:00
    ["2026-10-05T15:00:00Z", false], // 火曜 00:00
  ])("%s が結星の実行時間帯（月曜 00:00-04:59 JST）かを判定する", (iso, expected) => {
    expect(isWeeklyRunWindowInTokyoTime(new Date(iso))).toBe(expected);
  });
});
