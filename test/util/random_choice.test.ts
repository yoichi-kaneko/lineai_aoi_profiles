import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseWeightedChoice,
  selectWeighted,
} from "../../src/util/random_choice.js";

describe("util/random_choice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("重み付き選択肢を解析する", () => {
    expect(parseWeightedChoice("ラーメン:70")).toEqual({ choice: "ラーメン", weight: 70 });
  });

  it("形式不正の重み付き選択肢を拒否する", () => {
    expect(() => parseWeightedChoice("ラーメン")).toThrow("重み付き選択肢は");
    expect(() => parseWeightedChoice("ラーメン:-1")).toThrow("重みは0以上");
  });

  it("乱数値に応じて重み付き index を返す", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.79);
    expect(
      selectWeighted([
        { choice: "A", weight: 70 },
        { choice: "B", weight: 30 },
      ]),
    ).toBe(1);
  });

  it("重み合計 0 は拒否する", () => {
    expect(() =>
      selectWeighted([
        { choice: "A", weight: 0 },
        { choice: "B", weight: 0 },
      ]),
    ).toThrow("重みの合計は1以上");
  });
});
