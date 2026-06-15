import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  createReadStream,
} from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import type { Uploadable } from "openai/uploads";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

const IMAGE_SIZE = "1024x1024" as const;
const IMAGE_QUALITY = "medium" as const;
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

/** プロンプトを保存したファイル（プロジェクトルート相対）を読み込んで返す */
function readPromptFile(filePath: string): string {
  try {
    return readFileSync(resolve(PROJECT_ROOT, filePath), "utf-8");
  } catch (error) {
    console.error(
      `プロンプトファイルを読み込めませんでした: ${filePath}`,
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

function parseReferenceFileNames(rawFileNames: string): string[] {
  const fileNames = rawFileNames
    .split(",")
    .map((fileName) => fileName.trim())
    .filter(Boolean);

  if (fileNames.length === 0) {
    console.error("参照画像ファイル名を指定してください");
    process.exit(1);
  }

  return fileNames;
}

function loadReferenceImages(rawFileNames: string): ReferenceImage[] {
  const importDir = process.env.GENERATE_IMAGE_IMPORT_DIR;
  if (!importDir) {
    console.error("環境変数 GENERATE_IMAGE_IMPORT_DIR が設定されていません");
    process.exit(1);
  }

  const dirPath = resolve(PROJECT_ROOT, importDir);
  if (!existsSync(dirPath)) {
    console.error(`参照画像ディレクトリが存在しません: ${dirPath}`);
    process.exit(1);
  }

  const files = parseReferenceFileNames(rawFileNames);
  const images: ReferenceImage[] = [];

  for (const file of files) {
    if (file !== path.basename(file)) {
      console.error(`ファイル名のみを指定してください: ${file}`);
      process.exit(1);
    }

    const ext = path.extname(file).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      console.error(`対応していない画像形式です: ${file}`);
      process.exit(1);
    }

    const filePath = path.join(dirPath, file);
    if (!existsSync(filePath)) {
      console.error(`参照画像ファイルが存在しません: ${filePath}`);
      process.exit(1);
    }

    images.push({
      path: filePath,
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
  const promptFilePath = process.argv[2];
  const rawFileNames = process.argv[3];

  if (!promptFilePath || !rawFileNames) {
    console.error(
      "使用方法: npx tsx src/openai/generate_image.ts <プロンプトファイルパス> <参照画像ファイル名[,参照画像ファイル名...]>",
    );
    console.error(
      '例: npx tsx src/openai/generate_image.ts "tmp/gpt_image_prompt.txt" "reference.png,style.webp"',
    );
    process.exit(1);
  }

  // プロンプトは一時ファイル経由で受け渡す（他スキルと同様。改行はそのまま使われる）
  const prompt = readPromptFile(promptFilePath);

  const apiKey = getApiKey();
  const modelName = getModel();
  const client = new OpenAI({ apiKey });
  const referenceImages = loadReferenceImages(rawFileNames);

  const result = await client.images.edit({
    model: modelName,
    image: await createImageInputs(referenceImages),
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
        operation: "edit",
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
