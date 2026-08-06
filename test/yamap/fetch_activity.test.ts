/**
 * fetch_yamap_activity: URL正規化・__NEXT_DATA__ の実行時スキーマ検証・レポート整形
 *
 * 実ページの JSON から必要フィールドだけ抜いた縮小フィクスチャ（日帰り／1泊2日）を通し、
 * YAMAP の画面表示と一致する値が出ることを検証する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  extractActivityData,
  normalizeActivityUrl,
} from "../../src/yamap/fetch_activity.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/yamap/activity",
);

function wrapNextData(json: string): string {
  return `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

function wrapPageProps(pageProps: unknown): string {
  return wrapNextData(JSON.stringify({ props: { pageProps } }));
}

/** 縮小フィクスチャ（__NEXT_DATA__ の中身そのもの）を HTML に包んで読み込む */
function loadFixture(name: string): string {
  return wrapNextData(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

/** レポートを `--------` 区切りのブロックへ分解する */
function blocks(report: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const block of report.split("\n--------\n")) {
    const newline = block.indexOf("\n");
    result[block.slice(0, newline)] = block.slice(newline + 1);
  }
  return result;
}

function reportOf(fixtureName: string): Record<string, string> {
  return blocks(buildReport(extractActivityData(loadFixture(fixtureName))));
}

describe("normalizeActivityUrl", () => {
  it("活動記録URLをそのまま受け付ける", () => {
    expect(normalizeActivityUrl("https://yamap.com/activities/49604731")).toBe(
      "https://yamap.com/activities/49604731",
    );
  });

  it("末尾スラッシュ・クエリ・フラグメントを除去する", () => {
    for (const url of [
      "https://yamap.com/activities/49604731/",
      "https://yamap.com/activities/49604731?ref=share",
      "https://yamap.com/activities/49604731#comments",
      "  https://yamap.com/activities/49604731  ",
    ]) {
      expect(normalizeActivityUrl(url)).toBe("https://yamap.com/activities/49604731");
    }
  });

  it("計画書URL・IDが数値でないURL・他ドメインは拒否する", () => {
    for (const url of [
      "https://yamap.com/plans/code/ABCDEF",
      "https://yamap.com/activities/abc",
      "https://example.com/activities/49604731",
      "http://yamap.com/activities/49604731",
    ]) {
      expect(() => normalizeActivityUrl(url)).toThrow("URLのフォーマットが正しくありません");
    }
  });
});

describe("extractActivityData", () => {
  it("正常な activity を取り出し、checkpoints 欠落は空配列に正規化する", () => {
    const { activity, dailySections, timezone } = extractActivityData(
      wrapPageProps({ activity: { title: "テスト記録", timeZone: 9 } }),
    );

    expect(activity.title).toBe("テスト記録");
    expect(activity.checkpoints).toEqual([]);
    expect(dailySections).toEqual([]);
    expect(timezone).toBe(9);
  });

  it("__NEXT_DATA__ が無ければ拒否する", () => {
    expect(() => extractActivityData("<html><body>no data</body></html>")).toThrow(
      "活動記録データ（__NEXT_DATA__）が見つかりませんでした",
    );
  });

  it("JSON として壊れていれば拒否する", () => {
    expect(() => extractActivityData(wrapNextData("{壊れたJSON"))).toThrow(
      "活動記録データ（__NEXT_DATA__）のJSON解析に失敗しました。",
    );
  });

  it("ルートが null／配列なら拒否する", () => {
    for (const json of ["null", "[1]"]) {
      expect(() => extractActivityData(wrapNextData(json))).toThrow(
        "活動記録データ（__NEXT_DATA__）の形式が不正です。",
      );
    }
  });

  it("pageProps.error があれば YAMAP のメッセージを添えて拒否する", () => {
    expect(() =>
      extractActivityData(
        wrapPageProps({
          activity: null,
          error: { status: 404, message: "活動日記が見つかりません。削除された可能性があります" },
        }),
      ),
    ).toThrow("活動記録を取得できませんでした: 活動日記が見つかりません。削除された可能性があります");
  });

  it("pageProps.error にメッセージが無くても拒否する", () => {
    expect(() => extractActivityData(wrapPageProps({ error: { status: 500 } }))).toThrow(
      "活動記録を取得できませんでした。",
    );
  });

  it("activity が欠落／文字列／配列なら拒否する", () => {
    for (const activity of [undefined, "STRING", []]) {
      expect(() => extractActivityData(wrapPageProps({ activity }))).toThrow(
        "活動記録データが含まれていませんでした",
      );
    }
  });

  it("checkpoints がオブジェクトなら拒否する", () => {
    expect(() =>
      extractActivityData(wrapPageProps({ activity: { checkpoints: {} } })),
    ).toThrow("活動記録データのチェックポイント形式が不正です。");
  });

  it("timeZone が非数値・欠落なら JST(9) にフォールバックする", () => {
    expect(extractActivityData(wrapPageProps({ activity: { timeZone: "Asia/Tokyo" } })).timezone).toBe(9);
    expect(extractActivityData(wrapPageProps({ activity: {} })).timezone).toBe(9);
  });
});

describe("buildReport（日帰り: 雲取山）", () => {
  const report = reportOf("kumotoriyama_day_trip");

  it("概要が画面表示と一致する", () => {
    expect(report["概要"]).toBe(
      [
        "タイトル: 【タフ山】鴨沢登山口から雲取山へ　6年ぶりの再訪",
        "山域: 雲取山・鷹ノ巣山・七ツ石山",
        "都道府県: 東京、埼玉、山梨",
        "活動日: 2026.07.11 (土) 08:03 〜 14:38",
        "日程: 日帰り",
      ].join("\n"),
    );
  });

  it("活動データが画面表示と一致する", () => {
    expect(report["活動データ"]).toBe(
      [
        "タイム: 6時間34分",
        "距離: 23.3km",
        "のぼり: 1688m",
        "くだり: 1686m",
        "コース定数: 44 (きつい)",
        "標準タイム: 11時間27分",
        "平均ペース: 187% (速い)",
        "登頂した山: ヨモギノ頭・小雲取山・雲取山",
      ].join("\n"),
    );
  });

  it("チェックポイントが1日分にまとまり、通過時刻が画面表示と一致する", () => {
    const lines = report["チェックポイント"].split("\n");

    expect(lines[0]).toBe(
      "1日目: 合計6時間34分 / 休憩20分 / 距離23.3km / のぼり1688m / くだり1686m",
    );
    expect(lines[1]).toBe("08:04-08:05 鴨沢バス停 (542m)");
    expect(lines).toContain("11:26-11:36 雲取山 (2017m)");
    expect(lines.at(-1)).toBe("14:36-14:37 鴨沢バス停 (542m)");
    expect(lines).toHaveLength(20); // 見出し1行 + チェックポイント19件
  });

  it("活動詳細に本文が全文そのまま入る", () => {
    const detail = report["活動詳細"];

    expect(detail.startsWith("YAMAPのタフ山デジタルバッジキャンペーンのため、")).toBe(true);
    expect(detail).toContain("【前半のトラバース道　歩きやすさと危うさの同居】");
    expect(detail).toContain("- 雲取山の登頂により、アミノバイタル タフ山EASTを獲得");
  });
});

describe("buildReport（1泊2日: 悪沢岳・赤石岳）", () => {
  const report = reportOf("akaishidake_two_days");

  it("日をまたぐ活動日と泊数を表記する", () => {
    expect(report["概要"]).toContain("活動日: 2025.08.15 (金) 04:02 〜 2025.08.16 (土) 11:27");
    expect(report["概要"]).toContain("日程: 1泊2日");
  });

  it("平均ペースが画面表示と一致する", () => {
    expect(report["活動データ"]).toContain("平均ペース: 113% (やや速い)");
    expect(report["活動データ"]).toContain("コース定数: 73 (きつい)");
    expect(report["活動データ"]).toContain("タイム: 17時間51分");
  });

  it("チェックポイントを日別に分け、日別サマリが画面表示と一致する", () => {
    const lines = report["チェックポイント"].split("\n");
    const day1 = lines.indexOf(
      "1日目: 合計9時間43分 / 休憩42分 / 距離15.8km / のぼり2396m / くだり902m",
    );
    const day2 = lines.indexOf(
      "2日目: 合計8時間8分 / 休憩40分 / 距離11.7km / のぼり729m / くだり2230m",
    );

    expect(day1).toBe(0);
    expect(day2).toBe(17); // 1日目は見出し1行 + 16件
    expect(lines).toHaveLength(31); // 見出し2行 + チェックポイント29件
    expect(lines[1]).toBe("04:02-04:02 椹島ロッヂ (1122m)");
    expect(lines[day2 + 1]).toBe("03:17-03:17 キャンプ場 (2610m)");
  });

  it("登頂した山を初回通過順に重複なく並べる", () => {
    expect(report["活動データ"]).toContain(
      "登頂した山: 千枚岳・丸山・悪沢岳（東岳）・荒川中岳・前岳・小赤石岳・赤石岳",
    );
  });
});

describe("buildReport（欠損値の扱い）", () => {
  /** 2026-07-11 08:00 JST */
  const BASE = 1783724400;

  function build(pageProps: Record<string, unknown>): string {
    return buildReport(extractActivityData(wrapPageProps(pageProps)));
  }

  it("courseConstant / averagePace が null なら該当行を出さない", () => {
    const report = build({
      activity: {
        title: "非公開ペース",
        courseConstant: null,
        averagePace: null,
        activityWholeSection: { totalTime: 3600, distance: 1000, totalDays: 1 },
      },
    });

    expect(report).toContain("タイム: 1時間0分");
    expect(report).not.toContain("コース定数");
    expect(report).not.toContain("平均ペース");
  });

  it("登頂した山が無ければ該当行を出さない", () => {
    const report = build({
      activity: {
        title: "山頂なし",
        checkpoints: [{ enteredAt: BASE, leftAt: BASE, landmark: { name: "登山口", isSummit: false } }],
      },
    });

    expect(report).not.toContain("登頂した山");
  });

  it("activityDailySections が空でもチェックポイントを1日目にまとめる", () => {
    const report = build({
      activity: {
        title: "日別セクション欠落",
        checkpoints: [
          { enteredAt: BASE, leftAt: BASE + 60, landmark: { name: "起点", altitude: 500 } },
        ],
      },
    });

    expect(report).toContain("1日目\n08:00-08:01 起点 (500m)");
  });

  it("どの日別セクションの範囲にも入らないチェックポイントを開始済みの最後の日へ寄せる", () => {
    const report = build({
      activity: {
        title: "範囲外",
        checkpoints: [
          { enteredAt: BASE + 100, leftAt: BASE + 160, landmark: { name: "1日目の地点" } },
          // 1日目の stoppedAt より後、2日目の startedAt より前（ログの空白）
          { enteredAt: BASE + 5000, leftAt: BASE + 5060, landmark: { name: "空白時間の地点" } },
          { enteredAt: BASE + 90000, leftAt: BASE + 90060, landmark: { name: "2日目の地点" } },
        ],
      },
      activityDailySections: [
        { dayNumber: 1, startedAt: BASE, stoppedAt: BASE + 3600 },
        { dayNumber: 2, startedAt: BASE + 86400, stoppedAt: BASE + 90600 },
      ],
    });
    const lines = report.split("\n");
    const at = (text: string) => lines.findIndex((line) => line.includes(text));

    // 空白時間の地点は1日目の側（2日目の見出しより前）に置かれる
    expect(at("空白時間の地点")).toBeGreaterThan(at("1日目の地点"));
    expect(at("空白時間の地点")).toBeLessThan(at("2日目"));
    expect(at("2日目の地点")).toBeGreaterThan(at("2日目"));
  });

  it("日別セクションが dayNumber の昇順でなくても日付順に並べる", () => {
    const report = build({
      activity: {
        title: "順不同",
        checkpoints: [
          { enteredAt: BASE + 86500, leftAt: BASE + 86560, landmark: { name: "2日目の地点" } },
          { enteredAt: BASE + 100, leftAt: BASE + 160, landmark: { name: "1日目の地点" } },
        ],
      },
      activityDailySections: [
        { dayNumber: 2, startedAt: BASE + 86400, stoppedAt: BASE + 90600 },
        { dayNumber: 1, startedAt: BASE, stoppedAt: BASE + 3600 },
      ],
    });
    const lines = report.split("\n");
    const at = (text: string) => lines.findIndex((line) => line.includes(text));

    expect(at("1日目")).toBeLessThan(at("2日目"));
    expect(at("08:01-08:02 1日目の地点")).toBeLessThan(at("2日目"));
    expect(at("2日目の地点")).toBeGreaterThan(at("2日目"));
  });

  it("本文が空なら活動詳細をハイフンにする", () => {
    expect(build({ activity: { title: "本文なし" } })).toMatch(/活動詳細\n-$/);
  });
});
