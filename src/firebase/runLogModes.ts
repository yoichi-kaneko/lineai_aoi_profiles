/**
 * Firestore の `run_logs` コレクションにおける `mode` フィールドの取りうる値。
 * 標準モードキーは aoi.md の「モード概要」を正とする。
 */
export const RUN_LOG_MODE = {
  MORNING: "morning",
  NOON: "noon",
  NIGHT: "night",
  OFF_MOUNTAIN: "off_mountain",
  UP_MOUNTAIN: "up_mountain",
  SONG: "song",
} as const;

/** {@link RUN_LOG_MODE} の値の union。 */
export type RunLogMode = (typeof RUN_LOG_MODE)[keyof typeof RUN_LOG_MODE];

const RUN_LOG_MODE_SET = new Set<string>(Object.values(RUN_LOG_MODE));

export function isRunLogMode(value: string): value is RunLogMode {
  return RUN_LOG_MODE_SET.has(value);
}
