import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi, type Task } from "@doist/todoist-sdk";
import { parseTaskId, TaskUrlError } from "./task_url.js";

/** 完了済み検索の1ページ件数（API 上限 200）。 */
export const COMPLETED_PAGE_LIMIT = 200;
/** 完了済みを辿る最大ページ数。直近 1000 件までに限る。 */
export const COMPLETED_MAX_PAGES = 5;

/** getTask / 完了済み一覧の、この CLI が使う面だけ。 */
export type TaskLookupApi = {
  getTask: (id: string) => Promise<Task>;
  getAllCompletedTasks: (args: {
    limit: number;
    offset: number;
    annotateItems: boolean;
  }) => Promise<{ items?: Task[] | null }>;
};

/** REST の 404（未完了としては存在しない）かどうか。 */
export function isTaskNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return "httpStatusCode" in error && (error as { httpStatusCode?: unknown }).httpStatusCode === 404;
}

export function findTaskById<T extends { id: string }>(tasks: readonly T[], taskId: string): T | undefined {
  return tasks.find((task) => task.id === taskId);
}

/**
 * 未完了を getTask で取り、404 なら直近の完了済みから ID 照合する。
 * getTask はアクティブなタスク専用なので、完了済みは一覧側にフォールバックする。
 */
export async function fetchTaskIncludingCompleted(
  taskId: string,
  api: TaskLookupApi
): Promise<Task> {
  try {
    return await api.getTask(taskId);
  } catch (error) {
    if (!isTaskNotFoundError(error)) {
      throw error;
    }
  }

  for (let page = 0; page < COMPLETED_MAX_PAGES; page++) {
    const response = await api.getAllCompletedTasks({
      limit: COMPLETED_PAGE_LIMIT,
      offset: page * COMPLETED_PAGE_LIMIT,
      annotateItems: true,
    });
    const items = response.items ?? [];
    const found = findTaskById(items, taskId);
    if (found) {
      return found;
    }
    if (items.length < COMPLETED_PAGE_LIMIT) {
      break;
    }
  }

  throw new Error(
    `タスクが見つかりません: ${taskId}（未完了のタスクにも、直近の完了済みにもありません）`
  );
}

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
  console.error("使用方法: pnpm exec tsx src/todoist/get_task.ts <task_id | task_url>");
  console.error('例: pnpm exec tsx src/todoist/get_task.ts "6hMrP2PjpPv46vQq"');
  console.error(
    '例: pnpm exec tsx src/todoist/get_task.ts "https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq"'
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
  const task = await fetchTaskIncludingCompleted(taskId, api);
  console.log(JSON.stringify(formatTask(task), null, 2));
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleCliError);
}
