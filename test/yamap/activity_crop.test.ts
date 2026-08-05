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
  {
    name: "kuwasakiyama_20260731",
    // 2026-07-31 綴葉モードで checkpoints / activity_detail の切り出しに失敗した実レポート。
    // 「すべて見る」リンクが「てる」としか読めず、UI ラベルの完全一致除去をすり抜けていた。
    description: "鍬崎山レポート（併記リンクが部分的にしか読めないケース）",
    expected: {
      header: { top: 0, bottom: 1072 },
      activityData: { top: 1072, bottom: 2517 },
      checkpoints: { top: 2517, bottom: 4726 },
      activityDetail: { top: 4726, bottom: 7116, endMethod: "grid_detection" },
    },
  },
  {
    name: "kumotoriyama_20260805",
    // 2026-08-05 綴葉モードで checkpoints / activity_detail の切り出しに失敗した実レポート。
    // 「すべて見る」が「すて上る」と読まれ、文字の脱落だけでなく**取り違え**（見→上）が
    // 混ざっていたため、部分列による断片判定をすり抜けていた。
    description: "雲取山レポート（併記リンクに読み違えが混ざるケース）",
    expected: {
      header: { top: 0, bottom: 1073 },
      activityData: { top: 1073, bottom: 2477 },
      checkpoints: { top: 2477, bottom: 4785 },
      activityDetail: { top: 4785, bottom: 6873, endMethod: "grid_detection" },
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
      line: "活動 詳細 て る",
      label: "活動詳細",
      want: true,
      why: "「すべて見る」の文字が抜け落ち断片だけが残ったケース（kuwasakiyama）",
    },
    {
      line: "活動 詳細 べ 見 る",
      label: "活動詳細",
      want: true,
      why: "同上。抜け方が変わっても既知 UI 語の部分列なら断片とみなす",
    },
    {
      line: "活動 詳細 す て 上 る",
      label: "活動詳細",
      want: true,
      why: "「べ」が脱落し「見」が「上」へ読み違えられたケース（kumotoriyama）",
    },
    {
      line: "写真 も",
      label: "写真",
      want: false,
      why: "1文字の残りは助詞と区別がつかないため、部分列に一致しても断片とみなさない",
    },
    {
      line: "活動 詳細 も 見 た",
      label: "活動詳細",
      want: false,
      why: "既知 UI 語と3文字中2文字しか一致しない行は、読み違えとみなす水準に届かない",
    },
    {
      line: "活動 詳細 すべ て 見 る もの",
      label: "活動詳細",
      want: false,
      why: "既知 UI 語を除いてもなお語が残る行は、リンク併記ではなく本文",
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

describe("診断情報（debug）", () => {
  it("採用された見出しを元画像座標つきで報告する", async () => {
    const fixture = loadFixture("hijiriyama_20260728");
    const boundaries = await detectSectionBoundaries(
      toOcrResult(fixture),
      createReplayProbe(fixture),
    );

    const detail = boundaries.debug.headingCandidates.find(
      (candidate) => candidate.label === "活動詳細",
    );

    expect(detail).toBeDefined();
    expect(detail?.status).toBe("accepted");
    // 見出し＋リンクが1行として読まれていることが診断から分かる
    expect(detail?.text.replace(/\s/g, "")).toBe("活動詳細すべて見る");
    // 元画像座標が boundaries と一致していること（予備フローの座標決めに使うため）
    expect(detail?.imageY.y0).toBe(boundaries.activityDetail?.top);
  });

  it("棄却された見出し候補を理由つきで報告する", async () => {
    const fixture = loadFixture("hijiriyama_20260728");
    // 見出し行に日本語の語を混ぜ、isHeadingLine に弾かれる状態を作る
    const brokenLines = fixture.lines.map((line) => ({
      ...line,
      text: line.text.replace(/活動\s*詳細/g, "活動詳細の記録について"),
    })) as unknown as Line[];

    const boundaries = await detectSectionBoundaries(
      toOcrResult(fixture, brokenLines),
      createReplayProbe(fixture),
    );

    expect(boundaries.activityDetail).toBeNull();

    const detail = boundaries.debug.headingCandidates.find(
      (candidate) => candidate.label === "活動詳細",
    );

    // 「見出しらしき行はあったが弾かれた」ことと、その位置が分かる
    expect(detail?.status).toBe("not_heading");
    expect(detail?.imageY.y0).toBeGreaterThan(0);
  });

  it("活動詳細の下端解決で、試した手段と決め手を順に報告する", async () => {
    const fixture = loadFixture("hijiriyama_20260728");
    const boundaries = await detectSectionBoundaries(
      toOcrResult(fixture),
      createReplayProbe(fixture),
    );

    // このレポートには「写真」見出しが無く、グリッド検知が決め手になる
    expect(boundaries.debug.activityDetailBottomSteps).toEqual([
      { method: "photo_label", found: false },
      { method: "grid_detection", found: true, bottom: 6149 },
    ]);
  });

  it("見出しが取れなかった場合、下端解決は試行されない", async () => {
    const fixture = loadFixture("hijiriyama_20260728");
    const brokenLines = fixture.lines.map((line) => ({
      ...line,
      text: line.text.replace(/活動\s*詳細/g, "XX"),
    })) as unknown as Line[];

    const boundaries = await detectSectionBoundaries(
      toOcrResult(fixture, brokenLines),
      createReplayProbe(fixture),
    );

    expect(boundaries.debug.activityDetailBottomSteps).toBeNull();
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
