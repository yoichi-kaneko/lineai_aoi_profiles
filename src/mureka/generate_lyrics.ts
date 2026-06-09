import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readTextFile } from "./client";

// プロジェクトルートの .env を読み込む
// src/mureka/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

/** Mureka API が返す歌詞・タイトル中のリテラルエスケープや記号混入を正規化する */
function normalizeMurekaLyrics(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\[([^\]]+)\]["',]+/g, "[$1]");
}

function getApiKey(): string {
  const key = process.env.MUREKA_API_KEY;
  if (!key) {
    console.error("環境変数 MUREKA_API_KEY が設定されていません");
    process.exit(1);
  }
  return key;
}

async function main() {
  const promptFilePath = process.argv[2];

  if (!promptFilePath) {
    console.error("使用方法: npx tsx src/mureka/generate_lyrics.ts <promptFilePath>");
    console.error('例: npx tsx src/mureka/generate_lyrics.ts "tmp/mureka_lyrics_prompt.txt"');
    process.exit(1);
  }

  const prompt = readTextFile(promptFilePath);

  const apiKey = getApiKey();

  const response = await fetch("https://api.mureka.ai/v1/lyrics/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`APIエラー (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const data = await response.json() as { title: string; lyrics: string };

  console.log(JSON.stringify({
    prompt,
    title: normalizeMurekaLyrics(data.title),
    lyrics: normalizeMurekaLyrics(data.lyrics),
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
