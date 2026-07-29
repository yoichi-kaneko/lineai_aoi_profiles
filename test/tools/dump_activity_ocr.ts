/**
 * YAMAP レポート画像から層1テスト用のフィクスチャを生成する。
 *
 * OCR を実行して行一覧を取り出すと同時に、境界検出が画像へ行った問い合わせ
 * （赤背景ボタン判定・写真グリッド検知）の応答も記録する。これにより層1テストは
 * 画像ファイルなしで、実画像と同じ入力に対する境界検出を再現できる。
 *
 * 使い方:
 *   pnpm exec tsx test/tools/dump_activity_ocr.ts <入力画像パス> <フィクスチャ名>
 * 例:
 *   pnpm exec tsx test/tools/dump_activity_ocr.ts tmp/hijiriyama.png hijiriyama_20260728
 *
 * 出力先は test/fixtures/yamap/ocr/{フィクスチャ名}.json。
 *
 * ※ crop_yamap_report の `--debug` 出力（issue #90）が入ったら、そちらへ寄せて本ツールは整理する。
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  type Bbox,
  type ImageProbe,
  createSharpImageProbe,
  runOcr,
} from "../../src/yamap/activity_crop/activity_crop_ocr.js";
import { detectSectionBoundaries } from "../../src/yamap/activity_crop/activity_crop_sections.js";
import { bboxKey, gridKey } from "../yamap/fixture.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const FIXTURE_DIR = path.join(PROJECT_ROOT, "test/fixtures/yamap/ocr");

/** 実 probe の応答を記録しながら委譲する probe */
function createRecordingProbe(inner: ImageProbe) {
  const redButton: Record<string, boolean> = {};
  const photoGrid: Record<string, number | null> = {};

  const probe: ImageProbe = {
    async isRedButtonBackground(bbox: Bbox, scaleBack: number) {
      const result = await inner.isRedButtonBackground(bbox, scaleBack);
      redButton[bboxKey(bbox)] = result;
      return result;
    },
    async detectPhotoGridStartY(searchStartY, imageWidth, imageHeight) {
      const result = await inner.detectPhotoGridStartY(
        searchStartY,
        imageWidth,
        imageHeight,
      );
      photoGrid[gridKey(searchStartY)] = result;
      return result;
    },
  };

  return { probe, redButton, photoGrid };
}

async function main() {
  const inputArg = process.argv[2];
  const fixtureName = process.argv[3];

  if (!inputArg || !fixtureName) {
    console.error(
      "使用方法: pnpm exec tsx test/tools/dump_activity_ocr.ts <入力画像パス> <フィクスチャ名>",
    );
    process.exit(1);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fixtureName)) {
    console.error("フィクスチャ名は英数字・ハイフン・アンダースコアのみ使用できます");
    process.exit(1);
  }

  const inputPath = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(PROJECT_ROOT, inputArg);

  console.error(`OCR実行中（20秒ほどかかります）: ${inputPath}`);
  const ocr = await runOcr(inputPath);
  console.error(`検出行数: ${ocr.lines.length}`);

  const { probe, redButton, photoGrid } = createRecordingProbe(
    createSharpImageProbe(inputPath),
  );
  const boundaries = await detectSectionBoundaries(ocr, probe);

  const fixture = {
    source: path.basename(inputPath),
    generatedAt: new Date().toISOString(),
    ocrScale: ocr.ocrScale,
    imageWidth: ocr.imageWidth,
    imageHeight: ocr.imageHeight,
    probe: { redButton, photoGrid },
    lines: ocr.lines.map((line) => ({
      text: line.text,
      confidence: line.confidence,
      bbox: line.bbox,
    })),
  };

  mkdirSync(FIXTURE_DIR, { recursive: true });
  const outputPath = path.join(FIXTURE_DIR, `${fixtureName}.json`);
  writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);

  console.error(`フィクスチャを書き出しました: ${outputPath}`);
  console.error("\n生成時点の境界検出結果（テストの期待値を書くときの参考にしてください）:");
  console.error(JSON.stringify(boundaries, null, 2));
}

main().catch((error) => {
  console.error(
    "エラーが発生しました:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
