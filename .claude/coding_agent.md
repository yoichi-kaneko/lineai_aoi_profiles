# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイドラインです。

## プロジェクト概要

LINE AIアシスタント「碧衣（あおい）」の設定・スキル管理リポジトリ。
朝（暁）・昼（望）・夜（小夜）の3つの定期モードに加え、登山イベントでトリガーされる特別モード（門灯＝入山・継灯＝山小屋到着・帰灯＝下山）と楽曲を届ける調べモードを持ち、カレンダー確認・登山計画・日次振り返りなどをLINEに自動送信するシステム。

## ディレクトリ構成

```text
lineai_aoi_profiles/
├── CLAUDE.md               # このファイル
├── README.md               # プロジェクト概要
├── aoi.md                  # 碧衣のメインプロファイル定義
├── package.json            # pnpm パッケージ管理（ルート）
├── pnpm-workspace.yaml     # pnpm ワークスペース定義
├── .env                    # 環境変数（Git管理外）
├── .env.example            # 環境変数テンプレート
├── assets/
│   ├── image_guideline.md         # 画像生成ガイドライン本体（核／彩りの2層・衣装・プロンプト構成フレームワーク）
│   ├── image_guideline_hike.md    # 山行シーンの構図ガイド（山行シーンのときだけオンデマンド参照）
│   ├── image_guideline_samples.md # 画像生成プロンプトの詳細な記述例（6パターン・オンデマンド参照）
│   ├── songs_guideline.md  # 楽曲生成ガイドライン（スタイル・歌詞構成）
│   ├── scribe_image_guideline.md  # SNS投稿画像ガイドライン（綴葉モード用）
│   └── images/             # キャラクター設定画像（base / outfit_a〜d / room / ruri / hotaru）
├── modes/
│   ├── morning.md          # 暁モード定義
│   ├── noon.md             # 望モード定義
│   ├── night.md            # 小夜モード定義
│   ├── up_mountain.md      # 門灯モード定義（入山通知）
│   ├── stay_mountain.md    # 継灯モード定義（山小屋到着通知）
│   ├── off_mountain.md     # 帰灯モード定義（下山通知）
│   ├── song.md             # 調べモード定義（楽曲生成）
│   └── scribe.md           # 綴葉モード定義（YAMAPレポートのSNS代筆投稿・手動起動のみ）
├── src/                    # 各スキルの処理実装
│   ├── cloudinary/         # Cloudinary 画像・音声アップロード
│   ├── firebase/           # Firebase / Firestore アクセス（run_logs・--collection で専用コレクションも）
│   ├── gemini/             # Google Gemini 画像生成
│   ├── google_calendar/    # Google Calendar 予定取得・OAuth認証
│   ├── google_drive/       # Google Drive ファイルダウンロード・OAuth認証
│   ├── google_map/         # Google Maps ジオコーディング
│   ├── image/              # 画像へのQRコード埋め込み（ローカル画像処理）
│   ├── line/               # LINE メッセージ送信・画像ダウンロード
│   ├── mureka/             # Mureka 楽曲・歌詞生成
│   ├── openai/             # OpenAI GPT 画像生成
│   ├── openweather/        # OpenWeatherMap 天気予報取得
│   ├── swarm/              # Swarm チェックイン取得
│   ├── todoist/            # Todoist タスク操作
│   ├── twitter/            # Twitter（X）投稿
│   ├── util/               # 汎用ユーティリティ
│   └── yamap/              # YAMAP 計画書・活動記録の取得（埋め込み JSON のパース）
│       ├── fetch_plan.ts       # 山行計画ページ
│       ├── fetch_activity.ts   # 活動記録ページ
│       └── format.ts           # 両者で共通の整形・ラベル判定
├── .claude/
│   ├── rules/              # 常時適用ルール（aoi.md から @import で参照される）
│   │   ├── aoi_character.md    # エージェントの指針・伴侶の妖精ルリ
│   │   ├── aoi_user_profile.md # ユーザーに関する基本情報
│   │   ├── aoi_messaging.md    # 個人宛・家族グループ宛のメッセージ作法
│   │   └── aoi_constraints.md  # 注意事項（口調など）
│   ├── docs/               # 補助ドキュメント（Firestore スキーマ・退避運用など）
│   │   ├── image_log_schema.md       # image_logs（柱A）のスキーマ・記録コマンド
│   │   ├── image_feedback_schema.md  # image_feedback（柱B）のスキーマ・パース仕様
│   │   ├── song_log_schema.md        # song_logs（楽曲生成ログ）のスキーマ・記録コマンド
│   │   ├── song_feedback_schema.md   # song_feedback（楽曲フィードバック）のスキーマ・パース仕様
│   │   ├── line_send_fallback.md     # LINE 送信失敗時の Firestore 退避
│   │   ├── long_sleep_execution.md   # 長時間処理の実行方法（sleep・タイムアウト時の扱い）
│   │   ├── mountain_notice_guide.md  # 山行連絡モード（継灯・帰灯）の共通手順
│   │   ├── night_image_theme.md      # 小夜モードの画像テーマ抽選（候補・重み・当選後の扱い）
│   │   ├── song_from_aoi_extract.md  # 調べモードの from_aoi からの天候傾向の抽出手順
│   │   └── yamap_activity_guide.md   # YAMAP 活動記録レポートの重点チェックガイド
│   └── skills/             # カスタムスキル（各スキルは SKILL.md のみ）
│       ├── download_google_drive_file/
│       ├── download_image/
│       ├── download_line_image/
│       ├── download_mureka_audio/
│       ├── download_todoist_attachment/
│       ├── embed_qr_code/
│       ├── fetch_yamap_activity/
│       ├── fetch_yamap_plan/
│       ├── generate_gemini_image/
│       ├── generate_gpt_image/
│       ├── generate_mureka_lyrics/
│       ├── generate_mureka_song/
│       ├── get_firestore_docs/
│       ├── get_google_calendar_events/
│       ├── get_openweather_forecast/
│       ├── get_swarm_checkins/
│       ├── get_todoist_comments/
│       ├── get_todoist_completed_tasks/
│       ├── get_todoist_tasks/
│       ├── post_twitter/
│       ├── put_firestore_doc/
│       ├── put_todoist_task/
│       ├── random_choice/
│       ├── review_image_feedback/
│       ├── review_song_feedback/
│       ├── run_aoi_daily/
│       ├── run_aoi_scribe/
│       ├── send_line_audio/
│       ├── send_line_image/
│       └── send_line_text/
├── test/                   # ルート src/ に対するテスト（詳細は test/README.md）
│   ├── fixtures/           # テスト用フィクスチャ（活動記録の縮小 JSON）
│   ├── firebase/           # get_firestore_docs の引数解釈・type 絞り込みのテスト
│   ├── google_calendar/    # 終日予定の最終日計算のテスト
│   └── yamap/              # YAMAP 計画書・活動記録のパースと整形のテスト
├── .github/
│   └── workflows/
│       └── test.yml        # プッシュ時に pnpm test を実行する GitHub Actions
└── tmp/                    # 一時ファイル（画像など）
```

## 開発タスクの種類

### 1. mdファイルの修正（AIの挙動調整）

AIの応答・行動パターンを変更する場合は以下のファイルを編集する：

| ファイル | 用途 |
|---|---|
| `aoi.md` | 碧衣の共通フロー・モード構成（キャラクター・制約は `.claude/rules/` に分離） |
| `.claude/rules/aoi_character.md` | エージェントの指針・伴侶の妖精ルリの設定 |
| `.claude/rules/aoi_user_profile.md` | ユーザーの居住地・生活スタイル・判断指針 |
| `.claude/rules/aoi_messaging.md` | 個人宛・家族グループ宛のメッセージ作法 |
| `.claude/rules/aoi_constraints.md` | 常時適用の注意事項（口調など） |
| `modes/morning.md` | 暁モードの実行手順・判断ロジック |
| `modes/noon.md` | 望モードの実行手順・判断ロジック |
| `modes/night.md` | 小夜モードの実行手順・判断ロジック |
| `modes/up_mountain.md` | 門灯モード（入山通知）の実行手順・判断ロジック |
| `modes/stay_mountain.md` | 継灯モード（山小屋到着通知）の実行手順・判断ロジック |
| `modes/off_mountain.md` | 帰灯モード（下山通知）の実行手順・判断ロジック |
| `modes/song.md` | 調べモード（楽曲生成）の実行手順・判断ロジック |
| `modes/scribe.md` | 綴葉モード（YAMAPレポートのSNS代筆投稿）の実行手順・判断ロジック |
| `assets/image_guideline.md` | 画像生成プロンプトの定義・衣装リスト・構成フレームワーク本体 |
| `assets/image_guideline_hike.md` | 山行シーンの構図ルール（遠景の主役・碧衣とルリの向き・正面構図のポーズ・副素材）。山行シーンのときだけ参照する |
| `assets/image_guideline_samples.md` | 画像生成プロンプトの詳細な記述例（6パターン）。本体から分離し、生成時にオンデマンド参照する |
| `assets/songs_guideline.md` | 楽曲生成のスタイル・歌詞構成ガイドライン |
| `assets/scribe_image_guideline.md` | 綴葉モードのSNS投稿画像ガイドライン |
| `.claude/docs/mountain_notice_guide.md` | 継灯・帰灯が共通で使う山行コンテキストの確定と時刻の採用優先順位 |
| `.claude/docs/night_image_theme.md` | 小夜モードの画像テーマ抽選（候補の作り方・重みの表・当選後の扱い） |
| `.claude/docs/song_from_aoi_extract.md` | 調べモードが `from_aoi` から天候の傾向だけを取り出す手順 |

### 2. スキルの実装

スキルの定義は `.claude/skills/{skill_name}/SKILL.md` に、処理の実装は `src/{module}/` 以下に配置する。

**スキルの構成:**
```text
{skill_name}/
└── SKILL.md           # スキル定義（Claude Codeが読み込む設定）
```

**SKILL.md の構成:**
- フロントマター（`name`, `description`）
- 概要・前提条件
- 実行方法（`pnpm exec tsx src/{module}/{main}.ts` 形式）
- Claudeへの指示セクション

**TypeScript実装の慣習:**
- 実行方法: プロジェクトルートで `pnpm exec tsx src/{module}/{main}.ts [引数]`
- 環境変数の読み込み: `dotenv` で `../../.env`（`src/{module}/` から2階層上）を参照
- エラー時は `console.error` + `process.exit(1)`
- Firestore 系（`src/firebase/`）は初期化・タイムアウト・終了処理を `src/firebase/client.ts` に集約している。新しい Firestore CLI を追加する場合は `initFirestore()` / `withFirestoreTimeout()` / `finishFirestoreCli()` / `handleFirestoreCliError()` を使い、`initializeApp` を直に書かないこと（詳細は [README.md](../README.md) の「タイムアウト・リトライ」層3を参照）

## パッケージ管理

```bash
# 依存インストール（ルートディレクトリで実行）
pnpm install
```

新しい依存パッケージを追加する場合:
```bash
# ルートの package.json の dependencies に追記してから実行
pnpm install
```

## スキル動作確認

スキルの手動実行はプロジェクトルートから直接行う：

```bash
cd {プロジェクトルート}
pnpm exec tsx src/{module}/{main}.ts [引数]
```

環境変数は `.env` から自動読み込みされる（dotenvで設定済み）。

## 自動テスト

vitest を使用する。テストは `test/` 配下に置く（`src/` にはテストを混ぜない）。

```bash
pnpm test        # 全テストを実行する
pnpm test:watch  # ウォッチ実行
```

現在の対象は YAMAP の埋め込み JSON（`__NEXT_DATA__`）を読み取る `fetch_plan.ts` / `fetch_activity.ts`、
Google Calendar の `get_events.ts`、Firestore の `get_docs.ts`（引数解釈・`type` 絞り込み）。
いずれもネットワークへ出ない純関数のテストで、1秒未満で完了する。
CLI スクリプトをテスト対象にする場合は、`main()` を `isDirectRun` ガードで囲み（`src/firebase/get_docs.ts` 参照）、
判断ロジックを純関数として `export` すること。

プッシュすると `.github/workflows/test.yml` が同じ `pnpm test` を実行する（外部 API へ接続しないためシークレット不要）。
**取得に失敗する記録が見つかったら、フィクスチャとして追加してからロジックを直す**のが運用方針。
構成・フィクスチャの追加手順は [test/README.md](../test/README.md) を参照。

## 環境変数

`.env.example` を参照。必要な変数:
- `FIREBASE_CONFIG_PATH` - Firebase サービスアカウントJSONのパス（`FIRESTORE_TIMEOUT_MS` は任意・既定30000ms）
- `LINE_ACCESS_TOKEN` / `LINE_DESTINATION_USER_ID` - LINE Messaging API
- `GOOGLE_OAUTH_CREDENTIALS` / `GOOGLE_CALENDAR_ID` / `GOOGLE_CALENDAR_TIMEZONE` - Google Calendar
- `GOOGLE_GEMINI_API_KEY` / `GOOGLE_GEMINI_GENERATE_IMAGEMODEL` / `GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR` - Gemini画像生成
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_ASSET_FOLDER` / `CLOUDINARY_SONG_ASSET_FOLDER` - Cloudinary（画像・音声ホスティング）
- `OPEN_WEATHER_APP_ID` - OpenWeatherMap
- `SWARM_OAUTH_TOKEN` - Swarm
- `MUREKA_API_KEY` / `MUREKA_MODEL` / `MUREKA_VOCAL_ID`（任意） - Mureka楽曲生成

## 注意事項

- **移行の経緯はプロファイルに書かない**。仕様変更・機能移設の経緯（「従来は〜だったが〜へ移設した」「以前は〜の運用だった」など）は、残す必要があると判断したものだけを [README.md](../README.md) に書き、`aoi.md` / `modes/*.md` / `assets/*.md` / `.claude/rules/*.md` / `.claude/docs/*.md` といったプロファイル側には書かないこと。これらは碧衣が実行のたびに読み込むファイルであり、経緯は現在の判断に寄与しないうえ、加筆が累積してコンテキストを圧迫する原因になる。プロファイルには**現在のルールだけ**を書き、「今はこうしない」という禁止事項が必要な場合も、過去の運用を説明せず禁止だけを書く。経緯を追う必要が生じたときは git 履歴を参照する
- 同時実行・複数回実行のシステム的防止（原子的な実行予約・分散ロック・idempotency key・再実行フラグによるガード等）は導入しない方針。現状は `send_daily_line.sh` の `run_logs` 実行前スキップ（`morning` / `noon` / `night` のみ・ベストエフォート）に留め、手動起動モードの再実行回避は運用者判断に委ねる。レビュー指摘や一般的なベストプラクティスを理由に追加実装しないこと。詳細は [README.md](../README.md) の「二重実行防止」セクションを参照
- `.env` はGit管理外（`.gitignore`に含まれる）。直接編集・コミットしないこと
- `tmp/` は各処理（モード）内でのみ使う揮発的な一時ファイル置き場。コミット不要。処理開始時に前回の残骸があっても内容を確認・参照せず、固定名ファイルは上書きして使う（本番フローでは `send_daily_line.sh` が起動ごとに `refresh_tmp.sh` で掃除する）
- `send_line_*`（`send_line_text` / `send_line_image` / `send_line_audio`）はメッセージ本文を引数で直接渡さず、`tmp/line_message.txt` に保存してそのパスを引数に渡す方式。改行はそのまま改行として書けばよく、`\n` への置換は不要（各スキルの SKILL.md 参照）
- `generate_mureka_lyrics` / `generate_mureka_song` も同様に、複数行テキストを引数で直接渡さず `tmp/` 配下の一時ファイル経由で受け渡す方式（`tmp/mureka_lyrics_prompt.txt`、`tmp/mureka_song_lyrics.txt`、`tmp/mureka_song_prompt.txt`）。各スキルの SKILL.md 参照
- `put_firestore_doc` も同様に、本文（`description`）を引数で直接渡さず `tmp/firestore_doc.txt` に保存して `--description-file` で渡す方式。改行はそのまま改行として書けばよく、`\n` への置換は不要（SKILL.md 参照）
- `generate_gpt_image` も同様に、プロンプトを引数で直接渡さず `tmp/gpt_image_prompt.txt` に保存し、そのパスを第一引数に渡す方式（第二引数は参考画像ファイル名）。改行はそのまま改行として書けばよく、`\n` への置換は不要（SKILL.md 参照）
- `put_todoist_task` も同様に、詳細（`description`）を引数で直接渡さず `tmp/todoist_task.txt` に保存して `--description-file` で渡す方式。改行はそのまま改行として書けばよく、`\n` への置換は不要。タイトル（`content`）は1行に収まるため従来どおり第一位置引数で渡す（SKILL.md 参照）
- 画像生成スキルは `GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR` に設定された参照画像を自動添付する
- 画像生成フィードバック機構（issue #43）の `image_logs` / `image_feedback` / `image_feedback_reviews` は、`notes` とは別の**専用コレクション**に隔離されている。`get_firestore_docs` / `put_firestore_doc` の `--collection` オプションで読み書きし（デフォルトは `notes` で後方互換）、`notes` 以外では `NOTE_TYPE` 検証をバイパスして `type` をコレクション内識別用の任意値（`image_log` / `image_feedback` / `review_marker`）として扱う。日々の各モードのコンテキストには流入させず、`review_image_feedback` スキル（柱C）でのみ参照する。スキーマは [`.claude/docs/image_log_schema.md`](docs/image_log_schema.md) / [`image_feedback_schema.md`](docs/image_feedback_schema.md) を参照
- 楽曲生成ログ（issue #68/#69）の `song_logs` も、`notes` とは別の**専用コレクション**に隔離する。調べモードのフェーズA完了時に `type: song_log` で記録し、次回以降の調べモードで直近2〜3件を参照してスタイルパッケージや主要モチーフの連続を避ける。スキーマは [`.claude/docs/song_log_schema.md`](docs/song_log_schema.md) を参照
- 楽曲フィードバック機構（issue #71）の `song_feedback` / `song_feedback_reviews` も同様に**専用コレクション**に隔離する。`楽曲評価` / `音楽評価` で始まる LINE 返信を `receiveLineMessage` Webhook が `type: song_feedback` で保存し（画像側と異なり傾向フィードバックは持たない）、`song_logs` とあわせて `review_song_feedback` スキルが月次サイクルで参照して `assets/songs_guideline.md` の修正案を提示する（人手承認で反映）。スキーマは [`.claude/docs/song_feedback_schema.md`](docs/song_feedback_schema.md) を参照
