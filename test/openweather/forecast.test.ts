import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  isErrorResponse,
} from "../../src/openweather/forecast.js";

describe("openweather/forecast", () => {
  it("API エラーレスポンスを判定する", () => {
    expect(isErrorResponse({ cod: 401, message: "bad key" } as never)).toBe(true);
    expect(
      isErrorResponse({
        timezone: "Asia/Tokyo",
        timezone_offset: 32400,
        lat: 0,
        lon: 0,
        current: {} as never,
        hourly: [],
        daily: [],
      } as never),
    ).toBe(false);
  });

  it("JST で日時を整形する", () => {
    expect(formatDate(0)).toBe("1970/01/01");
    expect(formatDateTime(0)).toContain("1970/01/01");
  });
});
