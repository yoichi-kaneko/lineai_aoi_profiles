import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// scripts/ -> upload_and_send_line_audio/ -> skills/ -> .claude/ -> project root
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
  const originalContentUrl = process.argv[2];
  const durationArg = process.argv[3];

  if (!originalContentUrl || !durationArg) {
    console.error("使用方法: npx tsx scripts/send.ts <originalContentUrl> <duration>");
    console.error('例: npx tsx scripts/send.ts "https://example.com/song.mp3" "180000"');
    process.exit(1);
  }

  const duration = parseInt(durationArg, 10);
  if (isNaN(duration)) {
    console.error("duration はミリ秒単位の整数で指定してください");
    process.exit(1);
  }

  const token = getAccessToken();
  const to = getDestinationUserId();

  const body = {
    to,
    messages: [
      {
        type: "audio",
        originalContentUrl,
        duration,
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

  console.log("音声メッセージを送信しました。");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
