/**
 * OAuth 再認証スクリプト
 *
 * Calendar + Drive の両スコープで認証し、
 * google-skills と共有の tokens.json に保存します。
 *
 * 使用方法:
 *   npx tsx src/google_calendar/auth.ts
 *
 * ブラウザでの同意と localhost へのリダイレクトが必要なため、ブラウザのクラウド
 * セッション（Claude Code on the web）では実行できません。クラウド側では、ここで
 * 作った tokens.json の中身を環境変数 GOOGLE_OAUTH_TOKENS_JSON に渡して使います。
 */

import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import http from "http";
import { OAuth2Client } from "google-auth-library";
import {
  getGoogleSkillsTokenPath,
  loadGoogleOAuthCredentials,
  OAUTH_TOKENS_JSON_ENV,
  parseLocalRedirectListener,
} from "../util/google_oauth";

// プロジェクトルートの .env を読み込む
// src/google_calendar/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
];

function loadExistingTokens(tokenPath: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(tokenPath, "utf-8"));
  } catch {
    return {};
  }
}

async function main() {
  const accountMode = process.env.GOOGLE_ACCOUNT_MODE || "normal";
  const credentials = loadGoogleOAuthCredentials();
  const redirect = parseLocalRedirectListener(credentials.redirect_uri);

  const oauth2Client = new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    redirectUri: redirect.redirectUri,
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // refresh_token を確実に取得するために強制
  });

  console.log("─".repeat(60));
  console.log("Google OAuth 認証");
  console.log("─".repeat(60));
  console.log("付与するスコープ:");
  SCOPES.forEach((s) => console.log(`  - ${s}`));
  console.log();
  console.log("以下の URL をブラウザで開いて認証してください:");
  console.log();
  console.log(authUrl);
  console.log();
  console.log(`認証後、${redirect.redirectUri} にリダイレクトされます...`);
  console.log("─".repeat(60));

  // ローカルサーバーでコールバックを待機
  const code = await new Promise<string>((resolveCode, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${redirect.port}`);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>認証エラー: ${error}</h1><p>このウィンドウを閉じてください。</p>`);
        server.close();
        reject(new Error(`OAuth エラー: ${error}`));
        return;
      }

      const authCode = url.searchParams.get("code");
      if (!authCode) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>認証コードが見つかりません</h1>");
        server.close();
        reject(new Error("認証コードが取得できませんでした"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h1>認証完了</h1><p>このウィンドウを閉じてターミナルに戻ってください。</p>"
      );
      server.close();
      resolveCode(authCode);
    });

    server.listen(redirect.port, () => {
      // サーバー起動済み、ブラウザ操作を待機
    });

    server.on("error", reject);
  });

  console.log("認証コードを受信しました。トークンを取得中...");

  const { tokens } = await oauth2Client.getToken(code);

  // 既存の tokens.json を読み込んで accountMode のエントリを更新
  const tokenPath = getGoogleSkillsTokenPath();
  const allTokens = loadExistingTokens(tokenPath);
  allTokens[accountMode] = tokens;

  mkdirSync(path.dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(allTokens, null, 2), "utf-8");

  console.log();
  console.log("─".repeat(60));
  console.log("認証成功!");
  console.log(`アカウント: ${accountMode}`);
  console.log(`スコープ  : ${tokens.scope}`);
  console.log(`保存先    : ${tokenPath}`);
  console.log("─".repeat(60));

  // 中身の環境変数が設定されていると実行時はそちらが使われ、保存したファイルは読まれない
  if (process.env[OAUTH_TOKENS_JSON_ENV]) {
    console.log();
    console.log(`注意: 環境変数 ${OAUTH_TOKENS_JSON_ENV} が設定されています。`);
    console.log("      実行時はそちらが優先されるため、いま保存したトークンを使うには");
    console.log("      この環境変数も更新してください（README の「クラウドセッションへの");
    console.log("      資格情報の受け渡し」を参照）。");
  }
}

main().catch((error) => {
  console.error("エラーが発生しました:", error.message || error);
  process.exit(1);
});
