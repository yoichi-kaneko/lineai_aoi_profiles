/** notes の `date` 用。JST 基準で日付を揃え、UTC midnight として返す */
export function startOfJstDay(base: Date): Date {
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(base.getTime() + jstOffsetMs);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

/** "YYYY-MM-DD"（JST の暦日）を startOfJstDay と同じ UTC midnight 表現へ変換する */
export function jstDateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
