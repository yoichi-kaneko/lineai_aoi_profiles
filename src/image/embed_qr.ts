import { resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, realpathSync } from "fs";
import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");

/** QR コード本体の一辺（px）。既定値は 1536x1024 のレポート画像を前提に決めている */
const DEFAULT_QR_SIZE = 190;
/** QR 本体の指定として受け付ける範囲（px） */
const MIN_QR_SIZE = 120;
const MAX_QR_SIZE = 400;
/** カード内の余白（px）。QR PNG（クワイエットゾーン込み）の外側の見た目用 */
const CARD_PADDING = 14;
/** カードの角丸半径・枠線の太さ（px） */
const CARD_RADIUS = 18;
const CARD_STROKE = 3;
/** カード・QR の配色（レポート画像の水色基調に合わせる） */
const CARD_FILL = "#ffffff";
const CARD_FILL_OPACITY = 0.96;
const CARD_STROKE_COLOR = "#6fb7e0";
const QR_DARK = "#123a5aff";
const QR_LIGHT = "#ffffffff";
/** 誤り訂正レベル。表示時の縮小・SNS 側の再圧縮に耐えるよう高めに取る */
const QR_ERROR_CORRECTION_LEVEL = "Q" as const;

/** 画像の端からカードまでの余白（画像幅に対する比） */
const OUTER_MARGIN_RATIO = 28 / 1536;
/**
 * 代表写真フレームの右下（report_template.png のレイアウト基準・画像サイズに対する比）。
 * テンプレートの写真エリアは概ね右端 x=810 / 下端 y=690（1536x1024 換算）。
 */
const PHOTO_FRAME_RIGHT_RATIO = 810 / 1536;
const PHOTO_FRAME_BOTTOM_RATIO = 690 / 1024;
const PHOTO_FRAME_INSET_RATIO = 18 / 1536;

export const ANCHORS = [
  "bottom-right",
  "bottom-left",
  "photo-bottom-right",
] as const;
export type Anchor = (typeof ANCHORS)[number];
const DEFAULT_ANCHOR: Anchor = "bottom-right";

export interface BaseImageSize {
  width: number;
  height: number;
}

export interface OverlayPosition {
  left: number;
  top: number;
}

export interface EmbedQrOptions {
  basePath: string;
  url: string;
  anchor: Anchor;
  qrSize: number;
}

function isAnchor(value: string): value is Anchor {
  return (ANCHORS as readonly string[]).includes(value);
}

/** カード全体の一辺（QR 本体＋左右／上下の余白） */
export function cardSizeFor(qrSize: number): number {
  return qrSize + CARD_PADDING * 2;
}

/**
 * アンカー名とベース画像の寸法から、カードを貼る左上座標を求める。
 * 生成画像のサイズは `src/openai/generate_image.ts` が 1536x1024 に固定しているため
 * 実質固定値だが、寸法が変わっても崩れないよう比率で算出する。
 */
export function resolveAnchorPosition(
  anchor: Anchor,
  cardSize: number,
  base: BaseImageSize,
): OverlayPosition {
  const margin = Math.round(base.width * OUTER_MARGIN_RATIO);

  switch (anchor) {
    case "bottom-right":
      return {
        left: base.width - margin - cardSize,
        top: base.height - margin - cardSize,
      };
    case "bottom-left":
      return {
        left: margin,
        top: base.height - margin - cardSize,
      };
    case "photo-bottom-right": {
      const inset = Math.round(base.width * PHOTO_FRAME_INSET_RATIO);
      return {
        left: Math.round(base.width * PHOTO_FRAME_RIGHT_RATIO) - inset - cardSize,
        top: Math.round(base.height * PHOTO_FRAME_BOTTOM_RATIO) - inset - cardSize,
      };
    }
  }
}

/** カードがベース画像の内側に収まっているかを確認する */
export function assertPositionInsideBase(
  position: OverlayPosition,
  cardSize: number,
  base: BaseImageSize,
): void {
  if (
    position.left < 0 ||
    position.top < 0 ||
    position.left + cardSize > base.width ||
    position.top + cardSize > base.height
  ) {
    throw new Error(
      `QRコードのカードがベース画像からはみ出します（カード ${cardSize}px / ベース ${base.width}x${base.height}）。--size を小さくしてください`,
    );
  }
}

/** QR コード化する URL を検証する（http/https のみ受け付ける） */
export function assertEmbeddableUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL として解釈できません: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`http/https の URL を指定してください: ${url}`);
  }
  return parsed.toString();
}

export interface ParsedArgs {
  basePath: string;
  url: string;
  anchor: Anchor;
  qrSize: number;
}

/** コマンドライン引数を解釈する（位置引数2つ＋任意のオプション） */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let anchor: Anchor = DEFAULT_ANCHOR;
  let qrSize = DEFAULT_QR_SIZE;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--anchor") {
      const value = argv[++i];
      if (!value || !isAnchor(value)) {
        throw new Error(
          `--anchor には次のいずれかを指定してください: ${ANCHORS.join(" / ")}`,
        );
      }
      anchor = value;
      continue;
    }
    if (arg === "--size") {
      const value = argv[++i];
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < MIN_QR_SIZE || parsed > MAX_QR_SIZE) {
        throw new Error(
          `--size には ${MIN_QR_SIZE}〜${MAX_QR_SIZE} の整数を指定してください: ${value}`,
        );
      }
      qrSize = parsed;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`不明なオプションです: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length < 2) {
    throw new Error("ベース画像のパスと URL を指定してください");
  }
  if (positional.length > 2) {
    throw new Error(`引数が多すぎます: ${positional.slice(2).join(" ")}`);
  }

  return {
    basePath: positional[0],
    url: assertEmbeddableUrl(positional[1]),
    anchor,
    qrSize,
  };
}

/**
 * ベース画像のパスを解決する。プロジェクトルート外への参照
 * （絶対パスや `../` による脱出、シンボリックリンク経由の脱出）は拒否する。
 */
export function resolveBaseImagePath(basePath: string): string {
  const resolvedPath = resolve(PROJECT_ROOT, basePath);
  if (!resolvedPath.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(
      `ベース画像はプロジェクトルート内のパスを指定してください: ${basePath}`,
    );
  }
  if (!existsSync(resolvedPath)) {
    throw new Error(`ベース画像が存在しません: ${basePath}`);
  }

  const realPath = realpathSync(resolvedPath);
  if (!realPath.startsWith(realpathSync(PROJECT_ROOT) + path.sep)) {
    throw new Error(
      `ベース画像はプロジェクトルート内のパスを指定してください: ${basePath}`,
    );
  }
  return realPath;
}

/** QR コードを白い角丸カードに載せた PNG を作る */
async function renderQrCard(url: string, qrSize: number): Promise<Buffer> {
  const qrPng = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    // 規格どおり4モジュール分のクワイエットゾーンを QR PNG 内に含める
    margin: 4,
    width: qrSize,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });

  const cardSize = cardSizeFor(qrSize);
  const half = CARD_STROKE / 2;
  const svg = `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${half}" y="${half}" width="${cardSize - CARD_STROKE}" height="${cardSize - CARD_STROKE}" rx="${CARD_RADIUS}" ry="${CARD_RADIUS}" fill="${CARD_FILL}" fill-opacity="${CARD_FILL_OPACITY}" stroke="${CARD_STROKE_COLOR}" stroke-width="${CARD_STROKE}"/>
</svg>`;

  const card = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(card)
    .composite([{ input: qrPng, top: CARD_PADDING, left: CARD_PADDING }])
    .png()
    .toBuffer();
}

export interface EmbedQrResult {
  savedPath: string;
  base: BaseImageSize;
  cardSize: number;
  position: OverlayPosition;
}

/** ベース画像に QR コードカードを重ね、tmp/ 配下へ保存する */
export async function embedQrCode(options: EmbedQrOptions): Promise<EmbedQrResult> {
  const baseFullPath = resolveBaseImagePath(options.basePath);
  const metadata = await sharp(baseFullPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`ベース画像の寸法を取得できませんでした: ${options.basePath}`);
  }
  const base: BaseImageSize = { width: metadata.width, height: metadata.height };

  const cardSize = cardSizeFor(options.qrSize);
  const position = resolveAnchorPosition(options.anchor, cardSize, base);
  assertPositionInsideBase(position, cardSize, base);

  const card = await renderQrCard(options.url, options.qrSize);

  const tmpDir = resolve(PROJECT_ROOT, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const savedPath = path.join(tmpDir, `qr_embedded_${Date.now()}.png`);

  await sharp(baseFullPath)
    .composite([{ input: card, left: position.left, top: position.top }])
    .png()
    .toFile(savedPath);

  return { savedPath, base, cardSize, position };
}

const isDirectRun = !!process.argv[1] && process.argv[1].endsWith("embed_qr.ts");

async function main() {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      "使用方法: pnpm exec tsx src/image/embed_qr.ts <ベース画像パス> <URL> [--anchor bottom-right|bottom-left|photo-bottom-right] [--size 190]",
    );
    console.error(
      '例: pnpm exec tsx src/image/embed_qr.ts "tmp/gpt_image_123.png" "https://yamap.com/activities/45591468"',
    );
    process.exit(1);
  }

  const result = await embedQrCode(parsed);

  console.log(
    JSON.stringify(
      {
        basePath: parsed.basePath,
        url: parsed.url,
        anchor: parsed.anchor,
        qrSize: parsed.qrSize,
        cardSize: result.cardSize,
        baseSize: `${result.base.width}x${result.base.height}`,
        position: result.position,
        savedPath: result.savedPath,
      },
      null,
      2,
    ),
  );
}

if (isDirectRun) {
  main().catch((error) => {
    console.error(
      "エラーが発生しました:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
