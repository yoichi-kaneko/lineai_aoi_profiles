/**
 * LINE 返信による画像生成フィードバックのパース（柱B）。
 *
 * 入方向テキストが `評価` / `傾向` で始まる場合に、碧衣の画像生成へのフィードバックとして解釈する。
 * 解釈できたときは構造化した {@link ParsedImageFeedback} を返し、そうでなければ `null` を返す。
 * 呼び出し側は `null` のとき従来どおり line_text として扱う。
 *
 * 書式（いずれも前方一致。トークンの区切りは半角・全角空白いずれも可）:
 *   個別評価 : `評価 <1-5> <コメント>`           例: `評価 4 構図は好き。背景が少し寂しい`
 *   日付指定 : `評価 <YYYY-MM-DD> <1-5> <コメント>` 例: `評価 2026-06-12 5 ルリが可愛い`
 *   傾向FB   : `傾向 <コメント>`                   例: `傾向 最近バストアップ正面が続いている`
 *
 * パースは寛容に行う：先頭の日付・スコアが解釈できなくても、その分はコメントとして残す
 * （スコア欄が空でも、コメントだけのフィードバックとして保存できるようにするため）。
 */

export type ImageFeedbackKind = "rating" | "trend";

export interface ParsedImageFeedback {
  kind: ImageFeedbackKind;
  /** kind=rating で先頭から 1〜5 を抽出できたときのみ数値。それ以外は null。 */
  score: number | null;
  /** 自由コメント（先頭の日付・スコアを取り除いた残り）。 */
  comment: string;
  /** 評価対象画像の日付（YYYY-MM-DD）。明示されなければ null（呼び出し側が投稿日で補完する）。 */
  target_date: string | null;
}

const RATING_PREFIX = "評価";
const TREND_PREFIX = "傾向";
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

export function parseImageFeedback(text: string): ParsedImageFeedback | null {
  const trimmed = text.trim();

  if (trimmed.startsWith(RATING_PREFIX)) {
    let rest = trimmed.slice(RATING_PREFIX.length).trim();

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

    return { kind: "rating", score, comment: rest, target_date };
  }

  if (trimmed.startsWith(TREND_PREFIX)) {
    const comment = trimmed.slice(TREND_PREFIX.length).trim();
    return { kind: "trend", score: null, comment, target_date: null };
  }

  return null;
}
