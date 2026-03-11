import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// scripts/ -> get_swarm_checkins/ -> skills/ -> .claude/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

const API_BASE = "https://api.foursquare.com/v2";
const API_VERSION = "20231010";
const LIMIT = 250;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

function getToken(): string {
  const token = process.env.SWARM_OAUTH_TOKEN;
  if (!token) {
    console.error("環境変数 SWARM_OAUTH_TOKEN が設定されていません");
    process.exit(1);
  }
  return token;
}

interface Photo {
  prefix: string;
  suffix: string;
  width: number;
  height: number;
}

interface Category {
  name: string;
}

interface Location {
  formattedAddress?: string[];
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

interface Venue {
  id?: string;
  name?: string;
  location?: Location;
  categories?: Category[];
}

interface Checkin {
  id: string;
  createdAt: number;
  venue?: Venue;
  shout?: string;
  photos?: {
    count: number;
    items: Photo[];
  };
  likes?: { count: number };
  comments?: { count: number };
}

function formatCheckin(checkin: Checkin): Record<string, unknown> {
  const venue = checkin.venue ?? {};
  const location = venue.location ?? {};
  const categories = venue.categories ?? [];
  const category = categories.length > 0 ? categories[0].name : "Unknown";

  const dt = new Date(checkin.createdAt * 1000);

  const formatted: Record<string, unknown> = {
    id: checkin.id,
    created_at: dt.toISOString(),
    venue: {
      id: venue.id,
      name: venue.name ?? "Unknown",
      category,
      address: location.formattedAddress ?? [],
      city: location.city,
      state: location.state,
      country: location.country,
      lat: location.lat,
      lng: location.lng,
    },
    shout: checkin.shout,
    photos_count: checkin.photos?.count ?? 0,
    likes_count: checkin.likes?.count ?? 0,
    comments_count: checkin.comments?.count ?? 0,
  };

  const photoItems = checkin.photos?.items ?? [];
  if (photoItems.length > 0) {
    formatted.photos = photoItems.map((p) => ({
      url: `${p.prefix}original${p.suffix}`,
      width: p.width,
      height: p.height,
    }));
  }

  return formatted;
}

function buildMeta(params: {
  isComplete: boolean;
  returnedCount: number;
  totalAvailable?: number | null;
  limitApplied?: number | null;
  truncatedReason?: string | null;
  apiCallsMade?: number;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    is_complete: params.isComplete,
    returned_count: params.returnedCount,
    total_available: params.totalAvailable ?? null,
    api_calls_made: params.apiCallsMade ?? 1,
    data_source: "foursquare_swarm_api",
    data_scope: "authenticated_user_checkins",
  };
  if (params.limitApplied != null) meta.limit_applied = params.limitApplied;
  if (params.truncatedReason) meta.truncated_reason = params.truncatedReason;
  return meta;
}

async function makeRequest(
  endpoint: string,
  params: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const token = getToken();
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set("oauth_token", token);
  url.searchParams.set("v", API_VERSION);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  const startDateArg = process.argv[2];
  const endDateArg = process.argv[3];

  if (!startDateArg || !endDateArg) {
    console.error("使用方法: npx tsx scripts/get_checkins.ts <start_date> <end_date>");
    console.error("例: npx tsx scripts/get_checkins.ts 2024-01-01 2024-01-31");
    process.exit(1);
  }

  const startDate = new Date(startDateArg);
  const endDate = new Date(endDateArg);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error("日付は YYYY-MM-DD 形式で指定してください");
    process.exit(1);
  }

  // YYYY-MM-DD はUTC 00:00:00として解釈されるため、JSTオフセット分を引いてJST 00:00:00に補正する
  const afterTimestamp = Math.floor((startDate.getTime() - JST_OFFSET_MS) / 1000);

  // end_date の翌日JST 00:00:00をbeforeTimestampとすることで当日終わりまで含める
  const endDatePlusOne = new Date(endDate);
  endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
  const beforeTimestamp = Math.floor((endDatePlusOne.getTime() - JST_OFFSET_MS) / 1000);

  const data = await makeRequest("/users/self/checkins", {
    limit: LIMIT,
    afterTimestamp,
    beforeTimestamp,
    sort: "newestfirst",
  });

  const checkinsData = (data as Record<string, unknown>)?.response as Record<string, unknown>;
  const checkinsList = checkinsData?.checkins as Record<string, unknown>;
  const items: Checkin[] = (checkinsList?.items as Checkin[]) ?? [];
  const formattedCheckins = items.map(formatCheckin);

  const possiblyTruncated = formattedCheckins.length >= LIMIT;

  const result = {
    _meta: buildMeta({
      isComplete: !possiblyTruncated,
      returnedCount: formattedCheckins.length,
      totalAvailable: null,
      limitApplied: LIMIT,
      truncatedReason: possiblyTruncated ? "limit_reached" : null,
    }),
    date_range: `${startDateArg} to ${endDateArg}`,
    count: formattedCheckins.length,
    checkins: formattedCheckins,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error.message || error);
  process.exit(1);
});
