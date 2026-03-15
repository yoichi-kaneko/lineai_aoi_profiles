import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// scripts/ -> generate_mureka_song/ -> skills/ -> .claude/ -> project root
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

async function main() {
  const rawLyrics = process.argv[2];
  const rawPrompt = process.argv[3];

  if (!rawLyrics || !rawPrompt) {
    console.error("使用方法: npx tsx scripts/generate_song.ts <歌詞> <プロンプト>");
    console.error('例: npx tsx scripts/generate_song.ts "[Verse]\\n歌詞テキスト" "明るいポップス調"');
    process.exit(1);
  }

  // \\n をリテラル改行に戻す
  const lyrics = rawLyrics.replace(/\\n/g, "\n");
  const prompt = rawPrompt.replace(/\\n/g, "\n");

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

  const data = await response.json() as { task_id: string; [key: string]: unknown };

  console.log(JSON.stringify({
    task_id: data.task_id,
    model,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
