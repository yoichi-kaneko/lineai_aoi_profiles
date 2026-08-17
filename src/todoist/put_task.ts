import dotenv from "dotenv";
import { resolve, sep } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "../../");
dotenv.config({ path: resolve(projectRoot, ".env") });

import { TodoistApi } from "@doist/todoist-sdk";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

/**
 * `--key value` / `--key=value` 形式のオプションを抽出し、残りを位置引数として返す。
 */
function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string> } {
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

function printUsage() {
  console.error(
    "使用方法: npx tsx src/todoist/put_task.ts <content> [--description-file <path>]"
  );
  console.error('例: npx tsx src/todoist/put_task.ts "タスクタイトル"');
  console.error(
    '例: npx tsx src/todoist/put_task.ts "タスクタイトル" --description-file tmp/todoist_task.txt'
  );
  console.error(
    "詳細（description）は引数で直接渡せません。本文を一時ファイルに保存し --description-file で渡してください。"
  );
}

/** 詳細（description）を保存したファイル（プロジェクトルート相対）を読み込んで返す */
function readDescriptionFile(descriptionFile: string): string {
  // プロジェクトルート外への参照（絶対パスや ../ による脱出）を拒否する
  const resolvedPath = resolve(projectRoot, descriptionFile);
  if (resolvedPath !== projectRoot && !resolvedPath.startsWith(projectRoot + sep)) {
    console.error(
      `--description-file はプロジェクトルート内のパスを指定してください: ${descriptionFile}`
    );
    process.exit(1);
  }

  let description: string;
  try {
    description = readFileSync(resolvedPath, "utf-8");
  } catch (error) {
    console.error(
      `--description-file の読み込みに失敗しました: ${descriptionFile}`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }

  if (!description.trim()) {
    console.error(
      `--description-file の中身が空です: ${descriptionFile}。詳細が不要な場合はオプションごと省略してください。`
    );
    process.exit(1);
  }

  return description;
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));

  const content = positionals[0];
  const descriptionFile = flags["description-file"];

  if (!content) {
    printUsage();
    process.exit(1);
  }

  // 改行を含む本文をコマンドライン引数で渡すとクォート処理が崩れるため、
  // description は一時ファイル経由でのみ受け付ける。
  if (positionals.length > 1) {
    console.error(
      `詳細（description）を位置引数で渡すことはできません: "${positionals[1]}"。一時ファイルに保存して --description-file で渡してください。`
    );
    process.exit(1);
  }

  if (descriptionFile !== undefined && !descriptionFile) {
    console.error("--description-file にはファイルパスを指定してください");
    process.exit(1);
  }

  const description = descriptionFile ? readDescriptionFile(descriptionFile) : undefined;

  const api = new TodoistApi(getApiToken());
  const task = await api.addTask({ content, description });
  console.log(JSON.stringify(task, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
