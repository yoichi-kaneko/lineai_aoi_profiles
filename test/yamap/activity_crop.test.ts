/**
 * 層1: YAMAP レポートの境界検出テスト（高速・常時実行）
 *
 * 記録済みの OCR 結果をフィクスチャとして使い、画像ファイルなしで境界検出を検証する。
 * 実画像を通した確認は層2（activity_crop.e2e.test.ts）が担う。
 *
 * フィクスチャの追加手順は test/README.md を参照。
 */
import { describe, expect, it } from "vitest";
import type { Line } from "tesseract.js";
import {
  isHeadingLine,
  normalizeText,
} from "../../src/yamap/activity_crop/activity_crop_ocr.js";
import {
  type BoundaryEvidence,
  buildFailReason,
  detectSectionBoundaries,
} from "../../src/yamap/activity_crop/activity_crop_sections.js";
import { createReplayProbe, loadFixture, toOcrResult } from "./fixture.js";

/**
 * 各フィクスチャに対する期待値。
 *
 * 値は元画像座標。OCR を再実行しないため結果は決定的で、範囲ではなく厳密一致で確認できる。
 * 新しいフィクスチャを足すときは、dump_activity_ocr.ts が出力する境界検出結果を
 * 目視で妥当性確認したうえでここへ追記する。
 */
const FIXTURE_CASES = [
  {
    name: "hijiriyama_20260728",
    // 2026-07-28 綴葉モードで checkpoints / activity_detail の切り出しに失敗した実レポート。
    // 「活動詳細」見出しに「すべて見る」リンクが同一行で描画されていたのが原因（issue #88）。
    description: "聖山レポート（issue #88 の失敗ケース）",
    expected: {
      header: { top: 0, bottom: 1072 },
      activityData: { top: 1072, bottom: 2477 },
      checkpoints: { top: 2477, bottom: 4504 },
      activityDetail: { top: 4504, bottom: 6149, endMethod: "grid_detection" },
    },
  },
  {
    name: "hutamatayama_20260729",
    // 上記より横幅が広く（1965px）、OCR の縮小率が小さい（0.61）ため
    // 「すべて見る」リンクが読み取れず「ーー」に潰れていた実レポート。
    description: "二岐山レポート（見出し併記リンクがノイズ化するケース）",
    expected: {
      header: { top: 0, bottom: 1073 },
      activityData: { top: 1073, bottom: 2476 },
      checkpoints: { top: 2476, bottom: 3950 },
      activityDetail: { top: 3950, bottom: 6282, endMethod: "grid_detection" },
    },
  },
] as const;

describe("isHeadingLine", () => {
  const cases: { line: string; label: string; want: boolean; why: string }[] = [
    {
      line: "活動 詳細 すべ て 見 る",
      label: "活動詳細",
      want: true,
      why: "見出しの右端に併記される「すべて見る」リンク（issue #88 の原因）",
    },
    {
      line: "活動 詳細 もっ と 見る",
      label: "活動詳細",
      want: true,
      why: "既知 UI 語の別パターン",
    },
    {
      line: "活動 詳細 ーー",
      label: "活動詳細",
      want: true,
      why: "縮小率が小さくリンクが読み取れず長音符へ潰れたケース（hutamatayama）",
    },
    {
      line: "活動 詳細 一 _ |",
      label: "活動詳細",
      want: true,
      why: "罫線・下線の誤認識片",
    },
    { line: "チェ ッ ク ポ イン ト", label: "チェックポイント", want: true, why: "リンクなしの見出し" },
    { line: "活動 デー タ", label: "活動データ", want: true, why: "リンクなしの見出し" },
    {
      line: "この 活動 詳細 は とても 良い 記録 だ っ た",
      label: "活動詳細",
      want: false,
      why: "本文中にラベルが出現しただけの行",
    },
    {
      line: "活動 詳細 を 参考 に し た",
      label: "活動詳細",
      want: false,
      why: "ラベルが行頭でも、後ろに日本語の語が続く行は見出しではない",
    },
  ];

  for (const { line, label, want, why } of cases) {
    it(`${want ? "採用" : "除外"}: 「${line}」— ${why}`, () => {
      expect(isHeadingLine(normalizeText(line), normalizeText(label))).toBe(want);
    });
  }
});

describe("detectSectionBoundaries", () => {
  for (const testCase of FIXTURE_CASES) {
    describe(`${testCase.name}（${testCase.description}）`, () => {
      it("4ブロックすべての境界を検出できる", async () => {
        const fixture = loadFixture(testCase.name);
        const boundaries = await detectSectionBoundaries(
          toOcrResult(fixture),
          createReplayProbe(fixture),
        );

        expect(boundaries.header).toEqual(testCase.expected.header);
        expect(boundaries.activityData).toEqual(testCase.expected.activityData);
        expect(boundaries.checkpoints).toEqual(testCase.expected.checkpoints);
        expect(boundaries.activityDetail).toEqual(testCase.expected.activityDetail);
      });

      it("検出状況（evidence）がすべて揃う", async () => {
        const fixture = loadFixture(testCase.name);
        const boundaries = await detectSectionBoundaries(
          toOcrResult(fixture),
          createReplayProbe(fixture),
        );

        expect(boundaries.evidence).toEqual({
          activityDataHeading: true,
          checkpointsHeading: true,
          activityDetailHeading: true,
          activityDetailBottom: true,
        });
      });
    });
  }

  it("「活動詳細」見出しを見失うと checkpoints も連鎖して失敗する", async () => {
    const fixture = loadFixture("hijiriyama_20260728");
    // 見出しだけを潰し、それ以外は実データのままにする
    const brokenLines = fixture.lines.map((line) => ({
      ...line,
      text: line.text.replace(/活動\s*詳細/g, "XX"),
    })) as unknown as Line[];

    const boundaries = await detectSectionBoundaries(
      toOcrResult(fixture, brokenLines),
      createReplayProbe(fixture),
    );

    expect(boundaries.activityDetail).toBeNull();
    expect(boundaries.checkpoints).toBeNull();
    // 上流（header / activity_data）は巻き込まれない
    expect(boundaries.header).not.toBeNull();
    expect(boundaries.activityData).not.toBeNull();
  });
});

describe("buildFailReason", () => {
  const allFound: BoundaryEvidence = {
    activityDataHeading: true,
    checkpointsHeading: true,
    activityDetailHeading: true,
    activityDetailBottom: true,
  };

  it("連鎖による失敗はその旨を明示する", () => {
    const evidence: BoundaryEvidence = {
      ...allFound,
      activityDetailHeading: false,
      activityDetailBottom: false,
    };

    expect(buildFailReason("checkpoints", evidence)).toContain("連鎖");
    expect(buildFailReason("checkpoints", evidence)).toContain("活動詳細");
    // 大元の失敗は連鎖と呼ばない
    expect(buildFailReason("activity_detail", evidence)).not.toContain("連鎖");
  });

  it("自ブロックの見出しが取れない場合は連鎖と呼ばない", () => {
    const evidence: BoundaryEvidence = { ...allFound, checkpointsHeading: false };

    expect(buildFailReason("checkpoints", evidence)).not.toContain("連鎖");
    expect(buildFailReason("checkpoints", evidence)).toContain("チェックポイント");
  });

  it("見出しは取れたが下端が決まらない場合を区別する", () => {
    const evidence: BoundaryEvidence = { ...allFound, activityDetailBottom: false };

    expect(buildFailReason("activity_detail", evidence)).toContain("下端");
  });
});
