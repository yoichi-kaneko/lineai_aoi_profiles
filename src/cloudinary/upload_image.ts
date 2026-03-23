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
    console.error("使用方法: npx tsx src/cloudinary/upload_image.ts <相対ファイルパス>");
    console.error('例: npx tsx src/cloudinary/upload_image.ts "tmp/image.png"');
    process.exit(1);
  }

  const projectRoot = resolve(__dirname, "../../");
  const absoluteFilePath = resolve(projectRoot, relativeFilePath);

  cloudinary.config({
    cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requireEnv("CLOUDINARY_API_KEY"),
    api_secret: requireEnv("CLOUDINARY_API_SECRET"),
  });

  const assetFolder = process.env.CLOUDINARY_IMAGE_ASSET_FOLDER;
  const uploadOptions = assetFolder ? { asset_folder: assetFolder } : {};
  const uploadResult = await cloudinary.uploader.upload(absoluteFilePath, uploadOptions);

  const originalWidth: number = uploadResult.width;
  const originalHeight: number = uploadResult.height;
  const previewSize = calcPreviewSize(originalWidth, originalHeight);
  const originalUrl: string = uploadResult.secure_url;
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
