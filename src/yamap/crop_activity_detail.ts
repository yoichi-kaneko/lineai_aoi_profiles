/**
 * YAMAP 活動記録スクリーンショットから主要ブロックを OCR で解析し、4画像に切り出す CLI。
 *
 * 切り出し対象（YAMAP レポート画面フォーマット依存）:
 * - header: ページ最上部の実写ヘッダ画像（タイトル文字を含む帯）
 * - activity_data: 白背景の「活動データ」見出しから「チェックポイント」直前まで
 *   ※ヘッダ直下の赤背景ボタン「活動データ」は誤検知対象のため除外する
 * - checkpoints: 「チェックポイント」見出しから「活動詳細」直前まで
 * - activity_detail: 「活動詳細」見出しから写真一覧（または本文終端）直前まで
 */
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runOcr } from "./activity_crop/activity_crop_ocr.js";
import { cropAllSections } from "./activity_crop/activity_crop_sections.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");

function usageAndExit(): never {
  console.error(
    "使用方法: pnpm exec tsx src/yamap/crop_activity_detail.ts <入力画像パス> <出力プレフィックス> [--debug]",
  );
  console.error(
    '例: pnpm exec tsx src/yamap/crop_activity_detail.ts "tmp/yamap_screenshot.png" "yamap_20250716_001"',
  );
  console.error(
    "  --debug: 全ブロック成功時も診断情報（見出し候補と棄却理由）を出力する",
  );
  console.error(
    "           ※ 失敗ブロックがある場合は指定なしでも自動的に出力される",
  );
  process.exit(1);
}

function validateOutputPrefix(prefix: string): string | null {
  if (!prefix || prefix.trim() === "") {
    return "出力プレフィックスは必須です";
  }
  if (path.basename(prefix) !== prefix) {
    return "出力プレフィックスにはファイル名のみを指定してください（パス不可）";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(prefix)) {
    return "出力プレフィックスは英数字・ハイフン・アンダースコアのみ使用できます";
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const forceDebug = args.includes("--debug");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const [inputArg, outputPrefix] = positional;

  if (!inputArg || !outputPrefix) usageAndExit();

  const prefixError = validateOutputPrefix(outputPrefix);
  if (prefixError) {
    console.error(prefixError);
    process.exit(1);
  }

  const inputPath = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(PROJECT_ROOT, inputArg);

  if (!existsSync(inputPath)) {
    console.error(`入力画像が見つかりません: ${inputPath}`);
    process.exit(1);
  }

  mkdirSync(TMP_DIR, { recursive: true });

  console.error(`OCR実行中: ${inputPath}`);
  const ocr = await runOcr(inputPath);
  console.error(`検出行数: ${ocr.lines.length}`);

  const result = await cropAllSections(inputPath, TMP_DIR, outputPrefix, ocr);

  const failed = result.results.filter((item) => item.status === "FAILED");

  // 失敗ブロックがあるときは指定がなくても診断情報を出す（原因の切り分けと、
  // 予備フローでの座標決めに必要なため）。全ブロック成功時は --debug のときだけ付ける。
  const { debug, ...withoutDebug } = result;
  const output = forceDebug || failed.length > 0 ? result : withoutDebug;

  if (failed.length > 0) {
    console.error(`${failed.length}件のブロック切り出しに失敗しました:`);
    for (const item of failed) {
      console.error(`  ${item.section}: ${item.reason}`);
    }
    console.error("診断情報は出力JSONの debug フィールドを参照してください。");
  }

  // 全滅時も JSON を出してから終了する。失敗時ほど診断情報が要るため。
  console.log(JSON.stringify(output, null, 2));

  if (failed.length === result.results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    "エラーが発生しました:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
