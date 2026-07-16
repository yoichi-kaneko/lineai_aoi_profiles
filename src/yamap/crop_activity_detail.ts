import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { createWorker, type Block, type Line } from "tesseract.js";

// src/yamap/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/** OCR 用に縮小するときの最大幅（座標は後で元画像スケールに戻す） */
const OCR_MAX_WIDTH = 1200;

/** グリッド検知用の解析幅 */
const GRID_ANALYSIS_WIDTH = 600;

/** 切り出し上下の余白（元画像ピクセル） */
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;

/** 本文終端ヒューリスティック: 非本文行の連続数 */
const NOISE_RUN_THRESHOLD = 3;

const START_LABEL = "活動詳細";
const END_LABEL = "写真";

type Bbox = { x0: number; y0: number; x1: number; y1: number };
type EndMethod = "label" | "grid_detection" | "text_end_heuristic";

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .replace(/[・･．.]/g, "");
}

function collectLines(blocks: Block[] | null): Line[] {
  if (!blocks) return [];
  return blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) => paragraph.lines),
  );
}

function countJapaneseChars(text: string): number {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
}

function findLabelBbox(
  lines: Line[],
  label: string,
  options: { afterY?: number; exactHeading?: boolean } = {},
): Bbox | null {
  const needle = normalizeText(label);
  const afterY = options.afterY ?? 0;

  for (const line of lines) {
    if (line.bbox.y0 < afterY) continue;
    const normalized = normalizeText(line.text);
    if (!normalized.includes(needle)) continue;

    if (options.exactHeading) {
      const withoutLabel = normalized.replace(needle, "");
      if (withoutLabel.length > 4) continue;
    }

    return line.bbox;
  }

  return null;
}

function isContentLine(line: Line): boolean {
  const normalized = normalizeText(line.text);
  if (normalized.length < 10) return false;
  const jp = countJapaneseChars(normalized);
  if (jp < 8) return false;
  if (jp / normalized.length < 0.45) return false;
  if (line.confidence > 0 && line.confidence < 45) return false;
  return true;
}

/** OCR 本文終端ヒューリスティック（最終フォールバック） */
function findTextEndY(lines: Line[], afterY: number): number | null {
  const after = lines
    .filter((line) => line.bbox.y0 >= afterY)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  let seenContent = false;
  let nonContentRun = 0;
  let nonContentStartY: number | null = null;

  for (const line of after) {
    if (isContentLine(line)) {
      seenContent = true;
      nonContentRun = 0;
      nonContentStartY = null;
      continue;
    }

    if (!seenContent) continue;

    if (nonContentRun === 0) nonContentStartY = line.bbox.y0;
    nonContentRun += 1;
    if (nonContentRun >= NOISE_RUN_THRESHOLD && nonContentStartY != null) {
      return nonContentStartY;
    }
  }

  return null;
}

type BandStats = {
  avgDensity: number;
  activeCols: number;
  columnDensities: number[];
};

function isNearWhite(r: number, g: number, b: number): boolean {
  return r > 238 && g > 238 && b > 238;
}

function computeBandStats(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  yStart: number,
  bandHeight: number,
  leftCol: number,
  rightCol: number,
  columnCount: number,
): BandStats {
  const colWidth = (rightCol - leftCol) / columnCount;
  const colNonWhite = new Array(columnCount).fill(0);
  const colTotal = new Array(columnCount).fill(0);
  let nonWhite = 0;
  let total = 0;

  const yEnd = Math.min(yStart + bandHeight, height);

  for (let y = yStart; y < yEnd; y++) {
    for (let x = leftCol; x < rightCol; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] ?? 255;
      const g = data[idx + 1] ?? 255;
      const b = data[idx + 2] ?? 255;
      const col = Math.min(columnCount - 1, Math.floor((x - leftCol) / colWidth));

      colTotal[col] += 1;
      total += 1;
      if (!isNearWhite(r, g, b)) {
        nonWhite += 1;
        colNonWhite[col] += 1;
      }
    }
  }

  const columnDensities = colNonWhite.map((n, i) =>
    colTotal[i] > 0 ? n / colTotal[i] : 0,
  );
  const activeCols = columnDensities.filter((d) => d > 0.08).length;

  return {
    avgDensity: total > 0 ? nonWhite / total : 0,
    activeCols,
    columnDensities,
  };
}

function isTextLikeBand(stats: BandStats): boolean {
  return stats.avgDensity < 0.2 && stats.activeCols <= 2;
}

/** YAMAP 写真サムネイルの4列グリッド（中央2列が特に高密度） */
function isStrongPhotoGridBand(stats: BandStats): boolean {
  if (stats.columnDensities.length < 4) return false;
  const [, c1, c2] = stats.columnDensities;
  return stats.avgDensity >= 0.42 && c1 > 0.55 && c2 > 0.55;
}

/**
 * 活動詳細より下の領域を走査し、写真サムネイルのグリッド開始 Y を推定する。
 * 返却値は元画像座標。
 */
async function detectPhotoGridStartY(
  inputPath: string,
  searchStartY: number,
  imageWidth: number,
  imageHeight: number,
): Promise<number | null> {
  const regionHeight = imageHeight - searchStartY;
  if (regionHeight <= 0) return null;

  const scale = GRID_ANALYSIS_WIDTH / imageWidth;
  const bandHeight = Math.max(8, Math.round(16 * scale));
  const columnCount = 4;
  const contentMarginRatio = 0.1;
  const step = Math.floor(bandHeight / 2);

  const { data, info } = await sharp(inputPath)
    .extract({ left: 0, top: searchStartY, width: imageWidth, height: regionHeight })
    .resize({ width: GRID_ANALYSIS_WIDTH })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const leftCol = Math.floor(width * contentMarginRatio);
  const rightCol = Math.ceil(width * (1 - contentMarginRatio));

  const bands: { y: number; stats: BandStats }[] = [];
  for (let y = 0; y <= height - bandHeight; y += step) {
    bands.push({
      y,
      stats: computeBandStats(
        data, width, height, channels, y, bandHeight, leftCol, rightCol, columnCount,
      ),
    });
  }

  for (let i = 0; i < bands.length - 1; i++) {
    if (!isStrongPhotoGridBand(bands[i].stats)) continue;
    if (!isStrongPhotoGridBand(bands[i + 1].stats)) continue;

    // 直前の低密度帯（本文末尾）を下端候補にする
    let cutY = bands[i].y;
    for (let j = i - 1; j >= 0; j--) {
      if (isTextLikeBand(bands[j].stats)) {
        cutY = bands[j].y + bandHeight;
        break;
      }
    }

    return searchStartY + Math.round(cutY / scale);
  }

  return null;
}

function scaleBbox(bbox: Bbox, scaleX: number, scaleY: number): Bbox {
  return {
    x0: Math.round(bbox.x0 * scaleX),
    y0: Math.round(bbox.y0 * scaleY),
    x1: Math.round(bbox.x1 * scaleX),
    y1: Math.round(bbox.y1 * scaleY),
  };
}

function usageAndExit(): never {
  console.error("使用方法: pnpm exec tsx src/yamap/crop_activity_detail.ts <入力画像パス> [出力画像パス]");
  console.error("例: pnpm exec tsx src/yamap/crop_activity_detail.ts \"tmp/FireShot Capture 008 - ....png\"");
  process.exit(1);
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) usageAndExit();

  const inputPath = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(PROJECT_ROOT, inputArg);

  if (!existsSync(inputPath)) {
    console.error(`入力画像が見つかりません: ${inputPath}`);
    process.exit(1);
  }

  const outputArg = process.argv[3];
  const inputExt = path.extname(inputPath) || ".png";
  const defaultOutput = path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, inputExt)}_activity_detail${inputExt}`,
  );
  const outputPath = outputArg
    ? (path.isAbsolute(outputArg) ? outputArg : path.resolve(PROJECT_ROOT, outputArg))
    : defaultOutput;

  const meta = await sharp(inputPath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    console.error("画像サイズを取得できませんでした。");
    process.exit(1);
  }

  const ocrScale = width > OCR_MAX_WIDTH ? OCR_MAX_WIDTH / width : 1;
  const ocrWidth = Math.round(width * ocrScale);

  console.error(`OCR準備: ${width}x${height} -> ${ocrWidth}x${Math.round(height * ocrScale)} (scale=${ocrScale.toFixed(3)})`);

  const ocrBuffer = await sharp(inputPath)
    .resize({ width: ocrWidth })
    .png()
    .toBuffer();

  const worker = await createWorker("jpn");
  let lines: Line[] = [];
  try {
    console.error("OCR実行中...");
    const { data } = await worker.recognize(ocrBuffer, {}, { blocks: true });
    lines = collectLines(data.blocks);
    console.error(`検出行数: ${lines.length}`);
  } finally {
    await worker.terminate();
  }

  const startOcr = findLabelBbox(lines, START_LABEL);
  if (!startOcr) {
    console.error(`見出し「${START_LABEL}」が見つかりませんでした。`);
    console.error("検出テキスト抜粋:");
    for (const line of lines.slice(0, 40)) {
      console.error(`  y=${line.bbox.y0}: ${normalizeText(line.text)}`);
    }
    process.exit(1);
  }

  const scaleBack = 1 / ocrScale;
  const start = scaleBbox(startOcr, scaleBack, scaleBack);
  const searchStartY = start.y0;

  let endMethod: EndMethod = "label";
  let endY: number;

  const endLabelOcr = findLabelBbox(lines, END_LABEL, {
    afterY: startOcr.y1,
    exactHeading: true,
  });

  if (endLabelOcr) {
    endY = scaleBbox(endLabelOcr, scaleBack, scaleBack).y0;
    console.error(`見出し「${END_LABEL}」を検出 (y=${endY})`);
  } else {
    console.error(`見出し「${END_LABEL}」未検出。グリッド検知を実行...`);
    const gridY = await detectPhotoGridStartY(inputPath, searchStartY, width, height);

    if (gridY != null) {
      endY = gridY;
      endMethod = "grid_detection";
      console.error(`グリッド検知で境界を特定 (y=${gridY})`);
    } else {
      console.error("グリッド未検出。本文終端ヒューリスティックを実行...");
      const textEndOcrY = findTextEndY(lines, startOcr.y1);
      if (textEndOcrY == null) {
        console.error(`下端境界を特定できませんでした。`);
        process.exit(1);
      }
      endY = Math.round(textEndOcrY * scaleBack);
      endMethod = "text_end_heuristic";
      console.error(`本文終端ヒューリスティックで境界を特定 (y=${endY})`);
    }
  }

  const top = Math.max(0, start.y0 - PADDING_TOP);
  const bottom = Math.min(height, endY - PADDING_BOTTOM);
  const cropHeight = bottom - top;

  if (cropHeight <= 0) {
    console.error(`切り出し高さが不正です: top=${top}, bottom=${bottom}`);
    process.exit(1);
  }

  await sharp(inputPath)
    .extract({ left: 0, top, width, height: cropHeight })
    .toFile(outputPath);

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    imageSize: { width, height },
    ocrScale,
    endMethod,
    labels: {
      start: { text: START_LABEL, bbox: start },
      end: { text: END_LABEL, y: endY },
    },
    crop: { left: 0, top, width, height: cropHeight },
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
