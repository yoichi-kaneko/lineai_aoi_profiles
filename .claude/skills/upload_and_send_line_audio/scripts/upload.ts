import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

// プロジェクトルートの .env を読み込む
// scripts/ -> upload_and_send_line_audio/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

function getCloudinaryConfig(): { cloudName: string; apiKey: string; apiSecret: string } {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName) {
    console.error("環境変数 CLOUDINARY_CLOUD_NAME が設定されていません");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("環境変数 CLOUDINARY_API_KEY が設定されていません");
    process.exit(1);
  }
  if (!apiSecret) {
    console.error("環境変数 CLOUDINARY_API_SECRET が設定されていません");
    process.exit(1);
  }

  return { cloudName, apiKey, apiSecret };
}

async function main() {
  const relativeFilePath = process.argv[2];

  if (!relativeFilePath) {
    console.error("使用方法: npx tsx scripts/upload.ts <相対ファイルパス>");
    console.error('例: npx tsx scripts/upload.ts "tmp/song.mp3"');
    process.exit(1);
  }

  const absoluteFilePath = resolve(PROJECT_ROOT, relativeFilePath);

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  // 音声ファイルは resource_type: "video" でアップロード（Cloudinaryの仕様）
  const assetFolder = process.env.CLOUDINARY_SONG_ASSET_FOLDER;
  const uploadOptions: Record<string, unknown> = { resource_type: "video" };
  if (assetFolder) {
    uploadOptions.asset_folder = assetFolder;
  }
  const uploadResult = await cloudinary.uploader.upload(absoluteFilePath, uploadOptions);

  // duration は秒単位で返却されるのでミリ秒に変換
  const durationSeconds: number = uploadResult.duration ?? 0;
  const durationMs: number = Math.round(durationSeconds * 1000);

  const url: string = uploadResult.secure_url;

  console.log(
    JSON.stringify(
      {
        url,
        duration: durationMs,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
