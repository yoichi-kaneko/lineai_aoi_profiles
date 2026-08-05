import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/firebase/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

/**
 * Firestore 操作を打ち切るまでの既定時間（ミリ秒）。
 *
 * Firestore は他の連携先（Todoist / Swarm / Calendar 等の REST）と異なり gRPC で接続するため、
 * 接続が詰まると google-gax が指数バックオフで再試行し続け、クライアント側に期限がない。
 * 上位（Bash ツールやシェルの timeout）任せにすると「結果不明のまま宙ぶらりん」になるので、
 * CLI 側で明示的に打ち切る。
 */
const DEFAULT_TIMEOUT_MS = 30000;

/** `db.terminate()` 自体が詰まった場合に待つのをやめるまでの時間（ミリ秒） */
const TERMINATE_GRACE_MS = 3000;

/** タイムアウトで打ち切ったときの終了コード。`timeout(1)` の慣習に合わせる */
export const TIMEOUT_EXIT_CODE = 124;

/** 操作の種別。タイムアウト時のメッセージを読み手が正しく解釈できるように区別する */
export type FirestoreOpKind = "read" | "write";

export class FirestoreTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly kind: FirestoreOpKind,
    readonly timeoutMs: number
  ) {
    super(`${label} が ${timeoutMs}ms 以内に完了しませんでした`);
    this.name = "FirestoreTimeoutError";
  }
}

export function getFirebaseConfigPath(): string {
  const configPath = process.env.FIREBASE_CONFIG_PATH;
  if (!configPath) {
    console.error("環境変数 FIREBASE_CONFIG_PATH が設定されていません");
    process.exit(1);
  }
  return configPath;
}

/** サービスアカウントで Firebase Admin を初期化し、Firestore インスタンスを返す */
export function initFirestore(): Firestore {
  const configPath = getFirebaseConfigPath();
  const serviceAccount = JSON.parse(readFileSync(configPath, "utf-8")) as ServiceAccount;

  initializeApp({
    credential: cert(serviceAccount),
  });

  return getFirestore();
}

function resolveTimeoutMs(): number {
  const raw = process.env.FIRESTORE_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(
      `環境変数 FIRESTORE_TIMEOUT_MS の値が不正です: "${raw}"。既定値 ${DEFAULT_TIMEOUT_MS}ms を使用します。`
    );
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

/**
 * Firestore 操作に明示的な期限を設ける。
 *
 * 注: firebase-admin の `Query.get()` / `CollectionReference.add()` は gax の
 * 呼び出しオプション（deadline 等）を公開していないため、期限は Promise.race で与える。
 * これは「待つのをやめる」だけで、サーバ側の処理をキャンセルするものではない。
 * したがって write のタイムアウトは「失敗」ではなく「結果不明」として扱う必要がある。
 */
export async function withFirestoreTimeout<T>(
  operation: Promise<T>,
  label: string,
  kind: FirestoreOpKind
): Promise<T> {
  const timeoutMs = resolveTimeoutMs();

  // 打ち切った後に operation が遅れて失敗しても unhandled rejection にしない
  void operation.catch(() => undefined);

  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FirestoreTimeoutError(label, kind, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([operation, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** stdout / stderr を書き切ってからプロセスを終了する（パイプ出力の欠落を防ぐ） */
async function exitAfterFlush(exitCode: number): Promise<never> {
  await Promise.all([
    new Promise<void>((r) => process.stdout.write("", () => r())),
    new Promise<void>((r) => process.stderr.write("", () => r())),
  ]);
  process.exit(exitCode);
}

/**
 * Firestore CLI の正常終了処理。
 *
 * gRPC チャネルを開いたままにするとイベントループが解放されず終了が遅れることがあるため、
 * 明示的に `terminate()` してから終了コードを返す。
 */
export async function finishFirestoreCli(db: Firestore, exitCode = 0): Promise<never> {
  await Promise.race([
    db.terminate().catch(() => undefined),
    new Promise<void>((r) => setTimeout(r, TERMINATE_GRACE_MS)),
  ]);
  return exitAfterFlush(exitCode);
}

/** Firestore CLI の異常終了処理。タイムアウトは通常の失敗と区別して報告する */
export async function handleFirestoreCliError(error: unknown): Promise<never> {
  if (error instanceof FirestoreTimeoutError) {
    console.error(`[TIMEOUT] ${error.message}。`);
    if (error.kind === "write") {
      console.error(
        "サーバ側では処理が完了している可能性があります。結果を確認せずに再実行しないでください。"
      );
    } else {
      console.error("読み取り操作のため、そのまま再実行して差し支えありません。");
    }
    return exitAfterFlush(TIMEOUT_EXIT_CODE);
  }

  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  return exitAfterFlush(1);
}
