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
  const rawMessage = process.argv[2];

  if (!rawMessage) {
    console.error("使用方法: npx tsx src/line/send_text.ts <message>");
    console.error('例: npx tsx src/line/send_text.ts "こんにちは！"');
    process.exit(1);
  }

  // リテラルの \n を実際の改行文字に変換する
  const message = rawMessage.replace(/\\n/g, "\n");

  const token = requireEnv("LINE_ACCESS_TOKEN");
  const to = requireEnv("LINE_DESTINATION_USER_ID");

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });

  await client.pushMessage({
    to,
    messages: [
      {
        type: "text",
        text: message,
      },
    ],
  });

  console.log("メッセージを送信しました。");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
