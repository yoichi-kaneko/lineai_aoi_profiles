/**
 * LINE 返信による楽曲フィードバックのパース（楽曲版 柱B）。
 *
 * 入方向テキストが `楽曲評価` / `音楽評価` で始まる場合に、碧衣の楽曲生成へのフィードバックとして解釈する。
 * 解釈できたときは構造化した {@link ParsedSongFeedback} を返し、そうでなければ `null` を返す。
 * 呼び出し側は `null` のとき従来どおり line_text として扱う。
 *
 * 画像側（parseImageFeedback）と異なり、傾向フィードバックは扱わない（個別評価のみ）。
 *
 * 書式（いずれも前方一致。トークンの区切りは半角・全角空白いずれも可）:
 *   個別評価 : `楽曲評価 <1-5> <コメント>`              例: `楽曲評価 4 歌詞の余韻が好き`
 *   日付指定 : `楽曲評価 <YYYY-MM-DD> <1-5> <コメント>`  例: `楽曲評価 2026-07-05 5 サビの解放感がよい`
 *   （`音楽評価` も同義のプレフィックスとして受け付ける）
 *
 * パースは寛容に行う：先頭の日付・スコアが解釈できなくても、その分はコメントとして残す。
 */

import { parseRatingBody } from "./parseRating";

export interface ParsedSongFeedback {
  kind: "rating";
  /** 先頭から 1〜5 を抽出できたときのみ数値。それ以外は null。 */
  score: number | null;
  /** 自由コメント（先頭の日付・スコアを取り除いた残り）。 */
  comment: string;
  /** 評価対象楽曲の日付（YYYY-MM-DD）。明示されなければ null（呼び出し側が投稿日で補完する）。 */
  target_date: string | null;
}

const SONG_RATING_PREFIXES = ["楽曲評価", "音楽評価"];

export function parseSongFeedback(text: string): ParsedSongFeedback | null {
  const trimmed = text.trim();
  const prefix = SONG_RATING_PREFIXES.find((p) => trimmed.startsWith(p));
  if (prefix === undefined) return null;

  const { score, comment, target_date } = parseRatingBody(
    trimmed.slice(prefix.length),
  );
  return { kind: "rating", score, comment, target_date };
}
