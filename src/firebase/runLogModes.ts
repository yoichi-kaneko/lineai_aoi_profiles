/**
 * Firestore の `run_logs` コレクションにおける `mode` フィールドの取りうる値。
 * `run_aoi_daily` スキルから保存されるのは morning / noon / night の3種。
 * `scribe` は時間帯自動判定の対象外で、`run_aoi_scribe` スキル（手動起動）からのみ保存される。
 * `weekly` は `send_daily_line.sh` と `run_aoi_weekly` スキルから保存され、実行時間帯は
 * {@link isWeeklyRunWindowInTokyoTime} で判定する。
 */
export const RUN_LOG_MODE = {
  MORNING: "morning",
  NOON: "noon",
  NIGHT: "night",
  SCRIBE: "scribe",
  WEEKLY: "weekly",
} as const;

/** {@link RUN_LOG_MODE} の値の union。 */
export type RunLogMode = (typeof RUN_LOG_MODE)[keyof typeof RUN_LOG_MODE];

const RUN_LOG_MODE_SET = new Set<string>(Object.values(RUN_LOG_MODE));

export function isRunLogMode(value: string): value is RunLogMode {
  return RUN_LOG_MODE_SET.has(value);
}

const TOKYO_TIME_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// 結星の時間帯は 0 時台を含むため、深夜 0 時を "24" と表す実装に当たらないよう h23 を明示する
const TOKYO_WEEKDAY_TIME_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

function getTokyoTimeInMinutes(now: Date): number {
  const parts = TOKYO_TIME_PARTS.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

/**
 * Asia/Tokyo の現在時刻からデイリーモードを判定する。
 * 該当する時間帯がない場合は null を返す。
 *
 * - 03:00-08:59 → morning
 * - 12:00-14:59 → noon
 * - 20:00-23:59 → night
 */
export function resolveDailyRunLogModeFromTokyoTime(now: Date = new Date()): RunLogMode | null {
  const timeInMinutes = getTokyoTimeInMinutes(now);

  if (timeInMinutes >= 3 * 60 && timeInMinutes < 9 * 60) {
    return RUN_LOG_MODE.MORNING;
  }
  if (timeInMinutes >= 12 * 60 && timeInMinutes < 15 * 60) {
    return RUN_LOG_MODE.NOON;
  }
  if (timeInMinutes >= 20 * 60 && timeInMinutes < 24 * 60) {
    return RUN_LOG_MODE.NIGHT;
  }

  return null;
}

/**
 * Asia/Tokyo の現在時刻が、結星（weekly）の実行時間帯に当たるかを判定する。
 *
 * - 月曜 00:00-04:59 → true
 * - それ以外 → false
 *
 * 日曜の小夜の申し送り（night_handover）と「今日の一枚」（image_logs）までを対象期間に含めるため、
 * 週明けの深夜に限る。曜日で絞るため、run_logs の確認は同じ日付だけで足りる。
 */
export function isWeeklyRunWindowInTokyoTime(now: Date = new Date()): boolean {
  const parts = TOKYO_WEEKDAY_TIME_PARTS.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return weekday === "Mon" && hour >= 0 && hour < 5;
}
