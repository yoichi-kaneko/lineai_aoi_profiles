import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi } from "@doist/todoist-api-typescript";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

async function main() {
  const date = process.argv[2];

  if (!date) {
    console.error("使用方法: npx tsx src/todoist/get_completed_tasks.ts <date(YYYY-MM-DD)>");
    console.error('例: npx tsx src/todoist/get_completed_tasks.ts "2026-03-21"');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("日付は YYYY-MM-DD 形式で指定してください");
    process.exit(1);
  }

  const api = new TodoistApi(getApiToken());
  const result = await api.getCompletedTasksByCompletionDate({
    since: `${date}T00:00:00`,
    until: `${date}T23:59:59`,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
