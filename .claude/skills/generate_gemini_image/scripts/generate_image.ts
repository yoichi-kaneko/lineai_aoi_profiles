import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// プロジェクトルートの .env を読み込む
// scripts/ -> generate_gemini_image/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env") });

const ASPECT_RATIO = "1:1";
const RESOLUTION = "1K";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) {
    console.error("環境変数 GOOGLE_GEMINI_API_KEY が設定されていません");
    process.exit(1);
  }
  return key;
}

function getModel(): string {
  const model = process.env.GOOGLE_GEMINI_GENERATE_IMAGEMODEL;
  if (!model) {
    console.error("環境変数 GOOGLE_GEMINI_GENERATE_IMAGEMODEL が設定されていません");
    process.exit(1);
  }
  return model;
}

interface InlineData {
  mimeType: string;
  data: string;
}

function loadReferenceImages(): InlineData[] {
  const importDir = process.env.GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR;
  if (!importDir) return [];

  const dirPath = resolve(PROJECT_ROOT, importDir);
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath);
  const images: InlineData[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) continue;

    const filePath = path.join(dirPath, file);
    const data = readFileSync(filePath).toString("base64");
    images.push({ mimeType, data });
  }

  return images;
}

async function main() {
  const prompt = process.argv[2];

  if (!prompt) {
    console.error("使用方法: npx tsx scripts/generate_image.ts <プロンプト>");
    console.error('例: npx tsx scripts/generate_image.ts "青い空と白い雲"');
    process.exit(1);
  }

  const apiKey = getApiKey();
  const modelName = getModel();
  const ai = new GoogleGenAI({ apiKey });

  const referenceImages = loadReferenceImages();

  const parts: Array<{ text: string } | { inlineData: InlineData }> = [];

  // 参考画像を先頭に追加
  for (const img of referenceImages) {
    parts.push({ inlineData: img });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      generationConfig: {
        imageGenerationConfig: {
          aspectRatio: ASPECT_RATIO,
          numberOfImages: 1,
          outputOptions: {
            imageOutputResolution: RESOLUTION,
          },
        },
      },
    },
  });

  const tmpDir = resolve(PROJECT_ROOT, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const savedPaths: string[] = [];
  const texts: string[] = [];

  const candidates = response.candidates ?? [];
  for (const candidate of candidates) {
    const contentParts = candidate.content?.parts ?? [];
    for (const part of contentParts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? "image/png";
        const ext = mimeType === "image/jpeg" ? ".jpg" : ".png";
        const filename = `gemini_image_${Date.now()}${ext}`;
        const savePath = path.join(tmpDir, filename);
        writeFileSync(savePath, Buffer.from(part.inlineData.data, "base64"));
        savedPaths.push(savePath);
      } else if (part.text) {
        texts.push(part.text);
      }
    }
  }

  if (savedPaths.length === 0) {
    console.error("画像の生成に失敗しました");
    process.exit(1);
  }

  console.log(JSON.stringify({
    prompt,
    model: modelName,
    aspectRatio: ASPECT_RATIO,
    resolution: RESOLUTION,
    referenceImagesCount: referenceImages.length,
    savedPaths,
    texts,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
