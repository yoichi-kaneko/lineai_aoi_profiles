import { resolve } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// scripts/ -> fetch_image/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

function getFilenameFromResponse(response: Response, url: string): string {
  // Content-Disposition ヘッダーからファイル名を取得
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  // URLのパス部分からファイル名を取得
  const urlPath = new URL(url).pathname;
  const basename = path.basename(urlPath);
  if (basename && basename.includes(".")) {
    return basename;
  }

  // Content-Type からファイル名を生成
  const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const ext = MIME_TO_EXT[contentType] ?? ".bin";
  return `image_${Date.now()}${ext}`;
}

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("使用方法: npx tsx scripts/fetch.ts <URL>");
    console.error("例: npx tsx scripts/fetch.ts \"https://example.com/photo.jpg\"");
    process.exit(1);
  }

  // URLの基本検証
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error(`URLの形式が不正です: ${url}`);
    process.exit(1);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    console.error(`対応していないプロトコルです: ${parsedUrl.protocol}`);
    process.exit(1);
  }

  // ダウンロード
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error(`ダウンロード中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`ダウンロード失敗: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    console.error(`画像ファイルではありません。Content-Type: ${contentType}`);
    process.exit(1);
  }

  // tmp/ ディレクトリに保存
  const tmpDir = resolve(__dirname, "../../../../tmp");
  mkdirSync(tmpDir, { recursive: true });

  const filename = getFilenameFromResponse(response, url);
  const savePath = path.join(tmpDir, filename);

  const buffer = await response.arrayBuffer();
  writeFileSync(savePath, Buffer.from(buffer));

  console.log(JSON.stringify({
    url,
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
