import path from "path";
import sharp from "sharp";
import type { Line } from "tesseract.js";
import {
  type Bbox,
  type FindLabelOptions,
  type ImageProbe,
  type LabelCandidateStatus,
  type OcrResult,
  collectLabelCandidates,
  createSharpImageProbe,
  findAllLabelBboxes,
  findLabelBbox,
  findTextEndY,
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
  /** 見出し検出の診断情報。CLI 側が出力要否を判断する */
  debug: CropDebugInfo;
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

/**
 * 見出し・下端の検出状況。
 * 失敗理由を「どの手がかりが欠けたか」まで具体化するために持ち回る。
 */
export type BoundaryEvidence = {
  activityDataHeading: boolean;
  checkpointsHeading: boolean;
  activityDetailHeading: boolean;
  activityDetailBottom: boolean;
};

/** 活動詳細の下端解決で、どの手段をどこまで試したかの記録 */
export type ActivityDetailBottomStep = {
  method: ActivityDetailEndMethod;
  found: boolean;
  /** found=true のときの下端（元画像座標） */
  bottom?: number;
};

/** 見出し候補1件の診断情報 */
export type HeadingCandidateDebug = {
  label: string;
  /** OCR が読んだ生テキスト */
  text: string;
  confidence: number;
  /** OCR 座標（縮小後） */
  ocrY: { y0: number; y1: number };
  /** 元画像座標。切り出し位置を手で決めるときはこちらを使う */
  imageY: { y0: number; y1: number };
  status: LabelCandidateStatus | "red_button";
};

/**
 * 切り出しの診断情報。
 *
 * 「見出しらしき行はあったが、なぜ採用されなかったのか」を示すためのもの。
 * 検出に失敗したとき、この情報から予備フロー（座標指定での切り出し）へ進めるようにする。
 */
export type CropDebugInfo = {
  ocr: { lineCount: number; ocrScale: number };
  /** 4つの見出しラベルごとの候補行（採用・棄却の別つき） */
  headingCandidates: HeadingCandidateDebug[];
  /** 活動詳細の下端解決の経過。見出しが取れなかった場合は null */
  activityDetailBottomSteps: ActivityDetailBottomStep[] | null;
};

export type SectionBoundaries = {
  evidence: BoundaryEvidence;
  debug: CropDebugInfo;
  header: { top: number; bottom: number } | null;
  activityData: { top: number; bottom: number } | null;
  checkpoints: { top: number; bottom: number } | null;
  activityDetail: {
    top: number;
    bottom: number;
    endMethod: ActivityDetailEndMethod;
  } | null;
};

/**
 * 失敗したブロックの理由文を、検出できた手がかりから組み立てる。
 *
 * 各ブロックの下端は次のブロックの見出しに依存するため、見出し1つの検出漏れが
 * 2ブロックを道連れにする（例: 「活動詳細」の検出漏れ → checkpoints も失敗）。
 * 連鎖による失敗はその旨を明示し、原因の切り分けを助ける。
 */
export function buildFailReason(
  section: SectionId,
  evidence: BoundaryEvidence,
): string {
  const {
    activityDataHeading,
    checkpointsHeading,
    activityDetailHeading,
    activityDetailBottom,
  } = evidence;

  switch (section) {
    case "header":
      return `「${LABEL_ACTIVITY_DATA}」見出しを特定できず、ヘッダ画像の下端が決まりませんでした`;

    case "activity_data":
      if (!activityDataHeading && !checkpointsHeading) {
        return `「${LABEL_ACTIVITY_DATA}」「${LABEL_CHECKPOINTS}」いずれの見出しも特定できませんでした`;
      }
      if (!activityDataHeading) {
        return `「${LABEL_ACTIVITY_DATA}」見出し（白背景の本文側）を特定できませんでした`;
      }
      return `「${LABEL_CHECKPOINTS}」見出しを特定できず、下端が決まりませんでした（checkpoints の失敗による連鎖）`;

    case "checkpoints":
      if (!checkpointsHeading && !activityDetailHeading) {
        return `「${LABEL_CHECKPOINTS}」「${LABEL_ACTIVITY_DETAIL}」いずれの見出しも特定できませんでした`;
      }
      if (!checkpointsHeading) {
        return `「${LABEL_CHECKPOINTS}」見出しを特定できませんでした`;
      }
      return `「${LABEL_ACTIVITY_DETAIL}」見出しを特定できず、下端が決まりませんでした（activity_detail の失敗による連鎖）`;

    case "activity_detail":
      if (!activityDetailHeading) {
        return `「${LABEL_ACTIVITY_DETAIL}」見出しを特定できませんでした`;
      }
      if (!activityDetailBottom) {
        return `「${LABEL_ACTIVITY_DETAIL}」本文の下端（写真一覧の開始位置）を特定できませんでした`;
      }
      return "切り出し範囲を構成できませんでした";
  }
}

function looksLikeStatsLine(text: string): boolean {
  const normalized = normalizeText(text);
  return /km|kcal|m\b|時間|分|標高|累積/.test(normalized)
    || /\d/.test(normalized);
}

/**
 * 「活動データ」見出しの候補から、白背景の本文側見出しを選ぶ。
 * ヘッダ画像直下の赤背景ボタンは isRedButtonBackground で除外する。
 *
 * 赤背景として除外した候補は redButtonRejected に返す。この棄却は OCR 行だけでは
 * 説明できないため、診断出力で明示できるよう呼び出し元へ渡す。
 */
async function findActivityDataHeading(
  probe: ImageProbe,
  lines: Line[],
  scaleBack: number,
  checkpointOcrY: number | null,
): Promise<{ heading: Bbox | null; redButtonRejected: Bbox[] }> {
  const beforeY = checkpointOcrY ?? Number.POSITIVE_INFINITY;
  const candidates = findAllLabelBboxes(lines, LABEL_ACTIVITY_DATA, {
    exactHeading: true,
    beforeY,
  });

  const redButtonRejected: Bbox[] = [];
  if (candidates.length === 0) return { heading: null, redButtonRejected };

  const scored: { bbox: Bbox; score: number }[] = [];

  for (const candidate of candidates) {
    const isRed = await probe.isRedButtonBackground(candidate, scaleBack);
    if (isRed) {
      redButtonRejected.push(candidate);
      continue;
    }

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
    return { heading: null, redButtonRejected };
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    heading: scaleBbox(scored[0].bbox, scaleBack, scaleBack),
    redButtonRejected,
  };
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

/**
 * 活動詳細本文の下端を、3段のフォールバックで解決する。
 *
 * 1. 「写真」見出し → 2. 写真サムネイルのグリッド検知 → 3. 本文終端ヒューリスティック
 *
 * **「写真」見出しはレポートによって存在しない**（2026-07-28 の聖山レポートでは OCR ヒット 0 件で、
 * 本文の直後に写真サムネイルが並んでいた）。そのため 1 段目の失敗は異常ではなく、
 * 実質的には 2 段目のグリッド検知が下端検出の主役になっている点に注意。
 */
async function resolveActivityDetailBottom(
  probe: ImageProbe,
  lines: Line[],
  startOcr: Bbox,
  scaleBack: number,
  imageWidth: number,
  imageHeight: number,
): Promise<{
  resolved: { bottom: number; endMethod: ActivityDetailEndMethod } | null;
  steps: ActivityDetailBottomStep[];
}> {
  const start = scaleBbox(startOcr, scaleBack, scaleBack);
  const steps: ActivityDetailBottomStep[] = [];

  const photoLabelOcr = findLabelBbox(lines, LABEL_PHOTOS, {
    afterY: startOcr.y1,
    exactHeading: true,
  });

  if (photoLabelOcr) {
    const bottom = scaleBbox(photoLabelOcr, scaleBack, scaleBack).y0;
    steps.push({ method: "photo_label", found: true, bottom });
    return { resolved: { bottom, endMethod: "photo_label" }, steps };
  }
  steps.push({ method: "photo_label", found: false });

  const gridY = await probe.detectPhotoGridStartY(
    start.y0,
    imageWidth,
    imageHeight,
  );
  if (gridY != null) {
    steps.push({ method: "grid_detection", found: true, bottom: gridY });
    return { resolved: { bottom: gridY, endMethod: "grid_detection" }, steps };
  }
  steps.push({ method: "grid_detection", found: false });

  const textEndOcrY = findTextEndY(lines, startOcr.y1);
  if (textEndOcrY != null) {
    const bottom = Math.round(textEndOcrY * scaleBack);
    steps.push({ method: "text_end_heuristic", found: true, bottom });
    return { resolved: { bottom, endMethod: "text_end_heuristic" }, steps };
  }
  steps.push({ method: "text_end_heuristic", found: false });

  return { resolved: null, steps };
}

/**
 * OCR 結果から YAMAP 活動記録の4ブロック境界を推定する。
 *
 * - header: ページ最上部の実写ヘッダ画像（活動データ見出し直前まで）
 * - activity_data: 白背景「活動データ」見出しからチェックポイント直前まで
 * - checkpoints: 「チェックポイント」見出しから活動詳細直前まで
 * - activity_detail: 「活動詳細」見出しから写真一覧直前まで
 *
 * 画像の画素を要する判定は probe 経由で行うため、この関数自体は画像ファイルなしで実行できる。
 */
export async function detectSectionBoundaries(
  ocr: OcrResult,
  probe: ImageProbe,
): Promise<SectionBoundaries> {
  const { lines, ocrScale, imageWidth, imageHeight } = ocr;
  const scaleBack = 1 / ocrScale;

  const checkpointOcr = findLabelBbox(lines, LABEL_CHECKPOINTS, { exactHeading: true });
  const activityDetailOcr = findLabelBbox(lines, LABEL_ACTIVITY_DETAIL, { exactHeading: true });

  const { heading: activityDataHeading, redButtonRejected } =
    await findActivityDataHeading(
      probe,
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
  let activityDetailBottomSteps: ActivityDetailBottomStep[] | null = null;
  if (activityDetailOcr) {
    const resolution = await resolveActivityDetailBottom(
      probe,
      lines,
      activityDetailOcr,
      scaleBack,
      imageWidth,
      imageHeight,
    );
    activityDetailBottom = resolution.resolved;
    activityDetailBottomSteps = resolution.steps;
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

  const evidence: BoundaryEvidence = {
    activityDataHeading: activityDataHeading != null,
    checkpointsHeading: checkpointHeading != null,
    activityDetailHeading: activityDetailHeading != null,
    activityDetailBottom: activityDetailBottom != null,
  };

  const debug: CropDebugInfo = {
    ocr: { lineCount: lines.length, ocrScale },
    headingCandidates: collectHeadingCandidates(
      lines,
      scaleBack,
      checkpointOcr?.y0 ?? null,
      activityDetailOcr,
      redButtonRejected,
    ),
    activityDetailBottomSteps,
  };

  return { evidence, debug, header, activityData, checkpoints, activityDetail };
}

/**
 * 4つの見出しラベルについて、候補行を採否つきで集める。
 *
 * 探索条件は detectSectionBoundaries 本体と揃えること。ここがずれると
 * 「診断上は採用されるはずなのに実際は棄却されている」という食い違いが起きる。
 */
function collectHeadingCandidates(
  lines: Line[],
  scaleBack: number,
  checkpointOcrY: number | null,
  activityDetailOcr: Bbox | null,
  redButtonRejected: Bbox[],
): HeadingCandidateDebug[] {
  const redButtonKeys = new Set(
    redButtonRejected.map((bbox) => `${bbox.x0},${bbox.y0}`),
  );

  const groups: { label: string; options: FindLabelOptions }[] = [
    {
      label: LABEL_ACTIVITY_DATA,
      options: {
        exactHeading: true,
        beforeY: checkpointOcrY ?? Number.POSITIVE_INFINITY,
      },
    },
    { label: LABEL_CHECKPOINTS, options: { exactHeading: true } },
    { label: LABEL_ACTIVITY_DETAIL, options: { exactHeading: true } },
    {
      label: LABEL_PHOTOS,
      options: {
        exactHeading: true,
        afterY: activityDetailOcr?.y1 ?? 0,
      },
    },
  ];

  return groups.flatMap(({ label, options }) =>
    collectLabelCandidates(lines, label, options).map((candidate) => {
      const isRedButton = candidate.status === "accepted"
        && redButtonKeys.has(`${candidate.bbox.x0},${candidate.bbox.y0}`);
      const imageBbox = scaleBbox(candidate.bbox, scaleBack, scaleBack);

      return {
        label,
        text: candidate.text.trim(),
        confidence: Math.round(candidate.confidence),
        ocrY: { y0: candidate.bbox.y0, y1: candidate.bbox.y1 },
        imageY: { y0: imageBbox.y0, y1: imageBbox.y1 },
        status: isRedButton ? ("red_button" as const) : candidate.status,
      };
    }),
  );
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
  probe: ImageProbe = createSharpImageProbe(inputPath),
): Promise<CropAllSectionsResult> {
  const { imageWidth, imageHeight, ocrScale } = ocr;
  const boundaries = await detectSectionBoundaries(ocr, probe);

  const sectionDefs: {
    section: SectionId;
    bounds: { top: number; bottom: number; endMethod?: ActivityDetailEndMethod } | null;
  }[] = [
    { section: "header", bounds: boundaries.header },
    { section: "activity_data", bounds: boundaries.activityData },
    { section: "checkpoints", bounds: boundaries.checkpoints },
    { section: "activity_detail", bounds: boundaries.activityDetail },
  ];

  const results: SectionCropResult[] = [];
  const savedPaths: string[] = [];

  for (const def of sectionDefs) {
    if (!def.bounds) {
      results.push(
        buildFailedResult(def.section, buildFailReason(def.section, boundaries.evidence)),
      );
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
    debug: boundaries.debug,
  };
}
