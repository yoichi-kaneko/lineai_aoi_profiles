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

/** JST の暦日を "YYYY-MM-DD" で返す。EC2 起動へ渡す投稿日の表現に用いる。 */
export function jstYmd(base: Date): string {
  const day = startOfJstDay(base);
  const year = String(day.getUTCFullYear()).padStart(4, "0");
  const month = String(day.getUTCMonth() + 1).padStart(2, "0");
  const date = String(day.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}
