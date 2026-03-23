import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの .env を読み込む
// src/openweather/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const WEATHER_API_BASE = "https://api.openweathermap.org/data/3.0/onecall";

function getAppId(): string {
  const apiKey = process.env.OPEN_WEATHER_APP_ID;
  if (!apiKey) {
    console.error("環境変数 OPEN_WEATHER_APP_ID が設定されていません");
    process.exit(1);
  }
  return apiKey;
}

interface WeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

interface CurrentWeather {
  dt: number;
  sunrise: number;
  sunset: number;
  temp: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  dew_point: number;
  uvi: number;
  clouds: number;
  visibility: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather: WeatherCondition[];
}

interface RainData {
  "1h"?: number;
}

interface HourlyWeather {
  dt: number;
  temp: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  dew_point: number;
  uvi: number;
  clouds: number;
  visibility: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather: WeatherCondition[];
  pop: number;
  rain?: RainData;
}

interface DailyTemperature {
  day: number;
  min: number;
  max: number;
  night: number;
  eve: number;
  morn: number;
}

interface DailyFeelsLike {
  day: number;
  night: number;
  eve: number;
  morn: number;
}

interface DailyWeather {
  dt: number;
  sunrise: number;
  sunset: number;
  moonrise?: number;
  moonset?: number;
  moon_phase: number;
  summary: string;
  temp: DailyTemperature;
  feels_like: DailyFeelsLike;
  pressure: number;
  humidity: number;
  dew_point: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather: WeatherCondition[];
  clouds: number;
  pop: number;
  rain?: number;
  uvi: number;
}

interface MinutelyWeather {
  dt: number;
  precipitation: number;
}

interface SuccessWeatherResponse {
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
  current: CurrentWeather;
  minutely?: MinutelyWeather[];
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}

interface ErrorWeatherResponse {
  cod: number;
  message: string;
}

type WeatherResponse = SuccessWeatherResponse | ErrorWeatherResponse;

function isErrorResponse(response: WeatherResponse): response is ErrorWeatherResponse {
  return "cod" in response && "message" in response;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

async function main() {
  const latArg = process.argv[2];
  const lonArg = process.argv[3];

  if (!latArg || !lonArg) {
    console.error("使用方法: npx tsx src/openweather/forecast.ts <緯度> <経度>");
    console.error("例: npx tsx src/openweather/forecast.ts 35.6762 139.6503");
    process.exit(1);
  }

  const latitude = parseFloat(latArg);
  const longitude = parseFloat(lonArg);

  if (isNaN(latitude) || isNaN(longitude)) {
    console.error("緯度・経度は数値で指定してください");
    process.exit(1);
  }

  const appId = getAppId();

  const url = new URL(WEATHER_API_BASE);
  url.searchParams.append("lat", latitude.toString());
  url.searchParams.append("lon", longitude.toString());
  url.searchParams.append("appid", appId);
  url.searchParams.append("units", "metric");
  url.searchParams.append("lang", "ja");

  const response = await fetch(url.toString());
  const weatherData = (await response.json()) as WeatherResponse;

  if (isErrorResponse(weatherData)) {
    console.error(`APIエラー: ${weatherData.message}`);
    process.exit(1);
  }

  const current = weatherData.current;
  const currentWeatherText = `現在の天気:
気温: ${current.temp.toFixed(1)}℃
天気: ${current.weather[0].description}
湿度: ${current.humidity}%
風速: ${current.wind_speed}m/s
気圧: ${current.pressure}hPa
雲量: ${current.clouds}%
日の出: ${formatDateTime(current.sunrise)}
日の入: ${formatDateTime(current.sunset)}`;

  const hourlyForecast = weatherData.hourly
    .slice(0, 24)
    .map((hour) => {
      const rainInfo = hour.rain ? ` (雨: ${hour.rain["1h"] || 0}mm)` : "";
      return `${formatDateTime(hour.dt)}: ${hour.temp.toFixed(1)}℃, ${hour.weather[0].description}, 風速: ${hour.wind_speed}m/s, 雲量: ${hour.clouds}%, 降水確率: ${(hour.pop * 100).toFixed(0)}%${rainInfo}`;
    })
    .join("\n");

  const dailyForecast = weatherData.daily
    .map((day) => {
      const rainInfo = day.rain ? ` (雨: ${day.rain}mm)` : "";
      return `${formatDate(day.dt)}:
  天気: ${day.weather[0].description}
  気温: ${day.temp.min.toFixed(1)}℃ ～ ${day.temp.max.toFixed(1)}℃
  風速: ${day.wind_speed}m/s
  雲量: ${day.clouds}%
  降水確率: ${(day.pop * 100).toFixed(0)}%${rainInfo}
  概要: ${day.summary}`;
    })
    .join("\n\n");

  const forecastText = `天気予報 (${latitude}, ${longitude})

${currentWeatherText}

今後24時間の予報:
${hourlyForecast}

今後8日間の予報:
${dailyForecast}
`;

  console.log(forecastText);
}

main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
