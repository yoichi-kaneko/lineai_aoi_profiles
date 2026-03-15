import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";

// プロジェクトルートの .env を読み込む
// scripts/ -> download_mureka_song/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

function getApiKey(): string {
  const key = process.env.MUREKA_API_KEY;
  if (!key) {
    console.error("環境変数 MUREKA_API_KEY が設定されていません");
    process.exit(1);
  }
  return key;
}

interface SongChoice {
  url?: string;
  audio_url?: string;
  mp3_url?: string;
  [key: string]: unknown;
}

interface QueryResponse {
  status?: string;
  choices?: SongChoice[];
  [key: string]: unknown;
}

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    console.error("使用方法: npx tsx scripts/download_song.ts <task_id>");
    console.error('例: npx tsx scripts/download_song.ts "task_abc123"');
    process.exit(1);
  }

  const apiKey = getApiKey();

  const response = await fetch(`https://api.mureka.ai/v1/song/query/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`APIエラー (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const data = await response.json() as QueryResponse;

  if (!data.choices || data.choices.length === 0) {
    console.log(JSON.stringify({
      task_id: taskId,
      status: data.status ?? "unknown",
      message: "choicesがまだありません。生成が完了していない可能性があります。",
      raw: data,
    }, null, 2));
    process.exit(0);
  }

  // 1件目の楽曲URLを取得
  const firstChoice = data.choices[0];
  const audioUrl = firstChoice.url ?? firstChoice.audio_url ?? firstChoice.mp3_url;

  if (!audioUrl || typeof audioUrl !== "string") {
    console.error("楽曲のURLが見つかりませんでした。レスポンス:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  // tmp/ ディレクトリにダウンロード
  const tmpDir = resolve(PROJECT_ROOT, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const filename = `mureka_song_${taskId}_${Date.now()}.mp3`;
  const savePath = resolve(tmpDir, filename);

  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    console.error(`楽曲のダウンロードに失敗しました (${audioResponse.status}): ${audioUrl}`);
    process.exit(1);
  }

  const buffer = await audioResponse.arrayBuffer();
  writeFileSync(savePath, Buffer.from(buffer));

  console.log(JSON.stringify({
    task_id: taskId,
    status: data.status ?? "unknown",
    savedPath: savePath,
    audioUrl,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
