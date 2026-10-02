import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  MAX_LATITUDE,
  MAX_LOCATIONS,
  resolveInputPath,
  resolveOutputPath,
} from "../image/plot_locations";
import { clusterPlaces } from "./cluster_places";
import {
  ADOPT_MARGIN,
  type SelectionMethod,
  type SelectionMetrics,
  chooseMethod,
  evaluateSelection,
} from "./evaluate_selection";
import {
  type CenterPoint,
  type CenterSource,
  NEAREST_RADIUS_KM,
  selectNearestPlaces,
} from "./nearest_places";
import {
  MAX_LONGITUDE,
  type ParsedEntries,
  type Place,
  type PlaceGroup,
  groupPlaces,
  parseEntriesJson,
} from "./places";

/** 描画する点の数の既定値。plot_locations が受け付ける上限に揃える */
export const DEFAULT_MAX_POINTS = MAX_LOCATIONS;

export type MethodOption = "auto" | SelectionMethod;
const METHOD_OPTIONS: readonly MethodOption[] = ["auto", "cluster", "nearest"];

/** 出力ファイルへ書く1点。lat / lng 以外は plot_locations が無視するため、そのまま描画に渡せる */
export interface SelectedPoint {
  lat: number;
  lng: number;
  /** 代表地点の placeId（入力にあった場合のみ） */
  placeId?: string;
  /** この点が代表する地点の数。1なら実地点そのもの、2以上なら周辺の地点をまとめた点 */
  places: number;
  /** この点が代表する地点への入力件数の合計（反復訪問を含む） */
  visits: number;
}

export interface ClusterReport extends SelectionMetrics {
  /** 他の点へまとめた地点の数 */
  merged: number;
}

export interface NearestReport extends SelectionMetrics {
  /** 中心の決め方（--center の指定か、自動判定か）。中心の座標そのものは要約に含めない */
  centerSource: CenterSource;
  radiusKm: number;
  outsideRadius: number;
  absorbed: number;
  cut: number;
}

/**
 * 標準出力へ返す要約。位置情報をログへ残さないため、座標・placeId は含めない。
 */
export interface SelectionSummary {
  method: SelectionMethod | "none";
  reason: string;
  pointCount: number;
  input: {
    /** 入力の件数 */
    entries: number;
    /** 座標の欠落・型違い・範囲外で除外した件数 */
    invalid: number;
    /** 同じ地点をまとめた後の地点数 */
    places: number;
  };
  cluster: ClusterReport | null;
  nearest: NearestReport | null;
}

export interface SelectionResult {
  points: SelectedPoint[];
  summary: SelectionSummary;
}

export interface SelectOptions {
  maxPoints: number;
  method: MethodOption;
  /** ② の中心に据える座標。省略時は地点の最も集まる実在の地点を自動で選ぶ */
  center?: CenterPoint;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundMetrics(metrics: SelectionMetrics): SelectionMetrics {
  return {
    pointCount: metrics.pointCount,
    represented: round(metrics.represented, 3),
    detail: round(metrics.detail, 3),
    legibility: round(metrics.legibility, 3),
    minSpacingPx: metrics.minSpacingPx === null ? null : round(metrics.minSpacingPx, 1),
    score: round(metrics.score, 3),
  };
}

/** 選んだ点を、代表地点の通し番号の順に出力形式へ変換する */
export function toSelectedPoints(places: Place[], groups: PlaceGroup[]): SelectedPoint[] {
  return [...groups]
    .sort((a, b) => a.representative - b.representative)
    .map((group) => {
      const representative = places[group.representative];
      return {
        lat: representative.lat,
        lng: representative.lng,
        ...(representative.placeId !== undefined ? { placeId: representative.placeId } : {}),
        places: group.members.length,
        visits: group.members.reduce((sum, member) => sum + places[member].visits, 0),
      };
    });
}

function describeChoice(
  option: MethodOption,
  method: SelectionMethod,
  cluster: SelectionMetrics,
  nearest: SelectionMetrics,
): string {
  if (option !== "auto") {
    // 自動判定の中心は実在の地点のため、0点になるのは --center で地点の無い場所を指定したときだけ
    return method === "nearest" && nearest.pointCount === 0
      ? `--method nearest の指定により採用しましたが、指定した中心から半径${NEAREST_RADIUS_KM}km以内に地点が無いため、描ける点はありません`
      : `--method ${option} の指定により採用しました`;
  }
  const scores = `集合化（③）${cluster.score.toFixed(3)}、中心近傍選択（②）${nearest.score.toFixed(3)}`;
  return method === "nearest"
    ? `評価値は${scores}で、②が③を${ADOPT_MARGIN}以上上回ったため②を採用しました`
    : `評価値は${scores}で、②が③を${ADOPT_MARGIN}以上上回らなかったため、第一候補の③を採用しました`;
}

/**
 * 検証済みの入力から描画する点を選ぶ。③ と ② の両方を計算して同じ物差しで評価し、
 * method が auto なら評価の良いほう（僅差なら ③）を、それ以外なら指定の方式を採用する。
 */
export function selectLocations(parsed: ParsedEntries, options: SelectOptions): SelectionResult {
  const places = groupPlaces(parsed.entries);
  const input = {
    entries: parsed.entries.length + parsed.invalidCount,
    invalid: parsed.invalidCount,
    places: places.length,
  };
  if (places.length === 0) {
    return {
      points: [],
      summary: {
        method: "none",
        reason: "描画できる地点がありません（入力が0件、または有効な座標がありません）",
        pointCount: 0,
        input,
        cluster: null,
        nearest: null,
      },
    };
  }

  const clusterGroups = clusterPlaces(places, options.maxPoints);
  const nearest = selectNearestPlaces(places, options.maxPoints, { center: options.center });
  const clusterMetrics = roundMetrics(
    evaluateSelection(places, clusterGroups, options.maxPoints),
  );
  const nearestMetrics = roundMetrics(
    evaluateSelection(places, nearest.groups, options.maxPoints),
  );

  // 丸めた値で比べ、要約に出した評価値と採否の判断を食い違わせない
  const method =
    options.method === "auto" ? chooseMethod(clusterMetrics, nearestMetrics) : options.method;
  const groups = method === "cluster" ? clusterGroups : nearest.groups;

  return {
    points: toSelectedPoints(places, groups),
    summary: {
      method,
      reason: describeChoice(options.method, method, clusterMetrics, nearestMetrics),
      pointCount: groups.length,
      input,
      cluster: { ...clusterMetrics, merged: places.length - clusterGroups.length },
      nearest: {
        ...nearestMetrics,
        centerSource: nearest.centerSource,
        radiusKm: NEAREST_RADIUS_KM,
        outsideRadius: nearest.outsideRadius,
        absorbed: nearest.absorbed,
        cut: nearest.cut,
      },
    },
  };
}

export interface ParsedArgs extends SelectOptions {
  inputPath: string;
  outputPath: string;
}

const OPTION_NAMES = ["--method", "--max-points", "--center"] as const;
/** 符号付きの10進数（指数表記・16進数・空文字は受け付けない） */
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * --center の値（`緯度,経度`）を解釈する。位置情報をログへ残さないため、エラー文に値は含めない。
 */
export function parseCenter(value: string): CenterPoint {
  const message = `--center は「緯度,経度」の形式で、緯度は ±${MAX_LATITUDE}°、経度は ±${MAX_LONGITUDE}° の範囲の10進数で指定してください`;
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || !parts.every((part) => DECIMAL_PATTERN.test(part))) {
    throw new Error(message);
  }
  const [lat, lng] = parts.map(Number);
  if (Math.abs(lat) > MAX_LATITUDE || Math.abs(lng) > MAX_LONGITUDE) {
    throw new Error(message);
  }
  return { lat, lng };
}

/**
 * コマンドライン引数を解釈する。
 * 位置引数は入力 JSON と出力 JSON の2つ。オプションは --method、--max-points、--center
 * （`--name value` と `--name=value` のどちらでも指定できる）。
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let method: MethodOption = "auto";
  let maxPoints = DEFAULT_MAX_POINTS;
  let center: CenterPoint | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (!(OPTION_NAMES as readonly string[]).includes(name)) {
      // `--centre=緯度,経度` のような誤記でも値（座標）をログへ出さない
      throw new Error(`不明なオプションです: ${name}`);
    }
    let value: string | undefined;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      value = argv[i + 1];
      i++;
    }
    if (value === undefined || value === "") {
      throw new Error(`${name} の値を指定してください`);
    }

    if (name === "--method") {
      if (!(METHOD_OPTIONS as readonly string[]).includes(value)) {
        throw new Error(`--method は ${METHOD_OPTIONS.join(" / ")} のいずれかを指定してください`);
      }
      method = value as MethodOption;
    } else if (name === "--center") {
      center = parseCenter(value);
    } else {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_LOCATIONS) {
        throw new Error(`--max-points は 1〜${MAX_LOCATIONS} の整数で指定してください`);
      }
      maxPoints = Number(value);
    }
  }

  if (positional.length < 2) {
    throw new Error("入力 JSON ファイルのパスと出力 JSON ファイルのパスを指定してください");
  }
  if (positional.length > 2) {
    throw new Error(`引数が多すぎます: ${positional.slice(2).join(" ")}`);
  }
  const [inputPath, outputPath] = positional;
  if (path.extname(outputPath).toLowerCase() !== ".json") {
    throw new Error(`出力ファイルは .json で指定してください: ${outputPath}`);
  }
  return { inputPath, outputPath, method, maxPoints, ...(center ? { center } : {}) };
}

/** 入力 JSON を読み込んで描画する点を選び、出力 JSON を保存して要約を返す */
export function runSelectLocations(args: ParsedArgs): SelectionSummary & { outputPath: string } {
  const inputFile = resolveInputPath(args.inputPath);
  const parsed = parseEntriesJson(readFileSync(inputFile, "utf-8"));
  const result = selectLocations(parsed, args);
  const outputFile = resolveOutputPath(args.outputPath);
  writeFileSync(outputFile, `${JSON.stringify(result.points, null, 2)}\n`);
  return { ...result.summary, outputPath: outputFile };
}

const isDirectRun =
  !!process.argv[1] && process.argv[1].endsWith("select_locations.ts");

function main() {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      "使用方法: pnpm exec tsx src/geo/select_locations.ts <入力JSONパス> <出力JSONパス（tmp/ 配下）> [--method auto|cluster|nearest] [--max-points 1-12] [--center 緯度,経度]",
    );
    console.error(
      '例: pnpm exec tsx src/geo/select_locations.ts "tmp/select_locations_input.json" "tmp/plot_locations.json"',
    );
    process.exit(1);
  }

  const summary = runSelectLocations(parsed);
  console.log(JSON.stringify(summary, null, 2));
}

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(
      "エラーが発生しました:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}
