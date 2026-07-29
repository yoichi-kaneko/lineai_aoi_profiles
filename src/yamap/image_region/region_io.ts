/** 座標指定クロップ／範囲スライス CLI の共通処理（引数解析・画像 I/O） */
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import type { ImageSize, Rect } from "./region_plan.js";

/** `--name 値` 形式のオプションを整数として取り出す。未指定なら undefined */
export function parseIntOption(
  args: string[],
  name: string,
): number | undefined {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;

  const raw = args[index + 1];
  if (raw === undefined || raw.startsWith("--")) {
    throw new Error(`--${name} に値が指定されていません`);
  }
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`--${name} は整数で指定してください: ${raw}`);
  }

  return Number(raw);
}

/**
 * `--` で始まる引数のうち、許可リスト外のものを拒否する。
 * 誤字（`--rigth` など）が黙って無視され既定値で動くのを防ぐ。
 */
export function assertKnownOptions(args: string[], allowed: string[]): void {
  const allowedSet = new Set(allowed.map((name) => `--${name}`));
  const unknown = args.filter(
    (arg) => arg.startsWith("--") && !allowedSet.has(arg),
  );
  if (unknown.length > 0) {
    throw new Error(`未知のオプションです: ${unknown.join(", ")}`);
  }
}

/** 入力画像のパスを解決し、存在とサイズを確認する */
export async function openImage(
  projectRoot: string,
  inputArg: string,
): Promise<{ inputPath: string; size: ImageSize }> {
  const inputPath = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(projectRoot, inputArg);

  if (!existsSync(inputPath)) {
    throw new Error(`入力画像が見つかりません: ${inputPath}`);
  }

  const meta = await sharp(inputPath).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`画像サイズを取得できませんでした: ${inputPath}`);
  }

  return { inputPath, size: { width: meta.width, height: meta.height } };
}

export async function extractRegion(
  inputPath: string,
  outputPath: string,
  rect: Rect,
): Promise<void> {
  await sharp(inputPath).extract(rect).toFile(outputPath);
}

/** 出力プレフィックスにパス区切りや記号が混ざっていないか検証する */
export function validateOutputPrefix(prefix: string): string | null {
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

/** エラーを表示して終了コード1で終わる */
export function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}
