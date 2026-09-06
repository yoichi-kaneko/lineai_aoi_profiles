import { describe, expect, it } from "vitest";
import {
  buildChildEnv,
  buildCodexArgs,
  parseArgs,
  resolveConfig,
} from "../../src/codex/review.js";

describe("codex/review", () => {
  describe("parseArgs", () => {
    it("依頼文のパスを受け取り、出力先は既定値を使う", () => {
      expect(parseArgs(["tmp/codex_review_input.md"])).toEqual({
        inputPath: "tmp/codex_review_input.md",
        outputPath: "tmp/codex_review_result.md",
      });
    });

    it("--out で出力先を指定できる", () => {
      expect(
        parseArgs(["tmp/in.md", "--out", "tmp/out.md"]),
      ).toEqual({ inputPath: "tmp/in.md", outputPath: "tmp/out.md" });
    });

    it("依頼文のパスが無ければ拒否する", () => {
      expect(() => parseArgs([])).toThrow("レビュー依頼文のファイルパス");
      expect(() => parseArgs(["--out", "tmp/out.md"])).toThrow(
        "レビュー依頼文のファイルパス",
      );
    });

    it("--out の値が欠けていれば拒否する", () => {
      expect(() => parseArgs(["tmp/in.md", "--out"])).toThrow("--out には");
      expect(() => parseArgs(["tmp/in.md", "--out", "--foo"])).toThrow("--out には");
    });

    it("不明なオプション・余分な引数を拒否する", () => {
      expect(() => parseArgs(["tmp/in.md", "--bogus"])).toThrow("不明なオプション");
      expect(() => parseArgs(["tmp/in.md", "tmp/other.md"])).toThrow("引数が多すぎます");
    });
  });

  describe("resolveConfig", () => {
    it("未設定なら有効・既定タイムアウト・モデルと強度は未指定", () => {
      expect(resolveConfig({})).toEqual({
        enabled: true,
        timeoutMs: 240_000,
        model: undefined,
        effort: undefined,
      });
    });

    it("CODEX_REVIEW_ENABLED の否定値でのみ無効になる", () => {
      for (const value of ["false", "FALSE", "0", "no", "off"]) {
        expect(resolveConfig({ CODEX_REVIEW_ENABLED: value }).enabled).toBe(false);
      }
      for (const value of ["true", "1", "yes", ""]) {
        expect(resolveConfig({ CODEX_REVIEW_ENABLED: value }).enabled).toBe(true);
      }
    });

    it("タイムアウトを秒で受け取りミリ秒へ直す", () => {
      expect(resolveConfig({ CODEX_REVIEW_TIMEOUT_SEC: "90" }).timeoutMs).toBe(90_000);
    });

    it("壊れたタイムアウト指定は既定値へ落として警告する", () => {
      const warnings: string[] = [];
      const config = resolveConfig(
        { CODEX_REVIEW_TIMEOUT_SEC: "0" },
        (message) => warnings.push(message),
      );
      expect(config.timeoutMs).toBe(240_000);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("CODEX_REVIEW_TIMEOUT_SEC");
    });

    it("推論強度は許可された値のみ採用し、それ以外は未指定へ落とす", () => {
      expect(resolveConfig({ CODEX_REVIEW_EFFORT: "LOW" }).effort).toBe("low");

      const warnings: string[] = [];
      const config = resolveConfig(
        { CODEX_REVIEW_EFFORT: "ultra" },
        (message) => warnings.push(message),
      );
      expect(config.effort).toBeUndefined();
      expect(warnings[0]).toContain("CODEX_REVIEW_EFFORT");
    });

    it("モデル名は前後の空白を落として受け取る", () => {
      expect(resolveConfig({ CODEX_REVIEW_MODEL: "  gpt-6-astra " }).model).toBe(
        "gpt-6-astra",
      );
      expect(resolveConfig({ CODEX_REVIEW_MODEL: "   " }).model).toBeUndefined();
    });
  });

  describe("buildCodexArgs", () => {
    it("読み取り専用・stdin 入力の codex exec を組み立てる", () => {
      expect(buildCodexArgs({})).toEqual([
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--color",
        "never",
        "-o",
        "codex_review_output.md",
        "-",
      ]);
    });

    it("モデルと推論強度を指定した場合のみ引数へ足す", () => {
      const args = buildCodexArgs({ model: "gpt-6-astra", effort: "low" });
      expect(args).toContain("--model");
      expect(args[args.indexOf("--model") + 1]).toBe("gpt-6-astra");
      expect(args[args.indexOf("-c") + 1]).toBe("model_reasoning_effort='low'");
      // stdin 入力の指定は必ず末尾に置く
      expect(args[args.length - 1]).toBe("-");
    });

    it("引数に空白を含めない（Windows の shell 経由でも壊れないこと）", () => {
      const args = buildCodexArgs({ model: "gpt-6-astra", effort: "xhigh" });
      for (const arg of args) {
        expect(arg).not.toContain(" ");
      }
    });
  });

  describe("buildChildEnv", () => {
    it("実行に必要な変数だけを渡す", () => {
      const childEnv = buildChildEnv({
        PATH: "/usr/bin",
        HOME: "/home/ec2-user",
        CODEX_HOME: "/home/ec2-user/.codex",
        HTTPS_PROXY: "http://proxy:8080",
      });
      expect(childEnv).toEqual({
        PATH: "/usr/bin",
        HOME: "/home/ec2-user",
        CODEX_HOME: "/home/ec2-user/.codex",
        HTTPS_PROXY: "http://proxy:8080",
      });
    });

    it("dotenv が展開した碧衣の認証情報を渡さない", () => {
      const childEnv = buildChildEnv({
        PATH: "/usr/bin",
        LINE_CHANNEL_ACCESS_TOKEN: "line_secret",
        TODOIST_API_TOKEN: "todoist_secret",
        TWITTER_API_SECRET: "twitter_secret",
        OPENAI_GPT_API_KEY: "gpt_image_secret",
        CLOUDINARY_API_SECRET: "cloudinary_secret",
      });
      expect(Object.keys(childEnv)).toEqual(["PATH"]);
    });

    it("未設定の変数はキーごと落とす", () => {
      expect(buildChildEnv({ PATH: undefined, HOME: "/root" })).toEqual({
        HOME: "/root",
      });
    });
  });
});
