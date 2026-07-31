/**
 * 層2: 実画像を通した切り出しの E2E テスト（低速・任意実行）
 *
 * OCR に1枚あたり約20秒かかるため常時実行はしない。`pnpm test:e2e` で明示的に実行する。
 *
 * 元画像はリポジトリにコミットしていない（1枚あたり約10MB）。
 * test/fixtures/yamap/images/ へ配置してから実行する。入手元は test/README.md を参照。
 * 画像が無い場合、テストは失敗ではなくスキップになる。
 */
import { existsSync, mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { runOcr } from "../../src/yamap/activity_crop/activity_crop_ocr.js";
import { cropAllSections } from "../../src/yamap/activity_crop/activity_crop_sections.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IMAGE_DIR = path.resolve(__dirname, "../fixtures/yamap/images");

/** OCR が支配的（1枚あたり約20秒）。環境差を見込んで余裕を持たせる */
const E2E_TIMEOUT_MS = 10 * 60 * 1000;

const IMAGE_CASES = [
  {
    file: "hijiriyama_20260728.png",
    description: "聖山レポート（issue #88 の失敗ケース）",
  },
  {
    file: "hutamatayama_20260729.png",
    description: "二岐山レポート（見出し併記リンクがノイズ化するケース）",
  },
  {
    file: "kuwasakiyama_20260731.png",
    description: "鍬崎山レポート（併記リンクが部分的にしか読めないケース）",
  },
];

describe("crop_yamap_report E2E", () => {
  for (const imageCase of IMAGE_CASES) {
    const imagePath = path.join(IMAGE_DIR, imageCase.file);

    it.skipIf(!existsSync(imagePath))(
      `${imageCase.file}（${imageCase.description}）から4ブロックすべてを切り出せる`,
      async () => {
        const outputDir = mkdtempSync(path.join(os.tmpdir(), "yamap-crop-e2e-"));

        try {
          const ocr = await runOcr(imagePath);
          const result = await cropAllSections(imagePath, outputDir, "e2e", ocr);

          const failed = result.results.filter((r) => r.status === "FAILED");
          expect(
            failed,
            `失敗ブロック: ${failed.map((r) => `${r.section}(${r.reason})`).join(", ")}`,
          ).toEqual([]);

          expect(result.savedPaths).toHaveLength(4);
          for (const savedPath of result.savedPaths) {
            expect(existsSync(savedPath)).toBe(true);
          }
        } finally {
          rmSync(outputDir, { recursive: true, force: true });
        }
      },
      E2E_TIMEOUT_MS,
    );
  }
});
