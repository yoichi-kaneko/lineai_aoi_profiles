import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildNpmEnv,
  DEFAULT_MINIMUM_RELEASE_AGE_MINUTES,
  readMinimumReleaseAgeMinutes,
  toMinReleaseAgeDays,
} from "../../scripts/regenerate-functions-lock.mjs";

describe("scripts/regenerate-functions-lock", () => {
  describe("readMinimumReleaseAgeMinutes", () => {
    it("記載が無ければ pnpm の既定値（1440 分）を返す", () => {
      const yaml = "packages:\n  - 'functions'\nminimumReleaseAgeExclude:\n  - foo@1.0.0\n";
      expect(readMinimumReleaseAgeMinutes(yaml)).toBe(1440);
      expect(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES).toBe(1440);
    });

    it("トップレベルの minimumReleaseAge を読む", () => {
      const yaml = "packages:\n  - 'functions'\nminimumReleaseAge: 4320\n";
      expect(readMinimumReleaseAgeMinutes(yaml)).toBe(4320);
    });

    it("行末コメントと CRLF の改行を許容する", () => {
      const yaml = "packages:\r\n  - 'functions'\r\nminimumReleaseAge: 2880 # 2日\r\n";
      expect(readMinimumReleaseAgeMinutes(yaml)).toBe(2880);
    });

    it("0 は待機なしとして読む", () => {
      expect(readMinimumReleaseAgeMinutes("minimumReleaseAge: 0\n")).toBe(0);
    });

    it("minimumReleaseAgeExclude やネストしたキーを取り違えない", () => {
      const yaml = [
        "minimumReleaseAgeExclude:",
        "  - '@aws-sdk/client-ssm@3.1133.0 || 3.1135.0'",
        "catalog:",
        "  minimumReleaseAge: 10",
      ].join("\n");
      expect(readMinimumReleaseAgeMinutes(yaml)).toBe(1440);
    });

    it("0以上の整数として読めない値は既定値に頼らずエラーにする", () => {
      expect(() => readMinimumReleaseAgeMinutes("minimumReleaseAge: abc\n")).toThrow(
        "0以上の整数（分）として読めません",
      );
      expect(() => readMinimumReleaseAgeMinutes("minimumReleaseAge: -1\n")).toThrow(
        "0以上の整数（分）として読めません",
      );
      expect(() => readMinimumReleaseAgeMinutes("minimumReleaseAge: 1.5\n")).toThrow(
        "0以上の整数（分）として読めません",
      );
      expect(() => readMinimumReleaseAgeMinutes("minimumReleaseAge:\n")).toThrow("値なし");
    });

    it("リポジトリの pnpm-workspace.yaml を読める", () => {
      const yaml = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");
      expect(() => readMinimumReleaseAgeMinutes(yaml)).not.toThrow();
    });
  });

  describe("toMinReleaseAgeDays", () => {
    it("1440 分ちょうどは 1 日", () => {
      expect(toMinReleaseAgeDays(1440)).toBe(1);
      expect(toMinReleaseAgeDays(4320)).toBe(3);
    });

    it("端数は切り上げ、npm 側の待機を pnpm より短くしない", () => {
      expect(toMinReleaseAgeDays(1)).toBe(1);
      expect(toMinReleaseAgeDays(1441)).toBe(2);
      expect(toMinReleaseAgeDays(2879)).toBe(2);
    });

    it("0 分は 0 日（待機なし）", () => {
      expect(toMinReleaseAgeDays(0)).toBe(0);
    });
  });

  describe("buildNpmEnv", () => {
    it("npm_config_min_release_age を日数で設定し、他の環境変数を保つ", () => {
      const baseEnv = { PATH: "/usr/bin", npm_config_min_release_age: "0" };
      expect(buildNpmEnv(baseEnv, 2)).toEqual({
        PATH: "/usr/bin",
        npm_config_min_release_age: "2",
      });
      expect(baseEnv.npm_config_min_release_age).toBe("0");
    });
  });
});
