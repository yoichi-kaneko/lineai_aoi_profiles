import { resolve } from "path";
import { fileURLToPath } from "url";
import { Timestamp } from "firebase-admin/firestore";
import { isNoteType } from "./noteTypes";
import {
  finishFirestoreCli,
  handleFirestoreCliError,
  initFirestore,
  withFirestoreTimeout,
} from "./client";

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

export interface GetDocsOptions {
  collection: string;
  dateFrom: string;
  dateTo: string;
  startDate: Date;
  endDate: Date;
  /** `--type` による絞り込み対象。未指定時は `undefined`（全件取得）。 */
  types?: string[];
}

/**
 * `--key value` / `--key=value` 形式のオプションを抽出し、残りを位置引数として返す。
 * 同じキーが複数回現れる場合（`--type a --type b`）に備え、値は出現順の配列で保持する。
 */
export function parseArgs(argv: string[]): {
  positionals: string[];
  flags: Record<string, string[]>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};

  const push = (key: string, value: string) => {
    (flags[key] ??= []).push(value);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        push(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          push(key, next);
          i++;
        } else {
          push(key, "");
        }
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

/** 同じキーが複数回指定された場合は最後の値を採用する（単一値のオプション用）。 */
function lastFlag(flags: Record<string, string[]>, key: string): string | undefined {
  const values = flags[key];
  return values && values.length > 0 ? values[values.length - 1] : undefined;
}

/**
 * `--type` の指定を正規化する。
 *
 * `--type line_text,line_image` のカンマ区切りと `--type line_text --type line_image` の
 * 繰り返し指定の双方を受け付け、重複は取り除く。区切りには空白も許容する
 * （PowerShell は引用符なしのカンマ区切りを配列とみなし、空白区切りの1引数として渡すため）。
 * `notes` コレクションでは `NOTE_TYPE` で検証し、専用コレクション（`image_logs` 等）では
 * `type` がコレクション内識別用の別系統のため検証をバイパスする（`put_doc.ts` と同じ方針）。
 */
export function parseTypeFilter(rawValues: string[], collection: string): string[] | undefined {
  if (rawValues.length === 0) return undefined;

  const types = [
    ...new Set(
      rawValues.flatMap((value) => value.split(/[\s,]+/).filter((part) => part.length > 0))
    ),
  ];

  if (types.length === 0) {
    throw new ArgumentError("--type には1つ以上の type を指定してください");
  }

  if (collection === "notes") {
    const invalid = types.filter((type) => !isNoteType(type));
    if (invalid.length > 0) {
      throw new ArgumentError(
        `不正な type: ${invalid.map((type) => `"${type}"`).join(", ")}。` +
          "許可される値は src/firebase/noteTypes.ts の NOTE_TYPE を参照してください。"
      );
    }
  }

  return types;
}

/** `dateFrom` の 0:00:00 〜 `dateTo` の 23:59:59.999 を実行環境のローカル時刻で組み立てる。 */
export function resolveDateRange(
  dateFrom: string,
  dateTo: string
): { startDate: Date; endDate: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new ArgumentError("日付は YYYY-MM-DD 形式で指定してください");
  }

  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [toYear, toMonth, toDay] = dateTo.split("-").map(Number);
  const startDate = new Date(fromYear, fromMonth - 1, fromDay, 0, 0, 0, 0);
  const endDate = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999);

  if (
    startDate.getFullYear() !== fromYear ||
    startDate.getMonth() !== fromMonth - 1 ||
    startDate.getDate() !== fromDay ||
    endDate.getFullYear() !== toYear ||
    endDate.getMonth() !== toMonth - 1 ||
    endDate.getDate() !== toDay
  ) {
    throw new ArgumentError("日付が不正です。存在する日付を YYYY-MM-DD 形式で指定してください");
  }

  if (startDate > endDate) {
    throw new ArgumentError("dateFrom は dateTo 以前の日付を指定してください");
  }

  return { startDate, endDate };
}

/** コマンドライン引数から取得条件を組み立てる。不正な指定は {@link ArgumentError} を投げる。 */
export function resolveOptions(argv: string[]): GetDocsOptions {
  const { positionals, flags } = parseArgs(argv);

  const collection = lastFlag(flags, "collection") || "notes";
  const dateFrom = positionals[0];
  const dateTo = positionals[1];

  if (!dateFrom || !dateTo) {
    throw new ArgumentError("dateFrom と dateTo を指定してください", true);
  }

  const { startDate, endDate } = resolveDateRange(dateFrom, dateTo);
  const types = parseTypeFilter(flags["type"] ?? [], collection);

  return { collection, dateFrom, dateTo, startDate, endDate, ...(types ? { types } : {}) };
}

/**
 * `type` による絞り込みを行う。
 *
 * Firestore 側の `where("type", "in", ...)` を使わないのは、`date` の範囲指定と併用すると
 * 複合インデックスが必要になり、未作成の環境で取得そのものが失敗するため。
 * 本オプションの目的は読み手（碧衣）へ渡す出力量を抑えることなので、取得後の絞り込みで足りる。
 */
export function filterDocsByType<T>(docs: readonly T[], types?: string[]): T[] {
  if (!types || types.length === 0) return [...docs];

  return docs.filter((doc) => {
    const type = (doc as { type?: unknown }).type;
    return typeof type === "string" && types.includes(type);
  });
}

function printUsage() {
  console.error(
    "使用方法: npx tsx src/firebase/get_docs.ts <dateFrom(YYYY-MM-DD)> <dateTo(YYYY-MM-DD)> [--collection <name>] [--type <type[,type...]>]"
  );
  console.error('例: npx tsx src/firebase/get_docs.ts "2026-03-21" "2026-03-21"');
  console.error(
    '例: npx tsx src/firebase/get_docs.ts "2026-06-01" "2026-06-21" --collection image_logs'
  );
  console.error(
    '例: npx tsx src/firebase/get_docs.ts "2026-08-09" "2026-08-16" --type line_text,line_image'
  );
}

async function main() {
  let options: GetDocsOptions;
  try {
    options = resolveOptions(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ArgumentError) {
      console.error(error.message);
      if (error.showUsage) printUsage();
      process.exit(1);
    }
    throw error;
  }

  const { collection, dateFrom, dateTo, startDate, endDate, types } = options;

  const db = initFirestore();

  const snapshot = await withFirestoreTimeout(
    db
      .collection(collection)
      .where("date", ">=", Timestamp.fromDate(startDate))
      .where("date", "<=", Timestamp.fromDate(endDate))
      .get(),
    `コレクション ${collection} の取得`,
    "read"
  );

  const allDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const results = filterDocsByType(allDocs, types);
  const scope = `コレクション: ${collection}${types ? `, type: ${types.join(" / ")}` : ""}`;

  if (results.length === 0) {
    console.log(
      `dateFrom=${dateFrom}, dateTo=${dateTo}（${scope}）に一致するドキュメントはありませんでした。`
    );
  } else {
    const excluded = allDocs.length - results.length;

    console.log(JSON.stringify(results, null, 2));
    console.log(
      `\n${scope} から ${results.length} 件取得しました。` +
        (excluded > 0 ? `（type 絞り込みで ${excluded} 件を除外）` : "")
    );
  }

  await finishFirestoreCli(db);
}

const isDirectRun =
  !!process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch(handleFirestoreCliError);
}
