/**
 * fetch_yamap_plan: __NEXT_DATA__ の実行時スキーマ検証
 *
 * JSON.parse が成功してもルート・plan・timezone・checkpoints の型は保証されないため、
 * 構文的に正しいが構造が不正なフィクスチャで拒否／正規化を確認する。
 */
import { describe, expect, it } from "vitest";
import {
  buildReport,
  extractPageData,
  normalizeYamapUrl,
} from "../../src/yamap/fetch_plan.js";

function wrapNextData(json: string): string {
  return `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

function wrapPageProps(pageProps: unknown): string {
  return wrapNextData(JSON.stringify({ props: { pageProps } }));
}

describe("extractPageData", () => {
  it("正常な plan を取り出し、checkpoints 欠落は空配列に正規化する", () => {
    const { plan, timezone } = extractPageData(
      wrapPageProps({ plan: { title: "テスト計画" }, timezone: 9 }),
    );

    expect(plan.title).toBe("テスト計画");
    expect(plan.checkpoints).toEqual([]);
    expect(timezone).toBe(9);
  });

  it("ルートが null なら拒否する", () => {
    expect(() => extractPageData(wrapNextData("null"))).toThrow(
      "計画データ（__NEXT_DATA__）の形式が不正です。",
    );
  });

  it("ルートが配列なら拒否する", () => {
    expect(() => extractPageData(wrapNextData("[1]"))).toThrow(
      "計画データ（__NEXT_DATA__）の形式が不正です。",
    );
  });

  it("plan が文字列なら拒否する", () => {
    expect(() => extractPageData(wrapPageProps({ plan: "STRING" }))).toThrow(
      "計画データが含まれていませんでした",
    );
  });

  it("plan が配列なら拒否する", () => {
    expect(() => extractPageData(wrapPageProps({ plan: [] }))).toThrow(
      "計画データが含まれていませんでした",
    );
  });

  it("plan 欠落なら拒否する", () => {
    expect(() => extractPageData(wrapPageProps({}))).toThrow(
      "計画データが含まれていませんでした",
    );
  });

  it("checkpoints がオブジェクトなら拒否する", () => {
    expect(() =>
      extractPageData(wrapPageProps({ plan: { checkpoints: {} } })),
    ).toThrow("計画データのチェックポイント形式が不正です。");
  });

  it("timezone が非数値なら JST(9) にフォールバックする", () => {
    const { timezone } = extractPageData(
      wrapPageProps({ plan: { title: "tz" }, timezone: "Asia/Tokyo" }),
    );

    expect(timezone).toBe(9);
  });

  it("timezone 欠落なら JST(9) にフォールバックする", () => {
    const { timezone } = extractPageData(wrapPageProps({ plan: { title: "tz" } }));

    expect(timezone).toBe(9);
  });
});

describe("normalizeYamapUrl", () => {
  it("計画書URLをそのまま受け付ける", () => {
    expect(normalizeYamapUrl("https://yamap.com/plans/code/ABC123")).toBe(
      "https://yamap.com/plans/code/ABC123",
    );
  });

  it("printing URL は末尾を除去する", () => {
    expect(normalizeYamapUrl("https://yamap.com/plans/code/ABC123/printing")).toBe(
      "https://yamap.com/plans/code/ABC123",
    );
  });

  it("他の URL は拒否する", () => {
    expect(() => normalizeYamapUrl("https://yamap.com/activities/123")).toThrow(
      "URLのフォーマットが正しくありません。",
    );
  });
});

describe("buildReport", () => {
  it("計画レポートを整形する", () => {
    const report = buildReport(
      {
        title: "南アルプス縦走",
        description: "風に注意",
        startAt: 1783724400,
        finishAt: 1783810800,
        memberCount: 2,
        courseConstant: 25,
        paceMultiplier: 110,
        user: { name: "kanek" },
        maps: [{ name: "赤石岳" }],
        checkpoints: [
          {
            arrivalDayNumber: 1,
            arrivalTimeInSeconds: 21600,
            name: "登山口",
            distance: 0,
            cumulativeUp: 0,
            cumulativeDown: 0,
          },
          {
            arrivalDayNumber: 1,
            arrivalTimeInSeconds: 25200,
            name: "山小屋",
            stayType: "sleep",
            distance: 1234,
            cumulativeUp: 999.9,
            cumulativeDown: 12.5,
          },
        ],
      },
      9,
    );

    expect(report).toContain("計画タイトル: 南アルプス縦走");
    expect(report).toContain("コース定数: 25 (きつい)");
    expect(report).toContain("ペース倍率: 110% (やや速い)");
    expect(report).toContain("1日目: 合計55分 / 距離1.2km / のぼり999m / くだり12m");
    expect(report).toContain("06:55 山小屋（宿泊地）");
  });
});
