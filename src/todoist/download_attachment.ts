import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// プロジェクトルートの .env を読み込む
// src/todoist/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { TodoistApi } from "@doist/todoist-sdk";

function getApiToken(): string {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("環境変数 TODOIST_API_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

async function main() {
  const fileUrl = process.argv[2];
  const originalFilename = process.argv[3]; // オプション: コメントの fileAttachment.fileName から渡す

  if (!fileUrl) {
    console.error("使用方法: npx tsx src/todoist/download_attachment.ts <file_url> [filename]");
    console.error('例: npx tsx src/todoist/download_attachment.ts "https://files.todoist.com/..." "photo.jpg"');
    process.exit(1);
  }

  const api = new TodoistApi(getApiToken());

  let response: Awaited<ReturnType<typeof api.viewAttachment>>;
  try {
    response = await api.viewAttachment(fileUrl);
  } catch (error) {
    console.error(`ダウンロード中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`ダウンロード失敗: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  // SDKの viewAttachment は headers を Record<string, string> として返す
  const headers = response.headers as unknown as Record<string, string>;

  // ファイル名の決定: 引数 > Content-Disposition > URLのパス > タイムスタンプ
  let filename = originalFilename;
  if (!filename) {
    const disposition = headers["content-disposition"];
    if (disposition) {
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
      if (match?.[1]) {
        filename = decodeURIComponent(match[1].trim());
      }
    }
  }
  if (!filename) {
    const urlPath = new URL(fileUrl).pathname;
    const basename = path.basename(urlPath);
    if (basename && basename.includes(".")) {
      filename = basename;
    }
  }
  if (!filename) {
    filename = `attachment_${Date.now()}.bin`;
  }

  // tmp/ ディレクトリに保存
  const tmpDir = resolve(__dirname, "../../tmp");
  mkdirSync(tmpDir, { recursive: true });

  const savePath = path.join(tmpDir, filename);
  const buffer = await response.arrayBuffer();
  writeFileSync(savePath, Buffer.from(buffer));

  const contentType = headers["content-type"] ?? "";
  console.log(JSON.stringify({
    fileUrl,
    filename,
    contentType,
    savedPath: savePath,
    sizeBytes: buffer.byteLength,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
