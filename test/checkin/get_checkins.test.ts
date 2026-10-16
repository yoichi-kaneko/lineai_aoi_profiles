import { describe, expect, it } from "vitest";
import {
  LINK_WINDOW_MS,
  groupCheckins,
  parseCheckinLogDoc,
  resolveJstRange,
  toJstIsoString,
  type CheckinLogRecord,
} from "../../src/checkin/get_checkins.js";

const MINUTE = 60 * 1000;

/** 2026-10-11 09:00 JST */
const BASE = Date.UTC(2026, 9, 11, 0, 0, 0);

const range = resolveJstRange("2026-10-11", "2026-10-11");

function location(id: string, minutes: number, extra: Partial<CheckinLogRecord> = {}): CheckinLogRecord {
  return {
    type: "location",
    messageId: id,
    postedAtMs: BASE + minutes * MINUTE,
    latitude: 35.62,
    longitude: 139.72,
    ...extra,
  } as CheckinLogRecord;
}

function text(id: string, minutes: number, quotedMessageId?: string): CheckinLogRecord {
  return {
    type: "text",
    messageId: id,
    postedAtMs: BASE + minutes * MINUTE,
    text: `text ${id}`,
    ...(quotedMessageId ? { quotedMessageId } : {}),
  };
}

function image(id: string, minutes: number, setId?: string): CheckinLogRecord {
  return {
    type: "image",
    messageId: id,
    postedAtMs: BASE + minutes * MINUTE,
    ...(setId ? { imageSet: { id: setId } } : {}),
  };
}

function timestamp(ms: number) {
  return { toMillis: () => ms };
}

describe("checkin/get_checkins", () => {
  describe("resolveJstRange", () => {
    it("JST の 0:00 から、終わりの日の翌日 0:00 の手前までを返す", () => {
      expect(resolveJstRange("2026-10-11", "2026-10-12")).toEqual({
        startMs: Date.UTC(2026, 9, 10, 15, 0, 0),
        endMs: Date.UTC(2026, 9, 12, 15, 0, 0),
      });
    });

    it("形式の誤り・存在しない日付・逆順を拒否する", () => {
      expect(() => resolveJstRange("2026/10/11", "2026-10-11")).toThrow("YYYY-MM-DD");
      expect(() => resolveJstRange("2026-02-30", "2026-02-30")).toThrow("YYYY-MM-DD");
      expect(() => resolveJstRange(undefined, "2026-10-11")).toThrow("YYYY-MM-DD");
      expect(() => resolveJstRange("2026-10-12", "2026-10-11")).toThrow("以前");
    });
  });

  describe("toJstIsoString", () => {
    it("JST の時刻を秒までで表す", () => {
      expect(toJstIsoString(BASE + 12 * MINUTE + 3_456)).toBe("2026-10-11T09:12:03+09:00");
    });
  });

  describe("parseCheckinLogDoc", () => {
    it("位置情報を読み、任意項目は付いているときだけ入れる", () => {
      expect(
        parseCheckinLogDoc({
          type: "location",
          postedAt: timestamp(BASE),
          description: JSON.stringify({
            message_id: "1",
            latitude: 35.62,
            longitude: 139.72,
            title: "大崎駅",
          }),
        }),
      ).toEqual({
        type: "location",
        messageId: "1",
        postedAtMs: BASE,
        latitude: 35.62,
        longitude: 139.72,
        title: "大崎駅",
      });
    });

    it("引用元のあるテキストと、複数枚の組の写真を読む", () => {
      expect(
        parseCheckinLogDoc({
          type: "text",
          postedAt: timestamp(BASE),
          description: JSON.stringify({ message_id: "2", text: "到着", quoted_message_id: "1" }),
        }),
      ).toEqual({ type: "text", messageId: "2", postedAtMs: BASE, text: "到着", quotedMessageId: "1" });

      expect(
        parseCheckinLogDoc({
          type: "image",
          postedAt: timestamp(BASE),
          description: JSON.stringify({ message_id: "3", image_set: { id: "s", index: 1, total: 2 } }),
        }),
      ).toEqual({
        type: "image",
        messageId: "3",
        postedAtMs: BASE,
        imageSet: { id: "s", index: 1, total: 2 },
      });
    });

    it("時刻・メッセージ ID・座標が欠けたもの、壊れた JSON、未知の種別は読み飛ばす", () => {
      const description = JSON.stringify({ message_id: "1", latitude: 35, longitude: 139 });
      expect(parseCheckinLogDoc({ type: "location", description })).toBeNull();
      expect(
        parseCheckinLogDoc({ type: "location", postedAt: timestamp(BASE), description: "{" }),
      ).toBeNull();
      expect(
        parseCheckinLogDoc({
          type: "location",
          postedAt: timestamp(BASE),
          description: JSON.stringify({ message_id: "1", latitude: 91, longitude: 139 }),
        }),
      ).toBeNull();
      expect(
        parseCheckinLogDoc({
          type: "text",
          postedAt: timestamp(BASE),
          description: JSON.stringify({ text: "no id" }),
        }),
      ).toBeNull();
      expect(parseCheckinLogDoc({ type: "sticker", postedAt: timestamp(BASE), description })).toBeNull();
    });
  });

  describe("groupCheckins", () => {
    it("位置情報の後10分以内に届いたテキスト・写真を紐づける", () => {
      const { checkins, unlinked } = groupCheckins(
        [location("1", 0), text("2", 3), image("3", 10)],
        range,
      );
      expect(checkins).toHaveLength(1);
      expect(checkins[0].comments.map((c) => c.message_id)).toEqual(["2"]);
      expect(checkins[0].photos.map((p) => p.message_id)).toEqual(["3"]);
      expect(unlinked).toEqual([]);
    });

    it("位置情報より前、10分を過ぎて届いたものは紐づけない", () => {
      const { checkins, unlinked } = groupCheckins(
        [image("1", 0), location("2", 1), text("3", 1 + LINK_WINDOW_MS / MINUTE + 1)],
        range,
      );
      expect(checkins[0].comments).toEqual([]);
      expect(checkins[0].photos).toEqual([]);
      expect(unlinked.map((u) => [u.type, u.message_id])).toEqual([
        ["image", "1"],
        ["text", "3"],
      ]);
    });

    it("直前の位置情報に紐づける", () => {
      const { checkins } = groupCheckins(
        [location("1", 0), location("2", 5), image("3", 7)],
        range,
      );
      expect(checkins.map((c) => c.photos.length)).toEqual([0, 1]);
    });

    it("位置情報への引用返信は、時間や後の位置情報によらず引用元に紐づける", () => {
      const { checkins, unlinked } = groupCheckins(
        [location("1", 0), location("2", 30), text("3", 32, "1"), text("4", 90, "1")],
        range,
      );
      expect(checkins[0].comments.map((c) => c.message_id)).toEqual(["3", "4"]);
      expect(checkins[1].comments).toEqual([]);
      expect(unlinked).toEqual([]);
    });

    it("位置情報以外への引用返信は、10分の規則で紐づける", () => {
      const { checkins } = groupCheckins(
        [location("1", 0), image("2", 1), text("3", 2, "2")],
        range,
      );
      expect(checkins[0].comments.map((c) => c.message_id)).toEqual(["3"]);
    });

    it("同じ組の写真は、最初の1枚と同じ位置情報にそろえる", () => {
      const { checkins, unlinked } = groupCheckins(
        [image("1", 0, "s"), location("2", 1), image("3", 2, "s")],
        range,
      );
      expect(checkins[0].photos).toEqual([]);
      expect(unlinked.map((u) => u.message_id)).toEqual(["1", "3"]);
    });

    it("届いた順に並べ、同時刻はメッセージ ID の順にする", () => {
      const { checkins } = groupCheckins(
        [image("12", 1), location("2", 0), image("9", 1), location("1", 0)],
        range,
      );
      expect(checkins.map((c) => c.message_id)).toEqual(["1", "2"]);
      expect(checkins[1].photos.map((p) => p.message_id)).toEqual(["9", "12"]);
    });

    it("範囲の終わりをまたいで届いたものは、範囲内の位置情報に紐づくときだけ入れる", () => {
      // 23:55 JST の位置情報と、翌日 00:03 JST の写真・テキスト
      const nearEnd = (range.endMs - BASE) / MINUTE - 5;
      const { checkins, unlinked } = groupCheckins(
        [location("1", nearEnd), image("2", nearEnd + 8), location("3", nearEnd + 20), text("4", nearEnd + 21)],
        range,
      );
      expect(checkins.map((c) => c.message_id)).toEqual(["1"]);
      expect(checkins[0].photos.map((p) => p.message_id)).toEqual(["2"]);
      expect(checkins[0].photos[0].posted_at).toBe("2026-10-12T00:03:00+09:00");
      expect(unlinked).toEqual([]);
    });

    it("範囲より前の記録は出さない", () => {
      const beforeStart = (range.startMs - BASE) / MINUTE - 1;
      const { checkins, unlinked } = groupCheckins(
        [location("1", beforeStart), text("2", beforeStart + 2)],
        range,
      );
      expect(checkins).toEqual([]);
      expect(unlinked.map((u) => u.message_id)).toEqual(["2"]);
    });

    it("場所名・住所・座標と時刻を出す", () => {
      const { checkins } = groupCheckins(
        [location("1", 0, { title: "高尾山口駅", address: "東京都八王子市" } as Partial<CheckinLogRecord>)],
        range,
      );
      expect(checkins[0]).toEqual({
        message_id: "1",
        posted_at: "2026-10-11T09:00:00+09:00",
        title: "高尾山口駅",
        address: "東京都八王子市",
        latitude: 35.62,
        longitude: 139.72,
        comments: [],
        photos: [],
      });
    });
  });
});
