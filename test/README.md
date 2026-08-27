# テスト

ルートの `src/` に対するテストを置く。`functions/` は独立したワークスペースパッケージのため、そちらのテストは `functions/test/` に置く。

```bash
pnpm test        # ルートのテストを実行する
pnpm test:functions # functions のテストを実行する
pnpm test:watch  # ウォッチ実行
pnpm test:all    # ルート + functions の全テスト
```

GitHub へプッシュすると `.github/workflows/test.yml` が同じ `pnpm test:all` を実行する。
テストは外部 API へ接続しないため、CI 側に `.env` の設定は不要。

## 構成

```text
test/
├── cloudinary/
│   └── upload_image.test.ts   # プレビュー縮小計算
├── fixtures/
│   └── yamap/
│       └── activity/   # 活動記録ページの __NEXT_DATA__ を縮小したJSON
├── firebase/
│   ├── noteTypes.test.ts      # NOTE_TYPE の許可値
│   ├── runLogModes.test.ts    # JST 時間帯境界
│   └── get_docs.test.ts       # 取得条件の解釈（--type / --collection / 日付範囲）・type 絞り込み・出力整形
├── google_calendar/
│   └── get_events.test.ts     # 終日予定の最終日計算・日付検証・RFC3339 変換
├── image/
│   └── embed_qr.test.ts       # QRコード埋め込みの引数解釈・アンカー座標・パス検証
├── mureka/
│   └── generate_lyrics.test.ts # 歌詞正規化
├── openweather/
│   └── forecast.test.ts       # API エラー判定・日時整形
├── swarm/
│   └── get_checkins.test.ts   # JST 範囲計算・整形
├── todoist/
│   ├── put_task.test.ts       # タスク作成の引数解釈・description ファイルのパス検証
│   ├── task_url.test.ts       # タスクURL・タスクIDの正規化
│   └── get_comments.test.ts   # 引数解釈・対応方針コメントの除外
├── twitter/
│   └── post.test.ts           # tmp/ 内画像パス検証
├── util/
│   ├── download_image.test.ts # 保存ファイル名決定
│   └── random_choice.test.ts  # 重み付き抽選
└── yamap/
    ├── format.test.ts          # 共通整形・ラベル境界
    ├── fetch_plan.test.ts      # 計画ページの埋め込みJSONパース
    └── fetch_activity.test.ts  # 活動記録ページの埋め込みJSONパース・レポート整形
```

現在の対象は、YAMAP の埋め込み JSON を使うパース・整形、Google Calendar の日付変換、
Firestore / Todoist / Twitter / Cloudinary / Mureka / Swarm / OpenWeather / 画像合成のうち
**外部接続なしで価値の高い判断ロジック**です。いずれもネットワークへ出ない純関数、
または `fetch` / SDK を呼ぶ手前の境界検証を対象にします。

CLI スクリプトをテスト対象にする場合は、`main()` の実行を
「直接起動されたときだけ走らせる」ガード（`src/firebase/get_docs.ts` の `isDirectRun` 参照）で囲み、
判断ロジックを純関数として `export` してからテストを書く。

ファイルパスを検証するテストでは、`/assets/images/...$` のような**区切り文字を直書きした正規表現で照合しない**こと。
開発環境は macOS / Windows が混在し、CI は Linux（`ubuntu-latest`）のため、Windows では区切りが `\` になって落ちる。
期待値も `path.resolve` / `path.join`（必要なら `realpathSync`）で組み立て、実装と同じ手順で作った文字列と突き合わせる
（`test/image/embed_qr.test.ts` の `resolveBaseImagePath` 参照）。

## 直接カバー / 間接カバー

### 直接テストしている主なファイル

- `src/yamap/format.ts`
- `src/yamap/fetch_plan.ts`
- `src/yamap/fetch_activity.ts`
- `src/google_calendar/get_events.ts`
- `src/firebase/get_docs.ts`
- `src/firebase/noteTypes.ts`
- `src/firebase/runLogModes.ts`
- `src/todoist/put_task.ts`
- `src/todoist/task_url.ts`
- `src/todoist/get_comments.ts`
- `src/twitter/post.ts`
- `src/cloudinary/upload_image.ts`
- `src/mureka/generate_lyrics.ts`
- `src/openweather/forecast.ts`
- `src/swarm/get_checkins.ts`
- `src/util/random_choice.ts`
- `src/util/download_image.ts`
- `src/image/embed_qr.ts`

### 間接カバーまたは今回の対象外

- 薄い CLI ラッパー（`src/line/send_*.ts` など）は下位モジュールのテストで間接カバーする。
- OAuth 認証 (`src/google_calendar/auth.ts`, `src/google_drive/auth.ts`) は対話的かつ外部接続前提のため、自動テスト対象外とする。
- 実 API への接続自体が本体の処理であるモジュールは、引数検証・パス検証・整形ロジックのみを自動テストし、疎通確認は手動で行う。

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
