import { describe, expect, it } from "vitest";
import {
  RUN_LOG_MODE,
  isRunLogMode,
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
});
