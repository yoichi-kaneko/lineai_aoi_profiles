import path from "path";
import sharp from "sharp";
import type { Line } from "tesseract.js";
import {
  type Bbox,
  type OcrResult,
  detectPhotoGridStartY,
  findAllLabelBboxes,
  findLabelBbox,
  findTextEndY,
  isRedButtonBackground,
  normalizeText,
  scaleBbox,
} from "./activity_crop_ocr.js";

/** 切り出し上下の余白（元画像ピクセル） */
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;

/** YAMAP 活動記録レポートで切り出す4ブロックの識別子 */
export type SectionId =
  | "header"
  | "activity_data"
  | "checkpoints"
  | "activity_detail";

export type SectionStatus = "OK" | "FAILED";

export type ActivityDetailEndMethod =
  | "photo_label"
  | "grid_detection"
  | "text_end_heuristic";

export type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SectionCropResult = {
  section: SectionId;
  status: SectionStatus;
  outputPath?: string;
  reason?: string;
  crop?: CropRect;
  endMethod?: ActivityDetailEndMethod;
};

export type CropAllSectionsResult = {
  inputPath: string;
  outputPrefix: string;
  imageSize: { width: number; height: number };
  ocrScale: number;
  savedPaths: string[];
  results: SectionCropResult[];
};

const SECTION_OUTPUT_SUFFIX: Record<SectionId, string> = {
  header: "header",
  activity_data: "activity_data",
  checkpoints: "checkpoints",
  activity_detail: "activity_detail",
};

const LABEL_ACTIVITY_DATA = "活動データ";
const LABEL_CHECKPOINTS = "チェックポイント";
const LABEL_ACTIVITY_DETAIL = "活動詳細";
const LABEL_PHOTOS = "写真";

type SectionBoundaries = {
  header: { top: number; bottom: number } | null;
  activityData: { top: number; bottom: number } | null;
  checkpoints: { top: number; bottom: number } | null;
  activityDetail: {
    top: number;
    bottom: number;
    endMethod: ActivityDetailEndMethod;
  } | null;
};

function looksLikeStatsLine(text: string): boolean {
  const normalized = normalizeText(text);
  return /km|kcal|m\b|時間|分|標高|累積/.test(normalized)
    || /\d/.test(normalized);
}

/**
 * 「活動データ」見出しの候補から、白背景の本文側見出しを選ぶ。
 * ヘッダ画像直下の赤背景ボタンは isRedButtonBackground で除外する。
 */
async function findActivityDataHeading(
  inputPath: string,
  lines: Line[],
  scaleBack: number,
  checkpointOcrY: number | null,
): Promise<Bbox | null> {
  const beforeY = checkpointOcrY ?? Number.POSITIVE_INFINITY;
  const candidates = findAllLabelBboxes(lines, LABEL_ACTIVITY_DATA, {
    exactHeading: true,
    beforeY,
  });

  if (candidates.length === 0) return null;

  const scored: { bbox: Bbox; score: number }[] = [];

  for (const candidate of candidates) {
    const isRed = await isRedButtonBackground(inputPath, candidate, scaleBack);
    if (isRed) continue;

    let score = 0;
    const following = lines
      .filter((line) => line.bbox.y0 >= candidate.y1 && line.bbox.y0 < candidate.y1 + 120)
      .slice(0, 8);

    for (const line of following) {
      if (looksLikeStatsLine(line.text)) score += 2;
    }

    score += candidate.y0 / 1000;
    scored.push({ bbox: candidate, score });
  }

  if (scored.length === 0) {
    return null;
  }

  scored.sort((a, b) => b.score - a.score);
  return scaleBbox(scored[0].bbox, scaleBack, scaleBack);
}

function buildCropRect(
  top: number,
  bottom: number,
  imageWidth: number,
  imageHeight: number,
): CropRect | null {
  const paddedTop = Math.max(0, top - PADDING_TOP);
  const paddedBottom = Math.min(imageHeight, bottom - PADDING_BOTTOM);
  const height = paddedBottom - paddedTop;
  if (height <= 0) return null;

  return {
    left: 0,
    top: paddedTop,
    width: imageWidth,
    height,
  };
}

async function resolveActivityDetailBottom(
  inputPath: string,
  lines: Line[],
  startOcr: Bbox,
  scaleBack: number,
  imageWidth: number,
  imageHeight: number,
): Promise<{ bottom: number; endMethod: ActivityDetailEndMethod } | null> {
  const start = scaleBbox(startOcr, scaleBack, scaleBack);

  const photoLabelOcr = findLabelBbox(lines, LABEL_PHOTOS, {
    afterY: startOcr.y1,
    exactHeading: true,
  });

  if (photoLabelOcr) {
    return {
      bottom: scaleBbox(photoLabelOcr, scaleBack, scaleBack).y0,
      endMethod: "photo_label",
    };
  }

  const gridY = await detectPhotoGridStartY(
    inputPath,
    start.y0,
    imageWidth,
    imageHeight,
  );
  if (gridY != null) {
    return { bottom: gridY, endMethod: "grid_detection" };
  }

  const textEndOcrY = findTextEndY(lines, startOcr.y1);
  if (textEndOcrY != null) {
    return {
      bottom: Math.round(textEndOcrY * scaleBack),
      endMethod: "text_end_heuristic",
    };
  }

  return null;
}

/**
 * OCR 結果から YAMAP 活動記録の4ブロック境界を推定する。
 *
 * - header: ページ最上部の実写ヘッダ画像（活動データ見出し直前まで）
 * - activity_data: 白背景「活動データ」見出しからチェックポイント直前まで
 * - checkpoints: 「チェックポイント」見出しから活動詳細直前まで
 * - activity_detail: 「活動詳細」見出しから写真一覧直前まで
 */
async function detectSectionBoundaries(
  inputPath: string,
  ocr: OcrResult,
): Promise<SectionBoundaries> {
  const { lines, ocrScale, imageWidth, imageHeight } = ocr;
  const scaleBack = 1 / ocrScale;

  const checkpointOcr = findLabelBbox(lines, LABEL_CHECKPOINTS, { exactHeading: true });
  const activityDetailOcr = findLabelBbox(lines, LABEL_ACTIVITY_DETAIL, { exactHeading: true });

  const activityDataHeading = await findActivityDataHeading(
    inputPath,
    lines,
    scaleBack,
    checkpointOcr?.y0 ?? null,
  );

  const checkpointHeading = checkpointOcr
    ? scaleBbox(checkpointOcr, scaleBack, scaleBack)
    : null;
  const activityDetailHeading = activityDetailOcr
    ? scaleBbox(activityDetailOcr, scaleBack, scaleBack)
    : null;

  let activityDetailBottom: { bottom: number; endMethod: ActivityDetailEndMethod } | null = null;
  if (activityDetailOcr) {
    activityDetailBottom = await resolveActivityDetailBottom(
      inputPath,
      lines,
      activityDetailOcr,
      scaleBack,
      imageWidth,
      imageHeight,
    );
  }

  const headerBottom = activityDataHeading?.y0 ?? null;
  const header = headerBottom != null && headerBottom > 0
    ? { top: 0, bottom: headerBottom }
    : null;

  const activityData = activityDataHeading && checkpointHeading
    ? { top: activityDataHeading.y0, bottom: checkpointHeading.y0 }
    : null;

  const checkpoints = checkpointHeading && activityDetailHeading
    ? { top: checkpointHeading.y0, bottom: activityDetailHeading.y0 }
    : null;

  const activityDetail = activityDetailHeading && activityDetailBottom
    ? {
        top: activityDetailHeading.y0,
        bottom: activityDetailBottom.bottom,
        endMethod: activityDetailBottom.endMethod,
      }
    : null;

  return { header, activityData, checkpoints, activityDetail };
}

async function cropAndSave(
  inputPath: string,
  outputPath: string,
  rect: CropRect,
): Promise<void> {
  await sharp(inputPath)
    .extract({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    })
    .toFile(outputPath);
}

function buildFailedResult(
  section: SectionId,
  reason: string,
): SectionCropResult {
  return { section, status: "FAILED", reason };
}

/**
 * YAMAP 活動記録スクリーンショットから4ブロックを切り出し、tmp 配下へ保存する。
 * 一部失敗時は成功分のみ savedPaths に含め、失敗分は status: FAILED で返す。
 */
export async function cropAllSections(
  inputPath: string,
  outputDir: string,
  outputPrefix: string,
  ocr: OcrResult,
): Promise<CropAllSectionsResult> {
  const { imageWidth, imageHeight, ocrScale } = ocr;
  const boundaries = await detectSectionBoundaries(inputPath, ocr);

  const sectionDefs: {
    section: SectionId;
    bounds: { top: number; bottom: number; endMethod?: ActivityDetailEndMethod } | null;
    failReason: string;
  }[] = [
    {
      section: "header",
      bounds: boundaries.header,
      failReason: "ヘッダ画像領域の下端を特定できませんでした",
    },
    {
      section: "activity_data",
      bounds: boundaries.activityData,
      failReason: "「活動データ」または「チェックポイント」見出しを特定できませんでした",
    },
    {
      section: "checkpoints",
      bounds: boundaries.checkpoints,
      failReason: "「チェックポイント」または「活動詳細」見出しを特定できませんでした",
    },
    {
      section: "activity_detail",
      bounds: boundaries.activityDetail,
      failReason: "「活動詳細」見出しまたは下端境界を特定できませんでした",
    },
  ];

  const results: SectionCropResult[] = [];
  const savedPaths: string[] = [];

  for (const def of sectionDefs) {
    if (!def.bounds) {
      results.push(buildFailedResult(def.section, def.failReason));
      continue;
    }

    const rect = buildCropRect(
      def.bounds.top,
      def.bounds.bottom,
      imageWidth,
      imageHeight,
    );

    if (!rect) {
      results.push(
        buildFailedResult(def.section, "切り出し矩形が不正です（高さ0以下）"),
      );
      continue;
    }

    const outputPath = path.join(
      outputDir,
      `${outputPrefix}_${SECTION_OUTPUT_SUFFIX[def.section]}.png`,
    );

    try {
      await cropAndSave(inputPath, outputPath, rect);
      const result: SectionCropResult = {
        section: def.section,
        status: "OK",
        outputPath,
        crop: rect,
      };
      if (def.bounds.endMethod) {
        result.endMethod = def.bounds.endMethod;
      }
      results.push(result);
      savedPaths.push(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(
        buildFailedResult(def.section, `画像の切り出しに失敗しました: ${message}`),
      );
    }
  }

  return {
    inputPath,
    outputPrefix,
    imageSize: { width: imageWidth, height: imageHeight },
    ocrScale,
    savedPaths,
    results,
  };
}
