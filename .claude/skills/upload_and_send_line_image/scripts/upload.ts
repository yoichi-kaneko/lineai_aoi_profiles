import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

// プロジェクトルートの .env を読み込む
// scripts/ -> upload_and_send_line_image/ -> skills/ -> .claude/ -> project root
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

function calcPreviewSize(
  originalWidth: number,
  originalHeight: number,
  maxSize = 512
): { width: number; height: number } {
  const longSide = Math.max(originalWidth, originalHeight);

  if (longSide <= maxSize) {
    return { width: originalWidth, height: originalHeight };
  }

  const ratio = maxSize / longSide;
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

async function main() {
  const relativeFilePath = process.argv[2];

  if (!relativeFilePath) {
    console.error("使用方法: npx tsx scripts/upload.ts <相対ファイルパス>");
    console.error('例: npx tsx scripts/upload.ts "tmp/image.png"');
    process.exit(1);
  }

  const absoluteFilePath = resolve(PROJECT_ROOT, relativeFilePath);

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  // アップロード（レスポンスにオリジナルのwidthとheightが含まれる）
  const assetFolder = process.env.CLOUDINARY_IMAGE_ASSET_FOLDER;
  const uploadOptions = assetFolder ? { asset_folder: assetFolder } : {};
  const uploadResult = await cloudinary.uploader.upload(absoluteFilePath, uploadOptions);

  const originalWidth: number = uploadResult.width;
  const originalHeight: number = uploadResult.height;

  // プレビューサイズを計算
  const previewSize = calcPreviewSize(originalWidth, originalHeight);

  // オリジナル画像URL
  const originalUrl: string = uploadResult.secure_url;

  // プレビューサイズにリサイズしたURL
  const previewUrl: string = cloudinary.url(uploadResult.public_id, {
    transformation: [
      {
        width: previewSize.width,
        height: previewSize.height,
        crop: "fit",
      },
    ],
    secure: true,
  });

  console.log(
    JSON.stringify(
      {
        originalUrl,
        previewUrl,
        originalSize: { width: originalWidth, height: originalHeight },
        previewSize,
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
