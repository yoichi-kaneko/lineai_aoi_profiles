import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReceiveLineMessageHandler,
  type FirestoreLike,
  type HandlerRequest,
} from "../../src/receiveLineMessage/handler";

function createFirestoreMock() {
  const adds: Array<{ collection: string; data: Record<string, unknown> }> = [];
  const firestore: FirestoreLike = {
    collection(name: string) {
      return {
        async add(data: Record<string, unknown>) {
          adds.push({ collection: name, data });
          return {};
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

function createTextRequest(text: string, userId = "user-1"): HandlerRequest {
  return {
    headers: { "x-line-signature": "sig" },
    rawBody: Buffer.from("body"),
    body: {
      destination: "dest",
      events: [
        {
          type: "message",
          timestamp: new Date("2026-08-20T01:23:00Z").getTime(),
          source: { type: "user", userId },
          message: { type: "text", id: "m1", text, quoteToken: "qt1" },
          replyToken: "reply",
          mode: "active",
          webhookEventId: "w1",
          deliveryContext: { isRedelivery: false },
        },
      ],
    },
  };
}

describe("createReceiveLineMessageHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LINE_CHANNEL_SECRET: "secret",
      LINE_USER_ID: "user-1",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("署名が無効なら 401", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => false,
    });

    await handler(createTextRequest("こんにちは"), response);

    expect(sent).toEqual([{ code: 401, body: "Unauthorized" }]);
    expect(adds).toHaveLength(0);
  });

  it("LINE_CHANNEL_SECRET 未設定なら 500 で署名検証しない", async () => {
    process.env.LINE_CHANNEL_SECRET = "";
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const validateSignatureFn = vi.fn(() => true);
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn,
    });

    await handler(createTextRequest("こんにちは"), response);

    expect(sent).toEqual([{ code: 500, body: "LINE_CHANNEL_SECRET is not configured" }]);
    expect(validateSignatureFn).not.toHaveBeenCalled();
    expect(adds).toHaveLength(0);
  });

  it("許可ユーザー不一致なら 403", async () => {
    const { firestore } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(createTextRequest("こんにちは", "other-user"), response);

    expect(sent).toEqual([{ code: 403, body: "Forbidden" }]);
  });

  it("画像フィードバックは notes に入れず専用コレクションへ保存する", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const execMock = vi.fn();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      execEc2CommandFn: execMock,
      now: () => new Date("2026-08-20T12:34:56Z"),
    });

    await handler(createTextRequest("評価 2026-06-12 5 ルリが可愛い"), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    expect(adds[0].collection).toBe("image_feedback");
    expect(adds[0].data.type).toBe("image_feedback");
    expect(adds[0].data.description).toBe(
      JSON.stringify({
        kind: "rating",
        score: 5,
        comment: "ルリが可愛い",
        target_date: "2026-06-12",
      }),
    );
    expect(execMock).not.toHaveBeenCalled();
  });

  it("楽曲フィードバックは notes に入れず専用コレクションへ保存する", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const execMock = vi.fn();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      execEc2CommandFn: execMock,
      now: () => new Date("2026-08-20T12:34:56Z"),
    });

    await handler(createTextRequest("楽曲評価 2026-06-12 4 サビが好き"), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    expect(adds[0].collection).toBe("song_feedback");
    expect(adds[0].data.type).toBe("song_feedback");
    expect(adds[0].data.description).toBe(
      JSON.stringify({
        kind: "rating",
        score: 4,
        comment: "サビが好き",
        target_date: "2026-06-12",
      }),
    );
    expect(execMock).not.toHaveBeenCalled();
  });

  it("通常テキストは notes に保存し、トリガー語なら EC2 を呼ぶ", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const execMock = vi.fn();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
      execEc2CommandFn: execMock,
      now: () => new Date("2026-08-20T12:34:56Z"),
    });

    await handler(createTextRequest("下山しました"), response);

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(1);
    expect(adds[0].collection).toBe("notes");
    expect(adds[0].data.description).toBe("下山しました");
    expect(adds[0].data.type).toBe("line_text");
    expect(execMock).toHaveBeenCalledWith("off_mountain");
  });

  it("group/room メッセージは無視して 200 を返す", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(
      {
        headers: { "x-line-signature": "sig" },
        rawBody: Buffer.from("body"),
        body: {
          destination: "dest",
          events: [
            {
              type: "message",
              timestamp: Date.now(),
              source: { type: "group", groupId: "g1" },
              message: { type: "text", id: "m1", text: "こんにちは", quoteToken: "qt1" },
              replyToken: "reply",
              mode: "active",
              webhookEventId: "w1",
              deliveryContext: { isRedelivery: false },
            },
          ],
        },
      },
      response,
    );

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(0);
  });

  it("不完全な message イベントは無視して 200 を返す", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await handler(
      {
        headers: { "x-line-signature": "sig" },
        rawBody: Buffer.from("body"),
        body: {
          destination: "dest",
          events: [
            {
              type: "message",
              timestamp: Date.now(),
              source: { type: "user", userId: "user-1" },
              replyToken: "reply",
              mode: "active",
              webhookEventId: "w1",
              deliveryContext: { isRedelivery: false },
            } as unknown as HandlerRequest["body"]["events"][number],
          ],
        },
      },
      response,
    );

    expect(sent).toEqual([{ code: 200, body: "OK" }]);
    expect(adds).toHaveLength(0);
  });

  it("未対応イベントは例外を投げる", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await expect(
      handler(
        {
          headers: { "x-line-signature": "sig" },
          rawBody: Buffer.from("body"),
          body: {
            destination: "dest",
            events: [
              {
                type: "follow",
                timestamp: Date.now(),
                source: { type: "user", userId: "user-1" },
                replyToken: "reply",
                mode: "active",
                webhookEventId: "w1",
                deliveryContext: { isRedelivery: false },
              } as unknown as HandlerRequest["body"]["events"][number],
            ],
          },
        },
        response,
      ),
    ).rejects.toThrow("Unsupported event: type=follow, message.type=N/A");

    expect(sent).toEqual([]);
    expect(adds).toHaveLength(0);
  });

  it("未対応メッセージタイプは例外を投げる", async () => {
    const { firestore, adds } = createFirestoreMock();
    const { response, sent } = createResponseMock();
    const handler = createReceiveLineMessageHandler({
      firestore,
      validateSignatureFn: () => true,
    });

    await expect(
      handler(
        {
          headers: { "x-line-signature": "sig" },
          rawBody: Buffer.from("body"),
          body: {
            destination: "dest",
            events: [
              {
                type: "message",
                timestamp: Date.now(),
                source: { type: "user", userId: "user-1" },
                message: { type: "sticker", id: "m1", packageId: "1", stickerId: "1" },
                replyToken: "reply",
                mode: "active",
                webhookEventId: "w1",
                deliveryContext: { isRedelivery: false },
              } as unknown as HandlerRequest["body"]["events"][number],
            ],
          },
        },
        response,
      ),
    ).rejects.toThrow("Unsupported event: type=message, message.type=sticker");

    expect(sent).toEqual([]);
    expect(adds).toHaveLength(0);
  });
});
