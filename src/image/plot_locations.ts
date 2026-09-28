import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");

/** 出力画像の一辺（px） */
export const CANVAS_SIZE = 640;
/** 画像の端から点の中心までの余白（px）。点の半径より大きく取る */
export const PADDING = 48;
/** 白点の半径（px）。縮尺によらず固定する */
export const DOT_RADIUS = 4;
/**
 * 投影面での最小表示範囲（m）。全点が同一座標のときのゼロ除算と、
 * 近接点しかないときの過剰な拡大を防ぐ調整値で、地表距離 1km を保証するものではない
 */
export const MIN_PROJECTED_SPAN = 1000;
/** 受け付ける地点数の上限 */
export const MAX_LOCATIONS = 12;
/** 配色（黒背景・白点） */
const BACKGROUND_COLOR = "#000000";
const DOT_COLOR = "#ffffff";

/** Webメルカトルの地球半径（m） */
const EARTH_RADIUS = 6378137;
/** Webメルカトルで扱える緯度の上限（度）。範囲外の位置を黙って補正しない */
export const MAX_LATITUDE = 85.05112878;
const MAX_LONGITUDE = 180;
/** 日付変更線をまたぐ入力は対象外。経度の最大値−最小値がこれを超えたらエラーにする */
const MAX_LONGITUDE_SPAN = 180;

export interface Location {
  lat: number;
  lng: number;
}

/** Webメルカトルの投影面上の座標（m） */
export interface ProjectedPoint {
  x: number;
  y: number;
}

/** 画像上の座標（px、左上原点・Y 軸は下向き） */
export interface PixelPoint {
  x: number;
  y: number;
}

export interface Fit {
  centerX: number;
  centerY: number;
  /** 投影面 1m あたりのピクセル数。縦横で共通 */
  scale: number;
}

/**
 * 1件分の緯度・経度を取り出す。
 * エラー文には実座標を含めない（位置情報をログへ残さないため、何件目か・どの項目かだけを示す）。
 */
function readCoordinate(
  item: Record<string, unknown>,
  key: keyof Location,
  index: number,
): number {
  const label = `${index + 1}件目の ${key}`;
  if (!(key in item)) {
    throw new Error(`${label} がありません`);
  }
  const value = item[key];
  if (typeof value !== "number") {
    throw new Error(`${label} が数値ではありません`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${label} が有限の数値ではありません`);
  }
  return value;
}

/** 入力を検証し、{ lat, lng } の配列として返す（その他のプロパティは捨てる） */
export function validateLocations(value: unknown): Location[] {
  if (!Array.isArray(value)) {
    throw new Error("入力は { lat, lng } の配列にしてください");
  }
  if (value.length === 0) {
    throw new Error("地点が1件もありません");
  }
  if (value.length > MAX_LOCATIONS) {
    throw new Error(`地点は最大${MAX_LOCATIONS}件までです（${value.length}件）`);
  }

  const locations = value.map((item, index): Location => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${index + 1}件目が { lat, lng } の形式ではありません`);
    }
    const record = item as Record<string, unknown>;
    const lat = readCoordinate(record, "lat", index);
    const lng = readCoordinate(record, "lng", index);
    if (Math.abs(lng) > MAX_LONGITUDE) {
      throw new Error(
        `${index + 1}件目の lng が -${MAX_LONGITUDE}〜${MAX_LONGITUDE} の範囲外です`,
      );
    }
    if (Math.abs(lat) > MAX_LATITUDE) {
      throw new Error(
        `${index + 1}件目の lat が Webメルカトルで扱える範囲（±${MAX_LATITUDE}）の外です`,
      );
    }
    return { lat, lng };
  });

  const lngs = locations.map((location) => location.lng);
  if (Math.max(...lngs) - Math.min(...lngs) > MAX_LONGITUDE_SPAN) {
    throw new Error(
      `経度の幅が${MAX_LONGITUDE_SPAN}度を超えています。日付変更線をまたぐ入力には対応していません`,
    );
  }

  return locations;
}

/** 入力ファイルの中身を JSON として解釈し、検証済みの地点配列を返す */
export function parseLocationsJson(text: string): Location[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON.parse のエラー文は入力の断片（座標）を含むため、そのまま出さない
    throw new Error("入力ファイルを JSON として解釈できません");
  }
  return validateLocations(parsed);
}

/** 緯度経度を Webメルカトルの投影面（m）へ変換する */
export function projectWebMercator(location: Location): ProjectedPoint {
  const lambda = (location.lng * Math.PI) / 180;
  const phi = (location.lat * Math.PI) / 180;
  return {
    x: EARTH_RADIUS * lambda,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  };
}

/**
 * 全点を囲む長方形の中心と、余白の内側へ収める共通の倍率を求める。
 * 縦横に同じ倍率を使うため、投影後の点の配置（縦横比）が保たれる。
 */
export function computeFit(points: ProjectedPoint[]): Fit {
  if (points.length === 0) {
    throw new Error("地点が1件もありません");
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const usableSize = CANVAS_SIZE - 2 * PADDING;
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: usableSize / Math.max(maxX - minX, maxY - minY, MIN_PROJECTED_SPAN),
  };
}

/** 投影面の座標を画像上の座標へ変換する。画像の Y 軸は下向きのため符号を反転し、北を上にする */
export function toPixel(point: ProjectedPoint, fit: Fit): PixelPoint {
  const half = CANVAS_SIZE / 2;
  return {
    x: half + (point.x - fit.centerX) * fit.scale,
    y: half - (point.y - fit.centerY) * fit.scale,
  };
}

/** 地点ごとの画像上の座標を求める（入力順を保つ。中間値は丸めない） */
export function layoutLocations(locations: Location[]): PixelPoint[] {
  const projected = locations.map(projectWebMercator);
  const fit = computeFit(projected);
  return projected.map((point) => toPixel(point, fit));
}

/** 黒背景に白い点を置いた SVG を組み立てる。同じ座標の点はそのまま重ねる */
export function buildPlotSvg(pixels: PixelPoint[]): string {
  const dots = pixels
    .map(
      (pixel) =>
        `  <circle cx="${pixel.x}" cy="${pixel.y}" r="${DOT_RADIUS}" fill="${DOT_COLOR}"/>`,
    )
    .join("\n");
  return `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="${BACKGROUND_COLOR}"/>
${dots}
</svg>`;
}

/** 地点の配列から点描画の PNG を生成して返す（ファイルへは書かない） */
export async function renderLocationPlot(locations: Location[]): Promise<Buffer> {
  const svg = buildPlotSvg(layoutLocations(locations));
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface ParsedArgs {
  inputPath: string;
  outputPath: string;
}

/** コマンドライン引数を解釈する（入力 JSON と出力 PNG の位置引数2つ） */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      throw new Error(`不明なオプションです: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional.length < 2) {
    throw new Error("入力 JSON ファイルのパスと出力 PNG ファイルのパスを指定してください");
  }
  if (positional.length > 2) {
    throw new Error(`引数が多すぎます: ${positional.slice(2).join(" ")}`);
  }

  const [inputPath, outputPath] = positional;
  if (path.extname(outputPath).toLowerCase() !== ".png") {
    throw new Error(`出力ファイルは .png で指定してください: ${outputPath}`);
  }
  return { inputPath, outputPath };
}

function isPathInside(parent: string, child: string): boolean {
  return child.startsWith(parent + path.sep);
}

function isSameOrInside(parent: string, child: string): boolean {
  return child === parent || isPathInside(parent, child);
}

/** 存在する最も近い祖先ディレクトリの実体パスを返す */
function realpathOfNearestExisting(target: string): string {
  let current = target;
  while (!existsSync(current)) {
    current = path.dirname(current);
  }
  return realpathSync(current);
}

/**
 * 入力 JSON のパスを解決する。プロジェクトルート外への参照
 * （絶対パスや `../` による脱出、シンボリックリンク経由の脱出）は拒否する。
 */
export function resolveInputPath(inputPath: string, root: string = PROJECT_ROOT): string {
  const message = `入力ファイルはプロジェクトルート内のパスを指定してください: ${inputPath}`;
  const resolvedPath = resolve(root, inputPath);
  if (!isPathInside(root, resolvedPath)) {
    throw new Error(message);
  }
  if (!existsSync(resolvedPath)) {
    throw new Error(`入力ファイルが存在しません: ${inputPath}`);
  }
  const realPath = realpathSync(resolvedPath);
  if (!isPathInside(realpathSync(root), realPath)) {
    throw new Error(message);
  }
  return realPath;
}

/**
 * 出力 PNG のパスを解決する。書き込み先はプロジェクトの tmp/ 配下に限り、
 * 保存先ディレクトリが無ければ作る。シンボリックリンク経由で tmp/ の外へ書く指定は、
 * ディレクトリを作る前に拒否する。
 */
export function resolveOutputPath(outputPath: string, root: string = PROJECT_ROOT): string {
  const message = `出力ファイルはプロジェクトの tmp/ 配下のパスを指定してください: ${outputPath}`;
  const tmpDir = resolve(root, "tmp");
  const resolvedPath = resolve(root, outputPath);
  if (!isPathInside(tmpDir, resolvedPath)) {
    throw new Error(message);
  }

  mkdirSync(tmpDir, { recursive: true });
  const realTmpDir = realpathSync(tmpDir);
  const parentDir = path.dirname(resolvedPath);
  if (!isSameOrInside(realTmpDir, realpathOfNearestExisting(parentDir))) {
    throw new Error(message);
  }
  mkdirSync(parentDir, { recursive: true });

  const outputFile = path.join(realpathSync(parentDir), path.basename(resolvedPath));
  if (existsSync(outputFile) && !isPathInside(realTmpDir, realpathSync(outputFile))) {
    throw new Error(message);
  }
  return outputFile;
}

/** 入力 JSON を読み込んで点描画の PNG を保存し、保存先のパスを返す */
export async function plotLocations(args: ParsedArgs): Promise<string> {
  const inputFile = resolveInputPath(args.inputPath);
  const locations = parseLocationsJson(readFileSync(inputFile, "utf-8"));
  const png = await renderLocationPlot(locations);
  const outputFile = resolveOutputPath(args.outputPath);
  writeFileSync(outputFile, png);
  return outputFile;
}

const isDirectRun =
  !!process.argv[1] && process.argv[1].endsWith("plot_locations.ts");

async function main() {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      "使用方法: pnpm exec tsx src/image/plot_locations.ts <入力JSONパス> <出力PNGパス（tmp/ 配下）>",
    );
    console.error(
      '例: pnpm exec tsx src/image/plot_locations.ts "tmp/plot_locations.json" "tmp/location_plot.png"',
    );
    process.exit(1);
  }

  const savedPath = await plotLocations(parsed);
  console.log(savedPath);
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
