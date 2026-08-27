import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  isPolicyComment,
  resolveCommentsInput,
  splitPolicyComments,
} from "../../src/todoist/get_comments.js";

describe("isPolicyComment", () => {
  it("全角の目印で始まるコメントを方針コメントと判定する", () => {
    expect(isPolicyComment("【対応方針】この記述を削除する")).toBe(true);
  });

  it("半角の目印も受け付ける", () => {
    expect(isPolicyComment("[対応方針]この記述を削除する")).toBe(true);
  });

  it("目印の前の空白・改行は無視する", () => {
    expect(isPolicyComment("\n  【対応方針】この記述を削除する")).toBe(true);
  });

  it("目印が先頭に無いものは方針コメントとしない", () => {
    expect(isPolicyComment("修正しました。【対応方針】は別コメントです")).toBe(false);
  });

  it("目印の無いコメントは方針コメントとしない", () => {
    expect(isPolicyComment("対応しました。ありがとうございます")).toBe(false);
  });

  it("content が無い場合も方針コメントとしない", () => {
    expect(isPolicyComment(null)).toBe(false);
    expect(isPolicyComment(undefined)).toBe(false);
  });
});

describe("splitPolicyComments", () => {
  it("方針コメントを除いた一覧と除外件数を返す", () => {
    const comments = [
      { content: "【対応方針】night.md のステップ5を直す" },
      { content: "対応しました" },
      { content: "[対応方針] スキルを追加する" },
    ];

    expect(splitPolicyComments(comments)).toEqual({
      visible: [{ content: "対応しました" }],
      excludedPolicyComments: 2,
    });
  });

  it("方針コメントが無ければ除外件数は0になる", () => {
    const comments = [{ content: "対応しました" }];
    expect(splitPolicyComments(comments)).toEqual({
      visible: comments,
      excludedPolicyComments: 0,
    });
  });

  it("コメントが空でも壊れない", () => {
    expect(splitPolicyComments([])).toEqual({ visible: [], excludedPolicyComments: 0 });
  });
});

describe("resolveCommentsInput", () => {
  it("ID を渡すと既定では方針コメントを除外する", () => {
    expect(resolveCommentsInput(["6hMrP2PjpPv46vQq"])).toEqual({
      taskId: "6hMrP2PjpPv46vQq",
      includePolicy: false,
    });
  });

  it("URL を渡すと ID へ正規化する", () => {
    expect(
      resolveCommentsInput(["https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq"])
    ).toEqual({ taskId: "6hMrP2PjpPv46vQq", includePolicy: false });
  });

  it("--include-policy を付けると方針コメントも取得する", () => {
    expect(resolveCommentsInput(["6hMrP2PjpPv46vQq", "--include-policy"]).includePolicy).toBe(true);
  });

  it("フラグが先に来ても受け付ける", () => {
    expect(resolveCommentsInput(["--include-policy", "6hMrP2PjpPv46vQq"])).toEqual({
      taskId: "6hMrP2PjpPv46vQq",
      includePolicy: true,
    });
  });

  it("引数が無い場合は ArgumentError を投げる", () => {
    expect(() => resolveCommentsInput([])).toThrow(ArgumentError);
  });

  it("未知のオプションは ArgumentError を投げる", () => {
    expect(() => resolveCommentsInput(["6hMrP2PjpPv46vQq", "--include-all"])).toThrow(
      /未知のオプション: --include-all/
    );
  });

  it("タスクを2件以上渡すと ArgumentError を投げる", () => {
    expect(() => resolveCommentsInput(["6hMrP2PjpPv46vQq", "6hCfG9G7P29JHMjH"])).toThrow(
      /引数が多すぎます/
    );
  });
});
