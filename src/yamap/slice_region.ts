/**
 * 画像の指定範囲を等間隔にスライスして連番で出力する CLI（予備フロー・モードA）。
 *
 * crop_yamap_report の自動検出が失敗し、切り出し位置がまだ分からないときに使う。
 * 縦長のレポート画像はそのまま Read すると縮小されて判読できないため、
 * 帯状に分割して読み、目的の見出しがどのあたりにあるかを突き止める用途。
 *
 * 位置が決まったら crop_region.ts で本番の切り出しを行う。
 */
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  exitWithError,
  extractRegion,
  openImage,
  parseIntOption,
  validateOutputPrefix,
} from "./image_region/region_io.js";
import { DEFAULT_SLICE_STEP, planSlices } from "./image_region/region_plan.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");

function usageAndExit(): never {
  console.error(
    "使用方法: pnpm exec tsx src/yamap/slice_region.ts <入力画像パス> <出力プレフィックス> [--from <y>] [--to <y>] [--step <px>]",
  );
  console.error(
    '例: pnpm exec tsx src/yamap/slice_region.ts "tmp/report.png" "probe" --from 3950 --step 1400',
  );
  console.error("  --from: 開始y座標（任意）。省略時は画像の上端");
  console.error("  --to:   終了y座標（任意）。省略時は画像の下端");
  console.error(
    `  --step: 1枚あたりの高さ（任意）。省略時は ${DEFAULT_SLICE_STEP}px`,
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg, index) => {
    if (arg.startsWith("--")) return false;
    return !(index > 0 && args[index - 1].startsWith("--"));
  });
  const [inputArg, outputPrefix] = positional;

  if (!inputArg || !outputPrefix) usageAndExit();

  const prefixError = validateOutputPrefix(outputPrefix);
  if (prefixError) {
    exitWithError(prefixError);
  }

  let from: number | undefined;
  let to: number | undefined;
  let step: number | undefined;

  try {
    from = parseIntOption(args, "from");
    to = parseIntOption(args, "to");
    step = parseIntOption(args, "step");
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  const { inputPath, size } = await openImage(PROJECT_ROOT, inputArg);

  const plan = planSlices(size, { from, to, step });
  if (!plan.ok) {
    exitWithError(plan.error);
  }

  mkdirSync(TMP_DIR, { recursive: true });

  const slices: { outputPath: string; top: number; bottom: number }[] = [];

  for (const [index, rect] of plan.value.entries()) {
    const outputPath = path.join(
      TMP_DIR,
      `${outputPrefix}_${String(index + 1).padStart(2, "0")}.png`,
    );
    await extractRegion(inputPath, outputPath, rect);
    slices.push({
      outputPath,
      top: rect.top,
      bottom: rect.top + rect.height,
    });
  }

  console.log(
    JSON.stringify(
      {
        inputPath,
        imageSize: size,
        sliceCount: slices.length,
        slices,
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
