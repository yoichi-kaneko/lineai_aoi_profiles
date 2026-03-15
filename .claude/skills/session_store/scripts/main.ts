import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, "../../../../tmp/session_store.json");

function readStore(): Record<string, string> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
}

function writeStore(data: Record<string, string>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (Object.keys(data).length === 0) {
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
    return;
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

const [, , subcommand, ...args] = process.argv;

if (subcommand === "save") {
  if (args.length === 0) {
    console.error("Usage: main.ts save key=value [key2=value2 ...]");
    process.exit(1);
  }
  const store = readStore();
  for (const arg of args) {
    const idx = arg.indexOf("=");
    if (idx === -1) {
      console.error(`Invalid argument (expected key=value): ${arg}`);
      process.exit(1);
    }
    const key = arg.slice(0, idx);
    // \n（リテラル2文字）を実際の改行文字に変換
    const value = arg.slice(idx + 1).replace(/\\n/g, "\n");
    store[key] = value;
  }
  writeStore(store);
  console.log(`Saved: ${args.map((a) => a.split("=")[0]).join(", ")}`);
} else if (subcommand === "load") {
  if (args.length === 0) {
    console.error("Usage: main.ts load key [key2 ...]");
    process.exit(1);
  }
  const store = readStore();
  const result: Record<string, string> = {};
  for (const key of args) {
    if (!(key in store)) {
      console.error(`Key not found: ${key}`);
      process.exit(1);
    }
    result[key] = store[key];
    delete store[key];
  }
  writeStore(store);
  // 結果をkey=value形式で出力（複数キー対応）
  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}=${value}`);
  }
} else if (subcommand === "dump") {
  const store = readStore();
  console.log(JSON.stringify(store, null, 2));
} else {
  console.error("Usage: main.ts <save|load|dump> [args...]");
  process.exit(1);
}
