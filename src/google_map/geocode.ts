import { Client, Status } from "@googlemaps/google-maps-services-js";
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

/**
 * エラーから表示用のメッセージを取り出す。
 * SDK が内部で使う axios のエラーは、そのまま出力すると
 * リクエストURL（APIキーを含む）ごとログに残るため、必要な情報だけを抜き出す。
 */
function toErrorMessage(error: unknown): string {
  const data = (
    error as {
      response?: { data?: { error_message?: string; status?: string } };
    }
  )?.response?.data;
  const detail = data?.error_message ?? data?.status;
  if (detail) {
    return detail;
  }
  return error instanceof Error ? error.message : String(error);
}

async function geocode(address: string): Promise<GeocodeResult> {
  const apiKey = getApiKey();
  const client = new Client();

  const { data } = await client.geocode({
    params: { address, key: apiKey },
  });

  if (data.status !== Status.OK) {
    console.error(`Geocoding失敗: ${data.error_message ?? data.status}`);
    process.exit(1);
  }

  const [result] = data.results;
  return {
    location: result.geometry.location,
    formatted_address: result.formatted_address,
    place_id: result.place_id,
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
  console.error("エラーが発生しました:", toErrorMessage(error));
  process.exit(1);
});
