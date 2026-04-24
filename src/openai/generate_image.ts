import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  createReadStream,
} from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import type { Uploadable } from "openai/uploads";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

const IMAGE_SIZE = "1024x1024" as const;
const IMAGE_QUALITY = "high" as const;
const IMAGE_OUTPUT_FORMAT = "png" as const;

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

interface ReferenceImage {
  path: string;
  mimeType: string;
}

function getApiKey(): string {
  const key = process.env.OPENAI_GPT_API_KEY;
  if (!key) {
    console.error("環境変数 OPENAI_GPT_API_KEY が設定されていません");
    process.exit(1);
  }
  return key;
}

function getModel(): string {
  const model = process.env.OPENAI_GPT_GENERATE_IMAGE_MODEL;
  if (!model) {
    console.error("環境変数 OPENAI_GPT_GENERATE_IMAGE_MODEL が設定されていません");
    process.exit(1);
  }
  return model;
}

function loadReferenceImages(): ReferenceImage[] {
  const importDir = process.env.GENERATE_IMAGE_IMPORT_DIR;
  if (!importDir) return [];

  const dirPath = resolve(PROJECT_ROOT, importDir);
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath).sort();
  const images: ReferenceImage[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) continue;

    images.push({
      path: path.join(dirPath, file),
      mimeType,
    });
  }

  return images;
}

async function createImageInputs(
  referenceImages: ReferenceImage[],
): Promise<Uploadable[]> {
  return Promise.all(
    referenceImages.map(async (image) =>
      toFile(createReadStream(image.path), path.basename(image.path), {
        type: image.mimeType,
      }),
    ),
  );
}

function saveGeneratedImages(
  imageData: Array<{ b64_json?: string | null }>,
  outputFormat: string,
): string[] {
  const tmpDir = resolve(PROJECT_ROOT, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const extension = outputFormat === "jpeg" ? "jpg" : outputFormat;
  const savedPaths: string[] = [];

  imageData.forEach((item, index) => {
    if (!item.b64_json) return;

    const filename = `gpt_image_${Date.now()}_${index + 1}.${extension}`;
    const savePath = path.join(tmpDir, filename);
    writeFileSync(savePath, Buffer.from(item.b64_json, "base64"));
    savedPaths.push(savePath);
  });

  return savedPaths;
}

async function main() {
  const prompt = process.argv[2];

  if (!prompt) {
    console.error("使用方法: npx tsx src/openai/generate_image.ts <プロンプト>");
    console.error('例: npx tsx src/openai/generate_image.ts "青い空と白い雲"');
    process.exit(1);
  }

  const apiKey = getApiKey();
  const modelName = getModel();
  const client = new OpenAI({ apiKey });
  const referenceImages = loadReferenceImages();

  const result =
    referenceImages.length > 0
      ? await client.images.edit({
          model: modelName,
          image: await createImageInputs(referenceImages),
          prompt,
          size: IMAGE_SIZE,
          quality: IMAGE_QUALITY,
          output_format: IMAGE_OUTPUT_FORMAT,
        })
      : await client.images.generate({
          model: modelName,
          prompt,
          size: IMAGE_SIZE,
          quality: IMAGE_QUALITY,
          output_format: IMAGE_OUTPUT_FORMAT,
        });

  const savedPaths = saveGeneratedImages(result.data ?? [], IMAGE_OUTPUT_FORMAT);

  if (savedPaths.length === 0) {
    console.error("画像の生成に失敗しました");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        prompt,
        model: modelName,
        operation: referenceImages.length > 0 ? "edit" : "generate",
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        outputFormat: IMAGE_OUTPUT_FORMAT,
        referenceImagesCount: referenceImages.length,
        savedPaths,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    "エラーが発生しました:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
