import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { messagingApi } from "@line/bot-sdk";

// src/line/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const originalContentUrl = process.argv[2];
  const previewImageUrl = process.argv[3];

  if (!originalContentUrl || !previewImageUrl) {
    console.error("使用方法: npx tsx src/line/send_image.ts <originalContentUrl> <previewImageUrl>");
    console.error('例: npx tsx src/line/send_image.ts "https://example.com/image.jpg" "https://example.com/preview.jpg"');
    process.exit(1);
  }

  const token = requireEnv("LINE_ACCESS_TOKEN");
  const to = requireEnv("LINE_DESTINATION_USER_ID");

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });

  await client.pushMessage({
    to,
    messages: [
      {
        type: "image",
        originalContentUrl,
        previewImageUrl,
      },
    ],
  });

  console.log("画像メッセージを送信しました。");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
