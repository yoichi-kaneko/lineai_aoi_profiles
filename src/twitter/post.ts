import { realpathSync } from "fs";
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
function resolveUploadImagePath(imageFilePath: string): string {
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

  return realFilePath;
}

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
    const absoluteImagePath = resolveUploadImagePath(imageFilePath);
    const mediaId = await client.v1.uploadMedia(absoluteImagePath);
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

main().catch(handleCliError);
