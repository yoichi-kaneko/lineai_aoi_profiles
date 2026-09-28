import {
  type Place,
  type PlaceGroup,
  minSeparationFor,
  projectedDistance,
} from "./places";

interface Cluster {
  members: number[];
  sumX: number;
  sumY: number;
  representative: number;
}

/**
 * 集合の代表地点を選ぶ。異なる地点の数で重み付けした重心（地点ごとに重み1）に最も近い
 * 実在の地点とし、同距離なら訪問回数の多い地点、さらに通し番号の小さい地点を選ぶ。
 * 重心そのものは海や山腹など未訪問の位置に来ることがあるため、描画には使わない。
 */
function chooseRepresentative(places: Place[], cluster: Omit<Cluster, "representative">): number {
  const centroid = {
    x: cluster.sumX / cluster.members.length,
    y: cluster.sumY / cluster.members.length,
  };
  let best = cluster.members[0];
  let bestDistance = Infinity;
  for (const member of cluster.members) {
    const place = places[member];
    const distance = projectedDistance(place, centroid);
    const current = places[best];
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        (place.visits > current.visits ||
          (place.visits === current.visits && member < best)))
    ) {
      best = member;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * ③ 集合化: 各地点を1集合として始め、代表地点どうしが最も近い2集合を統合し続ける。
 *
 * - 集合間の距離は代表地点どうしの投影面上の距離とし、描画される点の近さを直接比べる
 * - 集合が maxPoints 以下になり、かつ全代表地点が MIN_SEPARATION_PX 以上離れたら止める
 * - 重なりの判定は全地点を自動フィットした倍率で行う。代表地点は全地点の一部なので、
 *   描画時の倍率はこれ以上になり、止めた時点の点は描画後も重ならない（再フィットの反復はしない）
 * - 統合の候補は各集合の最近傍を保持して探し、1回の統合を O(n) 程度に抑える
 *
 * places は groupPlaces() の結果（通し番号の順）を渡す。
 */
export function clusterPlaces(places: Place[], maxPoints: number): PlaceGroup[] {
  const n = places.length;
  if (n === 0) {
    return [];
  }
  const minSeparation = minSeparationFor(places);

  const clusters: (Cluster | null)[] = places.map((place) => ({
    members: [place.index],
    sumX: place.x,
    sumY: place.y,
    representative: place.index,
  }));
  const nearest = new Int32Array(n).fill(-1);
  const nearestDistance = new Float64Array(n).fill(Infinity);

  const distanceBetween = (a: number, b: number): number =>
    projectedDistance(
      places[(clusters[a] as Cluster).representative],
      places[(clusters[b] as Cluster).representative],
    );

  const updateNearest = (i: number): void => {
    let best = -1;
    let bestDistance = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i || clusters[j] === null) {
        continue;
      }
      const distance = distanceBetween(i, j);
      if (distance < bestDistance) {
        best = j;
        bestDistance = distance;
      }
    }
    nearest[i] = best;
    nearestDistance[i] = bestDistance;
  };

  for (let i = 0; i < n; i++) {
    updateNearest(i);
  }

  let activeCount = n;
  while (activeCount > 1) {
    let i = -1;
    for (let k = 0; k < n; k++) {
      if (clusters[k] !== null && (i === -1 || nearestDistance[k] < nearestDistance[i])) {
        i = k;
      }
    }
    if (activeCount <= maxPoints && nearestDistance[i] >= minSeparation) {
      break;
    }

    // 通し番号の小さいほうへ統合し、統合順を入力順に依存させない
    const keep = Math.min(i, nearest[i]);
    const drop = Math.max(i, nearest[i]);
    const kept = clusters[keep] as Cluster;
    const dropped = clusters[drop] as Cluster;
    const merged = {
      members: [...kept.members, ...dropped.members].sort((a, b) => a - b),
      sumX: kept.sumX + dropped.sumX,
      sumY: kept.sumY + dropped.sumY,
    };
    clusters[keep] = { ...merged, representative: chooseRepresentative(places, merged) };
    clusters[drop] = null;
    activeCount--;

    for (let k = 0; k < n; k++) {
      if (k === keep || clusters[k] === null) {
        continue;
      }
      if (nearest[k] === keep || nearest[k] === drop) {
        // 最近傍が統合で消えた、または代表地点が動いて遠ざかった可能性がある
        updateNearest(k);
      } else {
        const distance = distanceBetween(k, keep);
        if (
          distance < nearestDistance[k] ||
          (distance === nearestDistance[k] && keep < nearest[k])
        ) {
          nearest[k] = keep;
          nearestDistance[k] = distance;
        }
      }
    }
    updateNearest(keep);
  }

  return clusters
    .filter((cluster): cluster is Cluster => cluster !== null)
    .map((cluster) => ({
      representative: cluster.representative,
      members: cluster.members,
    }));
}
