/**
 * 画像を座標指定で1枚切り出す CLI（予備フロー・モードB）。
 *
 * crop_yamap_report の自動検出が失敗したとき、切り出し位置が分かっている前提で使う。
 * 位置がまだ分からない場合は先に slice_region.ts で範囲を探す。
 */
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  exitWithError,
  extractRegion,
  openImage,
  parseIntOption,
} from "./image_region/region_io.js";
import { resolveCropRect } from "./image_region/region_plan.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

function usageAndExit(): never {
  console.error(
    "使用方法: pnpm exec tsx src/yamap/crop_region.ts <入力画像パス> <出力パス> --top <y> --bottom <y> [--left <x>] [--right <x>]",
  );
  console.error(
    '例: pnpm exec tsx src/yamap/crop_region.ts "tmp/report.png" "tmp/detail.png" --top 3950 --bottom 6282',
  );
  console.error("  --top / --bottom: 切り出す縦範囲（必須・元画像座標）");
  console.error("  --left / --right: 切り出す横範囲（任意）。省略時は画像の全幅");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg, index) => {
    if (arg.startsWith("--")) return false;
    // オプションの値（直前が --xxx）は位置引数から除く
    return !(index > 0 && args[index - 1].startsWith("--"));
  });
  const [inputArg, outputArg] = positional;

  if (!inputArg || !outputArg) usageAndExit();

  let top: number | undefined;
  let bottom: number | undefined;
  let left: number | undefined;
  let right: number | undefined;

  try {
    top = parseIntOption(args, "top");
    bottom = parseIntOption(args, "bottom");
    left = parseIntOption(args, "left");
    right = parseIntOption(args, "right");
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  if (top === undefined || bottom === undefined) {
    console.error("--top と --bottom は必須です");
    usageAndExit();
  }

  const { inputPath, size } = await openImage(PROJECT_ROOT, inputArg);

  const plan = resolveCropRect(size, { top, bottom, left, right });
  if (!plan.ok) {
    exitWithError(plan.error);
  }

  const outputPath = path.isAbsolute(outputArg)
    ? outputArg
    : path.resolve(PROJECT_ROOT, outputArg);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  await extractRegion(inputPath, outputPath, plan.value);

  console.log(
    JSON.stringify(
      {
        inputPath,
        imageSize: size,
        outputPath,
        crop: plan.value,
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
