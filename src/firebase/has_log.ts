import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/firebase/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { isRunLogMode, type RunLogMode } from "./runLogModes";

function getFirebaseConfigPath(): string {
  const configPath = process.env.FIREBASE_CONFIG_PATH;
  if (!configPath) {
    console.error("環境変数 FIREBASE_CONFIG_PATH が設定されていません");
    process.exit(1);
  }
  return configPath;
}

async function main() {
  const date = process.argv[2];
  const modeArg = process.argv[3];

  if (!date || !modeArg) {
    console.error("使用方法: pnpm exec tsx src/firebase/has_log.ts <date(YYYY-MM-DD)> <mode>");
    console.error('例: pnpm exec tsx src/firebase/has_log.ts "2026-03-21" "night"');
    process.exit(1);
  }

  if (!isRunLogMode(modeArg)) {
    console.error(
      `不正な mode: "${modeArg}"。許可される値は src/firebase/runLogModes.ts の RUN_LOG_MODE を参照してください。`
    );
    process.exit(1);
  }
  const mode: RunLogMode = modeArg;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("日付は YYYY-MM-DD 形式で指定してください");
    process.exit(1);
  }

  const configPath = getFirebaseConfigPath();
  const serviceAccount = JSON.parse(readFileSync(configPath, "utf-8")) as ServiceAccount;

  initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore();

  const [year, month, day] = date.split("-").map(Number);
  const dateValue = new Date(year, month - 1, day);

  const snapshot = await db
    .collection("run_logs")
    .where("date", "==", Timestamp.fromDate(dateValue))
    .where("mode", "==", mode)
    .limit(1)
    .get();

  console.log(snapshot.empty ? "false" : "true");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
