import { describe, expect, it } from "vitest";
import {
  buildMeta,
  formatCheckin,
  resolveJstDateRange,
} from "../../src/swarm/get_checkins.js";

describe("swarm/get_checkins", () => {
  it("checkin を整形する", () => {
    const result = formatCheckin({
      id: "c1",
      createdAt: 0,
      venue: {
        id: "v1",
        name: "Cafe",
        categories: [{ name: "Coffee Shop" }],
        location: { formattedAddress: ["Tokyo"] },
      },
      photos: {
        count: 1,
        items: [{ prefix: "https://img/", suffix: ".jpg", width: 100, height: 200 }],
      },
      likes: { count: 2 },
      comments: { count: 3 },
    });

    expect(result).toMatchObject({
      id: "c1",
      venue: {
        id: "v1",
        name: "Cafe",
        category: "Coffee Shop",
        address: ["Tokyo"],
      },
      photos_count: 1,
      likes_count: 2,
      comments_count: 3,
    });
  });

  it("meta を組み立てる", () => {
    expect(
      buildMeta({ isComplete: false, returnedCount: 10, limitApplied: 250, truncatedReason: "limit_reached" }),
    ).toMatchObject({
      is_complete: false,
      returned_count: 10,
      limit_applied: 250,
      truncated_reason: "limit_reached",
    });
  });

  it("JST 日付範囲を timestamp に変換する", () => {
    expect(resolveJstDateRange("2024-01-01", "2024-01-01")).toEqual({
      afterTimestamp: 1704034800,
      beforeTimestamp: 1704121200,
    });
  });

  it("存在しない日付を拒否する", () => {
    expect(() => resolveJstDateRange("2024-02-30", "2024-03-01")).toThrow(
      "日付は YYYY-MM-DD 形式で指定してください",
    );
    expect(() => resolveJstDateRange("2023-02-28", "2023-02-29")).toThrow(
      "日付は YYYY-MM-DD 形式で指定してください",
    );
  });

  it("DST 境界日でも UTC 基準で beforeTimestamp を計算する", () => {
    expect(resolveJstDateRange("2024-03-10", "2024-03-10")).toEqual({
      afterTimestamp: 1709996400,
      beforeTimestamp: 1710082800,
    });
  });
});
