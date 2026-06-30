# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイドラインです。

## プロジェクト概要

LINE AIアシスタント「碧衣（あおい）」の設定・スキル管理リポジトリ。
朝（暁）・昼（望）・夜（小夜）の3モードで、カレンダー確認・登山計画・日次振り返りなどをLINEに自動送信するシステム。

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
│   ├── image_guideline_samples.md # 画像生成プロンプトの詳細な記述例（6パターン・オンデマンド参照）
│   ├── songs_guideline.md  # 楽曲生成ガイドライン（スタイル・歌詞構成）
│   └── images/             # キャラクター設定画像（base / outfit_a〜d / room / ruri / hotaru）
├── modes/
│   ├── morning.md          # 暁モード定義
│   ├── noon.md             # 望モード定義
│   └── night.md            # 小夜モード定義
├── src/                    # 各スキルの処理実装
│   ├── cloudinary/         # Cloudinary 画像・音声アップロード
│   ├── firebase/           # Firebase / Firestore アクセス（run_logs・--collection で専用コレクションも）
│   ├── gemini/             # Google Gemini 画像生成
│   ├── google_calendar/    # Google Calendar 予定取得・OAuth認証
│   ├── google_drive/       # Google Drive ファイルダウンロード・OAuth認証
│   ├── google_map/         # Google Maps ジオコーディング
│   ├── line/               # LINE メッセージ送信・画像ダウンロード
│   ├── mureka/             # Mureka 楽曲・歌詞生成
│   ├── openai/             # OpenAI GPT 画像生成
│   ├── openweather/        # OpenWeatherMap 天気予報取得
│   ├── swarm/              # Swarm チェックイン取得
│   ├── todoist/            # Todoist タスク操作
│   ├── util/               # 汎用ユーティリティ
│   └── yamap/              # YAMAP 登山情報スクレイピング
├── .claude/
│   ├── rules/              # 常時適用ルール（aoi.md から @import で参照される）
│   │   ├── aoi_character.md    # エージェントの指針・伴侶の妖精ルリ
│   │   ├── aoi_user_profile.md # ユーザーに関する基本情報
│   │   ├── aoi_messaging.md    # 個人宛・家族グループ宛のメッセージ作法
│   │   └── aoi_constraints.md  # 注意事項（口調など）
│   ├── docs/               # 補助ドキュメント（Firestore スキーマ・退避運用など）
│   │   ├── image_log_schema.md       # image_logs（柱A）のスキーマ・記録コマンド
│   │   ├── image_feedback_schema.md  # image_feedback（柱B）のスキーマ・パース仕様
│   │   ├── line_send_fallback.md     # LINE 送信失敗時の Firestore 退避
│   │   ├── long_sleep_execution.md   # 長時間 sleep の実行方法
│   │   └── yamap_activity_pdf_guide.md # YAMAP 活動記録PDF の重点チェックガイド
│   └── skills/             # カスタムスキル（各スキルは SKILL.md のみ）
│       ├── download_google_drive_file/
│       ├── download_image/
│       ├── download_line_image/
│       ├── download_mureka_audio/
│       ├── download_todoist_attachment/
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
│       ├── put_firestore_doc/
│       ├── put_todoist_task/
│       ├── random_choice/
│       ├── review_image_feedback/
│       ├── run_aoi_daily/
│       ├── send_line_audio/
│       ├── send_line_image/
│       └── send_line_text/
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
| `assets/image_guideline.md` | 画像生成プロンプトの定義・衣装リスト・構成フレームワーク本体 |
| `assets/image_guideline_samples.md` | 画像生成プロンプトの詳細な記述例（6パターン）。本体から分離し、生成時にオンデマンド参照する |
| `assets/songs_guideline.md` | 楽曲生成のスタイル・歌詞構成ガイドライン |

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

## パッケージ管理

```bash
# 依存インストール（ルートディレクトリで実行）
pnpm install

# Playwright Chromium（YAMAP スクレイピング用。初回・環境移行時）
pnpm run setup:browsers
```

`@playwright/browser-chromium` により `pnpm install` 時に Chromium が自動取得されるが、未取得時は `setup:browsers` を明示的に実行する。

新しい依存パッケージを追加する場合:
```bash
# ルートの package.json の dependencies に追記してから実行
pnpm install
```

## スキル動作確認

スキルのテストはプロジェクトルートから直接実行する：

```bash
cd {プロジェクトルート}
pnpm exec tsx src/{module}/{main}.ts [引数]
```

環境変数は `.env` から自動読み込みされる（dotenvで設定済み）。

## 環境変数

`.env.example` を参照。必要な変数:
- `LINE_ACCESS_TOKEN` / `LINE_DESTINATION_USER_ID` - LINE Messaging API
- `GOOGLE_OAUTH_CREDENTIALS` / `GOOGLE_CALENDAR_ID` / `GOOGLE_CALENDAR_TIMEZONE` - Google Calendar
- `GOOGLE_GEMINI_API_KEY` / `GOOGLE_GEMINI_GENERATE_IMAGEMODEL` / `GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR` - Gemini画像生成
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_ASSET_FOLDER` / `CLOUDINARY_SONG_ASSET_FOLDER` - Cloudinary（画像・音声ホスティング）
- `OPEN_WEATHER_APP_ID` - OpenWeatherMap
- `SWARM_OAUTH_TOKEN` - Swarm
- `MUREKA_API_KEY` / `MUREKA_MODEL` / `MUREKA_VOCAL_ID`（任意） - Mureka楽曲生成

## 注意事項

- `.env` はGit管理外（`.gitignore`に含まれる）。直接編集・コミットしないこと
- `tmp/` は各処理（モード）内でのみ使う揮発的な一時ファイル置き場。コミット不要。処理開始時に前回の残骸があっても内容を確認・参照せず、固定名ファイルは上書きして使う（本番フローでは `send_daily_line.sh` が起動ごとに `refresh_tmp.sh` で掃除する）
- `send_line_*`（`send_line_text` / `send_line_image` / `send_line_audio`）はメッセージ本文を引数で直接渡さず、`tmp/line_message.txt` に保存してそのパスを引数に渡す方式。改行はそのまま改行として書けばよく、`\n` への置換は不要（各スキルの SKILL.md 参照）
- `generate_mureka_lyrics` / `generate_mureka_song` も同様に、複数行テキストを引数で直接渡さず `tmp/` 配下の一時ファイル経由で受け渡す方式（`tmp/mureka_lyrics_prompt.txt`、`tmp/mureka_song_lyrics.txt`、`tmp/mureka_song_prompt.txt`）。各スキルの SKILL.md 参照
- `put_firestore_doc` も同様に、本文（`description`）を引数で直接渡さず `tmp/firestore_doc.txt` に保存して `--description-file` で渡す方式。改行はそのまま改行として書けばよく、`\n` への置換は不要（SKILL.md 参照）
- `generate_gpt_image` も同様に、プロンプトを引数で直接渡さず `tmp/gpt_image_prompt.txt` に保存し、そのパスを第一引数に渡す方式（第二引数は参考画像ファイル名）。改行はそのまま改行として書けばよく、`\n` への置換は不要（SKILL.md 参照）
- 画像生成スキルは `GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR` に設定された参照画像を自動添付する
- 画像生成フィードバック機構（issue #43）の `image_logs` / `image_feedback` / `image_feedback_reviews` は、`notes` とは別の**専用コレクション**に隔離されている。`get_firestore_docs` / `put_firestore_doc` の `--collection` オプションで読み書きし（デフォルトは `notes` で後方互換）、`notes` 以外では `NOTE_TYPE` 検証をバイパスして `type` をコレクション内識別用の任意値（`image_log` / `image_feedback` / `review_marker`）として扱う。日々の各モードのコンテキストには流入させず、`review_image_feedback` スキル（柱C）でのみ参照する。スキーマは [`.claude/docs/image_log_schema.md`](docs/image_log_schema.md) / [`image_feedback_schema.md`](docs/image_feedback_schema.md) を参照
