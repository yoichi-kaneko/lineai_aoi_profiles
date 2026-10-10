import { Timestamp } from "@google-cloud/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckinRecord,
  createReceiveCheckinMessageHandler,
  type CheckinHandlerRequest,
  type FirestoreLike,
} from "../../src/receiveCheckinMessage/handler";

type Event = CheckinHandlerRequest["body"]["events"][number];

const POSTED_AT = new Date("2026-10-10T15:30:12.345Z").getTime(); // JST 2026-10-11 00:30:12.345

function createFirestoreMock() {
  const adds: Array<{ collection: string; data: Record<string, unknown> }> = [];
  const firestore: FirestoreLike = {
    collection(name: string) {
      return {
        async add(data: Record<string, unknown>) {
          adds.push({ collection: name, data });
          return { id: `doc-${adds.length}` };
        },
      };
    },
  };
  return { firestore, adds };
}

function createResponseMock() {
  const sent: Array<{ code: number; body: string }> = [];
  return {
    sent,
    response: {
      status(code: number) {
        return {
          send(body: string) {
            sent.push({ code, body });
          },
        };
      },
    },
  };
}

function messageEvent(
  message: Record<string, unknown>,
  options: { userId?: string; sourceType?: string; timestamp?: number } = {},
): Event {
  const sourceType = options.sourceType ?? "user";
  return {
    type: "message",
    timestamp: options.timestamp ?? POSTED_AT,
    source:
      sourceType === "user"
        ? { type: "user", userId: options.userId ?? "user-1" }
        : { type: sourceType, groupId: "g1", userId: options.userId ?? "user-1" },
    message,
    replyToken: "reply",
    mode: "active",
    webhookEventId: "w1",
    deliveryContext: { isRedelivery: false },
  } as unknown as Event;
}

function locationMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "location",
    id: "500000000000000001",
    latitude: 35.6197,
    longitude: 139.7286,
    title: "大崎駅",
    address: "東京都品川区大崎",
    ...overrides,
  };
}

function textMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "text",
    id: "500000000000000002",
    text: "山頂に着いた",
    quoteToken: "qt",
    ...overrides,
  };
}

function imageMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "image",
    id: "500000000000000003",
    contentProvider: { type: "line" },
    quoteToken: "qt",
    ...overrides,
  };
}

function createRequest(events: Event[]): CheckinHandlerRequest {
  return {
    headers: { "x-line-signature": "sig" },
    rawBody: Buffer.from("body"),
    body: { destination: "dest", events },
  };
}

describe("buildCheckinRecord", () => {
  it("位置情報は座標・場所名・住所を残す", () => {
    expect(buildCheckinRecord(locationMessage() as never)).toEqual({
      type: "location",
      description: {
        message_id: "500000000000000001",
        latitude: 35.6197,
        longitude: 139.7286,
        title: "大崎駅",
        address: "東京都品川区大崎",
      },
    });
  });

  it("場所名・住所が無い位置情報は、その項目を省く", () => {
    expect(
      buildCheckinRecord(locationMessage({ title: undefined, address: "" }) as never),
    ).toEqual({
      type: "location",
      description: { message_id: "500000000000000001", latitude: 35.6197, longitude: 139.7286 },
    });
  });

  it.each([
    ["緯度が無い", { latitude: undefined }],
    ["経度が数値でない", { longitude: "139.7" }],
    ["緯度が範囲外", { latitude: 91 }],
    ["経度が範囲外", { longitude: -181 }],
    ["座標が NaN", { latitude: Number.NaN }],
  ])("%s位置情報は保存しない", (_label, overrides) => {
    expect(buildCheckinRecord(locationMessage(overrides) as never)).toBeNull();
  });

  it("テキストは本文と、引用返信のときだけ引用元のメッセージ ID を残す", () => {
    expect(buildCheckinRecord(textMessage() as never)).toEqual({
      type: "text",
      description: { message_id: "500000000000000002", text: "山頂に着いた" },
    });
    expect(
      buildCheckinRecord(textMessage({ quotedMessageId: "500000000000000001" }) as never),
    ).toEqual({
      type: "text",
      description: {
        message_id: "500000000000000002",
        text: "山頂に着いた",
        quoted_message_id: "500000000000000001",
      },
    });
  });

  it("画像はメッセージ ID と、まとめて送ったときだけ組の情報を残す", () => {
    expect(buildCheckinRecord(imageMessage() as never)).toEqual({
      type: "image",
      description: { message_id: "500000000000000003" },
      imageMessageId: "500000000000000003",
    });
    expect(
      buildCheckinRecord(
        imageMessage({ imageSet: { id: "set-1", index: 2, total: 3 } }) as never,
      ),
    ).toEqual({
      type: "image",
      description: {
        message_id: "500000000000000003",
        image_set: { id: "set-1", index: 2, total: 3 },
      },
      imageMessageId: "500000000000000003",
    });
  });

  it("組の index / total が無い場合は、組の ID だけを残す", () => {
    expect(
      buildCheckinRecord(imageMessage({ imageSet: { id: "set-1" } }) as never)?.description,
    ).toEqual({ message_id: "500000000000000003", image_set: { id: "set-1" } });
  });

  it("外部の URL を指す画像は保存しない", () => {
    expect(
      buildCheckinRecord(
        imageMessage({
          contentProvider: { type: "external", originalContentUrl: "https://example.com/a.jpg" },
        }) as never,
      ),
    ).toBeNull();
  });

  it.each([
    ["スタンプ", { type: "sticker", id: "1", packageId: "1", stickerId: "1" }],
    ["動画", { type: "video", id: "1", contentProvider: { type: "line" } }],
    ["メッセージ ID が無い位置情報", locationMessage({ id: undefined })],
    ["本文が無いテキスト", textMessage({ text: undefined })],
  ])("%sは保存しない", (_label, message) => {
    expect(buildCheckinRecord(message as never)).toBeNull();
  });
});

describe("createReceiveCheckinMessageHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CHECKIN_LINE_CHANNEL_SECRET: "checkin-secret",
      LINE_USER_ID: "user-1",
    };
    delete process.env.LINE_CHANNEL_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("地写のチャネルシークレットで署名を検証する", async () => {
    const { firestore } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const validateSignatureFn = vi.fn(() => true);
    const handler = createReceiveCheckinMessageHandler({ firestore, validateSignatureFn });

    await handler(createRequest([]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(validateSignatureFn).toHaveBeenCalledWith(expect.any(Buffer), "checkin-secret", "sig");
  });

  it("CHECKIN_LINE_CHANNEL_SECRET が無ければ 500 で、碧衣のシークレットでは代用しない", async () => {
    process.env.CHECKIN_LINE_CHANNEL_SECRET = "";
    process.env.LINE_CHANNEL_SECRET = "aoi-secret";
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const validateSignatureFn = vi.fn(() => true);
    const handler = createReceiveCheckinMessageHandler({ firestore, validateSignatureFn });

    await handler(createRequest([messageEvent(locationMessage())]), response);

    expect(sent).toEqual([{ code: 500, body: "CHECKIN_LINE_CHANNEL_SECRET is not configured" }]);
    expect(validateSignatureFn).not.toHaveBeenCalled();
    expect(adds).toHaveLength(0);
  });

  it("署名が無効なら 401 で保存しない", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => false,
    });

    await handler(createRequest([messageEvent(locationMessage())]), response);

    expect(sent).toEqual([{ code: 401, body: "Unauthorized" }]);
    expect(adds).toHaveLength(0);
  });

  it("許可ユーザー以外のメッセージは 403 で保存しない", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(
      createRequest([messageEvent(locationMessage(), { userId: "other-user" })]),
      response,
    );

    expect(sent).toEqual([{ code: 403, body: "Forbidden" }]);
    expect(adds).toHaveLength(0);
  });

  it.each(["group", "room"])("%s からのメッセージは保存せず 200 を返す", async (sourceType) => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(createRequest([messageEvent(locationMessage(), { sourceType })]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(0);
  });

  it("位置情報を checkin_logs に保存する（date は JST の日付、postedAt はミリ秒まで）", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      now: () => new Date("2026-10-10T15:30:13Z"),
    });

    await handler(createRequest([messageEvent(locationMessage())]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    expect(adds[0].collection).toBe("checkin_logs");
    const data = adds[0].data;
    expect(Object.keys(data).sort()).toEqual(
      ["createdAt", "date", "description", "postedAt", "type"].sort(),
    );
    expect(data.type).toBe("location");
    expect((data.date as Timestamp).toDate().toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect((data.postedAt as Timestamp).toMillis()).toBe(POSTED_AT);
    expect((data.createdAt as Timestamp).toDate().toISOString()).toBe("2026-10-10T15:30:13.000Z");
    expect(JSON.parse(data.description as string)).toEqual({
      message_id: "500000000000000001",
      latitude: 35.6197,
      longitude: 139.7286,
      title: "大崎駅",
      address: "東京都品川区大崎",
    });
  });

  it("テキストは line_text として扱わず、checkin_logs にだけ保存する", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    // 碧衣のトリガー語や評価の書式でも、地写ではただの記録として残す
    await handler(
      createRequest([
        messageEvent(textMessage({ text: "下山しました", quotedMessageId: "500000000000000001" })),
        messageEvent(textMessage({ id: "500000000000000004", text: "評価 5 よい眺め" })),
      ]),
      response,
    );

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds.map((add) => add.collection)).toEqual(["checkin_logs", "checkin_logs"]);
    expect(adds.map((add) => add.data.type)).toEqual(["text", "text"]);
    expect(JSON.parse(adds[0].data.description as string)).toEqual({
      message_id: "500000000000000002",
      text: "下山しました",
      quoted_message_id: "500000000000000001",
    });
  });

  it("画像は記録してから、地写の接頭辞で Cloudinary へ保存する", async () => {
    const order: string[] = [];
    const adds: Array<{ collection: string; data: Record<string, unknown> }> = [];
    const firestore: FirestoreLike = {
      collection(name: string) {
        return {
          async add(data: Record<string, unknown>) {
            order.push("add");
            adds.push({ collection: name, data });
            return {};
          },
        };
      },
    };
    const storeMock = vi.fn(async () => {
      order.push("store");
    });
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      storeLineImageFn: storeMock,
    });

    await handler(
      createRequest([messageEvent(imageMessage({ imageSet: { id: "set-1", index: 1, total: 2 } }))]),
      response,
    );

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds[0].collection).toBe("checkin_logs");
    expect(adds[0].data.type).toBe("image");
    expect(JSON.parse(adds[0].data.description as string)).toEqual({
      message_id: "500000000000000003",
      image_set: { id: "set-1", index: 1, total: 2 },
    });
    expect(storeMock).toHaveBeenCalledWith("500000000000000003");
    expect(order).toEqual(["add", "store"]);
  });

  it("既定の画像の保存は、地写のアクセストークンを使う", async () => {
    const { firestore } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.LINE_ACCESS_TOKEN = "aoi-token";
    delete process.env.CHECKIN_LINE_ACCESS_TOKEN;
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(createRequest([messageEvent(imageMessage())]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    const warned = warnSpy.mock.calls.flat().map(String).join(" ");
    expect(warned).toContain("CHECKIN_LINE_ACCESS_TOKEN");
  });

  it("Cloudinary への保存に失敗しても記録は残り 200 を返す", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const failure = Object.assign(new Error("upload failed"), {
      http_code: 500,
      request: { headers: { authorization: "Bearer secret-token" } },
    });
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      storeLineImageFn: vi.fn(async () => {
        throw failure;
      }),
    });

    await handler(createRequest([messageEvent(imageMessage())]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("upload failed");
    expect(logged).not.toContain("secret-token");
  });

  it("記録に失敗した画像は Cloudinary へ保存しない", async () => {
    const firestore: FirestoreLike = {
      collection() {
        return {
          async add() {
            throw new Error("firestore unavailable");
          },
        };
      },
    };
    const storeMock = vi.fn(async () => {});
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      storeLineImageFn: storeMock,
    });

    await expect(handler(createRequest([messageEvent(imageMessage())]), response)).rejects.toThrow(
      "firestore unavailable",
    );
    expect(sent).toEqual([]);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("位置情報・テキストでは Cloudinary への保存を呼ばない", async () => {
    const { firestore } = createFirestoreMock();
    const { response } = createResponseMock();
    const storeMock = vi.fn(async () => {});
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      storeLineImageFn: storeMock,
    });

    await handler(
      createRequest([messageEvent(locationMessage()), messageEvent(textMessage())]),
      response,
    );

    expect(storeMock).not.toHaveBeenCalled();
  });

  it("友だち追加などのメッセージ以外のイベントは、例外にせず読み飛ばす", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });
    const follow = {
      type: "follow",
      timestamp: POSTED_AT,
      source: { type: "user", userId: "user-1" },
      replyToken: "reply",
      mode: "active",
      webhookEventId: "w1",
      deliveryContext: { isRedelivery: false },
      follow: { isUnblocked: false },
    } as unknown as Event;
    const unfollowFromOther = {
      type: "unfollow",
      timestamp: POSTED_AT,
      source: { type: "user", userId: "other-user" },
      mode: "active",
      webhookEventId: "w2",
      deliveryContext: { isRedelivery: false },
    } as unknown as Event;

    await handler(createRequest([follow, unfollowFromOther]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(0);
  });

  it("未対応のメッセージ・不完全なイベントは読み飛ばし、同じリクエストの他のメッセージは保存する", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });
    const withoutMessage = {
      ...messageEvent(locationMessage()),
      message: undefined,
    } as unknown as Event;

    await handler(
      createRequest([
        messageEvent({ type: "sticker", id: "1", packageId: "1", stickerId: "1", quoteToken: "qt" }),
        withoutMessage,
        messageEvent(locationMessage(), { timestamp: Number.NaN }),
        messageEvent(locationMessage()),
      ]),
      response,
    );

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    expect(adds[0].data.type).toBe("location");
  });

  it("ログには種別と件数だけを出し、本文・座標・住所は出さない", async () => {
    const { firestore } = createFirestoreMock();
    const { response } = createResponseMock();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      storeLineImageFn: vi.fn(async () => {}),
    });

    await handler(
      createRequest([
        messageEvent(locationMessage()),
        messageEvent(textMessage({ text: "秘密の山頂メモ" })),
        messageEvent(imageMessage()),
        messageEvent({ type: "sticker", id: "1", packageId: "1", stickerId: "1", quoteToken: "qt" }),
      ]),
      response,
    );

    expect(logSpy).toHaveBeenCalledWith("Checkin messages: location=1, text=1, image=1, ignored=1");
    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    for (const secret of ["秘密の山頂メモ", "35.6197", "139.7286", "大崎駅", "東京都品川区大崎"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("イベントが無いリクエスト（LINE の接続確認）では何もログに出さない", async () => {
    const { firestore } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = createReceiveCheckinMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(createRequest([]), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
