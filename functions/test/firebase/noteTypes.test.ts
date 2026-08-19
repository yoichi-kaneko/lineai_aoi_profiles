import { describe, expect, it } from "vitest";
import { NOTE_TYPE, isNoteType, parseNoteType } from "../../src/firebase/noteTypes";

describe("functions/firebase/noteTypes", () => {
  it("定義済み type を受け付ける", () => {
    for (const value of Object.values(NOTE_TYPE)) {
      expect(isNoteType(value)).toBe(true);
      expect(parseNoteType(value)).toBe(value);
    }
  });

  it("ルート側だけにある scribe_handover を含む未知値を拒否する", () => {
    expect(isNoteType("scribe_handover")).toBe(false);
    expect(() => parseNoteType("scribe_handover")).toThrow(/許可される値/);
  });
});
