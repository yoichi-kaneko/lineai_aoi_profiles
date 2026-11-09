import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
dotenv.config({ path: resolve(PROJECT_ROOT, ".env"), quiet: true });

/**
 * 値を標準出力へ返してよい環境変数の許可リスト。
 *
 * `.env` には API キー・トークン・資格情報のパスも並ぶため、碧衣の手順でファイルを直接読ませず、
 * このリストに載せた変数だけを本スクリプト経由で渡す。秘密情報に当たる変数は加えないこと。
 */
export const PUBLIC_ENV_KEYS = ["OPENAI_GPT_GENERATE_IMAGE_MODEL"] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

/** 許可リストに載っている環境変数名かを判定する。 */
export function isPublicEnvKey(name: string): name is PublicEnvKey {
  return (PUBLIC_ENV_KEYS as readonly string[]).includes(name);
}

/**
 * 指定された環境変数の値を、許可リストに載っているものに限って返す。
 * 許可リスト外の名前が1つでも含まれる場合は、どの値も返さずにエラーとする。未設定・空の値もエラーとする。
 */
export function resolvePublicEnv(
  names: string[],
  env: NodeJS.ProcessEnv,
): Record<PublicEnvKey, string> {
  if (names.length === 0) {
    throw new Error("環境変数名を1つ以上指定してください");
  }

  const disallowed = names.filter((name) => !isPublicEnvKey(name));
  if (disallowed.length > 0) {
    throw new Error(`読み取りを許可していない環境変数です: ${disallowed.join(", ")}`);
  }

  const result = {} as Record<PublicEnvKey, string>;
  for (const name of names as PublicEnvKey[]) {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`環境変数 ${name} が設定されていません`);
    }
    result[name] = value;
  }
  return result;
}

function printUsage() {
  console.error("使用方法: pnpm exec tsx src/util/get_public_env.ts <環境変数名> [環境変数名 ...]");
  console.error(`読み取りを許可している環境変数: ${PUBLIC_ENV_KEYS.join(", ")}`);
}

const isDirectRun =
  !!process.argv[1] && process.argv[1].endsWith("get_public_env.ts");

function main() {
  const names = process.argv.slice(2);

  if (names.length === 0) {
    printUsage();
    process.exit(1);
  }

  console.log(JSON.stringify(resolvePublicEnv(names, process.env), null, 2));
}

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
