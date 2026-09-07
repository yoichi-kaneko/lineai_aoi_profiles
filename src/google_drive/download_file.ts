import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { createWriteStream, mkdirSync } from "fs";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import {
  loadGoogleOAuthCredentials,
  loadGoogleOAuthTokens,
} from "../util/google_oauth";

// プロジェクトルートの .env を読み込む
// src/google_drive/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

async function main() {
  const fileId = process.argv[2];

  if (!fileId) {
    console.error("使用方法: npx tsx src/google_drive/download_file.ts <fileId>");
    console.error("例: npx tsx src/google_drive/download_file.ts 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
    process.exit(1);
  }

  const accountMode = process.env.GOOGLE_ACCOUNT_MODE || "normal";

  const credentials = loadGoogleOAuthCredentials();
  const allTokens = loadGoogleOAuthTokens("npx tsx src/google_drive/auth.ts");
  const tokens = allTokens[accountMode];

  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    console.error(`アカウント "${accountMode}" のトークンが見つかりません。`);
    console.error("認証を完了してください: npx tsx src/google_drive/auth.ts");
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
  const tmpDir = resolve(__dirname, "../../tmp");
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
