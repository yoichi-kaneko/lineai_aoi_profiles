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
});
