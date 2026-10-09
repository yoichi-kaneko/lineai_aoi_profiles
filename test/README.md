# テスト

ルートの `src/` とリポジトリルートのシェルスクリプトに対するテストを置く。`functions/` は独立したワークスペースパッケージのため、そちらのテストは `functions/test/` に置く。

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
├── codex/
│   └── review.test.ts         # レビューの引数解釈・環境変数の解決・codex 引数の組み立て・子プロセスへ渡す環境変数の絞り込み
├── env/
│   └── dotenv_quiet.test.ts   # src/ 全体の dotenv.config が quiet: true を渡しているか
├── fixtures/
│   ├── geo/
│   │   └── select_locations/  # 座標の選択・集約の入力に使う架空の座標
│   ├── image/
│   │   └── plot_locations/  # 点描画の入力に使う架空の座標
│   └── yamap/
│       └── activity/   # 活動記録ページの __NEXT_DATA__ を縮小したJSON
├── firebase/
│   ├── noteTypes.test.ts      # NOTE_TYPE の許可値
│   ├── runLogModes.test.ts    # JST 時間帯境界（日次モードの判定・結星の実行時間帯）
│   └── get_docs.test.ts       # 取得条件の解釈（--type / --collection / 日付範囲）・type 絞り込み・出力整形
├── geo/
│   ├── places.test.ts             # 候補の検証・同じ地点のまとめ・距離計算
│   ├── cluster_places.test.ts     # ③集合化の統合・停止条件・代表地点・描画後の点の間隔
│   ├── nearest_places.test.ts     # ②中心近傍選択の中心決定・中心の指定・半径・吸収・上限
│   ├── evaluate_selection.test.ts # 描画後の見た目による評価・方式の採否
│   └── select_locations.test.ts   # 分布ごとの採用方式・出力形式・要約・引数解釈
├── google_calendar/
│   └── get_events.test.ts     # 終日予定の最終日計算・日付検証・RFC3339 変換
├── image/
│   ├── embed_qr.test.ts       # QRコード埋め込みの引数解釈・アンカー座標・パス検証
│   └── plot_locations.test.ts # 点描画の入力検証・投影・自動フィット・PNG の画素・パス検証
├── line/
│   └── download_image.test.ts # 受け取った画像の取得先の切り替え（Cloudinary → LINE）・public_id の組み立てと functions 側との一致・署名付き URL
├── openweather/
│   └── forecast.test.ts       # API エラー判定・日時整形
├── shell/
│   ├── deploy.test.ts         # 一時 Git リポジトリでの更新・依存インストール・失敗時の停止
│   └── send_daily_line.test.ts # runner の起動情報の受け渡し（響の対象ID・投稿日の検証、従来モードの互換性、結星の実行時間帯と run_logs による実行済みスキップ）と作業領域 tmp/ の扱い
├── swarm/
│   └── get_checkins.test.ts   # JST 範囲計算・整形
├── todoist/
│   ├── put_task.test.ts       # タスク作成の引数解釈・description ファイルのパス検証
│   ├── task_url.test.ts       # タスクURL・タスクIDの正規化
│   ├── get_comments.test.ts   # 引数解釈・対応方針コメントの除外
│   └── get_task.test.ts       # 未完了取得と完了済みフォールバック
├── twitter/
│   └── post.test.ts           # tmp/ 内画像パス検証
├── util/
│   ├── credentials.test.ts    # 資格情報の取得元の決定（中身の環境変数 / パス）・JSON と base64 の解釈
│   ├── download_image.test.ts # 保存ファイル名決定
│   ├── google_oauth.test.ts   # OAuth キーファイルの項目抽出・tokens.json のパス解決
│   └── random_choice.test.ts  # 重み付き抽選
└── yamap/
    ├── format.test.ts          # 共通整形・ラベル境界
    ├── fetch_plan.test.ts      # 計画ページの埋め込みJSONパース
    └── fetch_activity.test.ts  # 活動記録ページの埋め込みJSONパース・レポート整形
```

現在の対象は、YAMAP の埋め込み JSON を使うパース・整形、Google Calendar の日付変換、
Firestore / Todoist / Twitter / Cloudinary / LINE / Swarm / OpenWeather / 画像合成・点描画・座標の選択と集約のうち
**外部接続なしで価値の高い判断ロジック**です。いずれもネットワークへ出ない純関数、
または `fetch` / SDK を呼ぶ手前の境界検証を対象にします。

シェルスクリプトのテストは、スクリプト一式を一時ディレクトリへ複製し、`CLAUDE_BIN` を起動引数を記録するスタブへ差し替えて実行する
（`test/shell/send_daily_line.test.ts` 参照）。実際の claude 起動・LINE 送信・Firestore アクセスは行わず、リポジトリの `tmp/` にも触れない。
`test/shell/` は Bash と Unix の symlink / `flock` の挙動を前提とし、Windows では運用上も対象スクリプトを実行しないため、テストをスキップする。Linux CI では従来どおり実行する。
`run_logs` を確認するモード（`morning` / `noon` / `night`）は `pnpm exec tsx` を呼ぶため、この方式では扱わない。

`deploy.sh` は一時ディレクトリ内の Git リポジトリとローカルの bare リポジトリを使って検証する。`pnpm` は起動内容を記録するスタブに置き換え、開発中のチェックアウトの更新や実際の依存インストールは行わない。

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
- `src/todoist/get_task.ts`
- `src/twitter/post.ts`
- `src/cloudinary/upload_image.ts`
- `src/line/download_image.ts`
- `src/openweather/forecast.ts`
- `src/swarm/get_checkins.ts`
- `src/util/random_choice.ts`
- `src/util/download_image.ts`
- `src/util/credentials.ts`
- `src/util/google_oauth.ts`
- `src/image/embed_qr.ts`
- `src/image/plot_locations.ts`
- `src/geo/places.ts`
- `src/geo/cluster_places.ts`
- `src/geo/nearest_places.ts`
- `src/geo/evaluate_selection.ts`
- `src/geo/select_locations.ts`
- `src/codex/review.ts`
- `send_daily_line.sh` / `refresh_tmp.sh`（`test/shell/send_daily_line.test.ts`）
- `deploy.sh`（`test/shell/deploy.test.ts`）
- `src/**/*.ts` の `dotenv.config()` 呼び出し（`test/env/dotenv_quiet.test.ts`）

### 間接カバーまたは今回の対象外

- 薄い CLI ラッパー（`src/line/send_*.ts` など）は下位モジュールのテストで間接カバーする。
- OAuth 認証 (`src/google_calendar/auth.ts`, `src/google_drive/auth.ts`) は対話的かつ外部接続前提のため、自動テスト対象外とする。両者が使う資格情報・トークンの読み込みは `src/util/credentials.ts` / `src/util/google_oauth.ts` 側で直接テストしている。
- 実 API への接続自体が本体の処理であるモジュールは、引数検証・パス検証・整形ロジックのみを自動テストし、疎通確認は手動で行う。
- `src/codex/review.ts` の codex 起動そのもの（子プロセスの spawn・タイムアウト・終了コードの分岐）は、外部 CLI と外部 API に依存するため自動テスト対象外とする。純関数（引数解釈・環境変数の解決・引数の組み立て・環境変数の絞り込み）のみを直接テストし、`status` の5分岐（`ok` / `skipped` / `unavailable` / `timeout` / `error`）は手動で確認する。

## フィクスチャの方針

点描画のフィクスチャ（`fixtures/image/plot_locations/`）は、実在のチェックインに由来しない**架空の座標**だけで作っている。
Swarm（Foursquare）の API から取得したデータを使って生成した画像は Foursquare の規約上保持できないため、Swarm のチェックインから起こした座標は追加しない。

| ファイル | 特徴 |
|---|---|
| `near_only.json` | 近場の地点だけ（8件） |
| `near_and_far.json` | 先頭6件が `near_only.json` と同じ近場の地点で、遠方の地点2件が混じる（密度のムラの確認用） |

座標の選択・集約のフィクスチャ（`fixtures/geo/select_locations/`）も同じ方針で、実在の地名の周辺へシード固定の擬似乱数でばらまいた**架空の座標**だけで作っている。
`placeId` も `tokyo-01` のような架空の値で、地域の見分けに使う（テストでは接頭辞で中心や採用結果の地域を確かめる）。
1要素がチェックイン1件に当たり、同じ `placeId` の要素は同じ施設への反復訪問を表す。

| ファイル | 特徴 |
|---|---|
| `tokyo_wide.json` | 都内だけで広く移動した週（24地点・30件） |
| `tokyo_repeats.json` | 同一施設・隣接施設への反復が多い週（6地点・10件） |
| `tokyo_many_far_few.json` | 東京に多数、遠征先に少数の点がある週 |
| `tokyo_few_far_many.json` | 東京に少数、遠征先に多数の点がある週 |
| `multi_regions.json` | 東京に加えて遠方の地域が3つある週 |
| `rail_line.json` | 駅が約2km間隔で路線沿いに連続する週（`placeId` なし） |
| `bay_split.json` | 湾を挟む2地域。重心が海の上に来る |
| `single_outlier.json` | 都内の多数の地点に、遠方の単独1点が混じる週 |
| `invalid_entries.json` | 座標の欠落・型違い・範囲外・`null` などの不正な要素を含む |

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
