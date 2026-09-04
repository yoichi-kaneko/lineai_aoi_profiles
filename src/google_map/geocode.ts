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

/** 候補1件分。呼び出し側が正誤を判断できるよう、座標だけでなく判定材料も添える */
interface GeocodeCandidate {
  location: { lat: number; lng: number };
  formatted_address: string;
  /** 地物の種別。山を狙った検索では natural_feature が含まれるかが有力な判断材料になる */
  types: string[];
  /** Google が完全一致とみなさなかった場合に true。大きく外れた結果の兆候 */
  partial_match: boolean;
  place_id: string;
}

interface GeocodeOutput {
  query: string;
  count: number;
  results: GeocodeCandidate[];
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

/**
 * 住所・地点名を座標へ変換し、候補を返す。
 *
 * 1件目が目当ての地点である保証はないため、候補は絞り込まず全件返し、
 * どれを採るかの判断は文脈を持つ呼び出し側に委ねる。
 *
 * - `language: ja` … formatted_address を日本語で返し、県名から正誤を判断できるようにする
 * - `region: jp` … 日本国内の結果を優先する（「城山」が韓国の地名に解決されるなどを防ぐ）
 *
 * `components: country:JP` は使わない。完全制限がかかる結果、山（natural_feature）が
 * 同名の町丁名に置き換わってしまう（例: 白山 → 東京都文京区白山）。
 */
async function geocode(address: string): Promise<GeocodeOutput> {
  const apiKey = getApiKey();
  const client = new Client();

  const { data } = await client.geocode({
    params: { address, key: apiKey, language: "ja", region: "jp" },
  });

  if (data.status !== Status.OK) {
    console.error(`Geocoding失敗: ${data.error_message ?? data.status}`);
    process.exit(1);
  }

  return {
    query: address,
    count: data.results.length,
    results: data.results.map((result) => ({
      location: result.geometry.location,
      formatted_address: result.formatted_address,
      types: result.types,
      partial_match: result.partial_match ?? false,
      place_id: result.place_id,
    })),
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
