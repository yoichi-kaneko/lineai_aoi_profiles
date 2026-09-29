import { computeFit, toPixel } from "../image/plot_locations";
import { MIN_SEPARATION_PX, type Place, type PlaceGroup } from "./places";

/**
 * 描画後、地点の本来の位置からこの距離（px）以内に点があれば、その地点は点で表せているとみなす。
 * 点の間隔（MIN_SEPARATION_PX）の1.5倍とし、集約・吸収で生じるずれをある程度まで許す
 */
export const REPRESENT_TOLERANCE_PX = 1.5 * MIN_SEPARATION_PX;
/**
 * ② を採用するのに必要な評価値の差。第一候補の ③ を優先し、僅差では方式を切り替えない
 * （小さな入力差で方式が入れ替わるのを抑える）
 */
export const ADOPT_MARGIN = 0.05;

export interface SelectionMetrics {
  /** 描画する点の数 */
  pointCount: number;
  /** 代表性: 描画後、近く（REPRESENT_TOLERANCE_PX 以内）に点がある地点の割合 */
  represented: number;
  /** 細かさ: 点の数 ÷ 描ける点の数（上限と地点数の小さいほう） */
  detail: number;
  /** 見やすさ: 他の点と MIN_SEPARATION_PX 未満で重なっていない点の割合 */
  legibility: number;
  /** 最も近い2点の間隔（px）。1点以下なら null */
  minSpacingPx: number | null;
  /** 評価値 = 代表性 × √細かさ × 見やすさ（0〜1） */
  score: number;
}

/**
 * 選んだ点を plot_locations と同じ条件（代表地点だけで自動フィット）で配置し、評価する。
 * 地点ごとの判定は、どの点に集約されたかではなく描画後の見た目（最寄りの点までの距離）で行うため、
 * ③ と ② を同じ物差しで比べられる。地点は訪問回数によらず1地点を1として数える。
 */
export function evaluateSelection(
  places: Place[],
  groups: PlaceGroup[],
  maxPoints: number,
): SelectionMetrics {
  if (places.length === 0 || groups.length === 0) {
    return {
      pointCount: 0,
      represented: 0,
      detail: 0,
      legibility: 0,
      minSpacingPx: null,
      score: 0,
    };
  }

  const fit = computeFit(groups.map((group) => places[group.representative]));
  const dots = groups.map((group) => toPixel(places[group.representative], fit));

  let representedCount = 0;
  for (const place of places) {
    const pixel = toPixel(place, fit);
    if (
      dots.some(
        (dot) => Math.hypot(dot.x - pixel.x, dot.y - pixel.y) <= REPRESENT_TOLERANCE_PX,
      )
    ) {
      representedCount++;
    }
  }

  let minSpacing = Infinity;
  const overlapping = new Set<number>();
  for (let i = 0; i < dots.length; i++) {
    for (let j = i + 1; j < dots.length; j++) {
      const spacing = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
      minSpacing = Math.min(minSpacing, spacing);
      if (spacing < MIN_SEPARATION_PX) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }

  const represented = representedCount / places.length;
  const detail = Math.min(1, groups.length / Math.min(maxPoints, places.length));
  const legibility = 1 - overlapping.size / dots.length;
  return {
    pointCount: groups.length,
    represented,
    detail,
    legibility,
    minSpacingPx: dots.length > 1 ? minSpacing : null,
    score: represented * Math.sqrt(detail) * legibility,
  };
}

export type SelectionMethod = "cluster" | "nearest";

/**
 * ③（集合化）と ②（中心近傍選択）の評価から採用する方式を決める。
 * ② の評価値が ③ を ADOPT_MARGIN 以上上回ったときだけ ② を採り、それ以外は ③ を採る。
 */
export function chooseMethod(
  cluster: SelectionMetrics,
  nearest: SelectionMetrics,
): SelectionMethod {
  return nearest.score >= cluster.score + ADOPT_MARGIN ? "nearest" : "cluster";
}
