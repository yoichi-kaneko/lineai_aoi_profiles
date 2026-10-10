import { validateSignature, webhook } from "@line/bot-sdk";

/**
 * LINE Webhook を受ける関数に共通する、署名の検証と送信者の確認。
 *
 * 関数はアカウント（チャネル）ごとに分かれており、それぞれのチャネルシークレットで署名を検証する。
 * 送信者は、どのアカウントでも運用者本人（`LINE_USER_ID`）だけを受け付ける。
 */

export interface LineWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

export type LineWebhookAuthResult =
  | { ok: true; lineUserId: string }
  | { ok: false; status: number; body: string };

export interface LineWebhookAuthOptions {
  /** 署名の検証に使うチャネルシークレットの環境変数名。受けるアカウントごとに異なる。 */
  channelSecretEnvName: string;
  validateSignatureFn?: typeof validateSignature;
  env?: NodeJS.ProcessEnv;
}

/**
 * 署名を検証し、受け付ける送信者のユーザー ID を返す。
 *
 * 検証の順は、チャネルシークレットの設定 → 署名 → `LINE_USER_ID` の設定。
 * 署名を確かめる前に本文を読まないよう、本文は受け取らない。
 */
export function authenticateLineWebhook(
  req: LineWebhookRequest,
  options: LineWebhookAuthOptions,
): LineWebhookAuthResult {
  const env = options.env ?? process.env;
  const validateSignatureFn = options.validateSignatureFn ?? validateSignature;
  const channelSecret = env[options.channelSecretEnvName] ?? "";
  const lineUserId = env.LINE_USER_ID ?? "";
  const signatureHeader = req.headers["x-line-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!channelSecret) {
    return { ok: false, status: 500, body: `${options.channelSecretEnvName} is not configured` };
  }

  if (!signature || !req.rawBody || !validateSignatureFn(req.rawBody, channelSecret, signature)) {
    return { ok: false, status: 401, body: "Unauthorized" };
  }

  if (!lineUserId) {
    return { ok: false, status: 500, body: "LINE_USER_ID is not configured" };
  }

  return { ok: true, lineUserId };
}

/**
 * イベントの送り元を判定する。
 *
 * - `ignore`: グループ・複数人トークからのイベント。処理せずに読み飛ばす
 * - `forbidden`: 運用者以外が送ったメッセージ。リクエスト全体を 403 で打ち切る
 * - `accept`: それ以外。メッセージ以外のイベントをどう扱うかは、呼び出し側が決める
 */
export function judgeEventSource(
  event: webhook.Event,
  lineUserId: string,
): "accept" | "ignore" | "forbidden" {
  if (event.source?.type === "group" || event.source?.type === "room") {
    return "ignore";
  }
  if (event.type === "message" && event.source?.userId !== lineUserId) {
    return "forbidden";
  }
  return "accept";
}
