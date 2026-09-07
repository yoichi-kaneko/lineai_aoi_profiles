import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 資格情報の取得元。
 *
 * `inline` は JSON の中身を直に入れた環境変数、`path` は従来どおりのファイルパス。
 */
export type CredentialSource =
  | { kind: "inline"; value: string }
  | { kind: "path"; value: string };

/**
 * 中身の環境変数とパス指定の環境変数の、どちらを取得元にするかを決める。
 *
 * ブラウザのクラウドセッション（Claude Code on the web）はコンテナが揮発的で、
 * 資格情報のファイルを持ち込めない。渡せるのは環境変数だけなので、
 * 「JSON の中身を入れた環境変数」を先に見る。ローカルは従来どおりパス指定で動く。
 *
 * どちらも未設定（または空白のみ）の場合は null を返す。
 */
export function resolveCredentialSource(
  inlineValue: string | undefined,
  pathValue: string | undefined
): CredentialSource | null {
  if (inlineValue && inlineValue.trim() !== "") {
    return { kind: "inline", value: inlineValue };
  }
  if (pathValue && pathValue.trim() !== "") {
    return { kind: "path", value: pathValue };
  }
  return null;
}

/**
 * 中身の環境変数の値を JSON として解釈する。
 *
 * 生の JSON と、それを base64 に符号化したものの双方を受ける。環境変数の入力欄は
 * 改行や引用符の扱いが環境ごとに異なるため、base64 でも渡せるようにしてある。
 */
export function parseCredentialJson(value: string, envName: string): unknown {
  const trimmed = value.trim();
  const raw = trimmed.startsWith("{") ? trimmed : decodeBase64(trimmed, envName);

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `環境変数 ${envName} の値を JSON として解釈できませんでした。JSON そのものか、その base64 を設定してください`
    );
  }
}

function decodeBase64(value: string, envName: string): string {
  // 環境変数の入力欄で折り返されることがあるため、空白を落としてから検査する
  const compact = value.replace(/\s+/g, "");

  if (compact === "" || !/^[A-Za-z0-9+/\-_]+={0,2}$/.test(compact)) {
    throw new Error(`環境変数 ${envName} の値が JSON でも base64 でもありません`);
  }

  return Buffer.from(compact, "base64").toString("utf-8");
}

/**
 * JSON 形式の資格情報を読み込む。
 *
 * `inlineEnv`（中身）が設定されていればそれを使い、無ければ `pathEnv` の指すファイルを読む。
 * どちらも未設定なら、設定すべき環境変数を示して終了する。
 */
export function loadJsonCredential(inlineEnv: string, pathEnv: string): unknown {
  const source = resolveCredentialSource(process.env[inlineEnv], process.env[pathEnv]);

  if (!source) {
    console.error(`環境変数 ${pathEnv}（または ${inlineEnv}）が設定されていません`);
    process.exit(1);
  }

  if (source.kind === "inline") {
    return parseCredentialJson(source.value, inlineEnv);
  }

  return JSON.parse(readFileSync(resolve(source.value), "utf-8"));
}
