import { describe, expect, it, vi } from "vitest";
import type { webhook } from "@line/bot-sdk";
import {
  authenticateLineWebhook,
  judgeEventSource,
  type LineWebhookRequest,
} from "../../src/lib/lineWebhook";

const request = {
  headers: { "x-line-signature": "sig" },
  rawBody: Buffer.from("body"),
};

const env = { MY_CHANNEL_SECRET: "secret", LINE_USER_ID: "user-1" };

describe("authenticateLineWebhook", () => {
  it("指定した変数のチャネルシークレットで署名を検証し、許可ユーザーを返す", () => {
    const validateSignatureFn = vi.fn(() => true);

    const result = authenticateLineWebhook(request, {
      channelSecretEnvName: "MY_CHANNEL_SECRET",
      validateSignatureFn,
      env: { ...env, LINE_CHANNEL_SECRET: "other-secret" },
    });

    expect(result).toEqual({ ok: true, lineUserId: "user-1" });
    expect(validateSignatureFn).toHaveBeenCalledWith(request.rawBody, "secret", "sig");
  });

  it("チャネルシークレットが無ければ、変数名を添えて 500 を返し、署名を検証しない", () => {
    const validateSignatureFn = vi.fn(() => true);

    const result = authenticateLineWebhook(request, {
      channelSecretEnvName: "MY_CHANNEL_SECRET",
      validateSignatureFn,
      env: { LINE_USER_ID: "user-1" },
    });

    expect(result).toEqual({ ok: false, status: 500, body: "MY_CHANNEL_SECRET is not configured" });
    expect(validateSignatureFn).not.toHaveBeenCalled();
  });

  it.each<[string, LineWebhookRequest, () => boolean]>([
    ["署名が一致しない", request, () => false],
    ["署名ヘッダーが無い", { headers: {}, rawBody: Buffer.from("body") }, () => true],
    ["本文の生データが無い", { headers: { "x-line-signature": "sig" } }, () => true],
  ])("%s場合は 401", (_label, req, validateSignatureFn) => {
    const result = authenticateLineWebhook(req, {
      channelSecretEnvName: "MY_CHANNEL_SECRET",
      validateSignatureFn,
      env,
    });

    expect(result).toEqual({ ok: false, status: 401, body: "Unauthorized" });
  });

  it("署名ヘッダーが複数あれば先頭を使う", () => {
    const validateSignatureFn = vi.fn(() => true);

    authenticateLineWebhook(
      { headers: { "x-line-signature": ["sig-1", "sig-2"] }, rawBody: Buffer.from("body") },
      { channelSecretEnvName: "MY_CHANNEL_SECRET", validateSignatureFn, env },
    );

    expect(validateSignatureFn).toHaveBeenCalledWith(expect.any(Buffer), "secret", "sig-1");
  });

  it("署名が正しくても LINE_USER_ID が無ければ 500", () => {
    const result = authenticateLineWebhook(request, {
      channelSecretEnvName: "MY_CHANNEL_SECRET",
      validateSignatureFn: () => true,
      env: { MY_CHANNEL_SECRET: "secret" },
    });

    expect(result).toEqual({ ok: false, status: 500, body: "LINE_USER_ID is not configured" });
  });
});

describe("judgeEventSource", () => {
  function event(type: string, source: Record<string, unknown>): webhook.Event {
    return { type, source, timestamp: 0 } as unknown as webhook.Event;
  }

  it("許可ユーザーのメッセージは受け付ける", () => {
    expect(judgeEventSource(event("message", { type: "user", userId: "user-1" }), "user-1")).toBe(
      "accept",
    );
  });

  it("許可ユーザー以外のメッセージは拒否する", () => {
    expect(judgeEventSource(event("message", { type: "user", userId: "other" }), "user-1")).toBe(
      "forbidden",
    );
  });

  it.each(["group", "room"])("%s からのイベントは読み飛ばす", (type) => {
    expect(judgeEventSource(event("message", { type, userId: "user-1" }), "user-1")).toBe("ignore");
  });

  it("メッセージ以外のイベントは送信者によらず呼び出し側へ委ねる", () => {
    expect(judgeEventSource(event("follow", { type: "user", userId: "other" }), "user-1")).toBe(
      "accept",
    );
  });
});
