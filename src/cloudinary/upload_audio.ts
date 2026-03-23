import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

// src/cloudinary/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const relativeFilePath = process.argv[2];

  if (!relativeFilePath) {
    console.error("使用方法: npx tsx src/cloudinary/upload_audio.ts <相対ファイルパス>");
    console.error('例: npx tsx src/cloudinary/upload_audio.ts "tmp/song.mp3"');
    process.exit(1);
  }

  const projectRoot = resolve(__dirname, "../../");
  const absoluteFilePath = resolve(projectRoot, relativeFilePath);

  cloudinary.config({
    cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requireEnv("CLOUDINARY_API_KEY"),
    api_secret: requireEnv("CLOUDINARY_API_SECRET"),
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
