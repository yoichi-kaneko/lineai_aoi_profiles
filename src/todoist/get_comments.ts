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
  const taskId = process.argv[2];

  if (!taskId) {
    console.error("使用方法: npx tsx src/todoist/get_comments.ts <task_id>");
    console.error('例: npx tsx src/todoist/get_comments.ts "1234567890"');
    process.exit(1);
  }

  const api = new TodoistApi(getApiToken());
  const comments = await api.getComments({ taskId });
  console.log(JSON.stringify(comments, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
