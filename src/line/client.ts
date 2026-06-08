import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { messagingApi } from "@line/bot-sdk";

// src/line/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません`);
    process.exit(1);
  }
  return value;
}

export function parseArgs(argv: string[]): { destination: string; remaining: string[] } {
  const idx = argv.indexOf("--destination");
  if (idx === -1) return { destination: "user", remaining: argv };
  const destination = argv[idx + 1] ?? "user";
  const remaining = argv.filter((_, i) => i !== idx && i !== idx + 1);
  return { destination, remaining };
}

export function resolveDestinations(destination: string): string[] {
  const userId = requireEnv("LINE_DESTINATION_USER_ID");
  if (destination === "user") return [userId];
  const groupId = requireEnv("LINE_DESTINATION_GROUP_ID");
  if (destination === "group") return [groupId];
  if (destination === "both") return [userId, groupId];
  console.error(
    `不正な destination 値: ${destination}。user / group / both のいずれかを指定してください`
  );
  process.exit(1);
}

/** メッセージ本文を保存したファイルを読み込んで返す */
export function readMessageText(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(
      `メッセージファイルを読み込めませんでした: ${filePath}`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

export function createMessagingClient(): messagingApi.MessagingApiClient {
  const token = requireEnv("LINE_ACCESS_TOKEN");
  return new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });
}

export async function pushMessagesToDestinations(
  destination: string,
  messages: messagingApi.Message[]
): Promise<void> {
  const client = createMessagingClient();
  const destinations = resolveDestinations(destination);

  for (const to of destinations) {
    await client.pushMessage({ to, messages });
  }
}

export function handleCliError(error: unknown): never {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
