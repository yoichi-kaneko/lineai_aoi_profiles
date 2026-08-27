import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi } from "@doist/todoist-sdk";
import { parseTaskId, TaskUrlError } from "./task_url.js";

/**
 * 開発上の対応方針を書き残すコメントの目印。
 * 碧衣宛のコメントと混ざらないよう、既定ではこの目印で始まるコメントを取得結果から除外する。
 * 規約の正本は .claude/skills/dev_apply_todoist_request/SKILL.md
 */
export const POLICY_COMMENT_PREFIXES = ["【対応方針】", "[対応方針]"] as const;

const SUPPORTED_FLAGS = new Set(["include-policy"]);

/** 引数の指定ミス。CLI ではメッセージ（必要なら使用方法）を出して終了コード1で終わる。 */
export class ArgumentError extends Error {
  constructor(
    message: string,
    readonly showUsage = false
  ) {
    super(message);
    this.name = "ArgumentError";
  }
}

/** 開発上の対応方針コメント（目印で始まるコメント）かどうか。 */
export function isPolicyComment(content: string | null | undefined): boolean {
  const trimmed = (content ?? "").trimStart();
  return POLICY_COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/** コメント一覧を、碧衣へ見せるものと開発上の対応方針とに分ける。 */
export function splitPolicyComments<T extends { content?: string | null }>(
  comments: T[]
): { visible: T[]; excludedPolicyComments: number } {
  const visible = comments.filter((comment) => !isPolicyComment(comment.content));
  return { visible, excludedPolicyComments: comments.length - visible.length };
}

export interface ResolvedCommentsInput {
  taskId: string;
  includePolicy: boolean;
}

/** CLI 引数を検証し、タスクID と方針コメントの取得可否を返す。 */
export function resolveCommentsInput(argv: string[]): ResolvedCommentsInput {
  const positionals: string[] = [];
  let includePolicy = false;

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (!SUPPORTED_FLAGS.has(key)) {
      throw new ArgumentError(`未知のオプション: ${arg}`);
    }
    includePolicy = true;
  }

  const input = positionals[0];
  if (!input) {
    throw new ArgumentError("タスクID（またはタスクURL）が指定されていません", true);
  }
  if (positionals.length > 1) {
    throw new ArgumentError(`引数が多すぎます: "${positionals[1]}"。タスクは1件ずつ指定してください`);
  }

  return { taskId: parseTaskId(input), includePolicy };
}

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

function printUsage() {
  console.error("使用方法: pnpm exec tsx src/todoist/get_comments.ts <task_id | task_url> [--include-policy]");
  console.error('例: pnpm exec tsx src/todoist/get_comments.ts "6hMrP2PjpPv46vQq"');
  console.error(
    '例: pnpm exec tsx src/todoist/get_comments.ts "https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq"'
  );
  console.error(
    "既定では 【対応方針】 または [対応方針] で始まる開発用のコメントを除外します。開発フローで方針を読むときだけ --include-policy を付けてください。"
  );
}

function handleCliError(error: unknown): never {
  if (error instanceof ArgumentError) {
    console.error(error.message);
    if (error.showUsage) {
      printUsage();
    }
    process.exit(1);
  }

  if (error instanceof TaskUrlError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  let input: ResolvedCommentsInput;
  try {
    input = resolveCommentsInput(process.argv.slice(2));
  } catch (error) {
    handleCliError(error);
  }

  const api = new TodoistApi(getApiToken());
  const comments = await api.getComments({ taskId: input.taskId });
  const results = comments.results || [];

  if (input.includePolicy) {
    console.log(JSON.stringify({ ...comments, results }, null, 2));
    return;
  }

  const { visible, excludedPolicyComments } = splitPolicyComments(results);
  console.log(JSON.stringify({ ...comments, results: visible, excludedPolicyComments }, null, 2));
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleCliError);
}
