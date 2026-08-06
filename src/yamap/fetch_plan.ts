import * as cheerio from "cheerio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  difficultyLabel,
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  isPlainObject,
  paceLabel,
  resolveTimezone,
} from "./format";

// YAMAPの計画ページは Next.js 製で、計画データは SSR 時に埋め込まれる
// `#__NEXT_DATA__`（JSON）から取得する。DOMのクラス名はハッシュ化されており
// マークアップ変更で容易に壊れるため、スクレイピングではなくJSONを正とする。

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

  const plan: YamapPlan = {
    ...(planRaw as YamapPlan),
    checkpoints: Array.isArray(planRaw.checkpoints)
      ? (planRaw.checkpoints as YamapCheckpoint[])
      : [],
  };

  return { plan, timezone: resolveTimezone(pageProps?.timezone) };
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
  return checkpoints.reduce((total, checkpoint) => total + (checkpoint[key] ?? 0), 0);
}

function buildReport(plan: YamapPlan, timezone: number): string {
  const checkpoints = plan.checkpoints ?? [];
  const paceMultiplier = plan.paceMultiplier ?? 100;
  const lines: string[] = [];

  // 概要
  lines.push("概要");
  lines.push(`計画タイトル: ${plan.title?.trim() || "-"}`);
  lines.push(`特記事項: ${plan.description?.trim() || "-"}`);
  lines.push(`作成者: ${plan.user?.name ?? "-"}`);
  lines.push(`地図: ${plan.maps?.map((map) => map.name).filter(Boolean).join("、") || "-"}`);
  lines.push(`予定人数: ${plan.memberCount ?? "-"}人`);
  if (plan.startAt) {
    lines.push(`入山予定日: ${formatDate(plan.startAt, timezone)}`);
  }
  if (plan.finishAt) {
    lines.push(`下山予定日: ${formatDate(plan.finishAt, timezone)}`);
  }

  // 日程ごとの集計（移動計画セクションと共用するため先に組み立てる）
  const days = groupByDay(checkpoints);
  const dayReports: { day: number; totalMinutes: number; lines: string[] }[] = [];

  for (const [day, dayCheckpoints] of days) {
    const dayLines: string[] = [];
    let cursor = dayCheckpoints[0]?.arrivalTimeInSeconds ?? 0;
    let totalMinutes = 0;

    dayCheckpoints.forEach((checkpoint, index) => {
      if (index > 0) {
        const base = (checkpoint.arrivalTimeInSeconds ?? 0) - (dayCheckpoints[index - 1].arrivalTimeInSeconds ?? 0);
        const minutes = segmentMinutes(base, paceMultiplier);
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
  if (plan.courseConstant != null) {
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

  const browser = await chromium.launch();
  let html: string;
  try {
    const page = await browser.newPage();
    // 計画データは初期HTMLに埋め込まれているため、描画完了までは待たない
    await page.goto(normalizedUrl, { waitUntil: "domcontentloaded" });
    html = await page.content();
  } finally {
    await browser.close();
  }

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
