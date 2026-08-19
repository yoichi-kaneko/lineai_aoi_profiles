import { describe, expect, it } from "vitest";
import { normalizeMurekaLyrics } from "../../src/mureka/generate_lyrics.js";

describe("mureka/generate_lyrics", () => {
  it("リテラルエスケープと余計な記号を正規化する", () => {
    expect(normalizeMurekaLyrics('\\"hello\\"\\n[Verse]",')).toBe('"hello"\n[Verse]');
  });
});
