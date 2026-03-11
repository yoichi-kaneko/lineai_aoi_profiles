import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// scripts/ -> send_line_message/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

const LINE_API_PUSH = "https://api.line.me/v2/bot/message/push";

function getAccessToken(): string {
  const token = process.env.LINE_ACCESS_TOKEN;
  if (!token) {
    console.error("環境変数 LINE_ACCESS_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

function getDestinationUserId(): string {
  const userId = process.env.LINE_DESTINATION_USER_ID;
  if (!userId) {
    console.error("環境変数 LINE_DESTINATION_USER_ID が設定されていません");
    process.exit(1);
  }
  return userId;
}

async function main() {
  const rawMessage = process.argv[2];

  if (!rawMessage) {
    console.error("使用方法: npx tsx scripts/send_message.ts <message>");
    console.error('例: npx tsx scripts/send_message.ts "こんにちは！"');
    process.exit(1);
  }

  // リテラルの \n を実際の改行文字に変換する
  const message = rawMessage.replace(/\\n/g, "\n");

  const token = getAccessToken();
  const to = getDestinationUserId();

  const body = {
    to,
    messages: [
      {
        type: "text",
        text: message,
      },
    ],
  };

  const response = await fetch(LINE_API_PUSH, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`LINE API エラー: ${response.status} ${response.statusText}`);
    console.error(errorText);
    process.exit(1);
  }

  console.log("メッセージを送信しました。");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
