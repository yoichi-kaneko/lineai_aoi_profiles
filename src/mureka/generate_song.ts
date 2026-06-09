import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readTextFile } from "./client";

// プロジェクトルートの .env を読み込む
// src/mureka/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

// 入力長の上限は POST /v1/song/generate のリクエストボディ仕様（maximum）に合わせる。
// https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html
const MAX_LYRICS_LENGTH = 3000;
const MAX_PROMPT_LENGTH = 1024;

function getApiKey(): string {
  const key = process.env.MUREKA_API_KEY;
  if (!key) {
    console.error("環境変数 MUREKA_API_KEY が設定されていません");
    process.exit(1);
  }
  return key;
}

async function main() {
  const lyricsFilePath = process.argv[2];
  const promptFilePath = process.argv[3];

  if (!lyricsFilePath || !promptFilePath) {
    console.error("使用方法: npx tsx src/mureka/generate_song.ts <lyricsFilePath> <promptFilePath>");
    console.error('例: npx tsx src/mureka/generate_song.ts "tmp/mureka_song_lyrics.txt" "tmp/mureka_song_prompt.txt"');
    process.exit(1);
  }

  const lyrics = readTextFile(lyricsFilePath);
  const prompt = readTextFile(promptFilePath);

  if (lyrics.length > MAX_LYRICS_LENGTH) {
    console.error(`歌詞が長すぎます: ${lyrics.length}文字（上限: ${MAX_LYRICS_LENGTH}文字）`);
    process.exit(1);
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    console.error(`プロンプトが長すぎます: ${prompt.length}文字（上限: ${MAX_PROMPT_LENGTH}文字）`);
    process.exit(1);
  }

  const apiKey = getApiKey();
  const model = process.env.MUREKA_MODEL || "auto";
  const vocalId = process.env.MUREKA_VOCAL_ID;

  const body: Record<string, unknown> = {
    lyrics,
    prompt,
    n: 1,
    model,
  };

  if (vocalId) {
    body.vocal_id = vocalId;
  }

  const response = await fetch("https://api.mureka.ai/v1/song/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`APIエラー (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const data = await response.json() as { id?: string; [key: string]: unknown };
  const responseId = data.id;
  if (!responseId) {
    console.error("APIレスポンスに id が含まれていません");
    process.exit(1);
  }

  console.log(JSON.stringify({
    task_id: responseId,
    model,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
