import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import type { Credentials } from "google-auth-library";
import { loadJsonCredential, parseCredentialJson } from "./credentials";

/** OAuth クライアントのキーファイル（gcp-oauth.keys.json）から取り出す項目 */
export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

/** キーファイルに redirect_uris が無い場合に使うコールバック（auth.ts の待ち受け先） */
export const DEFAULT_REDIRECT_URI = "http://localhost:3000/oauth2callback";

/** 資格情報の中身を直接渡すための環境変数（クラウドセッション用） */
export const OAUTH_CREDENTIALS_JSON_ENV = "GOOGLE_OAUTH_CREDENTIALS_JSON";

/** トークンの中身を直接渡すための環境変数（クラウドセッション用） */
export const OAUTH_TOKENS_JSON_ENV = "GOOGLE_OAUTH_TOKENS_JSON";

/**
 * OAuth クライアントのキーファイル相当の JSON から、必要な項目を取り出す。
 *
 * Google Cloud が配る `installed` 形式と、client_id / client_secret を直に並べた
 * フラット形式の双方を受ける。redirect_uris が無い場合は既定値で補う。
 */
export function extractOAuthCredentials(json: unknown): OAuthCredentials {
  const root = json as Record<string, any> | null | undefined;
  const source = (root?.installed as Record<string, any> | undefined) ?? root;

  if (
    !source ||
    typeof source.client_id !== "string" ||
    typeof source.client_secret !== "string"
  ) {
    throw new Error(
      "クレデンシャルの形式が不正です (installed または client_id/client_secret が必要)"
    );
  }

  const redirectUris = source.redirect_uris;
  const redirectUri =
    Array.isArray(redirectUris) && typeof redirectUris[0] === "string"
      ? redirectUris[0]
      : DEFAULT_REDIRECT_URI;

  return {
    client_id: source.client_id,
    client_secret: source.client_secret,
    redirect_uri: redirectUri,
  };
}

/**
 * OAuth クライアントの資格情報を読み込む。
 *
 * 中身の環境変数（GOOGLE_OAUTH_CREDENTIALS_JSON）を優先し、
 * 無ければ GOOGLE_OAUTH_CREDENTIALS の指すファイルを読む。
 */
export function loadGoogleOAuthCredentials(): OAuthCredentials {
  return extractOAuthCredentials(
    loadJsonCredential(OAUTH_CREDENTIALS_JSON_ENV, "GOOGLE_OAUTH_CREDENTIALS")
  );
}

/**
 * tokens.json の保存先を決める。
 *
 * GOOGLE_SKILLS_TOKEN_PATH があればそれを使い、無ければ XDG の設定ディレクトリ
 * （未設定ならホーム直下の .config）配下の google-skills/tokens.json を使う。
 */
export function resolveGoogleSkillsTokenPath(
  env: NodeJS.ProcessEnv,
  homeDir: string
): string {
  return (
    env.GOOGLE_SKILLS_TOKEN_PATH ||
    path.join(
      env.XDG_CONFIG_HOME || path.join(homeDir, ".config"),
      "google-skills",
      "tokens.json"
    )
  );
}

/** tokens.json の保存先。google-skills と共有する */
export function getGoogleSkillsTokenPath(): string {
  return resolveGoogleSkillsTokenPath(process.env, homedir());
}

/**
 * アカウントモードごとのトークン束を読み込む。
 *
 * 中身の環境変数（GOOGLE_OAUTH_TOKENS_JSON）を優先し、無ければ tokens.json を読む。
 * `authCommand` は、読めなかったときに案内する再認証コマンド。
 */
export function loadGoogleOAuthTokens(authCommand: string): Record<string, Credentials> {
  const inline = process.env[OAUTH_TOKENS_JSON_ENV];
  if (inline && inline.trim() !== "") {
    return parseCredentialJson(inline, OAUTH_TOKENS_JSON_ENV) as Record<string, Credentials>;
  }

  const tokenPath = getGoogleSkillsTokenPath();
  try {
    return JSON.parse(readFileSync(tokenPath, "utf-8"));
  } catch {
    console.error(`トークンファイルを読み込めませんでした: ${tokenPath}`);
    console.error(`認証を完了してください: ${authCommand}`);
    process.exit(1);
  }
}
