import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi, type Task } from "@doist/todoist-sdk";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

function formatTask(task: Task): object {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    due: task.due,
    labels: task.labels,
  };
}

async function main() {
  const api = new TodoistApi(getApiToken());
  const tasks = await api.getTasks();
  const result = {
    tasks: (tasks.results || []).map(formatTask),
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
