export type TriggerMode = "off_mountain" | "up_mountain" | "stay_mountain" | "talk";

export const TRIGGER_MODE_MAP: { keywords: string[]; mode: TriggerMode }[] = [
  { keywords: ["下山", "無事下山"], mode: "off_mountain" },
  { keywords: ["登山開始"], mode: "up_mountain" },
  { keywords: ["山小屋"], mode: "stay_mountain" },
  { keywords: ["碧衣"], mode: "talk" },
];

/**
 * 起動時に「どのメッセージへの応答か」を渡す必要があるモード。
 *
 * 響（talk）はユーザーの呼びかけへ応答するモードのため、保存した `line_text` の
 * ドキュメントIDと投稿日を渡さないと対象を特定できない。対象を渡せない場合は
 * 別のメッセージを代用させないため、起動そのものを行わない。
 */
const MODES_REQUIRING_TARGET_DOC = new Set<TriggerMode>(["talk"]);

export function requiresTargetDoc(mode: TriggerMode): boolean {
  return MODES_REQUIRING_TARGET_DOC.has(mode);
}

export function findTriggerMode(text: string): TriggerMode | null {
  for (const { keywords, mode } of TRIGGER_MODE_MAP) {
    if (keywords.some((keyword) => text.startsWith(keyword))) {
      return mode;
    }
  }
  return null;
}
