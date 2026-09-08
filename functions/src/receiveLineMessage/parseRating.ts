/**
 * 評価系フィードバック共通の本文パース。
 *
 * `評価` / `楽曲評価` などのプレフィックスを取り除いた残りから、
 * 任意の先頭日付トークン（YYYY-MM-DD）、任意の対象IDトークン（`#<ID>`）、
 * 任意のスコアトークン（1〜5）を寛容に抽出する。
 * 先頭の日付・対象ID・スコアが解釈できなくても、その分はコメントとして残す
 * （スコア欄が空でも、コメントだけのフィードバックとして保存できるようにするため）。
 *
 * 対象IDの抽出は `allowTargetId` を指定したときだけ行う。同日に複数の生成物がある
 * 画像評価のための書式であり、楽曲評価など従来どおり日付で足りる書式には広げない。
 */

export interface ParseRatingBodyOptions {
  /** `#<ID>` 形式の対象指定を受け付けるか。既定は false（従来の日付＋スコアのみ）。 */
  allowTargetId?: boolean;
}

export interface ParsedRatingBody {
  /** 先頭から 1〜5 を抽出できたときのみ数値。それ以外は null。 */
  score: number | null;
  /** 自由コメント（先頭の日付・対象ID・スコアを取り除いた残り）。 */
  comment: string;
  /** 評価対象の日付（YYYY-MM-DD）。明示されなければ null（呼び出し側が投稿日で補完する）。 */
  target_date: string | null;
  /** 評価対象の識別子（`#` を除いた本体）。`allowTargetId` 指定時に抽出できたときのみ文字列。 */
  target_id: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCORE_RE = /^[1-5]$/;
/** 全角の `＃` も受け付ける（日本語IMEでそのまま入力されることがあるため）。 */
const TARGET_ID_RE = /^[#＃]([A-Za-z0-9_-]{1,64})$/;

/**
 * 先頭トークン（空白区切り）と残りを返す。
 * JS の `\s` は全角空白（U+3000）も含むため、半角・全角どちらの区切りにも対応する。
 */
function splitFirstToken(text: string): { head: string; rest: string } {
  const m = text.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!m) return { head: "", rest: "" };
  return { head: m[1], rest: (m[2] ?? "").trim() };
}

export function parseRatingBody(
  text: string,
  options: ParseRatingBodyOptions = {},
): ParsedRatingBody {
  const allowTargetId = options.allowTargetId ?? false;

  let rest = text.trim();
  let target_date: string | null = null;
  let target_id: string | null = null;
  let score: number | null = null;

  // 先頭トークンを、日付 → 対象ID → スコアの順に寛容へ拾う。
  // 日付・対象IDはスコアより前にのみ現れる想定で、スコアを拾った時点で打ち切る。
  for (;;) {
    const { head, rest: after } = splitFirstToken(rest);
    if (!head) break;

    if (target_date === null && DATE_RE.test(head)) {
      target_date = head;
      rest = after;
      continue;
    }

    if (allowTargetId && target_id === null) {
      const idMatch = head.match(TARGET_ID_RE);
      if (idMatch) {
        target_id = idMatch[1];
        rest = after;
        continue;
      }
    }

    if (score === null && SCORE_RE.test(head)) {
      score = Number(head);
      rest = after;
    }
    break;
  }

  return { score, comment: rest, target_date, target_id };
}
