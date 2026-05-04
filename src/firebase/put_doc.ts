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
import { NOTE_TYPE, isNoteType, type NoteType } from "./noteTypes";

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
  const description = process.argv[3];
  const typeArg = process.argv[4] ?? NOTE_TYPE.FROM_AOI;

  if (!date || !description) {
    console.error("使用方法: npx tsx src/firebase/put_doc.ts <date(YYYY-MM-DD)> <description> [type]");
    console.error('例: npx tsx src/firebase/put_doc.ts "2026-03-21" "今日のメモ"');
    console.error('例: npx tsx src/firebase/put_doc.ts "2026-03-21" "下山報告" "off_mountain"');
    process.exit(1);
  }

  if (!isNoteType(typeArg)) {
    console.error(
      `不正な type: "${typeArg}"。許可される値は src/firebase/noteTypes.ts の NOTE_TYPE を参照してください。`
    );
    process.exit(1);
  }
  const type: NoteType = typeArg;

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

  const docData = {
    date: Timestamp.fromDate(dateValue),
    description,
    type,
    isRead: false,
    createdAt: Timestamp.fromDate(new Date()),
  };

  const docRef = await db.collection("notes").add(docData);

  console.log(`ドキュメントを追加しました。ID: ${docRef.id}`);
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
