import { describe, expect, it } from "vitest";
import {
  isPublicEnvKey,
  resolvePublicEnv,
} from "../../src/util/get_public_env.js";

describe("util/get_public_env", () => {
  it("許可リストに載っている変数名だけを公開可能と判定する", () => {
    expect(isPublicEnvKey("OPENAI_GPT_GENERATE_IMAGE_MODEL")).toBe(true);
    expect(isPublicEnvKey("OPENAI_GPT_API_KEY")).toBe(false);
  });

  it("許可リストの変数の値を返す", () => {
    expect(
      resolvePublicEnv(["OPENAI_GPT_GENERATE_IMAGE_MODEL"], {
        OPENAI_GPT_GENERATE_IMAGE_MODEL: " image-model-x ",
      }),
    ).toEqual({ OPENAI_GPT_GENERATE_IMAGE_MODEL: "image-model-x" });
  });

  it("許可リスト外の変数が含まれる場合は、値を返さずに拒否する", () => {
    const env = {
      OPENAI_GPT_GENERATE_IMAGE_MODEL: "image-model-x",
      OPENAI_GPT_API_KEY: "secret-value",
    };
    expect(() =>
      resolvePublicEnv(["OPENAI_GPT_GENERATE_IMAGE_MODEL", "OPENAI_GPT_API_KEY"], env),
    ).toThrow("読み取りを許可していない環境変数です: OPENAI_GPT_API_KEY");

    let message = "";
    try {
      resolvePublicEnv(["OPENAI_GPT_API_KEY"], env);
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("読み取りを許可していない環境変数です");
    expect(message).not.toContain("secret-value");
  });

  it("未設定・空の値はエラーにする", () => {
    expect(() => resolvePublicEnv(["OPENAI_GPT_GENERATE_IMAGE_MODEL"], {})).toThrow(
      "環境変数 OPENAI_GPT_GENERATE_IMAGE_MODEL が設定されていません",
    );
    expect(() =>
      resolvePublicEnv(["OPENAI_GPT_GENERATE_IMAGE_MODEL"], {
        OPENAI_GPT_GENERATE_IMAGE_MODEL: "  ",
      }),
    ).toThrow("設定されていません");
  });

  it("変数名の指定が無い場合はエラーにする", () => {
    expect(() => resolvePublicEnv([], {})).toThrow("1つ以上指定してください");
  });
});
