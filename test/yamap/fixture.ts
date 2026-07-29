/**
 * 層1テスト用フィクスチャの読み込みと、記録済み応答を返す ImageProbe。
 *
 * フィクスチャは test/tools/dump_activity_ocr.ts が生成する。
 * 生成方法・追加手順は test/README.md を参照。
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Line } from "tesseract.js";
import type {
  Bbox,
  ImageProbe,
  OcrResult,
} from "../../src/yamap/activity_crop/activity_crop_ocr.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/yamap/ocr");

export type OcrFixture = {
  source: string;
  generatedAt: string;
  ocrScale: number;
  imageWidth: number;
  imageHeight: number;
  probe: {
    redButton: Record<string, boolean>;
    photoGrid: Record<string, number | null>;
  };
  lines: { text: string; confidence: number; bbox: Bbox }[];
};

/** 記録・再生で同じキーを使うため、キー生成はここに集約する */
export function bboxKey(bbox: Bbox): string {
  return `${bbox.x0},${bbox.y0},${bbox.x1},${bbox.y1}`;
}

export function gridKey(searchStartY: number): string {
  return String(searchStartY);
}

export function loadFixture(name: string): OcrFixture {
  return JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"),
  ) as OcrFixture;
}

/** フィクスチャの行一覧を OcrResult へ組み立てる */
export function toOcrResult(
  fixture: OcrFixture,
  lines: Line[] = fixture.lines as unknown as Line[],
): OcrResult {
  return {
    lines,
    ocrScale: fixture.ocrScale,
    imageWidth: fixture.imageWidth,
    imageHeight: fixture.imageHeight,
  };
}

/**
 * フィクスチャに記録された応答を返す ImageProbe。
 *
 * 記録に無い問い合わせが来た場合は、黙って既定値を返さず例外を投げる。
 * 実装変更で問い合わせ内容が変わったことに気づけるようにするため。
 */
export function createReplayProbe(fixture: OcrFixture): ImageProbe {
  return {
    async isRedButtonBackground(bbox: Bbox) {
      const key = bboxKey(bbox);
      const recorded = fixture.probe.redButton[key];
      if (recorded === undefined) {
        throw new Error(
          `フィクスチャに赤背景判定の記録がありません (bbox=${key})。`
            + " test/tools/dump_activity_ocr.ts でフィクスチャを再生成してください。",
        );
      }
      return recorded;
    },
    async detectPhotoGridStartY(searchStartY: number) {
      const key = gridKey(searchStartY);
      const recorded = fixture.probe.photoGrid[key];
      if (recorded === undefined) {
        throw new Error(
          `フィクスチャに写真グリッド検知の記録がありません (searchStartY=${key})。`
            + " test/tools/dump_activity_ocr.ts でフィクスチャを再生成してください。",
        );
      }
      return recorded;
    },
  };
}
