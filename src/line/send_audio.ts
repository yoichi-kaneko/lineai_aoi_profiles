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

function parseArgs(argv: string[]): { destination: string; remaining: string[] } {
  const idx = argv.indexOf("--destination");
  if (idx === -1) return { destination: "user", remaining: argv };
  const destination = argv[idx + 1] ?? "user";
  const remaining = argv.filter((_, i) => i !== idx && i !== idx + 1);
  return { destination, remaining };
}

function resolveDestinations(destination: string): string[] {
  const userId = requireEnv("LINE_DESTINATION_USER_ID");
  if (destination === "user") return [userId];
  const groupId = requireEnv("LINE_DESTINATION_GROUP_ID");
  if (destination === "group") return [groupId];
  if (destination === "both") return [userId, groupId];
  console.error(`不正な destination 値: ${destination}。user / group / both のいずれかを指定してください`);
  process.exit(1);
}

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const originalContentUrl = remaining[0];
  const durationArg = remaining[1];

  if (!originalContentUrl || !durationArg) {
    console.error("使用方法: npx tsx src/line/send_audio.ts [--destination user|group|both] <originalContentUrl> <duration>");
    console.error('例: npx tsx src/line/send_audio.ts "https://example.com/song.mp3" "180000"');
    process.exit(1);
  }

  const duration = parseInt(durationArg, 10);
  if (isNaN(duration)) {
    console.error("duration はミリ秒単位の整数で指定してください");
    process.exit(1);
  }

  const token = requireEnv("LINE_ACCESS_TOKEN");
  const destinations = resolveDestinations(destination);

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });

  for (const to of destinations) {
    await client.pushMessage({
      to,
      messages: [{ type: "audio", originalContentUrl, duration }],
    });
  }

  console.log("音声メッセージを送信しました。");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
