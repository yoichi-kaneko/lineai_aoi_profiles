import { describe, expect, it } from "vitest";
import { parseTaskId, TaskUrlError } from "../../src/todoist/task_url.js";

describe("parseTaskId", () => {
  it("スラッグ付きURLからIDを取り出す", () => {
    expect(parseTaskId("https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq")).toBe(
      "6hMrP2PjpPv46vQq"
    );
  });

  it("数字だけのスラッグでもIDを取り出す", () => {
    expect(parseTaskId("https://app.todoist.com/app/task/9-6hJJrFfGVRp79hFH")).toBe(
      "6hJJrFfGVRp79hFH"
    );
  });

  it("スラッグが無いURLからIDを取り出す", () => {
    expect(parseTaskId("https://app.todoist.com/app/task/6hCfG9G7P29JHMjH")).toBe(
      "6hCfG9G7P29JHMjH"
    );
  });

  it("ハイフンを複数含むスラッグでも末尾をIDとして扱う", () => {
    expect(parseTaskId("https://app.todoist.com/app/task/line-stamp-6hJrJvvfxV2WWH5H")).toBe(
      "6hJrJvvfxV2WWH5H"
    );
  });

  it("クエリやフラグメントが付いていても取り出せる", () => {
    expect(parseTaskId("https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq?foo=1#bar")).toBe(
      "6hMrP2PjpPv46vQq"
    );
  });

  it("todoist.com 直下のURLも受け付ける", () => {
    expect(parseTaskId("https://todoist.com/app/task/6hCfG9G7P29JHMjH")).toBe("6hCfG9G7P29JHMjH");
  });

  it("ID を直接渡した場合はそのまま返す", () => {
    expect(parseTaskId("6hMrP2PjpPv46vQq")).toBe("6hMrP2PjpPv46vQq");
  });

  it("前後の空白を無視する", () => {
    expect(parseTaskId("  https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq  ")).toBe(
      "6hMrP2PjpPv46vQq"
    );
  });

  it("空文字は TaskUrlError を投げる", () => {
    expect(() => parseTaskId("   ")).toThrow(TaskUrlError);
  });

  it("Todoist 以外のホストは TaskUrlError を投げる", () => {
    expect(() => parseTaskId("https://example.com/app/task/6hMrP2PjpPv46vQq")).toThrow(
      /Todoist の URL ではありません/
    );
  });

  it("タスク以外のURLは TaskUrlError を投げる", () => {
    expect(() => parseTaskId("https://app.todoist.com/app/project/6fxCf2fHvfvRFVfq")).toThrow(
      /タスクの URL ではありません/
    );
  });

  it("task の後ろにセグメントが無いURLは TaskUrlError を投げる", () => {
    expect(() => parseTaskId("https://app.todoist.com/app/task")).toThrow(
      /タスクの URL ではありません/
    );
  });

  it("英数字以外を含む文字列は TaskUrlError を投げる", () => {
    expect(() => parseTaskId("task_6hMrP2PjpPv46vQq")).toThrow(
      /タスクIDまたはタスクURLとして解釈できません/
    );
  });
});
