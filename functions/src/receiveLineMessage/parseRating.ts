/**
 * 評価系フィードバック共通の本文パース。
 *
 * `評価` / `楽曲評価` などのプレフィックスを取り除いた残りから、
 * 任意の先頭日付トークン（YYYY-MM-DD）と任意のスコアトークン（1〜5）を寛容に抽出する。
 * 先頭の日付・スコアが解釈できなくても、その分はコメントとして残す
 * （スコア欄が空でも、コメントだけのフィードバックとして保存できるようにするため）。
 */

export interface ParsedRatingBody {
  /** 先頭から 1〜5 を抽出できたときのみ数値。それ以外は null。 */
  score: number | null;
  /** 自由コメント（先頭の日付・スコアを取り除いた残り）。 */
  comment: string;
  /** 評価対象の日付（YYYY-MM-DD）。明示されなければ null（呼び出し側が投稿日で補完する）。 */
  target_date: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 先頭トークン（空白区切り）と残りを返す。
 * JS の `\s` は全角空白（U+3000）も含むため、半角・全角どちらの区切りにも対応する。
 */
function splitFirstToken(text: string): { head: string; rest: string } {
  const m = text.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!m) return { head: "", rest: "" };
  return { head: m[1], rest: (m[2] ?? "").trim() };
}

export function parseRatingBody(text: string): ParsedRatingBody {
  let rest = text.trim();

  // 任意の先頭日付トークン（YYYY-MM-DD）を抽出
  let target_date: string | null = null;
  {
    const { head, rest: after } = splitFirstToken(rest);
    if (DATE_RE.test(head)) {
      target_date = head;
      rest = after;
    }
  }

  // 任意の先頭スコアトークン（1〜5）を抽出
  let score: number | null = null;
  {
    const { head, rest: after } = splitFirstToken(rest);
    if (/^[1-5]$/.test(head)) {
      score = Number(head);
      rest = after;
    }
  }

  return { score, comment: rest, target_date };
}
