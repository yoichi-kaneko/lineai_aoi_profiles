import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { createWriteStream, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { messagingApi } from "@line/bot-sdk";

// src/line/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const messageId = process.argv[2];

  if (!messageId) {
    console.error("使用方法: npx tsx src/line/download_image.ts <messageId>");
    console.error("例: npx tsx src/line/download_image.ts \"123456789\"");
    process.exit(1);
  }

  const token = requireEnv("LINE_ACCESS_TOKEN");

  const client = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: token,
  });

  const { httpResponse, body: readable } = await client.getMessageContentWithHttpInfo(messageId);

  const contentType = httpResponse.headers.get("content-type")?.split(";")[0].trim() ?? "";
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

  await pipeline(readable, createWriteStream(savePath));

  console.log(JSON.stringify({
    messageId,
    contentType,
    savedPath: savePath,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
