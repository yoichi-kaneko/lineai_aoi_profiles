# テスト

ルートの `src/` に対するテストを置く。`functions/` は独立したワークスペースパッケージのため対象外。

```bash
pnpm test        # 全テストを実行する
pnpm test:watch  # ウォッチ実行
```

GitHub へプッシュすると `.github/workflows/test.yml` が同じ `pnpm test` を実行する。
テストは外部 API へ接続しないため、CI 側に `.env` の設定は不要。

## 構成

```text
test/
├── fixtures/
│   └── yamap/
│       └── activity/   # 活動記録ページの __NEXT_DATA__ を縮小したJSON
├── firebase/
│   └── get_docs.test.ts       # 取得条件の解釈（--type / --collection / 日付範囲）と type 絞り込み
├── google_calendar/
│   └── get_events.test.ts     # 終日予定の最終日計算・日付検証
└── yamap/
    ├── fetch_plan.test.ts      # 計画ページの埋め込みJSONパース
    └── fetch_activity.test.ts  # 活動記録ページの埋め込みJSONパース・レポート整形
```

現在の対象は、YAMAP の埋め込み JSON（`__NEXT_DATA__`）を読み取る2つのスキル、
Google Calendar の終日予定に対する最終日計算、
`get_firestore_docs` の引数解釈（`--type` の正規化・`NOTE_TYPE` 検証・日付範囲）と `type` 絞り込みです。
いずれもネットワークへ出ない純関数のテストです。

CLI スクリプトをテスト対象にする場合は、`main()` の実行を
「直接起動されたときだけ走らせる」ガード（`src/firebase/get_docs.ts` の `isDirectRun` 参照）で囲み、
判断ロジックを純関数として `export` してからテストを書く。

## フィクスチャの方針

活動記録のフィクスチャは、実ページの `__NEXT_DATA__` から
**テストに必要なフィールドだけを抜いた縮小版**をコミットしている（1件あたり 10〜20KB）。
原寸は 200KB〜660KB あり、その大半は写真・装備・i18n など取得対象外のデータが占める。

| ファイル | 元にした活動記録 | 特徴 |
|---|---|---|
| `kumotoriyama_day_trip.json` | `activities/49604731` | 日帰り・チェックポイント19件 |
| `akaishidake_two_days.json` | `activities/42223530` | 1泊2日・チェックポイント29件 |

期待値は **YAMAP の画面表示に実際に出ている値**を書いている
（タイム `6時間34分` は画面の `06:34`、距離 `23.3km` は画面の `23.3km` に対応する）。
埋め込み JSON には画面表示と一致しない別系統の値も入っているため、
参照先を間違えるとテストが落ちる。

## フィクスチャの追加手順

取得に失敗する活動記録が見つかったときは、テストケースとして追加してからロジックを直す。

1. 対象ページの HTML を取得し、`<script id="__NEXT_DATA__">` の中身を取り出す
2. `fetch_activity.ts` が参照するフィールド（`activity` の主要項目・`activityWholeSection`・
   `checkpoints`・`activityDailySections`）だけを残した JSON を
   `test/fixtures/yamap/activity/{名前}.json` へ保存する
3. `test/yamap/fetch_activity.test.ts` へ、**画面表示を確認したうえで**期待値を書く
4. `pnpm test` で既存ケースのデグレードも含めて確認する

> 失敗ケースを追加した直後は、期待値どおりにならず**テストが落ちるのが正しい**。
> 出力をそのまま期待値にせず、「あるべき値」を書くこと。
