import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi, type Task } from "@doist/todoist-sdk";
import { parseTaskId, TaskUrlError } from "./task_url.js";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

/**
 * 開発フローで参照するフィールドだけに絞る。
 * `checked` / `completedAt` は、対応済みのタスクを誤って掴んでいないかの確認に使う。
 */
export function formatTask(task: Task): object {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    due: task.due,
    labels: task.labels,
    checked: task.checked,
    completedAt: task.completedAt,
    url: task.url,
  };
}

function printUsage() {
  console.error("使用方法: npx tsx src/todoist/get_task.ts <task_id | task_url>");
  console.error('例: npx tsx src/todoist/get_task.ts "6hMrP2PjpPv46vQq"');
  console.error(
    '例: npx tsx src/todoist/get_task.ts "https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq"'
  );
}

function handleCliError(error: unknown): never {
  if (error instanceof TaskUrlError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  const input = process.argv[2];

  if (!input) {
    console.error("タスクID（またはタスクURL）が指定されていません");
    printUsage();
    process.exit(1);
  }

  let taskId: string;
  try {
    taskId = parseTaskId(input);
  } catch (error) {
    handleCliError(error);
  }

  const api = new TodoistApi(getApiToken());
  const task = await api.getTask(taskId);
  console.log(JSON.stringify(formatTask(task), null, 2));
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleCliError);
}
