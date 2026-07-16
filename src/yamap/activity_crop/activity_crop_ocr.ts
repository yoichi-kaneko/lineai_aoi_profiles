import sharp from "sharp";
import { createWorker, type Block, type Line } from "tesseract.js";

/** OCR 用に縮小するときの最大幅（座標は後で元画像スケールに戻す） */
export const OCR_MAX_WIDTH = 1200;

/** グリッド検知用の解析幅 */
export const GRID_ANALYSIS_WIDTH = 600;

/** 本文終端ヒューリスティック: 非本文行の連続数 */
export const NOISE_RUN_THRESHOLD = 3;

export type Bbox = { x0: number; y0: number; x1: number; y1: number };

export type OcrResult = {
  lines: Line[];
  ocrScale: number;
  imageWidth: number;
  imageHeight: number;
};

/** OCR テキストを比較用に正規化する */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .replace(/[・･．.]/g, "");
}

/** Tesseract の blocks から行一覧を平坦化する */
export function collectLines(blocks: Block[] | null): Line[] {
  if (!blocks) return [];
  return blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) => paragraph.lines),
  );
}

export function countJapaneseChars(text: string): number {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
}

export function scaleBbox(bbox: Bbox, scaleX: number, scaleY: number): Bbox {
  return {
    x0: Math.round(bbox.x0 * scaleX),
    y0: Math.round(bbox.y0 * scaleY),
    x1: Math.round(bbox.x1 * scaleX),
    y1: Math.round(bbox.y1 * scaleY),
  };
}

export type FindLabelOptions = {
  afterY?: number;
  beforeY?: number;
  exactHeading?: boolean;
};

/**
 * OCR 行からラベル文字列を含む bbox を探す。
 * exactHeading=true のとき、ラベル以外の文字が少ない行のみ採用する。
 */
export function findLabelBbox(
  lines: Line[],
  label: string,
  options: FindLabelOptions = {},
): Bbox | null {
  const candidates = findAllLabelBboxes(lines, label, options);
  return candidates[0] ?? null;
}

/** 条件に合うラベル bbox を縦位置順にすべて返す */
export function findAllLabelBboxes(
  lines: Line[],
  label: string,
  options: FindLabelOptions = {},
): Bbox[] {
  const needle = normalizeText(label);
  const afterY = options.afterY ?? 0;
  const beforeY = options.beforeY ?? Number.POSITIVE_INFINITY;
  const results: Bbox[] = [];

  for (const line of lines) {
    if (line.bbox.y0 < afterY || line.bbox.y0 >= beforeY) continue;
    const normalized = normalizeText(line.text);
    if (!normalized.includes(needle)) continue;

    if (options.exactHeading) {
      const withoutLabel = normalized.replace(needle, "");
      if (withoutLabel.length > 4) continue;
    }

    results.push(line.bbox);
  }

  return results.sort((a, b) => a.y0 - b.y0);
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

/**
 * 活動詳細本文の終端 Y を推定する（OCR 座標）。
 * 本文らしい行のあと、非本文行が連続した位置を返す。
 */
export function findTextEndY(lines: Line[], afterY: number): number | null {
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
export async function detectPhotoGridStartY(
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

/**
 * 見出し bbox 付近の背景色をサンプリングし、赤背景ボタン風かどうか判定する。
 * YAMAP ではヘッダ画像直下に赤背景・白抜きの「活動データ」ボタンがある。
 */
export async function isRedButtonBackground(
  inputPath: string,
  bbox: Bbox,
  scaleBack: number,
): Promise<boolean> {
  const scaled = scaleBbox(bbox, scaleBack, scaleBack);
  const meta = await sharp(inputPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) return false;

  const sampleTop = Math.max(0, scaled.y0 - 4);
  const sampleBottom = Math.min(height, scaled.y1 + 4);
  const sampleLeft = Math.max(0, scaled.x0 - 8);
  const sampleRight = Math.min(width, scaled.x1 + 8);
  const sampleWidth = sampleRight - sampleLeft;
  const sampleHeight = sampleBottom - sampleTop;
  if (sampleWidth <= 0 || sampleHeight <= 0) return false;

  const { data, info } = await sharp(inputPath)
    .extract({
      left: sampleLeft,
      top: sampleTop,
      width: sampleWidth,
      height: sampleHeight,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  let redCount = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    total += 1;
    if (r > 160 && g < 120 && b < 120 && r > g + 30 && r > b + 30) {
      redCount += 1;
    }
  }

  return total > 0 && redCount / total > 0.25;
}

/** 入力画像に対して OCR を1回実行し、行一覧とスケール情報を返す */
export async function runOcr(inputPath: string): Promise<OcrResult> {
  const meta = await sharp(inputPath).metadata();
  const imageWidth = meta.width;
  const imageHeight = meta.height;
  if (!imageWidth || !imageHeight) {
    throw new Error("画像サイズを取得できませんでした。");
  }

  const ocrScale = imageWidth > OCR_MAX_WIDTH ? OCR_MAX_WIDTH / imageWidth : 1;
  const ocrWidth = Math.round(imageWidth * ocrScale);

  const ocrBuffer = await sharp(inputPath)
    .resize({ width: ocrWidth })
    .png()
    .toBuffer();

  const worker = await createWorker("jpn");
  try {
    const { data } = await worker.recognize(ocrBuffer, {}, { blocks: true });
    const lines = collectLines(data.blocks);
    return { lines, ocrScale, imageWidth, imageHeight };
  } finally {
    await worker.terminate();
  }
}
