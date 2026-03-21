/**
 * OAuth 再認証スクリプト
 *
 * Calendar + Drive の両スコープで認証し、
 * google-skills と共有の tokens.json に保存します。
 *
 * 使用方法:
 *   npx tsx scripts/auth.ts
 */

import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import path from "path";
import http from "http";
import { OAuth2Client } from "google-auth-library";

// プロジェクトルートの .env を読み込む
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
];

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function getEnvOrExit(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません`);
    process.exit(1);
  }
  return value;
}

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
}

function loadCredentials(): OAuthCredentials {
  const credPath = getEnvOrExit("GOOGLE_OAUTH_CREDENTIALS");
  const content = readFileSync(resolve(credPath), "utf-8");
  const json = JSON.parse(content);

  if (json.installed) {
    return {
      client_id: json.installed.client_id,
      client_secret: json.installed.client_secret,
    };
  } else if (json.client_id && json.client_secret) {
    return {
      client_id: json.client_id,
      client_secret: json.client_secret,
    };
  }
  throw new Error("クレデンシャルファイルの形式が不正です");
}

function getTokenPath(): string {
  return (
    process.env.GOOGLE_SKILLS_TOKEN_PATH ||
    path.join(
      process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
      "google-skills",
      "tokens.json"
    )
  );
}

function loadExistingTokens(tokenPath: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(tokenPath, "utf-8"));
  } catch {
    return {};
  }
}

async function main() {
  const accountMode = process.env.GOOGLE_ACCOUNT_MODE || "normal";
  const credentials = loadCredentials();

  const oauth2Client = new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    redirectUri: REDIRECT_URI,
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
  console.log(`認証後、localhost:${REDIRECT_PORT} にリダイレクトされます...`);
  console.log("─".repeat(60));

  // ローカルサーバーでコールバックを待機
  const code = await new Promise<string>((resolveCode, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname !== "/oauth2callback") {
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

    server.listen(REDIRECT_PORT, () => {
      // サーバー起動済み、ブラウザ操作を待機
    });

    server.on("error", reject);
  });

  console.log("認証コードを受信しました。トークンを取得中...");

  const { tokens } = await oauth2Client.getToken(code);

  // 既存の tokens.json を読み込んで accountMode のエントリを更新
  const tokenPath = getTokenPath();
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
}

main().catch((error) => {
  console.error("エラーが発生しました:", error.message || error);
  process.exit(1);
});
