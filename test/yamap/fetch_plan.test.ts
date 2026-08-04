/**
 * fetch_yamap_plan: __NEXT_DATA__ の実行時スキーマ検証
 *
 * JSON.parse が成功してもルート・plan・timezone・checkpoints の型は保証されないため、
 * 構文的に正しいが構造が不正なフィクスチャで拒否／正規化を確認する。
 */
import { describe, expect, it } from "vitest";
import { extractPageData } from "../../src/yamap/fetch_plan.js";

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
