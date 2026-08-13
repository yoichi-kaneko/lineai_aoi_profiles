import { describe, expect, it } from "vitest";
import { resolveAllDayLastDate } from "../../src/google_calendar/get_events.js";

describe("resolveAllDayLastDate", () => {
  it("1日だけの終日予定では開始日を返す", () => {
    expect(
      resolveAllDayLastDate({
        start: { date: "2026-08-15" },
        end: { date: "2026-08-16" },
      }),
    ).toBe("2026-08-15");
  });

  it("年境界をまたぐ終日予定の最終日を返す", () => {
    expect(
      resolveAllDayLastDate({
        start: { date: "2025-12-31" },
        end: { date: "2026-01-02" },
      }),
    ).toBe("2026-01-01");
  });

  it("うるう年の2月29日を最終日として返す", () => {
    expect(
      resolveAllDayLastDate({
        start: { date: "2024-02-28" },
        end: { date: "2024-03-01" },
      }),
    ).toBe("2024-02-29");
  });

  it.each([
    ["形式が不正な開始日", "2026-8-15", "2026-08-17"],
    ["形式が不正な終了日", "2026-08-15", "2026/08/17"],
    ["実在しない開始日", "2026-02-30", "2026-03-02"],
    ["実在しない終了日", "2026-02-01", "2026-02-30"],
    ["平年の2月29日", "2026-02-28", "2026-02-29"],
  ])("%sなら undefined を返す", (_label, startDate, endDate) => {
    expect(
      resolveAllDayLastDate({
        start: { date: startDate },
        end: { date: endDate },
      }),
    ).toBeUndefined();
  });

  it.each([
    ["終了日が開始日と同じ", "2026-08-15", "2026-08-15"],
    ["終了日が開始日より前", "2026-08-15", "2026-08-14"],
  ])("%s異常な範囲なら undefined を返す", (_label, startDate, endDate) => {
    expect(
      resolveAllDayLastDate({
        start: { date: startDate },
        end: { date: endDate },
      }),
    ).toBeUndefined();
  });

  it("時刻付き予定なら undefined を返す", () => {
    expect(
      resolveAllDayLastDate({
        start: { dateTime: "2026-08-15T10:00:00+09:00" },
        end: { dateTime: "2026-08-15T11:00:00+09:00" },
      }),
    ).toBeUndefined();
  });
});
