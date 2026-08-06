import * as cheerio from "cheerio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  difficultyLabel,
  formatDate,
  formatDistance,
  formatDurationFromSeconds,
  formatElevation,
  formatTimeOfDay,
  isPlainObject,
  paceLabel,
  resolveTimezone,
} from "./format";

// YAMAPの活動記録ページは Next.js 製で、記録データは SSR 時に埋め込まれる
// `#__NEXT_DATA__`（JSON）から取得する。DOMのクラス名はハッシュ化されており
// マークアップ変更で容易に壊れるため、スクレイピングではなくJSONを正とする。
//
// 埋め込みJSONは素のHTTP GETで返るため、ブラウザによるレンダリングは不要
// （Playwright を使う fetch_plan.ts とは取得方法が異なる。移行は issue #100）。

type YamapLandmark = {
  name?: string | null;
  altitude?: number | null;
  isSummit?: boolean | null;
};

export type YamapActivityCheckpoint = {
  enteredAt?: number | null;
  leftAt?: number | null;
  landmark?: YamapLandmark | null;
};

/** 全体・日別で共通の区間サマリ。日別のみ dayNumber を持つ */
export type YamapActivitySection = {
  startedAt?: number | null;
  stoppedAt?: number | null;
  totalTime?: number | null;
  restTime?: number | null;
  distance?: number | null;
  cumulativeUp?: number | null;
  cumulativeDown?: number | null;
  totalDays?: number | null;
  dayNumber?: number | null;
};

export type YamapActivity = {
  title?: string | null;
  description?: string | null;
  startAt?: number | null;
  finishAt?: number | null;
  timeZone?: number | null;
  courseConstant?: number | null;
  standardCourseTime?: number | null;
  averagePace?: number | null;
  map?: { name?: string | null; prefectures?: { name?: string | null }[] | null } | null;
  activityWholeSection?: YamapActivitySection | null;
  checkpoints?: YamapActivityCheckpoint[] | null;
};

export type YamapActivityPage = {
  activity: YamapActivity;
  dailySections: YamapActivitySection[];
  timezone: number;
};

// URLの正規化処理
// 受け付けるフォーマット:
//   - https://yamap.com/activities/{ID}
// 末尾スラッシュとクエリ文字列・フラグメントは除去して扱う
// それ以外のURLはエラーとして扱う
export function normalizeActivityUrl(url: string): string {
  const match = url.trim().match(/^https:\/\/yamap\.com\/activities\/(\d+)\/?(?:[?#].*)?$/);
  if (match) {
    return `https://yamap.com/activities/${match[1]}`;
  }

  throw new Error(
    `URLのフォーマットが正しくありません。\n` +
    `受け付けるフォーマット:\n` +
    `  - https://yamap.com/activities/{ID}\n` +
    `指定されたURL: ${url}`,
  );
}

// #__NEXT_DATA__ から活動記録データ・日別セクション・タイムゾーンを取り出す
// JSON.parse 成功だけでは型が保証されないため、ルート・activity・checkpoints を実行時に検証する
export function extractActivityData(html: string): YamapActivityPage {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").first().html();
  if (!raw) {
    throw new Error("活動記録データ（__NEXT_DATA__）が見つかりませんでした。YAMAP側のページ構成が変更された可能性があります。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("活動記録データ（__NEXT_DATA__）のJSON解析に失敗しました。");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("活動記録データ（__NEXT_DATA__）の形式が不正です。");
  }

  const pageProps =
    isPlainObject(parsed.props) && isPlainObject(parsed.props.pageProps)
      ? parsed.props.pageProps
      : undefined;

  // 削除済み・非公開の活動記録は HTTP 200 のまま pageProps.error にメッセージが入る
  if (isPlainObject(pageProps?.error)) {
    const message = typeof pageProps.error.message === "string" ? pageProps.error.message : "";
    throw new Error(
      message
        ? `活動記録を取得できませんでした: ${message}`
        : "活動記録を取得できませんでした。",
    );
  }

  const activityRaw = pageProps?.activity;
  if (!isPlainObject(activityRaw)) {
    throw new Error("活動記録データが含まれていませんでした。非公開の活動日記、または削除された活動日記の可能性があります。");
  }

  if (activityRaw.checkpoints != null && !Array.isArray(activityRaw.checkpoints)) {
    throw new Error("活動記録データのチェックポイント形式が不正です。");
  }

  const activity: YamapActivity = {
    ...(activityRaw as YamapActivity),
    checkpoints: Array.isArray(activityRaw.checkpoints)
      ? (activityRaw.checkpoints as YamapActivityCheckpoint[])
      : [],
  };

  const dailySections = Array.isArray(pageProps?.activityDailySections)
    ? (pageProps.activityDailySections as YamapActivitySection[])
    : [];

  return {
    activity,
    dailySections,
    timezone: resolveTimezone(activity.timeZone),
  };
}

/** 泊数の表記を求める（1日なら日帰り、N日なら(N-1)泊N日） */
function itineraryLabel(totalDays: number): string {
  return totalDays <= 1 ? "日帰り" : `${totalDays - 1}泊${totalDays}日`;
}

/** チェックポイントの表示名を求める */
function checkpointName(checkpoint: YamapActivityCheckpoint): string {
  return checkpoint.landmark?.name?.trim() || "地点名不明";
}

/**
 * 登頂した山を初回通過順に重複を除いて並べる。
 * 画面の「山の情報」は埋め込みJSONに無いが、isSummit のチェックポイントで代替できる
 * （実際に踏んだ山頂という意味ではむしろこちらが正確）。
 */
function summitNames(checkpoints: YamapActivityCheckpoint[]): string[] {
  const names: string[] = [];
  for (const checkpoint of checkpoints) {
    const name = checkpoint.landmark?.name?.trim();
    if (checkpoint.landmark?.isSummit && name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * チェックポイントを日別セクションへ割り当てる。
 * enteredAt が [startedAt, stoppedAt] に収まるセクションを正とし、
 * 収まらない場合は開始済みの最後のセクション（それも無ければ先頭）へ寄せる。
 */
function groupByDay(
  checkpoints: YamapActivityCheckpoint[],
  sections: YamapActivitySection[],
): Map<number, YamapActivityCheckpoint[]> {
  const ordered = [...sections].sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
  const groups = new Map<number, YamapActivityCheckpoint[]>();
  for (const [index, section] of ordered.entries()) {
    groups.set(section.dayNumber ?? index + 1, []);
  }
  if (groups.size === 0) {
    groups.set(1, []);
  }

  const dayNumbers = [...groups.keys()];
  for (const checkpoint of checkpoints) {
    const enteredAt = checkpoint.enteredAt ?? 0;
    let index = ordered.findIndex(
      (section) => enteredAt >= (section.startedAt ?? 0) && enteredAt <= (section.stoppedAt ?? 0),
    );
    if (index < 0) {
      index = ordered.findLastIndex((section) => enteredAt >= (section.startedAt ?? 0));
    }
    const day = dayNumbers[index >= 0 ? index : 0];
    groups.get(day)?.push(checkpoint);
  }

  return groups;
}

export function buildReport(page: YamapActivityPage): string {
  const { activity, dailySections, timezone } = page;
  const checkpoints = activity.checkpoints ?? [];
  const whole = activity.activityWholeSection ?? {};
  const lines: string[] = [];

  // 概要
  lines.push("概要");
  lines.push(`タイトル: ${activity.title?.trim() || "-"}`);
  lines.push(`山域: ${activity.map?.name?.trim() || "-"}`);
  const prefectures = (activity.map?.prefectures ?? [])
    .map((prefecture) => prefecture.name)
    .filter(Boolean)
    .join("、");
  lines.push(`都道府県: ${prefectures || "-"}`);
  if (activity.startAt && activity.finishAt) {
    const startDate = formatDate(activity.startAt, timezone);
    const finishDate = formatDate(activity.finishAt, timezone);
    const start = `${startDate} ${formatTimeOfDay(activity.startAt, timezone)}`;
    // 同日中に終わるなら終了側の日付は省く
    const finish =
      startDate === finishDate
        ? formatTimeOfDay(activity.finishAt, timezone)
        : `${finishDate} ${formatTimeOfDay(activity.finishAt, timezone)}`;
    lines.push(`活動日: ${start} 〜 ${finish}`);
  }
  lines.push(`日程: ${itineraryLabel(whole.totalDays ?? 1)}`);

  // 活動データ
  // 画面表示は activityWholeSection の値を用いる（activity 直下の distance /
  // cumulativeUp は別系統の値で、表示と一致しないため使わない）
  lines.push("--------");
  lines.push("活動データ");
  if (whole.totalTime != null) {
    lines.push(`タイム: ${formatDurationFromSeconds(whole.totalTime)}`);
  }
  if (whole.distance != null) {
    lines.push(`距離: ${formatDistance(whole.distance)}`);
  }
  if (whole.cumulativeUp != null) {
    lines.push(`のぼり: ${formatElevation(whole.cumulativeUp)}`);
  }
  if (whole.cumulativeDown != null) {
    lines.push(`くだり: ${formatElevation(whole.cumulativeDown)}`);
  }
  if (activity.courseConstant != null) {
    lines.push(`コース定数: ${activity.courseConstant} (${difficultyLabel(activity.courseConstant)})`);
  }
  if (activity.standardCourseTime != null) {
    lines.push(`標準タイム: ${formatDurationFromSeconds(activity.standardCourseTime)}`);
  }
  // averagePace は「標準タイムに対する実績の比」なので、逆数を百分率にすると画面表示と一致する
  if (activity.averagePace != null && activity.averagePace > 0) {
    const percent = Math.round((1 / activity.averagePace) * 100);
    lines.push(`平均ペース: ${percent}% (${paceLabel(percent)})`);
  }
  const summits = summitNames(checkpoints);
  if (summits.length > 0) {
    lines.push(`登頂した山: ${summits.join("・")}`);
  }

  // チェックポイント
  lines.push("--------");
  lines.push("チェックポイント");
  const sectionsByDay = new Map(
    dailySections.map((section, index) => [section.dayNumber ?? index + 1, section]),
  );
  for (const [day, dayCheckpoints] of groupByDay(checkpoints, dailySections)) {
    const section = sectionsByDay.get(day);
    const summary = [
      section?.totalTime != null ? `合計${formatDurationFromSeconds(section.totalTime)}` : null,
      section?.restTime != null ? `休憩${formatDurationFromSeconds(section.restTime)}` : null,
      section?.distance != null ? `距離${formatDistance(section.distance)}` : null,
      section?.cumulativeUp != null ? `のぼり${formatElevation(section.cumulativeUp)}` : null,
      section?.cumulativeDown != null ? `くだり${formatElevation(section.cumulativeDown)}` : null,
    ].filter(Boolean);
    lines.push(summary.length > 0 ? `${day}日目: ${summary.join(" / ")}` : `${day}日目`);

    for (const checkpoint of dayCheckpoints) {
      const entered = checkpoint.enteredAt != null ? formatTimeOfDay(checkpoint.enteredAt, timezone) : "--:--";
      const left = checkpoint.leftAt != null ? formatTimeOfDay(checkpoint.leftAt, timezone) : "--:--";
      const altitude = checkpoint.landmark?.altitude;
      const suffix = altitude != null ? ` (${formatElevation(altitude)})` : "";
      lines.push(`${entered}-${left} ${checkpointName(checkpoint)}${suffix}`);
    }
  }

  // 活動詳細（ユーザーが綴った本文。可変長のため末尾に置く）
  lines.push("--------");
  lines.push("活動詳細");
  lines.push(activity.description?.trim() || "-");

  return lines.join("\n");
}

/**
 * 活動記録ページのHTMLを取得する。
 * 埋め込みJSONは初期HTMLに含まれるため、ブラウザによるレンダリングは行わない。
 */
async function fetchActivityHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      // 素のリクエストだとYAMAP側で弾かれる場合に備え、ブラウザ相当のUAを名乗る
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`活動記録ページの取得に失敗しました（HTTP ${response.status}）。`);
  }

  return response.text();
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("使用方法: npx tsx src/yamap/fetch_activity.ts <URL>");
    console.error("例: npx tsx src/yamap/fetch_activity.ts \"https://yamap.com/activities/XXXX\"");
    process.exit(1);
  }

  // URLの検証と正規化
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeActivityUrl(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const html = await fetchActivityHtml(normalizedUrl);
  console.log(buildReport(extractActivityData(html)));
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
