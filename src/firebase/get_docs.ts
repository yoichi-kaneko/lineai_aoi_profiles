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

function getFirebaseConfigPath(): string {
  const configPath = process.env.FIREBASE_CONFIG_PATH;
  if (!configPath) {
    console.error("環境変数 FIREBASE_CONFIG_PATH が設定されていません");
    process.exit(1);
  }
  return configPath;
}

async function main() {
  const dateFrom = process.argv[2];
  const dateTo = process.argv[3];

  if (!dateFrom || !dateTo) {
    console.error("使用方法: npx tsx src/firebase/get_docs.ts <dateFrom(YYYY-MM-DD)> <dateTo(YYYY-MM-DD)>");
    console.error('例: npx tsx src/firebase/get_docs.ts "2026-03-21" "2026-03-21"');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    console.error("日付は YYYY-MM-DD 形式で指定してください");
    process.exit(1);
  }

  const configPath = getFirebaseConfigPath();
  const serviceAccount = JSON.parse(readFileSync(configPath, "utf-8")) as ServiceAccount;

  initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore();

  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [toYear, toMonth, toDay] = dateTo.split("-").map(Number);
  const startDate = new Date(fromYear, fromMonth - 1, fromDay, 0, 0, 0, 0);
  const endDate = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999);

  const snapshot = await db
    .collection("notes")
    .where("date", ">=", Timestamp.fromDate(startDate))
    .where("date", "<=", Timestamp.fromDate(endDate))
    .get();

  if (snapshot.empty) {
    console.log(`dateFrom=${dateFrom}, dateTo=${dateTo} に一致するドキュメントはありませんでした。`);
    return;
  }

  const results: object[] = [];

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    results.push({ id: doc.id, ...data });
    batch.update(doc.ref, { isRead: true });
  }
  await batch.commit();

  console.log(JSON.stringify(results, null, 2));
  console.log(`\n${results.length} 件取得し、isRead を true に更新しました。`);
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
