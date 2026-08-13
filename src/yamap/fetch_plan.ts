import * as cheerio from "cheerio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  difficultyLabel,
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  isFiniteNumber,
  isPlainObject,
  paceLabel,
  requireFiniteNumberOrNull,
  resolveTimezone,
} from "./format";

// YAMAPの計画ページは Next.js 製で、計画データは SSR 時に埋め込まれる
// `#__NEXT_DATA__`（JSON）から取得する。DOMのクラス名はハッシュ化されており
// マークアップ変更で容易に壊れるため、スクレイピングではなくJSONを正とする。
//
// 埋め込みJSONは素のHTTP GETで返るため、ブラウザによるレンダリングは不要
// （活動記録を取得する fetch_activity.ts と同じ方式）。

type YamapLandmark = {
  name?: string | null;
};

export type YamapCheckpoint = {
  arrivalDayNumber?: number | null;
  arrivalTimeInSeconds?: number | null;
  stayType?: string | null;
  distance?: number | null;
  cumulativeUp?: number | null;
  cumulativeDown?: number | null;
  name?: string | null;
  landmark?: YamapLandmark | null;
};

export type YamapPlan = {
  title?: string | null;
  description?: string | null;
  startAt?: number | null;
  finishAt?: number | null;
  memberCount?: number | null;
  courseConstant?: number | null;
  paceMultiplier?: number | null;
  user?: { name?: string | null } | null;
  maps?: { name?: string | null }[] | null;
  checkpoints?: YamapCheckpoint[] | null;
};

// URLの正規化処理
// 受け付けるフォーマット:
//   - https://yamap.com/plans/code/{CODE}
//   - https://yamap.com/plans/code/{CODE}/printing -> 末尾の /printing を除去して使用
// それ以外のURLはエラーとして扱う
function normalizeYamapUrl(url: string): string {
  const exactPattern = /^https:\/\/yamap\.com\/plans\/code\/[^/]+$/;
  const printingPattern = /^https:\/\/yamap\.com\/plans\/code\/[^/]+(\/printing)$/;

  if (exactPattern.test(url)) {
    return url;
  }

  const printingMatch = url.match(printingPattern);
  if (printingMatch) {
    // 末尾の /printing を除去
    return url.slice(0, url.length - printingMatch[1].length);
  }

  throw new Error(
    `URLのフォーマットが正しくありません。\n` +
    `受け付けるフォーマット:\n` +
    `  - https://yamap.com/plans/code/{CODE}\n` +
    `  - https://yamap.com/plans/code/{CODE}/printing\n` +
    `指定されたURL: ${url}`,
  );
}

// #__NEXT_DATA__ から計画データとタイムゾーン（時間単位）を取り出す
// JSON.parse 成功だけでは型が保証されないため、ルート・plan・timezone・checkpoints を実行時に検証する
export function extractPageData(html: string): { plan: YamapPlan; timezone: number } {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").first().html();
  if (!raw) {
    throw new Error("計画データ（__NEXT_DATA__）が見つかりませんでした。YAMAP側のページ構成が変更された可能性があります。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("計画データ（__NEXT_DATA__）のJSON解析に失敗しました。");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("計画データ（__NEXT_DATA__）の形式が不正です。");
  }

  const pageProps =
    isPlainObject(parsed.props) && isPlainObject(parsed.props.pageProps)
      ? parsed.props.pageProps
      : undefined;

  const planRaw = pageProps?.plan;
  if (!isPlainObject(planRaw)) {
    throw new Error("計画データが含まれていませんでした。非公開の計画、または削除された計画の可能性があります。");
  }

  if (planRaw.checkpoints != null && !Array.isArray(planRaw.checkpoints)) {
    throw new Error("計画データのチェックポイント形式が不正です。");
  }

  const checkpoints = Array.isArray(planRaw.checkpoints)
    ? planRaw.checkpoints.map((checkpoint, index) =>
        parsePlanCheckpoint(checkpoint, `checkpoints[${index}]`),
      )
    : [];

  const plan: YamapPlan = {
    title: asOptionalString(planRaw.title),
    description: asOptionalString(planRaw.description),
    startAt: requireFiniteNumberOrNull(planRaw.startAt, "計画データのstartAt"),
    finishAt: requireFiniteNumberOrNull(planRaw.finishAt, "計画データのfinishAt"),
    memberCount: requireFiniteNumberOrNull(planRaw.memberCount, "計画データのmemberCount"),
    courseConstant: requireFiniteNumberOrNull(planRaw.courseConstant, "計画データのcourseConstant"),
    paceMultiplier: requireFiniteNumberOrNull(planRaw.paceMultiplier, "計画データのpaceMultiplier"),
    user: parseNamedObject(planRaw.user, "user"),
    maps: parseNamedObjectList(planRaw.maps, "maps"),
    checkpoints,
  };

  return { plan, timezone: resolveTimezone(pageProps?.timezone) };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value == null) return value as null | undefined;
  return typeof value === "string" ? value : null;
}

function parseNamedObject(
  value: unknown,
  label: string,
): { name?: string | null } | null | undefined {
  if (value == null) return value as null | undefined;
  if (!isPlainObject(value)) {
    throw new Error(`計画データの${label}の形式が不正です。`);
  }
  return { name: asOptionalString(value.name) };
}

function parseNamedObjectList(
  value: unknown,
  label: string,
): { name?: string | null }[] | null | undefined {
  if (value == null) return value as null | undefined;
  if (!Array.isArray(value)) {
    throw new Error(`計画データの${label}の形式が不正です。`);
  }
  return value.map((entry, index) => {
    const parsed = parseNamedObject(entry, `${label}[${index}]`);
    return parsed ?? { name: null };
  });
}

function parsePlanCheckpoint(value: unknown, label: string): YamapCheckpoint {
  if (!isPlainObject(value)) {
    throw new Error(`計画データの${label}の形式が不正です。`);
  }
  const landmarkRaw = value.landmark;
  let landmark: YamapLandmark | null | undefined;
  if (landmarkRaw == null) {
    landmark = landmarkRaw as null | undefined;
  } else if (!isPlainObject(landmarkRaw)) {
    throw new Error(`計画データの${label}.landmarkの形式が不正です。`);
  } else {
    landmark = { name: asOptionalString(landmarkRaw.name) };
  }
  return {
    arrivalDayNumber: requireFiniteNumberOrNull(
      value.arrivalDayNumber,
      `計画データの${label}.arrivalDayNumber`,
    ),
    arrivalTimeInSeconds: requireFiniteNumberOrNull(
      value.arrivalTimeInSeconds,
      `計画データの${label}.arrivalTimeInSeconds`,
    ),
    stayType: asOptionalString(value.stayType),
    distance: requireFiniteNumberOrNull(value.distance, `計画データの${label}.distance`),
    cumulativeUp: requireFiniteNumberOrNull(value.cumulativeUp, `計画データの${label}.cumulativeUp`),
    cumulativeDown: requireFiniteNumberOrNull(
      value.cumulativeDown,
      `計画データの${label}.cumulativeDown`,
    ),
    name: asOptionalString(value.name),
    landmark,
  };
}

// 日内の経過秒を「HH:MM」形式に整形する（日をまたぐ場合は24時間で丸める）
function formatClock(secondsOfDay: number): string {
  const normalized = ((secondsOfDay % 86400) + 86400) % 86400;
  const hours = String(Math.floor(normalized / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((normalized % 3600) / 60)).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// チェックポイントの表示名を求める
function checkpointName(checkpoint: YamapCheckpoint): string {
  return checkpoint.landmark?.name?.trim() || checkpoint.name?.trim() || "地点名不明";
}

// チェックポイントを arrivalDayNumber ごとにまとめる
function groupByDay(checkpoints: YamapCheckpoint[]): Map<number, YamapCheckpoint[]> {
  const days = new Map<number, YamapCheckpoint[]>();
  for (const checkpoint of checkpoints) {
    const day = checkpoint.arrivalDayNumber ?? 1;
    const bucket = days.get(day);
    if (bucket) {
      bucket.push(checkpoint);
    } else {
      days.set(day, [checkpoint]);
    }
  }
  return new Map([...days.entries()].sort((a, b) => a[0] - b[0]));
}

// 区間の所要時間（分）を求める
// checkpoints の arrivalTimeInSeconds はペース倍率100%の素の値なので、
// 計画のペース倍率で割って区間ごとに分単位へ丸める（YAMAPの表示と一致する計算）
function segmentMinutes(baseSeconds: number, paceMultiplier: number): number {
  const rate = paceMultiplier > 0 ? paceMultiplier / 100 : 1;
  return Math.round(baseSeconds / rate / 60);
}

function sumBy(checkpoints: YamapCheckpoint[], key: "distance" | "cumulativeUp" | "cumulativeDown"): number {
  return checkpoints.reduce((total, checkpoint) => {
    const value = checkpoint[key];
    return total + (isFiniteNumber(value) ? value : 0);
  }, 0);
}

function buildReport(plan: YamapPlan, timezone: number): string {
  const checkpoints = plan.checkpoints ?? [];
  const paceMultiplier = isFiniteNumber(plan.paceMultiplier) ? plan.paceMultiplier : 100;
  const lines: string[] = [];

  // 概要
  lines.push("概要");
  lines.push(`計画タイトル: ${plan.title?.trim() || "-"}`);
  lines.push(`特記事項: ${plan.description?.trim() || "-"}`);
  lines.push(`作成者: ${plan.user?.name ?? "-"}`);
  lines.push(`地図: ${plan.maps?.map((map) => map.name).filter(Boolean).join("、") || "-"}`);
  lines.push(`予定人数: ${isFiniteNumber(plan.memberCount) ? plan.memberCount : "-"}人`);
  if (isFiniteNumber(plan.startAt)) {
    lines.push(`入山予定日: ${formatDate(plan.startAt, timezone)}`);
  }
  if (isFiniteNumber(plan.finishAt)) {
    lines.push(`下山予定日: ${formatDate(plan.finishAt, timezone)}`);
  }

  // 日程ごとの集計（移動計画セクションと共用するため先に組み立てる）
  const days = groupByDay(checkpoints);
  const dayReports: { day: number; totalMinutes: number; lines: string[] }[] = [];

  for (const [day, dayCheckpoints] of days) {
    const dayLines: string[] = [];
    const firstArrival = dayCheckpoints[0]?.arrivalTimeInSeconds;
    let cursor = isFiniteNumber(firstArrival) ? firstArrival : 0;
    let totalMinutes = 0;

    dayCheckpoints.forEach((checkpoint, index) => {
      if (index > 0) {
        const current = isFiniteNumber(checkpoint.arrivalTimeInSeconds)
          ? checkpoint.arrivalTimeInSeconds
          : 0;
        const previous = isFiniteNumber(dayCheckpoints[index - 1].arrivalTimeInSeconds)
          ? dayCheckpoints[index - 1].arrivalTimeInSeconds
          : 0;
        const minutes = segmentMinutes(current - (previous ?? 0), paceMultiplier);
        totalMinutes += minutes;
        cursor += minutes * 60;
      }
      const lodging = checkpoint.stayType === "sleep" ? "（宿泊地）" : "";
      dayLines.push(`${formatClock(cursor)} ${checkpointName(checkpoint)}${lodging}`);
    });

    const header =
      `${day}日目: 合計${formatDuration(totalMinutes)} / ` +
      `距離${formatDistance(sumBy(dayCheckpoints, "distance"))} / ` +
      `のぼり${formatElevation(sumBy(dayCheckpoints, "cumulativeUp"))} / ` +
      `くだり${formatElevation(sumBy(dayCheckpoints, "cumulativeDown"))}`;

    dayReports.push({ day, totalMinutes, lines: [header, ...dayLines] });
  }

  // 計画データ
  lines.push("--------");
  lines.push("計画データ");
  lines.push(`タイム: ${formatDuration(dayReports.reduce((total, report) => total + report.totalMinutes, 0))}`);
  lines.push(`距離: ${formatDistance(sumBy(checkpoints, "distance"))}`);
  lines.push(`のぼり: ${formatElevation(sumBy(checkpoints, "cumulativeUp"))}`);
  lines.push(`くだり: ${formatElevation(sumBy(checkpoints, "cumulativeDown"))}`);
  if (isFiniteNumber(plan.courseConstant)) {
    lines.push(`コース定数: ${plan.courseConstant} (${difficultyLabel(plan.courseConstant)})`);
  }
  lines.push(`ペース倍率: ${paceMultiplier}% (${paceLabel(paceMultiplier)})`);

  // 移動計画
  lines.push("--------");
  lines.push("移動計画");
  for (const report of dayReports) {
    lines.push(...report.lines);
  }

  return lines.join("\n");
}

/**
 * 計画ページのHTMLを取得する。
 * 埋め込みJSONは初期HTMLに含まれるため、ブラウザによるレンダリングは行わない。
 */
async function fetchPlanHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      // 素のリクエストだとYAMAP側で弾かれる場合に備え、ブラウザ相当のUAを名乗る
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.9",
    },
  });

  if (response.status === 404) {
    // ブラウザ取得時はエラーページのHTMLが返り「計画データが含まれていない」として扱われていた。
    // 素のGETではHTTPステータスで判別できるため、同じ趣旨をここで伝える
    throw new Error(
      "計画ページが見つかりませんでした（HTTP 404）。存在しない計画コード、または非公開・削除された計画の可能性があります。",
    );
  }

  if (!response.ok) {
    throw new Error(`計画ページの取得に失敗しました（HTTP ${response.status}）。`);
  }

  return response.text();
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("使用方法: npx tsx src/yamap/fetch_plan.ts <URL>");
    console.error("例: npx tsx src/yamap/fetch_plan.ts \"https://yamap.com/plans/code/XXXX\"");
    process.exit(1);
  }

  // URLの検証と正規化
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeYamapUrl(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const html = await fetchPlanHtml(normalizedUrl);
  const { plan, timezone } = extractPageData(html);
  console.log(buildReport(plan, timezone));
}

const isDirectRun =
  !!process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error("エラーが発生しました:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
