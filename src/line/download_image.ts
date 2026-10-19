import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { Readable } from "stream";
import { messagingApi } from "@line/bot-sdk";
import { v2 as cloudinary } from "cloudinary";

// src/line/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env"), quiet: true });

export const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
};

/**
 * 画像を受け取ったチャネルごとの設定。
 *
 * - `aoi`: 碧衣のチャネル（`line_image` の画像）
 * - `checkin`: チェックイン用のチャネル（地写。`checkin_logs` の画像）
 *
 * `publicIdPrefix` は受信時に Cloudinary へ保存した画像の public_id の接頭辞で、保存する側
 * （`functions/src/lib/lineImageStore.ts` の `LINE_IMAGE_PUBLIC_ID_PREFIX`）と一致させる。
 * `accessTokenEnvName` は、Cloudinary に無いときに LINE から取得するためのアクセストークンの変数名。
 */
export const LINE_IMAGE_CHANNELS = {
  aoi: { publicIdPrefix: "line_aoi_", accessTokenEnvName: "LINE_ACCESS_TOKEN" },
  checkin: { publicIdPrefix: "line_checkin_", accessTokenEnvName: "CHECKIN_LINE_ACCESS_TOKEN" },
} as const;

export type LineImageChannel = keyof typeof LINE_IMAGE_CHANNELS;

function isLineImageChannel(value: string): value is LineImageChannel {
  return Object.hasOwn(LINE_IMAGE_CHANNELS, value);
}

/** LINE のメッセージ ID は数字列。保存先のファイル名と public_id に使うため、使える文字を限る。 */
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Cloudinary から取得するときの待ち時間の上限。超えたら LINE からの取得に回る。 */
const CLOUDINARY_FETCH_TIMEOUT_MS = 30_000;

export type ImageSource = "cloudinary" | "line";

export interface FetchedImage {
  contentType: string;
  data: Buffer;
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiSecret: string;
}

export function isValidMessageId(messageId: string): boolean {
  return MESSAGE_ID_PATTERN.test(messageId);
}

export function buildLineImagePublicId(messageId: string, channel: LineImageChannel = "aoi"): string {
  return `${LINE_IMAGE_CHANNELS[channel].publicIdPrefix}${messageId}`;
}

/**
 * コマンドライン引数から messageId とチャネルを取り出す。
 * チャネルは `--channel checkin` / `--channel=checkin` で指定し、省略時は碧衣のチャネル（`aoi`）。
 */
export function parseArgs(argv: string[]): { messageId: string | undefined; channel: LineImageChannel } {
  const positionals: string[] = [];
  let channel: string = "aoi";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--channel") {
      channel = argv[++i] ?? "";
    } else if (arg.startsWith("--channel=")) {
      channel = arg.slice("--channel=".length);
    } else {
      positionals.push(arg);
    }
  }

  if (!isLineImageChannel(channel)) {
    throw new Error(
      `--channel には ${Object.keys(LINE_IMAGE_CHANNELS).join(" / ")} のいずれかを指定してください`,
    );
  }
  return { messageId: positionals[0], channel };
}

/** `image/jpeg; charset=...` のような値から MIME タイプだけを取り出す。 */
export function normalizeContentType(header: string | null | undefined): string {
  return header?.split(";")[0].trim().toLowerCase() ?? "";
}

/** 署名付き URL を作るのに要る Cloudinary の設定。どれかが欠けていれば `null`（LINE からだけ取得する）。 */
export function resolveCloudinaryCredentials(env: NodeJS.ProcessEnv): CloudinaryCredentials | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim() ?? "";
  if (!cloudName || !apiSecret) {
    return null;
  }
  return { cloudName, apiSecret };
}

/**
 * `authenticated` で保存した画像の署名付き URL を作る。
 *
 * 署名付き URL には期限が無く、知っていれば誰でも画像を見られるため、取得の直前に作って使い捨てる。
 * 標準出力・ログ・Firestore には残さない。
 */
export function buildSignedImageUrl(publicId: string, credentials: CloudinaryCredentials): string {
  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: "image",
    sign_url: true,
    secure: true,
    cloud_name: credentials.cloudName,
    api_secret: credentials.apiSecret,
    urlAnalytics: false,
  });
}

/** Cloudinary から取得する。保存されていなければ `null`、それ以外の失敗は例外を投げる。 */
async function fetchFromCloudinary(
  messageId: string,
  channel: LineImageChannel,
  credentials: CloudinaryCredentials,
): Promise<FetchedImage | null> {
  const url = buildSignedImageUrl(buildLineImagePublicId(messageId, channel), credentials);
  const response = await fetch(url, { signal: AbortSignal.timeout(CLOUDINARY_FETCH_TIMEOUT_MS) });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    // URL には署名が含まれるため、例外のメッセージには入れない
    throw new Error(`HTTP ${response.status}`);
  }
  return {
    contentType: normalizeContentType(response.headers.get("content-type")),
    data: Buffer.from(await response.arrayBuffer()),
  };
}

async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fetchFromLine(messageId: string, channel: LineImageChannel): Promise<FetchedImage> {
  const tokenEnvName = LINE_IMAGE_CHANNELS[channel].accessTokenEnvName;
  const token = process.env[tokenEnvName];
  if (!token) {
    throw new Error(`環境変数 ${tokenEnvName} が設定されていません`);
  }

  const client = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });
  const { httpResponse, body } = await client.getMessageContentWithHttpInfo(messageId);
  return {
    contentType: normalizeContentType(httpResponse.headers.get("content-type")),
    data: await readableToBuffer(body),
  };
}

export interface FetchLineImageDeps {
  /** Cloudinary の設定が無い場合は `null` を渡し、LINE からだけ取得する。 */
  fromCloudinary: ((messageId: string) => Promise<FetchedImage | null>) | null;
  fromLine: (messageId: string) => Promise<FetchedImage>;
}

/**
 * 受信時に保存した Cloudinary から取得し、取れなければ LINE から取得する。
 *
 * Cloudinary に無い（保存の仕組みより前に届いた・保存に失敗した）画像や、Cloudinary 側の失敗は、
 * LINE 側の保存期間内であれば従来どおり LINE から取得できる。
 */
export async function fetchLineImage(
  messageId: string,
  deps: FetchLineImageDeps,
): Promise<{ source: ImageSource; image: FetchedImage }> {
  if (deps.fromCloudinary) {
    try {
      const image = await deps.fromCloudinary(messageId);
      if (image && CONTENT_TYPE_TO_EXT[image.contentType]) {
        return { source: "cloudinary", image };
      }
      if (image) {
        console.error(
          `Cloudinary の画像の Content-Type に対応していないため、LINE から取得します: ${image.contentType}`,
        );
      }
    } catch (error) {
      console.error(
        "Cloudinary から取得できなかったため、LINE から取得します:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { source: "line", image: await deps.fromLine(messageId) };
}

function printUsage() {
  console.error("使用方法: npx tsx src/line/download_image.ts <messageId> [--channel aoi|checkin]");
  console.error("例: npx tsx src/line/download_image.ts \"123456789\"");
  console.error("例: npx tsx src/line/download_image.ts \"123456789\" --channel checkin");
}

async function main() {
  let messageId: string | undefined;
  let channel: LineImageChannel;
  try {
    ({ messageId, channel } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exit(1);
  }

  if (!messageId) {
    printUsage();
    process.exit(1);
  }

  if (!isValidMessageId(messageId)) {
    console.error("messageId は英数字・ハイフン・アンダースコアの64文字以内で指定してください");
    process.exit(1);
  }

  const credentials = resolveCloudinaryCredentials(process.env);
  const { source, image } = await fetchLineImage(messageId, {
    fromCloudinary: credentials ? (id) => fetchFromCloudinary(id, channel, credentials) : null,
    fromLine: (id) => fetchFromLine(id, channel),
  });

  const { contentType } = image;
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (!ext) {
    console.error(`対応していない Content-Type です: ${contentType}`);
    console.error("対応形式: image/jpeg, image/png, image/gif");
    process.exit(1);
  }

  const tmpDir = resolve(__dirname, "../../tmp");
  mkdirSync(tmpDir, { recursive: true });

  const filename = `line_image_${messageId}${ext}`;
  const savePath = path.join(tmpDir, filename);

  writeFileSync(savePath, image.data);

  console.log(JSON.stringify({
    messageId,
    contentType,
    savedPath: savePath,
    source,
  }, null, 2));
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
