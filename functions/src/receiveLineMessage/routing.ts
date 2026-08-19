export type TriggerMode = "off_mountain" | "up_mountain" | "stay_mountain";

export const TRIGGER_MODE_MAP: { keywords: string[]; mode: TriggerMode }[] = [
  { keywords: ["下山", "無事下山"], mode: "off_mountain" },
  { keywords: ["登山開始"], mode: "up_mountain" },
  { keywords: ["山小屋"], mode: "stay_mountain" },
];

export function findTriggerMode(text: string): TriggerMode | null {
  for (const { keywords, mode } of TRIGGER_MODE_MAP) {
    if (keywords.some((keyword) => text.startsWith(keyword))) {
      return mode;
    }
  }
  return null;
}
