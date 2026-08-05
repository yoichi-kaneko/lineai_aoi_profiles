import { Timestamp } from "firebase-admin/firestore";
import { isRunLogMode, type RunLogMode } from "./runLogModes";
import {
  finishFirestoreCli,
  handleFirestoreCliError,
  initFirestore,
  withFirestoreTimeout,
} from "./client";

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

  const db = initFirestore();

  const [year, month, day] = date.split("-").map(Number);
  const dateValue = new Date(year, month - 1, day);

  const snapshot = await withFirestoreTimeout(
    db
      .collection("run_logs")
      .where("date", "==", Timestamp.fromDate(dateValue))
      .where("mode", "==", mode)
      .limit(1)
      .get(),
    "run_logs の確認",
    "read"
  );

  console.log(snapshot.empty ? "false" : "true");

  await finishFirestoreCli(db);
}

main().catch(handleFirestoreCliError);
