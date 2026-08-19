import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import { google, calendar_v3 } from "googleapis";

// プロジェクトルートの .env を読み込む
// src/google_calendar/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

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
    console.error("認証を完了してください: npx tsx src/google_calendar/auth.ts");
    process.exit(1);
  }
}

/**
 * 指定タイムゾーンにおける、与えられた日付のUTCオフセット文字列を返す
 * 例: "Asia/Tokyo" -> "+09:00", "America/New_York" (EST) -> "-05:00"
 */
export function getTimezoneOffsetString(timezone: string, dateStr: string): string {
  const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
  // その日の正午UTC を基準にオフセットを取得 (DST境界の誤検知を防ぐため)
  const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).format(refDate);

  const match = formatted.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return "Z";

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] || "0").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

/** ISO datetime 文字列 (例: "2026-03-08T00:00:00") にタイムゾーンオフセットを付加して RFC3339 に変換 */
export function toRFC3339(datetime: string, timezone: string): string {
  const offset = getTimezoneOffsetString(timezone, datetime);
  return `${datetime}${offset}`;
}

/** 文字列が実在する "YYYY-MM-DD" 形式の日付かを検証する */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateStr;
}

/** "YYYY-MM-DD" の前日を "YYYY-MM-DD" で返す (実行環境のローカルタイムゾーンに影響されないよう UTC 基準で計算) */
export function previousDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * 終日予定の「実際の最終日」を返す。
 *
 * Google Calendar の終日予定は end.date が排他 (非包含) であり、
 * 例えば 8/15〜8/16 の2日間の予定は end.date = "2026-08-17" として返る。
 * そのため実際の最終日は end.date の前日となる。
 * 時刻付き予定 (dateTime)、date の欠落・不正、end.date <= start.date の場合は
 * undefined を返す。
 */
export function resolveAllDayLastDate(event: calendar_v3.Schema$Event): string | undefined {
  const startDate = event.start?.date;
  const endDate = event.end?.date;
  if (!startDate || !endDate) return undefined;
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) return undefined;
  if (endDate <= startDate) return undefined;

  return previousDay(endDate);
}

export function formatEvent(event: calendar_v3.Schema$Event): object {
  const allDayLastDate = resolveAllDayLastDate(event);

  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    ...(allDayLastDate ? { allDayLastDate } : {}),
  };
}

async function main() {
  const dateFromArg = process.argv[2];
  const dateToArg = process.argv[3];

  if (!dateFromArg || !dateToArg) {
    console.error("使用方法: npx tsx src/google_calendar/get_events.ts <dateFrom> <dateTo>");
    console.error("例: npx tsx src/google_calendar/get_events.ts 2026-03-08 2026-03-08");
    process.exit(1);
  }

  const calendarId = getEnvOrExit("GOOGLE_CALENDAR_ID");
  const timezone = getEnvOrExit("GOOGLE_CALENDAR_TIMEZONE");
  const accountMode = process.env.GOOGLE_ACCOUNT_MODE || "normal";

  const credentials = loadCredentials();
  const allTokens = loadTokens();
  const tokens = allTokens[accountMode];

  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    console.error(`アカウント "${accountMode}" のトークンが見つかりません。`);
    console.error("認証を完了してください: npx tsx src/google_calendar/auth.ts");
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

  const timeMin = toRFC3339(`${dateFromArg}T00:00:00`, timezone);
  const timeMax = toRFC3339(`${dateToArg}T23:59:59`, timezone);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    timeZone: timezone,
  });

  const events = (response.data.items || []).filter(
    (e) => e.status !== "cancelled"
  );
  const result = {
    events: events.map(formatEvent),
  };

  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun =
  !!process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error("エラーが発生しました:", error.message || error);
    process.exit(1);
  });
}
