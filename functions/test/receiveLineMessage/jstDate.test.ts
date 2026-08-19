import { describe, expect, it } from "vitest";
import { jstDateFromYmd, startOfJstDay } from "../../src/receiveLineMessage/jstDate";

describe("jstDate helpers", () => {
  it("UTC 午後は JST 当日に丸める", () => {
    expect(startOfJstDay(new Date("2026-08-19T18:30:00Z")).toISOString()).toBe(
      "2026-08-20T00:00:00.000Z",
    );
  });

  it("UTC 深夜でも JST 基準で同日を返す", () => {
    expect(startOfJstDay(new Date("2026-08-20T00:30:00Z")).toISOString()).toBe(
      "2026-08-20T00:00:00.000Z",
    );
  });

  it("YYYY-MM-DD を UTC midnight に変換する", () => {
    expect(jstDateFromYmd("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
});
