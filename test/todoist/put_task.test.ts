import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseArgs,
  readDescriptionFile,
  resolveTaskInput,
  validateFlags,
} from "../../src/todoist/put_task.js";

describe("parseArgs", () => {
  it("位置引数とオプションを分けて返す", () => {
    expect(parseArgs(["タスク", "--description-file", "tmp/todoist_task.txt"])).toEqual({
      positionals: ["タスク"],
      flags: { "description-file": "tmp/todoist_task.txt" },
    });
  });

  it("--key=value 形式を受け付ける", () => {
    expect(parseArgs(["タスク", "--description-file=tmp/todoist_task.txt"]).flags).toEqual({
      "description-file": "tmp/todoist_task.txt",
    });
  });

  it("値を伴わないオプションは空文字として扱う", () => {
    expect(parseArgs(["タスク", "--description-file"]).flags).toEqual({
      "description-file": "",
    });
  });
});

describe("validateFlags", () => {
  it("サポート対象のフラグのみならエラーにならない", () => {
    expect(() => validateFlags({ "description-file": "tmp/todoist_task.txt" })).not.toThrow();
  });

  it("未知のフラグは ArgumentError を投げる", () => {
    expect(() => validateFlags({ "descripton-file": "tmp/todoist_task.txt" })).toThrow(
      /未知のオプション: --descripton-file/
    );
  });
});

describe("readDescriptionFile", () => {
  let root: string;
  let tmpDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "put-task-test-"));
    tmpDir = join(root, "tmp");
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("tmp/ 配下のファイル内容を返す", () => {
    writeFileSync(join(tmpDir, "todoist_task.txt"), "1行目\n2行目\n");

    expect(readDescriptionFile("tmp/todoist_task.txt", root)).toBe("1行目\n2行目\n");
  });

  it("tmp/ 外のパスは ArgumentError を投げる", () => {
    writeFileSync(join(root, ".env"), "SECRET=1");

    expect(() => readDescriptionFile(".env", root)).toThrow(/tmp\/ 配下/);
  });

  it("空ファイルは ArgumentError を投げる", () => {
    writeFileSync(join(tmpDir, "empty.txt"), "   \n");

    expect(() => readDescriptionFile("tmp/empty.txt", root)).toThrow(/中身が空です/);
  });

  it("存在しないファイルは ArgumentError を投げる", () => {
    expect(() => readDescriptionFile("tmp/missing.txt", root)).toThrow(/読み込みに失敗しました/);
  });

  it.skipIf(process.platform === "win32")(
    "シンボリックリンクで tmp/ 外へ脱出するパスは拒否する",
    () => {
      const secretPath = join(root, "secret.txt");
      writeFileSync(secretPath, "secret content");
      symlinkSync(secretPath, join(tmpDir, "escape.txt"));

      expect(() => readDescriptionFile("tmp/escape.txt", root)).toThrow(/tmp\/ 配下/);
    }
  );
});

describe("resolveTaskInput", () => {
  let root: string;
  let tmpDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "put-task-resolve-"));
    tmpDir = join(root, "tmp");
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("タイトルのみを解決する", () => {
    expect(resolveTaskInput(["タスクタイトル"], root)).toEqual({
      content: "タスクタイトル",
      description: undefined,
    });
  });

  it("--description-file で詳細を解決する", () => {
    writeFileSync(join(tmpDir, "todoist_task.txt"), "詳細本文");

    expect(resolveTaskInput(["タスク", "--description-file", "tmp/todoist_task.txt"], root)).toEqual(
      {
        content: "タスク",
        description: "詳細本文",
      }
    );
  });

  it("content が無い場合は使用方法付き ArgumentError を投げる", () => {
    expect(() => resolveTaskInput([], root)).toThrow(
      expect.objectContaining({ name: "ArgumentError", showUsage: true })
    );
  });

  it("第2位置引数での description 指定を拒否する", () => {
    expect(() => resolveTaskInput(["タイトル", "詳細"], root)).toThrow(/位置引数で渡すことはできません/);
  });

  it("未知のオプションを拒否する", () => {
    expect(() =>
      resolveTaskInput(["タイトル", "--descripton-file", "tmp/todoist_task.txt"], root)
    ).toThrow(/未知のオプション/);
  });

  it("--description-file が空の場合は ArgumentError を投げる", () => {
    expect(() => resolveTaskInput(["タイトル", "--description-file"], root)).toThrow(
      /ファイルパスを指定してください/
    );
  });
});
