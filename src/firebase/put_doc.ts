import { resolve, sep } from "path";
import { fileURLToPath } from "url";

// src/firebase/ -> src/ -> project root
// .env の読み込みは ./client が行う
const __dirname = fileURLToPath(new URL(".", import.meta.url));

import { Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { NOTE_TYPE, isNoteType, type NoteType } from "./noteTypes";
import {
  finishFirestoreCli,
  handleFirestoreCliError,
  initFirestore,
  withFirestoreTimeout,
} from "./client";

const projectRoot = resolve(__dirname, "../../");

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

function looksLikeDescriptionFilePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const knownTempDescriptionFiles = ["tmp/firestore_doc.txt", "tmp/image_log.json"];

  return knownTempDescriptionFiles.some(
    (path) => normalized === path || normalized.endsWith(`/${path}`)
  );
}

function printUsage() {
  console.error(
    "使用方法: npx tsx src/firebase/put_doc.ts <date(YYYY-MM-DD)> [type] [--collection <name>] --description-file <path>"
  );
  console.error(
    '例: npx tsx src/firebase/put_doc.ts "2026-03-21" --description-file tmp/firestore_doc.txt'
  );
  console.error(
    '例: npx tsx src/firebase/put_doc.ts "2026-03-21" "off_mountain" --description-file tmp/firestore_doc.txt'
  );
  console.error(
    '例: npx tsx src/firebase/put_doc.ts "2026-03-21" "image_log" --collection image_logs --description-file tmp/image_log.json'
  );
  console.error("互換形式: --description-file 未指定時のみ、第2位置引数を本文として扱います。");
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));

  const collection = flags["collection"] || "notes";
  const descriptionFile = flags["description-file"];

  const date = positionals[0];

  // --description-file 指定時は description を位置引数ではなくファイルから読むため、
  // 位置引数は [date, type?] とみなす。未指定時は従来どおり [date, description, type?]。
  let description: string;
  let typeArg: string | undefined;

  if (descriptionFile) {
    typeArg = positionals[1];
    // プロジェクトルート外への参照（絶対パスや ../ による脱出）を拒否する
    const resolvedPath = resolve(projectRoot, descriptionFile);
    if (resolvedPath !== projectRoot && !resolvedPath.startsWith(projectRoot + sep)) {
      console.error(
        `--description-file はプロジェクトルート内のパスを指定してください: ${descriptionFile}`
      );
      process.exit(1);
    }
    try {
      description = readFileSync(resolvedPath, "utf-8");
    } catch (error) {
      console.error(
        `--description-file の読み込みに失敗しました: ${descriptionFile}`,
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  } else {
    description = positionals[1];
    typeArg = positionals[2];
  }

  if (!date || !description) {
    printUsage();
    process.exit(1);
  }

  if (!descriptionFile && looksLikeDescriptionFilePath(description)) {
    console.error(
      `description に一時ファイルパス "${description}" が直接渡されています。本文をファイルに保存した場合は --description-file を指定してください。`
    );
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("日付は YYYY-MM-DD 形式で指定してください");
    process.exit(1);
  }

  // type の決定と検証。
  // - notes: 従来どおり NOTE_TYPE で検証（省略時は FROM_AOI）。
  // - notes 以外（image_logs 等の専用コレクション）: NOTE_TYPE 検証はバイパスし、
  //   コレクション内識別用の type を必須とする（軽い非空検証のみ）。
  let type: string;
  if (collection === "notes") {
    const candidate = typeArg ?? NOTE_TYPE.FROM_AOI;
    if (!isNoteType(candidate)) {
      console.error(
        `不正な type: "${candidate}"。許可される値は src/firebase/noteTypes.ts の NOTE_TYPE を参照してください。`
      );
      process.exit(1);
    }
    type = candidate as NoteType;
  } else {
    if (!typeArg) {
      console.error(
        `コレクション "${collection}" には type を指定してください（notes 以外では NOTE_TYPE 検証をバイパスします）。`
      );
      process.exit(1);
    }
    type = typeArg;
  }

  const db = initFirestore();

  const [year, month, day] = date.split("-").map(Number);
  const dateValue = new Date(year, month - 1, day);

  const docData = {
    date: Timestamp.fromDate(dateValue),
    description,
    type,
    createdAt: Timestamp.fromDate(new Date()),
  };

  const docRef = await withFirestoreTimeout(
    db.collection(collection).add(docData),
    `コレクション ${collection} への書き込み`,
    "write"
  );

  console.log(`ドキュメントを追加しました。コレクション: ${collection}, ID: ${docRef.id}`);

  await finishFirestoreCli(db);
}

main().catch(handleFirestoreCliError);
