import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync, createWriteStream, mkdirSync } from "fs";
import { homedir } from "os";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

// プロジェクトルートの .env を読み込む
// scripts/ -> get_google_drive_file/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

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
  redirect_uri: string;
}

function loadCredentials(): OAuthCredentials {
  const credPath = getEnvOrExit("GOOGLE_OAUTH_CREDENTIALS");
  const content = readFileSync(resolve(credPath), "utf-8");
  const json = JSON.parse(content);

  if (json.installed) {
    return {
      client_id: json.installed.client_id,
      client_secret: json.installed.client_secret,
      redirect_uri: json.installed.redirect_uris[0],
    };
  } else if (json.client_id && json.client_secret) {
    return {
      client_id: json.client_id,
      client_secret: json.client_secret,
      redirect_uri: (json.redirect_uris || ["http://localhost:3000/oauth2callback"])[0],
    };
  }
  throw new Error("クレデンシャルファイルの形式が不正です (installed または client_id/client_secret が必要)");
}

function loadTokens(): Record<string, any> {
  const tokenPath =
    process.env.GOOGLE_SKILLS_TOKEN_PATH ||
    path.join(
      process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
      "google-skills",
      "tokens.json"
    );
  try {
    const content = readFileSync(tokenPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`トークンファイルを読み込めませんでした: ${tokenPath}`);
    console.error("認証を完了してください: npx tsx scripts/auth.ts");
    process.exit(1);
  }
}

async function main() {
  const fileId = process.argv[2];

  if (!fileId) {
    console.error("使用方法: npx tsx scripts/download_file.ts <fileId>");
    console.error("例: npx tsx scripts/download_file.ts 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
    process.exit(1);
  }

  const accountMode = process.env.GOOGLE_ACCOUNT_MODE || "normal";

  const credentials = loadCredentials();
  const allTokens = loadTokens();
  const tokens = allTokens[accountMode];

  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    console.error(`アカウント "${accountMode}" のトークンが見つかりません。`);
    console.error("google-calendar-mcp で認証を完了してください: npm run auth");
    process.exit(1);
  }

  const oauth2Client = new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    redirectUri: credentials.redirect_uri,
  });
  oauth2Client.setCredentials(tokens);

  // アクセストークンが期限切れ (または5分以内に期限切れ) の場合はリフレッシュ
  const expiryDate = oauth2Client.credentials.expiry_date;
  const isExpired = expiryDate
    ? Date.now() >= expiryDate - 5 * 60 * 1000
    : !oauth2Client.credentials.access_token;

  if (isExpired && oauth2Client.credentials.refresh_token) {
    const { credentials: newCreds } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(newCreds);
  }

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  // ファイルメタデータを取得してファイル名を決定
  const metaResponse = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
  });
  const { name: fileName, mimeType } = metaResponse.data;

  if (!fileName) {
    console.error("ファイル名を取得できませんでした");
    process.exit(1);
  }

  // tmp ディレクトリを作成
  const tmpDir = resolve(__dirname, "../../../../tmp");
  mkdirSync(tmpDir, { recursive: true });

  const outputPath = path.join(tmpDir, fileName);

  // ファイルをストリームでダウンロード
  const downloadResponse = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise<void>((resolvePromise, reject) => {
    const dest = createWriteStream(outputPath);
    (downloadResponse.data as NodeJS.ReadableStream)
      .on("error", reject)
      .pipe(dest)
      .on("error", reject)
      .on("finish", resolvePromise);
  });

  const result = {
    fileId,
    fileName,
    mimeType,
    savedPath: outputPath,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error.message || error);
  process.exit(1);
});
