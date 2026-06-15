/**
 * Firestore の `run_logs` コレクションにおける `mode` フィールドの取りうる値。
 * `run_aoi_daily` スキルから保存されるのは morning / noon / night の3種のみ。
 */
export const RUN_LOG_MODE = {
  MORNING: "morning",
  NOON: "noon",
  NIGHT: "night",
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
