import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/google_map/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("環境変数 GOOGLE_MAPS_API_KEY が設定されていません");
    process.exit(1);
  }
  return apiKey;
}

interface GeocodeResult {
  location: { lat: number; lng: number };
  formatted_address: string;
  place_id: string;
}

async function geocode(address: string): Promise<GeocodeResult> {
  const apiKey = getApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", address);
  url.searchParams.append("key", apiKey);

  const response = await fetch(url.toString());
  const data = (await response.json()) as {
    status: string;
    error_message?: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      place_id: string;
    }>;
  };

  if (data.status !== "OK") {
    console.error(`Geocoding失敗: ${data.error_message ?? data.status}`);
    process.exit(1);
  }

  return {
    location: data.results[0].geometry.location,
    formatted_address: data.results[0].formatted_address,
    place_id: data.results[0].place_id,
  };
}

async function main() {
  const address = process.argv[2];

  if (!address) {
    console.error("使用方法: npx tsx src/google_map/geocode.ts <住所>");
    console.error('例: npx tsx src/google_map/geocode.ts "東京都新宿区西新宿2-8-1"');
    process.exit(1);
  }

  const result = await geocode(address);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
