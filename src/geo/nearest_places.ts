import {
  type Place,
  type PlaceGroup,
  haversineKm,
  minSeparationFor,
  projectedDistance,
} from "./places";

/**
 * ② の選択範囲（中心からの地表距離、km）。点数が足りなくても広げない。
 * 都区部の生活圏、または一つの山域の行程がおおむね収まる大きさとして置いている
 */
export const NEAREST_RADIUS_KM = 30;

/** ② の中心の位置 */
export interface CenterPoint {
  lat: number;
  lng: number;
}

/**
 * 中心の決め方。specified は呼び出し元が座標を指定したもの、auto は地点の最も集まる実在の地点を
 * chooseCenter() で選んだもの
 */
export type CenterSource = "specified" | "auto";

export interface NearestSelectOptions {
  /**
   * 中心に据える座標。入力にある地点である必要はない（チェックインの無い山頂なども指定できる）。
   * 省略時は chooseCenter() で自動判定する
   */
  center?: CenterPoint;
  radiusKm?: number;
}

export interface NearestSelection {
  /** 中心の位置。自動判定で地点が1件も無い場合は null */
  center: CenterPoint | null;
  centerSource: CenterSource;
  groups: PlaceGroup[];
  /** 選択範囲の外にあった地点の数 */
  outsideRadius: number;
  /** 選んだ点と重なるため、その点に代表させた地点の数 */
  absorbed: number;
  /** 範囲内だが、点数の上限に達したため描かなかった地点の数 */
  cut: number;
}

/**
 * 中心とする地点を決める。各地点について、半径内の地点を距離に応じて重み付けした
 * 密度（自身を1、半径の縁で0とする三角形の重み）を求め、最も高い地点を選ぶ。
 * 同値なら訪問回数の多い地点、さらに通し番号の小さい地点を選ぶ。
 * 全地点の平均のような未訪問の位置ではなく、地点が最も集まっている場所の実在の地点が中心になる。
 */
export function chooseCenter(places: Place[], radiusKm: number = NEAREST_RADIUS_KM): number {
  if (places.length === 0) {
    throw new Error("地点が1件もありません");
  }
  let best = 0;
  let bestDensity = -Infinity;
  for (const place of places) {
    let density = 0;
    for (const other of places) {
      const distance = haversineKm(place, other);
      if (distance < radiusKm) {
        density += 1 - distance / radiusKm;
      }
    }
    const current = places[best];
    if (
      density > bestDensity ||
      (density === bestDensity && place.visits > current.visits)
    ) {
      best = place.index;
      bestDensity = density;
    }
  }
  return best;
}

/**
 * ② 中心近傍選択: 中心から半径内の地点を近い順に最大 maxPoints 点選ぶ。
 * 中心は options.center で座標を指定でき、省略時は地点の最も集まる実在の地点を自動で選ぶ。
 *
 * - 描く点は常に入力にある実在の地点で、指定した中心の座標そのものは描かない
 * - 既に選んだ点と MIN_SEPARATION_PX 未満で重なる地点は選ばず、その点に代表させる（吸収）
 * - 重なりの判定は半径内の全地点を自動フィットした倍率で行う。選んだ点は半径内の地点の一部なので、
 *   描画時の倍率はこれ以上になり、選んだ点は描画後も重ならない
 * - 半径外の地点は、点数が上限に満たなくても加えない。指定した中心の半径内に地点が無ければ0点になる
 *
 * places は groupPlaces() の結果（通し番号の順）を渡す。
 */
export function selectNearestPlaces(
  places: Place[],
  maxPoints: number,
  options: NearestSelectOptions = {},
): NearestSelection {
  const radiusKm = options.radiusKm ?? NEAREST_RADIUS_KM;
  const centerSource: CenterSource = options.center ? "specified" : "auto";
  if (places.length === 0) {
    return {
      center: options.center ? { ...options.center } : null,
      centerSource,
      groups: [],
      outsideRadius: 0,
      absorbed: 0,
      cut: 0,
    };
  }
  const centerPlace = options.center ?? places[chooseCenter(places, radiusKm)];
  const center: CenterPoint = { lat: centerPlace.lat, lng: centerPlace.lng };
  const withDistance = places.map((place) => ({
    place,
    distance: haversineKm(center, place),
  }));
  const inside = withDistance
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance || a.place.index - b.place.index)
    .map((item) => item.place);
  // 指定した中心の半径内に地点が無いときは比べる点も無いため、間隔は使われない
  const minSeparation = inside.length > 0 ? minSeparationFor(inside) : 0;

  const groups: PlaceGroup[] = [];
  let absorbed = 0;
  let cut = 0;
  for (const place of inside) {
    let overlapped: PlaceGroup | null = null;
    let overlappedDistance = Infinity;
    for (const group of groups) {
      const distance = projectedDistance(place, places[group.representative]);
      if (distance < minSeparation && distance < overlappedDistance) {
        overlapped = group;
        overlappedDistance = distance;
      }
    }
    if (overlapped) {
      overlapped.members.push(place.index);
      absorbed++;
    } else if (groups.length < maxPoints) {
      groups.push({ representative: place.index, members: [place.index] });
    } else {
      cut++;
    }
  }
  for (const group of groups) {
    group.members.sort((a, b) => a - b);
  }

  return {
    center,
    centerSource,
    groups,
    outsideRadius: places.length - inside.length,
    absorbed,
    cut,
  };
}
