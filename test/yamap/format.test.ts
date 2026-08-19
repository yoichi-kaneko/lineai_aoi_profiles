import { describe, expect, it } from "vitest";
import {
  difficultyLabel,
  formatDate,
  formatDistance,
  formatDuration,
  formatDurationFromSeconds,
  formatElevation,
  formatTimeOfDay,
  isFiniteNumber,
  isPlainObject,
  paceLabel,
  requireFiniteNumberOrNull,
  resolveTimezone,
} from "../../src/yamap/format.js";

describe("yamap/format", () => {
  it("plain object と配列・null を区別する", () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });

  it("有限数値だけを許可する", () => {
    expect(isFiniteNumber(1.2)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber("1")).toBe(false);
  });

  it("null / undefined はそのまま通し、非数値は拒否する", () => {
    expect(requireFiniteNumberOrNull(null, "x")).toBeNull();
    expect(requireFiniteNumberOrNull(undefined, "x")).toBeUndefined();
    expect(requireFiniteNumberOrNull(12, "x")).toBe(12);
    expect(() => requireFiniteNumberOrNull("12", "距離")).toThrow("距離の形式が不正です。");
  });

  it("timezone は非数値時に JST へフォールバックする", () => {
    expect(resolveTimezone(8)).toBe(8);
    expect(resolveTimezone("Asia/Tokyo")).toBe(9);
    expect(resolveTimezone(undefined)).toBe(9);
  });

  it("日付と時刻をタイムゾーン付きで整形する", () => {
    expect(formatDate(0, 9)).toBe("1970.01.01 (木)");
    expect(formatTimeOfDay(0, 9)).toBe("09:00");
  });

  it("所要時間・距離・標高を YAMAP 仕様で整形する", () => {
    expect(formatDuration(59)).toBe("59分");
    expect(formatDuration(125)).toBe("2時間5分");
    expect(formatDurationFromSeconds(3599)).toBe("59分");
    expect(formatDistance(1234)).toBe("1.2km");
    expect(formatElevation(999.9)).toBe("999m");
  });

  it.each([
    [11, "やさしい"],
    [12, "ふつう"],
    [24, "ふつう"],
    [25, "きつい"],
  ])("コース定数 %i のラベル", (value, expected) => {
    expect(difficultyLabel(value)).toBe(expected);
  });

  it.each([
    [70, "ゆっくり"],
    [71, "ややゆっくり"],
    [90, "ややゆっくり"],
    [91, "標準"],
    [109, "標準"],
    [110, "やや速い"],
    [129, "やや速い"],
    [130, "速い"],
  ])("ペース %i%% のラベル", (value, expected) => {
    expect(paceLabel(value)).toBe(expected);
  });
});
