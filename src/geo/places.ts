import {
  DOT_RADIUS,
  MAX_LATITUDE,
  computeFit,
  projectWebMercator,
} from "../image/plot_locations";

/** 受け付ける入力件数（チェックイン1件＝1要素）の上限。計算時間を見積もれる範囲に抑える */
export const MAX_ENTRIES = 1000;
/**
 * 描画後の点どうしに確保する中心間距離（px）。点の直径（8px）に同じ幅の隙間を足したもの。
 * これより近い点は重なって見えるものとして、集合化（③）では統合し、中心近傍選択（②）では吸収する
 */
export const MIN_SEPARATION_PX = 4 * DOT_RADIUS;

const MAX_LONGITUDE = 180;
/** 日付変更線をまたぐ入力は対象外。plot_locations と同じ条件で拒否する */
const MAX_LONGITUDE_SPAN = 180;
/** 地表距離の計算に使う地球の平均半径（km） */
const EARTH_RADIUS_KM = 6371.0088;

/** 入力1件分（チェックイン1件に相当する） */
export interface Entry {
  lat: number;
  lng: number;
  /** 同じ施設を識別する ID。無ければ、緯度経度が完全に一致する入力を同じ地点とみなす */
  placeId?: string;
}

/** 同じ地点への入力をまとめたもの。距離・重心・評価はすべてこの単位（異なる地点の数）で扱う */
export interface Place {
  /** 並べ替え後の通し番号。同値の比較はこの番号で決め、入力順に結果を依存させない */
  index: number;
  lat: number;
  lng: number;
  placeId?: string;
  /** この地点への入力件数（反復訪問の回数）。重み付けには使わず、属性として持ち回る */
  visits: number;
  /** Webメルカトルの投影面上の座標（m）。plot_locations と同じ投影を使う */
  x: number;
  y: number;
}

/** 描画する1点と、その点が代表する地点の対応 */
export interface PlaceGroup {
  /** 描画する地点（Place.index）。常に入力に含まれる実在の地点を使う */
  representative: number;
  /** この点が代表する地点（Place.index）。代表自身を含む */
  members: number[];
}

export interface ParsedEntries {
  entries: Entry[];
  /** 座標の欠落・型違い・範囲外などで除外した件数 */
  invalidCount: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 1件分を読み取る。使えない要素は null を返す（座標の値はエラー文へ出さない） */
function readEntry(item: unknown): Entry | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const { lat, lng, placeId } = record;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }
  if (Math.abs(lat) > MAX_LATITUDE || Math.abs(lng) > MAX_LONGITUDE) {
    return null;
  }
  if (placeId === undefined) {
    return { lat, lng };
  }
  if (typeof placeId !== "string" || placeId === "") {
    return null;
  }
  return { lat, lng, placeId };
}

/**
 * 入力を検証する。配列でない・件数超過・日付変更線をまたぐ入力はエラーにし、
 * 個々の要素の不備（座標の欠落など）は除外して件数だけを返す。
 */
export function parseEntries(value: unknown): ParsedEntries {
  if (!Array.isArray(value)) {
    throw new Error("入力は { lat, lng, placeId? } の配列にしてください");
  }
  if (value.length > MAX_ENTRIES) {
    throw new Error(`入力は最大${MAX_ENTRIES}件までです（${value.length}件）`);
  }

  const entries: Entry[] = [];
  let invalidCount = 0;
  for (const item of value) {
    const entry = readEntry(item);
    if (entry) {
      entries.push(entry);
    } else {
      invalidCount++;
    }
  }

  if (entries.length > 0) {
    const lngs = entries.map((entry) => entry.lng);
    if (Math.max(...lngs) - Math.min(...lngs) > MAX_LONGITUDE_SPAN) {
      throw new Error(
        `経度の幅が${MAX_LONGITUDE_SPAN}度を超えています。日付変更線をまたぐ入力には対応していません`,
      );
    }
  }
  return { entries, invalidCount };
}

/** 入力ファイルの中身を JSON として解釈し、検証済みの入力を返す */
export function parseEntriesJson(text: string): ParsedEntries {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON.parse のエラー文は入力の断片（座標）を含むため、そのまま出さない
    throw new Error("入力ファイルを JSON として解釈できません");
  }
  return parseEntries(parsed);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareCoordinates(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return a.lat - b.lat || a.lng - b.lng;
}

/**
 * 同じ地点への入力をまとめる。placeId が同じもの、placeId が無く緯度経度が完全に一致するものを
 * 1地点とし、入力件数を visits に数える。結果は緯度・経度・placeId の順に並べ、通し番号を振る。
 */
export function groupPlaces(entries: Entry[]): Place[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key =
      entry.placeId !== undefined ? `id:${entry.placeId}` : `ll:${entry.lat},${entry.lng}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const places = [...groups.values()].map((group) => {
    // 同じ placeId で座標が食い違う場合は、最も多い座標（同数なら南西側）を使う
    const counts = new Map<string, { lat: number; lng: number; count: number }>();
    for (const entry of group) {
      const key = `${entry.lat},${entry.lng}`;
      const current = counts.get(key);
      if (current) {
        current.count++;
      } else {
        counts.set(key, { lat: entry.lat, lng: entry.lng, count: 1 });
      }
    }
    const chosen = [...counts.values()].sort(
      (a, b) => b.count - a.count || compareCoordinates(a, b),
    )[0];
    const projected = projectWebMercator(chosen);
    const place: Place = {
      index: 0,
      lat: chosen.lat,
      lng: chosen.lng,
      visits: group.length,
      x: projected.x,
      y: projected.y,
    };
    if (group[0].placeId !== undefined) {
      place.placeId = group[0].placeId;
    }
    return place;
  });

  places.sort(
    (a, b) =>
      compareCoordinates(a, b) || compareStrings(a.placeId ?? "", b.placeId ?? ""),
  );
  places.forEach((place, index) => {
    place.index = index;
  });
  return places;
}

/** 2地点間の地表距離（km、球面の大円距離） */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 投影面上の距離（m）。描画時のピクセル距離はこれに倍率を掛けたものになる */
export function projectedDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 与えた地点を plot_locations の自動フィットで描いたときに、MIN_SEPARATION_PX に相当する
 * 投影面上の距離（m）を返す。描画する点がこの地点群の一部であれば、描画時の倍率は
 * これ以上になる（表示範囲が狭まる）ため、この距離を空けた点は描画後も重ならない。
 */
export function minSeparationFor(points: { x: number; y: number }[]): number {
  return MIN_SEPARATION_PX / computeFit(points).scale;
}
