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
  isFiniteNumber,
  isPlainObject,
  paceLabel,
  requireFiniteNumberOrNull,
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
  map?: {
    name?: string | null;
    prefectures?: ({ name?: string | null } | null)[] | null;
  } | null;
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

  const checkpoints = Array.isArray(activityRaw.checkpoints)
    ? activityRaw.checkpoints.map((checkpoint, index) =>
        parseCheckpoint(checkpoint, `checkpoints[${index}]`),
      )
    : [];

  const dailySections = Array.isArray(pageProps?.activityDailySections)
    ? pageProps.activityDailySections.map((section, index) =>
        parseSection(section, `activityDailySections[${index}]`),
      )
    : [];

  const activity: YamapActivity = {
    title: asOptionalString(activityRaw.title),
    description: asOptionalString(activityRaw.description),
    startAt: requireFiniteNumberOrNull(activityRaw.startAt, "活動記録データのstartAt"),
    finishAt: requireFiniteNumberOrNull(activityRaw.finishAt, "活動記録データのfinishAt"),
    timeZone: isFiniteNumber(activityRaw.timeZone) ? activityRaw.timeZone : undefined,
    courseConstant: requireFiniteNumberOrNull(activityRaw.courseConstant, "活動記録データのcourseConstant"),
    standardCourseTime: requireFiniteNumberOrNull(
      activityRaw.standardCourseTime,
      "活動記録データのstandardCourseTime",
    ),
    averagePace: requireFiniteNumberOrNull(activityRaw.averagePace, "活動記録データのaveragePace"),
    map: parseMap(activityRaw.map),
    activityWholeSection:
      activityRaw.activityWholeSection == null
        ? (activityRaw.activityWholeSection as null | undefined)
        : parseSection(activityRaw.activityWholeSection, "activityWholeSection"),
    checkpoints,
  };

  return {
    activity,
    dailySections,
    timezone: resolveTimezone(activity.timeZone),
  };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value == null) return value as null | undefined;
  return typeof value === "string" ? value : null;
}

function parseMap(value: unknown): YamapActivity["map"] {
  if (value == null) return value as null | undefined;
  if (!isPlainObject(value)) {
    throw new Error("活動記録データのmapの形式が不正です。");
  }
  const prefecturesRaw = value.prefectures;
  let prefectures: ({ name?: string | null } | null)[] | null | undefined;
  if (prefecturesRaw == null) {
    prefectures = prefecturesRaw as null | undefined;
  } else if (!Array.isArray(prefecturesRaw)) {
    throw new Error("活動記録データのmap.prefecturesの形式が不正です。");
  } else {
    prefectures = prefecturesRaw.map((entry) => {
      if (entry == null) return null;
      if (!isPlainObject(entry)) {
        throw new Error("活動記録データのmap.prefecturesの形式が不正です。");
      }
      return { name: asOptionalString(entry.name) };
    });
  }
  return {
    name: asOptionalString(value.name),
    prefectures,
  };
}

function parseSection(value: unknown, label: string): YamapActivitySection {
  if (!isPlainObject(value)) {
    throw new Error(`活動記録データの${label}の形式が不正です。`);
  }
  return {
    startedAt: requireFiniteNumberOrNull(value.startedAt, `活動記録データの${label}.startedAt`),
    stoppedAt: requireFiniteNumberOrNull(value.stoppedAt, `活動記録データの${label}.stoppedAt`),
    totalTime: requireFiniteNumberOrNull(value.totalTime, `活動記録データの${label}.totalTime`),
    restTime: requireFiniteNumberOrNull(value.restTime, `活動記録データの${label}.restTime`),
    distance: requireFiniteNumberOrNull(value.distance, `活動記録データの${label}.distance`),
    cumulativeUp: requireFiniteNumberOrNull(value.cumulativeUp, `活動記録データの${label}.cumulativeUp`),
    cumulativeDown: requireFiniteNumberOrNull(
      value.cumulativeDown,
      `活動記録データの${label}.cumulativeDown`,
    ),
    totalDays: requireFiniteNumberOrNull(value.totalDays, `活動記録データの${label}.totalDays`),
    dayNumber: requireFiniteNumberOrNull(value.dayNumber, `活動記録データの${label}.dayNumber`),
  };
}

function parseCheckpoint(value: unknown, label: string): YamapActivityCheckpoint {
  if (!isPlainObject(value)) {
    throw new Error(`活動記録データの${label}の形式が不正です。`);
  }
  const landmarkRaw = value.landmark;
  let landmark: YamapLandmark | null | undefined;
  if (landmarkRaw == null) {
    landmark = landmarkRaw as null | undefined;
  } else if (!isPlainObject(landmarkRaw)) {
    throw new Error(`活動記録データの${label}.landmarkの形式が不正です。`);
  } else {
    landmark = {
      name: asOptionalString(landmarkRaw.name),
      altitude: requireFiniteNumberOrNull(landmarkRaw.altitude, `活動記録データの${label}.landmark.altitude`),
      isSummit:
        typeof landmarkRaw.isSummit === "boolean"
          ? landmarkRaw.isSummit
          : landmarkRaw.isSummit == null
            ? (landmarkRaw.isSummit as null | undefined)
            : null,
    };
  }
  return {
    enteredAt: requireFiniteNumberOrNull(value.enteredAt, `活動記録データの${label}.enteredAt`),
    leftAt: requireFiniteNumberOrNull(value.leftAt, `活動記録データの${label}.leftAt`),
    landmark,
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

  const fallbackDay = [...groups.keys()][0];
  const dayNumberOf = (index: number) => ordered[index]?.dayNumber ?? index + 1;
  for (const checkpoint of checkpoints) {
    const enteredAt = checkpoint.enteredAt ?? 0;
    let index = ordered.findIndex(
      (section) => enteredAt >= (section.startedAt ?? 0) && enteredAt <= (section.stoppedAt ?? 0),
    );
    if (index < 0) {
      // 開始済みの最後のセクションを後ろから探す
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        if (enteredAt >= (ordered[i].startedAt ?? 0)) {
          index = i;
          break;
        }
      }
    }
    const day = index >= 0 ? dayNumberOf(index) : fallbackDay;
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
    .map((prefecture) => prefecture?.name)
    .filter(Boolean)
    .join("、");
  lines.push(`都道府県: ${prefectures || "-"}`);
  if (isFiniteNumber(activity.startAt) && isFiniteNumber(activity.finishAt)) {
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
  lines.push(`日程: ${itineraryLabel(isFiniteNumber(whole.totalDays) ? whole.totalDays : 1)}`);

  // 活動データ
  // 画面表示は activityWholeSection の値を用いる（activity 直下の distance /
  // cumulativeUp は別系統の値で、表示と一致しないため使わない）
  lines.push("--------");
  lines.push("活動データ");
  if (isFiniteNumber(whole.totalTime)) {
    lines.push(`タイム: ${formatDurationFromSeconds(whole.totalTime)}`);
  }
  if (isFiniteNumber(whole.distance)) {
    lines.push(`距離: ${formatDistance(whole.distance)}`);
  }
  if (isFiniteNumber(whole.cumulativeUp)) {
    lines.push(`のぼり: ${formatElevation(whole.cumulativeUp)}`);
  }
  if (isFiniteNumber(whole.cumulativeDown)) {
    lines.push(`くだり: ${formatElevation(whole.cumulativeDown)}`);
  }
  if (isFiniteNumber(activity.courseConstant)) {
    lines.push(`コース定数: ${activity.courseConstant} (${difficultyLabel(activity.courseConstant)})`);
  }
  if (isFiniteNumber(activity.standardCourseTime)) {
    lines.push(`標準タイム: ${formatDurationFromSeconds(activity.standardCourseTime)}`);
  }
  // averagePace は「標準タイムに対する実績の比」なので、逆数を百分率にすると画面表示と一致する
  if (isFiniteNumber(activity.averagePace) && activity.averagePace > 0) {
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
    const totalTime = section?.totalTime;
    const restTime = section?.restTime;
    const distance = section?.distance;
    const cumulativeUp = section?.cumulativeUp;
    const cumulativeDown = section?.cumulativeDown;
    const summary = [
      isFiniteNumber(totalTime) ? `合計${formatDurationFromSeconds(totalTime)}` : null,
      isFiniteNumber(restTime) ? `休憩${formatDurationFromSeconds(restTime)}` : null,
      isFiniteNumber(distance) ? `距離${formatDistance(distance)}` : null,
      isFiniteNumber(cumulativeUp) ? `のぼり${formatElevation(cumulativeUp)}` : null,
      isFiniteNumber(cumulativeDown) ? `くだり${formatElevation(cumulativeDown)}` : null,
    ].filter(Boolean);
    lines.push(summary.length > 0 ? `${day}日目: ${summary.join(" / ")}` : `${day}日目`);

    for (const checkpoint of dayCheckpoints) {
      const entered = isFiniteNumber(checkpoint.enteredAt)
        ? formatTimeOfDay(checkpoint.enteredAt, timezone)
        : "--:--";
      const left = isFiniteNumber(checkpoint.leftAt)
        ? formatTimeOfDay(checkpoint.leftAt, timezone)
        : "--:--";
      const altitude = checkpoint.landmark?.altitude;
      const suffix = isFiniteNumber(altitude) ? ` (${formatElevation(altitude)})` : "";
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
    signal: AbortSignal.timeout(30_000),
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
