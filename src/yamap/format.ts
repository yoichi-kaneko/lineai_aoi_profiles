/**
 * YAMAP の計画ページ・活動記録ページで共通の整形処理とラベル判定。
 *
 * 数値の丸め方（距離は小数第1位で切り捨て、標高は整数で切り捨て）と
 * ラベルの閾値は YAMAP 側の実装に合わせてある。画面表示と一致させるために
 * 必要な取り決めなので、根拠なく変更しないこと。
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 有限な number かどうか（NaN / Infinity / 非 number を弾く） */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * null / undefined はそのまま通し、それ以外は有限な number のみ許可する。
 * 外部 JSON の数値フィールドを整形関数へ渡す前の境界検証に使う。
 */
export function requireFiniteNumberOrNull(
  value: unknown,
  fieldLabel: string,
): number | null | undefined {
  if (value == null) return value as null | undefined;
  if (isFiniteNumber(value)) return value;
  throw new Error(`${fieldLabel}の形式が不正です。`);
}

/** timezone は数値なら採用し、欠落・非数値は JST(9) にフォールバックする */
export function resolveTimezone(value: unknown): number {
  return isFiniteNumber(value) ? value : 9;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** UNIX秒を指定タイムゾーンの「YYYY.MM.DD (曜)」形式に整形する */
export function formatDate(unixSeconds: number, timezoneHours: number): string {
  const shifted = new Date((unixSeconds + timezoneHours * 3600) * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day} (${WEEKDAYS[shifted.getUTCDay()]})`;
}

/** UNIX秒を指定タイムゾーンの「HH:MM」形式に整形する */
export function formatTimeOfDay(unixSeconds: number, timezoneHours: number): string {
  const shifted = new Date((unixSeconds + timezoneHours * 3600) * 1000);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** 分を「X時間Y分」形式に整形する */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}時間${rest}分` : `${rest}分`;
}

/**
 * 秒を「X時間Y分」形式に整形する。
 * YAMAP は秒を切り捨てて HH:MM 表示するため、分への変換も切り捨てる。
 */
export function formatDurationFromSeconds(seconds: number): string {
  return formatDuration(Math.floor(seconds / 60));
}

/** メートルを「X.Ykm」形式に整形する（YAMAPの表示に合わせて切り捨て） */
export function formatDistance(meters: number): string {
  return `${(Math.floor(meters / 100) / 10).toFixed(1)}km`;
}

/** メートルを整数に丸めて「Xm」形式に整形する（YAMAPの表示に合わせて切り捨て） */
export function formatElevation(meters: number): string {
  return `${Math.floor(meters)}m`;
}

/** コース定数から体力度のラベルを求める（YAMAPの区分に準拠） */
export function difficultyLabel(courseConstant: number): string {
  if (courseConstant <= 11) return "やさしい";
  if (courseConstant <= 24) return "ふつう";
  return "きつい";
}

/**
 * ペースの百分率からラベルを求める（YAMAPの区分に準拠）。
 * 計画は `paceMultiplier` がそのまま百分率、活動記録は `averagePace` の逆数を百分率にして渡す。
 */
export function paceLabel(pacePercent: number): string {
  if (pacePercent <= 70) return "ゆっくり";
  if (pacePercent <= 90) return "ややゆっくり";
  if (pacePercent <= 109) return "標準";
  if (pacePercent <= 129) return "やや速い";
  return "速い";
}
