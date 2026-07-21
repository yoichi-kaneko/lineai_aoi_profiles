/**
 * Firestore の `notes` コレクションにおける `type` フィールドの取りうる値。
 * スキル・モード文書での説明は本ファイルの JSDoc を正とする。
 */
export const NOTE_TYPE = {
  /** 碧衣（エージェント）から後続モードへの引き継ぎメモ。`put_firestore_doc` のデフォルト。 */
  FROM_AOI: "from_aoi",
  /** 帰灯モードが下山直後に残す記録。noon / night が帰灯の実行有無を識別するために参照する。 */
  OFF_MOUNTAIN: "off_mountain",
  /** 門灯モードが入山連絡（家族グループへの送信）後に残す記録。後続モードが山行コンテキストを把握するために参照する。 */
  UP_MOUNTAIN: "up_mountain",
  /** 継灯モードが山小屋到着連絡（家族グループへの送信）後に残す記録。まだ下山しておらず翌日も山行が続くことを示し、小夜モードが山中泊コンテキストを把握するために参照する。 */
  STAY_MOUNTAIN: "stay_mountain",
  /** ユーザーが LINE から送信したテキストメッセージを Webhook で記録したもの。 */
  LINE_TEXT: "line_text",
  /** ユーザーが LINE から送信した画像メッセージを Webhook で記録したもの（description に messageId 等）。 */
  LINE_IMAGE: "line_image",
  /** Google Apps Script 等から共有された位置情報URL（YAMAPから共有される）。 */
  LOCATION_URL: "location_url",
  /**
   * 碧衣が LINE Messaging API で送信しようとしたが失敗し、Firestore に退避した内容。
   * `description` は送信予定のテキスト（および画像・音声の場合は Cloudinary URL 等）と同一粒度。
   * 入方向の `line_text` / `line_image` や、後続向け要約の `from_aoi` とは別。
   */
  LINE_UNDELIVERED: "line_undelivered",
  /** 小夜モードが翌朝の暁モードへ残す一日の概要・引き継ぎメモ。`date` は振り返り対象日（前日）を指定する。 */
  NIGHT_HANDOVER: "night_handover",
  /** 綴葉モードが同日の小夜モードへ残す引き継ぎメモ。SNS本文はユーザーの代筆のため、碧衣→ユーザー視点でのレポートの感想を含める。`date` は当日を指定する。 */
  SCRIBE_HANDOVER: "scribe_handover",
} as const;

/** {@link NOTE_TYPE} の値の union。 */
export type NoteType = (typeof NOTE_TYPE)[keyof typeof NOTE_TYPE];

const NOTE_TYPE_SET = new Set<string>(Object.values(NOTE_TYPE));

export function isNoteType(value: string): value is NoteType {
  return NOTE_TYPE_SET.has(value);
}

/** CLI や検証用。許可されない値のときは例外を投げる。 */
export function parseNoteType(value: string): NoteType {
  if (!isNoteType(value)) {
    throw new Error(
      `不正な type: "${value}"。許可される値: ${Array.from(NOTE_TYPE_SET).sort().join(", ")}`,
    );
  }
  return value;
}
