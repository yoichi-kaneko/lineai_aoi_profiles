import { readFileSync, realpathSync, statSync } from "fs";
import { isAbsolute, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { createTwitterClient, handleCliError, readMessageText } from "./client";

// src/twitter/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "../../");
const TMP_DIR = resolve(projectRoot, "tmp");
const TMP_PREFIX = "tmp/";

function rejectOutsideTmp(imageFilePath: string): never {
  console.error(
    `画像ファイルはプロジェクトの tmp/ 配下の相対パス（tmp/...）または同配下の絶対パスを指定してください: ${imageFilePath}`,
  );
  process.exit(1);
}

/**
 * 画像パスをプロジェクトの tmp/ 配下の実体パスへ解決する。
 * 受け付けるのは tmp/ 相対パス、または実体が tmp/ 内にある絶対パス。
 * tmp/ 外・シンボリックリンク経由の脱出は拒否する。
 * （generate_gpt_image の savedPaths は絶対パスのため、相対のみだと投稿が失敗する）
 */
export function resolveUploadImagePath(imageFilePath: string): string {
  if (!isAbsolute(imageFilePath) && !imageFilePath.startsWith(TMP_PREFIX)) {
    rejectOutsideTmp(imageFilePath);
  }

  const resolvedPath = isAbsolute(imageFilePath)
    ? resolve(imageFilePath)
    : resolve(projectRoot, imageFilePath);
  if (resolvedPath !== TMP_DIR && !resolvedPath.startsWith(TMP_DIR + sep)) {
    rejectOutsideTmp(imageFilePath);
  }

  let realTmpDir: string;
  let realFilePath: string;
  try {
    realTmpDir = realpathSync(TMP_DIR);
    realFilePath = realpathSync(resolvedPath);
  } catch (error) {
    console.error(
      `画像ファイルが存在しません: ${imageFilePath}`,
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  if (realFilePath !== realTmpDir && !realFilePath.startsWith(realTmpDir + sep)) {
    rejectOutsideTmp(imageFilePath);
  }

  if (!statSync(realFilePath).isFile()) {
    console.error(`画像ファイルではありません: ${imageFilePath}`);
    process.exit(1);
  }

  return realFilePath;
}

/** 投稿に添付できる画像の MIME タイプ */
export type UploadImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** X のメディアアップロードで指定するカテゴリ（アニメーション GIF は専用カテゴリ） */
export type UploadImageCategory = "tweet_image" | "tweet_gif";

export interface UploadImage {
  data: Buffer;
  mediaType: UploadImageMimeType;
  mediaCategory: UploadImageCategory;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function hasBytesAt(data: Buffer, signature: Buffer | string, offset = 0): boolean {
  const expected = typeof signature === "string" ? Buffer.from(signature, "latin1") : signature;
  return data.subarray(offset, offset + expected.length).equals(expected);
}

/**
 * 画像データの先頭バイト（マジックナンバー）から MIME タイプを判定する。
 * v2 のメディアアップロードは media_type の指定が必須のため、拡張子ではなく中身で判定する。
 * 対応外の形式なら undefined を返す。
 */
export function detectImageMimeType(data: Buffer): UploadImageMimeType | undefined {
  if (hasBytesAt(data, PNG_SIGNATURE)) return "image/png";
  if (hasBytesAt(data, JPEG_SIGNATURE)) return "image/jpeg";
  if (hasBytesAt(data, "GIF87a") || hasBytesAt(data, "GIF89a")) return "image/gif";
  if (hasBytesAt(data, "RIFF") && hasBytesAt(data, "WEBP", 8)) return "image/webp";
  return undefined;
}

/** MIME タイプに対応するメディアカテゴリを返す */
export function mediaCategoryFor(mediaType: UploadImageMimeType): UploadImageCategory {
  return mediaType === "image/gif" ? "tweet_gif" : "tweet_image";
}

/**
 * 添付画像を tmp/ 配下から読み込み、アップロードに必要な MIME タイプとカテゴリを添えて返す。
 * パスが tmp/ 外を指す場合や、対応外の形式の場合は終了コード1で終える。
 */
export function readUploadImage(imageFilePath: string): UploadImage {
  const data = readFileSync(resolveUploadImagePath(imageFilePath));
  const mediaType = detectImageMimeType(data);
  if (!mediaType) {
    console.error(
      `対応していない画像形式です（JPEG / PNG / GIF / WebP のいずれかを指定してください）: ${imageFilePath}`,
    );
    process.exit(1);
  }
  return { data, mediaType, mediaCategory: mediaCategoryFor(mediaType) };
}

const isDirectRun =
  !!process.argv[1] && process.argv[1].endsWith("post.ts");

async function main() {
  const textFilePath = process.argv[2];
  const imageFilePath = process.argv[3];

  if (!textFilePath) {
    console.error("使用方法: npx tsx src/twitter/post.ts <textFilePath> [imageFilePath]");
    console.error('例: npx tsx src/twitter/post.ts "tmp/twitter_message.txt"');
    console.error('例: npx tsx src/twitter/post.ts "tmp/twitter_message.txt" "tmp/image.png"');
    console.error(
      "画像は tmp/ 相対パス、または generate_gpt_image の savedPaths のような tmp/ 配下の絶対パス可",
    );
    process.exit(1);
  }

  const text = readMessageText(textFilePath).trim();
  if (!text) {
    console.error("テキストが空です");
    process.exit(1);
  }

  const client = createTwitterClient();

  if (imageFilePath) {
    const image = readUploadImage(imageFilePath);
    const mediaId = await client.v2.uploadMedia(image.data, {
      media_type: image.mediaType,
      media_category: image.mediaCategory,
    });
    const result = await client.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    });
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  const result = await client.v2.tweet(text);
  console.log(JSON.stringify(result.data, null, 2));
}

if (isDirectRun) {
  main().catch(handleCliError);
}
