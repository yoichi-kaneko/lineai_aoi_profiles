import { describe, expect, it } from "vitest";
import {
  formatEvent,
  getTimezoneOffsetString,
  isValidDateString,
  previousDay,
  resolveAllDayLastDate,
  toRFC3339,
} from "../../src/google_calendar/get_events.js";

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

describe("date helpers", () => {
  it("実在する YYYY-MM-DD だけを受け付ける", () => {
    expect(isValidDateString("2024-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-8-9")).toBe(false);
  });

  it("UTC 基準で前日を返す", () => {
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
    expect(previousDay("2024-03-01")).toBe("2024-02-29");
  });

  it("タイムゾーンオフセット文字列を返す", () => {
    expect(getTimezoneOffsetString("Asia/Tokyo", "2026-08-20T00:00:00")).toBe("+09:00");
  });

  it("RFC3339 へ変換する", () => {
    expect(toRFC3339("2026-08-20T23:59:59", "Asia/Tokyo")).toBe(
      "2026-08-20T23:59:59+09:00",
    );
  });
});

describe("formatEvent", () => {
  it("終日予定なら allDayLastDate を含める", () => {
    expect(
      formatEvent({
        summary: "夏休み",
        start: { date: "2026-08-15" },
        end: { date: "2026-08-17" },
      }),
    ).toEqual({
      summary: "夏休み",
      description: undefined,
      location: undefined,
      start: { date: "2026-08-15" },
      end: { date: "2026-08-17" },
      allDayLastDate: "2026-08-16",
    });
  });

  it("時刻付き予定には allDayLastDate を含めない", () => {
    expect(
      formatEvent({
        summary: "会議",
        start: { dateTime: "2026-08-15T10:00:00+09:00" },
        end: { dateTime: "2026-08-15T11:00:00+09:00" },
      }),
    ).toEqual({
      summary: "会議",
      description: undefined,
      location: undefined,
      start: { dateTime: "2026-08-15T10:00:00+09:00" },
      end: { dateTime: "2026-08-15T11:00:00+09:00" },
    });
  });
});
