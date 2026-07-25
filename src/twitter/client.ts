import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { TwitterApi } from "twitter-api-v2";

// src/twitter/ -> src/ -> project root
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

/** テキストを保存したファイルを読み込んで返す */
export function readMessageText(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(
      `テキストファイルを読み込めませんでした: ${filePath}`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

export function createTwitterClient(): TwitterApi {
  return new TwitterApi({
    appKey: requireEnv("TWITTER_API_KEY"),
    appSecret: requireEnv("TWITTER_API_SECRET"),
    accessToken: requireEnv("TWITTER_ACCESS_TOKEN"),
    accessSecret: requireEnv("TWITTER_ACCESS_TOKEN_SECRET"),
  });
}

export function handleCliError(error: unknown): never {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
