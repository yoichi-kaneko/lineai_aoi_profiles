import { describe, expect, it } from "vitest";
import { NOTE_TYPE, isNoteType, parseNoteType } from "../../src/firebase/noteTypes.js";

describe("firebase/noteTypes", () => {
  it("定義済み type をすべて受け付ける", () => {
    for (const value of Object.values(NOTE_TYPE)) {
      expect(isNoteType(value)).toBe(true);
      expect(parseNoteType(value)).toBe(value);
    }
  });

  it("未知の type は拒否する", () => {
    expect(isNoteType("image_feedback")).toBe(false);
    expect(() => parseNoteType("image_feedback")).toThrow(/許可される値/);
  });
});
