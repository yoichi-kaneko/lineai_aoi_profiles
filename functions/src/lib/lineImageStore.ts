import { messagingApi } from "@line/bot-sdk";
import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";

/**
 * LINE で受け取った画像を、受信時に Cloudinary へ非公開で保存する。
 *
 * LINE 側のコンテンツは一定期間で削除され、`notes` の `line_image` に残るのはメッセージ ID だけのため、
 * 画像の実体を自前で持つために使う。
 *
 * 配信タイプは `authenticated`（原本も加工版も署名付き URL でしか取得できない）とする。
 * `private` は加工版が既定で公開のままで、それを塞ぐ Strict Transformations はアカウント全体に効き、
 * 送信画像のプレビュー URL（署名なしの縮小 URL）まで止めてしまうため使わない。
 *
 * public_id はメッセージ ID から決める。碧衣側の `src/line/download_image.ts` が同じ規則で組み立てて
 * 取得するため、Firestore の記録に保存先を持たせずに済む。
 */

/** 受信したチャネルごとの public_id の接頭辞。`src/line/download_image.ts` の値と一致させる。 */
export const LINE_IMAGE_PUBLIC_ID_PREFIX = {
  aoi: "line_aoi_",
} as const;

export type LineImageChannel = keyof typeof LINE_IMAGE_PUBLIC_ID_PREFIX;

/** LINE のメッセージ ID は数字列。public_id に使える文字だけを許し、想定外の値では保存しない。 */
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** LINE からの画像取得の待ち時間の上限。接続やストリーム読み取りが止まっても Webhook を長く止めない。 */
const FETCH_TIMEOUT_MS = 30_000;

/** アップロードの待ち時間の上限。Webhook の応答を長く止めないため、SDK 既定の 60 秒より短くする。 */
const UPLOAD_TIMEOUT_MS = 30_000;

/** 期限付きで Promise を待つ。超過したら message の Error で reject し、タイマーは必ず消す。 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function buildLineImagePublicId(channel: LineImageChannel, messageId: string): string | null {
  if (!MESSAGE_ID_PATTERN.test(messageId)) {
    return null;
  }
  return `${LINE_IMAGE_PUBLIC_ID_PREFIX[channel]}${messageId}`;
}

export interface LineImageStoreConfig {
  lineAccessToken: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** 受け取った画像の保存フォルダ。未設定ならフォルダを指定せずにアップロードする。 */
  assetFolder?: string;
}

export type LineImageStoreConfigResult =
  | { ok: true; config: LineImageStoreConfig }
  | { ok: false; missing: string[] };

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  // Secret Manager へ登録した値の末尾に改行が混じっても、認証ヘッダーや署名を壊さないようにする
  return (env[name] ?? "").trim();
}

/**
 * 環境変数から保存の設定を組み立てる。
 *
 * 足りない場合は、不足している変数名だけを返す（値はログへ出さないため返さない）。
 * `accessTokenEnvName` は、画像を受け取ったチャネルのアクセストークンの変数名。
 */
export function resolveLineImageStoreConfig(
  env: NodeJS.ProcessEnv,
  accessTokenEnvName: string,
): LineImageStoreConfigResult {
  const values = {
    lineAccessToken: readEnv(env, accessTokenEnvName),
    cloudName: readEnv(env, "CLOUDINARY_CLOUD_NAME"),
    apiKey: readEnv(env, "CLOUDINARY_API_KEY"),
    apiSecret: readEnv(env, "CLOUDINARY_API_SECRET"),
  };
  const names: Record<keyof typeof values, string> = {
    lineAccessToken: accessTokenEnvName,
    cloudName: "CLOUDINARY_CLOUD_NAME",
    apiKey: "CLOUDINARY_API_KEY",
    apiSecret: "CLOUDINARY_API_SECRET",
  };

  const missing = (Object.keys(values) as Array<keyof typeof values>)
    .filter((key) => values[key] === "")
    .map((key) => names[key]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const assetFolder = readEnv(env, "CLOUDINARY_RECEIVED_IMAGE_ASSET_FOLDER");
  return {
    ok: true,
    config: { ...values, ...(assetFolder ? { assetFolder } : {}) },
  };
}

/** 認証情報は SDK の全体設定を書き換えず、呼び出しごとに渡す。 */
export function buildUploadOptions(config: LineImageStoreConfig, publicId: string): UploadApiOptions {
  return {
    type: "authenticated",
    resource_type: "image",
    public_id: publicId,
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    timeout: UPLOAD_TIMEOUT_MS,
    ...(config.assetFolder ? { asset_folder: config.assetFolder } : {}),
  };
}

export interface LineImageStoreDeps {
  fetchContent?: (messageId: string, accessToken: string) => Promise<Buffer>;
  upload?: (data: Buffer, options: UploadApiOptions) => Promise<void>;
}

async function fetchLineContent(messageId: string, accessToken: string): Promise<Buffer> {
  const client = new messagingApi.MessagingApiBlobClient({ channelAccessToken: accessToken });
  return raceWithTimeout(
    (async () => {
      const readable = await client.getMessageContent(messageId);
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    })(),
    FETCH_TIMEOUT_MS,
    "LINE content fetch timed out",
  );
}

function uploadToCloudinary(data: Buffer, options: UploadApiOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("Cloudinary upload returned no result"));
        return;
      }
      resolve();
    });
    stream.end(data);
  });
}

/**
 * 1枚の画像を LINE から取得し、Cloudinary へ `authenticated` でアップロードする。
 * 取得・アップロードの失敗は例外として呼び出し元へ返す。
 *
 * @returns 保存した場合は `stored`、メッセージ ID が想定外の形で保存しなかった場合は `invalid_message_id`
 */
export async function storeLineImage(
  channel: LineImageChannel,
  messageId: string,
  config: LineImageStoreConfig,
  deps: LineImageStoreDeps = {},
): Promise<"stored" | "invalid_message_id"> {
  const publicId = buildLineImagePublicId(channel, messageId);
  if (!publicId) {
    return "invalid_message_id";
  }

  const fetchContent = deps.fetchContent ?? fetchLineContent;
  const upload = deps.upload ?? uploadToCloudinary;

  const data = await fetchContent(messageId, config.lineAccessToken);
  await upload(data, buildUploadOptions(config, publicId));
  return "stored";
}

/**
 * 環境変数から設定を読んで {@link storeLineImage} を呼ぶ。
 *
 * 設定が足りないときは、保存だけを飛ばして警告を出す（シークレットの登録とデプロイの順番に
 * 依存せず、従来の記録は続けられるようにするため）。
 */
export async function storeLineImageFromEnv(
  channel: LineImageChannel,
  messageId: string,
  accessTokenEnvName: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: LineImageStoreDeps = {},
): Promise<void> {
  const resolved = resolveLineImageStoreConfig(env, accessTokenEnvName);
  if (!resolved.ok) {
    console.warn(`Skipped storing LINE image: missing ${resolved.missing.join(", ")}`);
    return;
  }

  const result = await storeLineImage(channel, messageId, resolved.config, deps);
  if (result === "invalid_message_id") {
    console.warn("Skipped storing LINE image: unexpected message id format");
  }
}

/**
 * 例外をログ用の短い文字列にする。
 *
 * SDK の例外オブジェクトはリクエストの情報を抱えていることがあるため、そのままログへ渡さず、
 * 名前・メッセージ・HTTP ステータスだけを取り出す。
 */
export function summarizeError(error: unknown): string {
  if (error && typeof error === "object") {
    const { name, message, status, http_code: httpCode } = error as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof name === "string" && name !== "") parts.push(name);
    if (typeof message === "string" && message !== "") parts.push(message);
    const code = typeof status === "number" ? status : typeof httpCode === "number" ? httpCode : null;
    if (code !== null) parts.push(`status=${code}`);
    if (parts.length > 0) return parts.join(": ");
  }
  return typeof error === "string" ? error : "unknown error";
}
