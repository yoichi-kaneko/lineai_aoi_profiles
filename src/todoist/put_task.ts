import dotenv from "dotenv";
import { readFileSync, realpathSync } from "fs";
import { resolve, sep } from "path";
import { fileURLToPath } from "url";
import { TodoistApi } from "@doist/todoist-sdk";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const dirname = fileURLToPath(new URL(".", import.meta.url));
export const projectRoot = resolve(dirname, "../../");
dotenv.config({ path: resolve(projectRoot, ".env") });

const SUPPORTED_FLAGS = new Set(["description-file"]);

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

/**
 * `--key value` / `--key=value` 形式のオプションを抽出し、残りを位置引数として返す。
 */
export function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string> } {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = "";
        }
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

/** サポート対象外の `--` オプションを拒否する。 */
export function validateFlags(flags: Record<string, string>): void {
  for (const key of Object.keys(flags)) {
    if (!SUPPORTED_FLAGS.has(key)) {
      throw new ArgumentError(`未知のオプション: --${key}`);
    }
  }
}

function isPathInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + sep);
}

/**
 * 詳細（description）を保存したファイル（tmp/ 配下）を読み込んで返す。
 * シンボリックリンクで tmp/ 外へ脱出するパスは拒否する。
 */
export function readDescriptionFile(descriptionFile: string, root = projectRoot): string {
  const tmpDir = resolve(root, "tmp");
  const resolvedPath = resolve(root, descriptionFile);

  if (!isPathInside(tmpDir, resolvedPath)) {
    throw new ArgumentError(
      `--description-file は tmp/ 配下のパスを指定してください: ${descriptionFile}`
    );
  }

  let realTmpDir: string;
  let realFilePath: string;
  try {
    realTmpDir = realpathSync(tmpDir);
    realFilePath = realpathSync(resolvedPath);
  } catch (error) {
    throw new ArgumentError(
      `--description-file の読み込みに失敗しました: ${descriptionFile}（${
        error instanceof Error ? error.message : String(error)
      }）`
    );
  }

  if (!isPathInside(realTmpDir, realFilePath)) {
    throw new ArgumentError(
      `--description-file は tmp/ 配下のパスを指定してください: ${descriptionFile}`
    );
  }

  let description: string;
  try {
    description = readFileSync(realFilePath, "utf-8");
  } catch (error) {
    throw new ArgumentError(
      `--description-file の読み込みに失敗しました: ${descriptionFile}（${
        error instanceof Error ? error.message : String(error)
      }）`
    );
  }

  if (!description.trim()) {
    throw new ArgumentError(
      `--description-file の中身が空です: ${descriptionFile}。詳細が不要な場合はオプションごと省略してください。`
    );
  }

  return description;
}

export interface ResolvedTaskInput {
  content: string;
  description?: string;
}

/** CLI 引数を検証し、Todoist へ渡す content / description を返す。 */
export function resolveTaskInput(argv: string[], root = projectRoot): ResolvedTaskInput {
  const { positionals, flags } = parseArgs(argv);
  validateFlags(flags);

  const content = positionals[0];
  const descriptionFile = flags["description-file"];

  if (!content) {
    throw new ArgumentError("タスクタイトル（content）が指定されていません", true);
  }

  if (positionals.length > 1) {
    throw new ArgumentError(
      `詳細（description）を位置引数で渡すことはできません: "${positionals[1]}"。一時ファイルに保存して --description-file で渡してください。`
    );
  }

  if (descriptionFile !== undefined && !descriptionFile) {
    throw new ArgumentError("--description-file にはファイルパスを指定してください");
  }

  const description = descriptionFile ? readDescriptionFile(descriptionFile, root) : undefined;
  return { content, description };
}

function printUsage() {
  console.error(
    "使用方法: npx tsx src/todoist/put_task.ts <content> [--description-file <path>]"
  );
  console.error('例: npx tsx src/todoist/put_task.ts "タスクタイトル"');
  console.error(
    '例: npx tsx src/todoist/put_task.ts "タスクタイトル" --description-file tmp/todoist_task.txt'
  );
  console.error(
    "詳細（description）は引数で直接渡せません。本文を tmp/ 配下の一時ファイルに保存し --description-file で渡してください。"
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

function handleCliError(error: unknown): never {
  if (error instanceof ArgumentError) {
    console.error(error.message);
    if (error.showUsage) {
      printUsage();
    }
    process.exit(1);
  }

  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  let input: ResolvedTaskInput;
  try {
    input = resolveTaskInput(process.argv.slice(2));
  } catch (error) {
    handleCliError(error);
  }

  const api = new TodoistApi(getApiToken());
  const task = await api.addTask({ content: input.content, description: input.description });
  console.log(JSON.stringify(task, null, 2));
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleCliError);
}
