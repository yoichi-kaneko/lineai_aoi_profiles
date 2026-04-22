import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi } from "@doist/todoist-sdk";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

async function main() {
  const content = process.argv[2];
  const description = process.argv[3];

  if (!content) {
    console.error("使用方法: npx tsx src/todoist/put_task.ts <content> [description]");
    console.error('例: npx tsx src/todoist/put_task.ts "タスクタイトル" "詳細説明"');
    process.exit(1);
  }

  const api = new TodoistApi(getApiToken());
  const task = await api.addTask({ content, description });
  console.log(JSON.stringify(task, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
