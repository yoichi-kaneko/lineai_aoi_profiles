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
  /** ユーザーが LINE から送信したテキストメッセージを Webhook で記録したもの。 */
  LINE_TEXT: "line_text",
  /** ユーザーが LINE から送信した画像メッセージを Webhook で記録したもの（description に messageId 等）。 */
  LINE_IMAGE: "line_image",
  /** Google Apps Script 等から共有された位置情報URL（YAMAPから共有される）。 */
  LOCATION_URL: "location_url",
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
