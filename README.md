# LINE AI「碧衣（あおい）」プロファイル

## 1. はじめに

このドキュメントは、LINE AI「碧衣（あおい）」のプロファイル定義に関するリポジトリの概要を説明するものです。
各セクションの詳細は随時更新されます。

## 2. このリポジトリについて

LINE AI「碧衣」のキャラクター設定や応答プロファイルを管理するリポジトリです。
プロファイルの定義・更新・バージョン管理を行います。

## 3. ファイル構成について

```
lineai_aoi_profiles/
├── README.md              # 本ファイル
├── aoi.md                 # 碧衣のプロファイル定義
├── package.json           # npm パッケージ管理（ルート）
├── send_daily_line.sh     # 碧衣の送信処理を実行するスクリプト
├── refresh_tmp.sh         # tmp/ ディレクトリのクリーンアップスクリプト
├── modes/                 # モード別設定（morning / noon / night / up_mountain / off_mountain / song）
├── assets/                # 画像素材・ガイドライン
├── src/                   # 各スキルの処理実装
│   ├── cloudinary/        # Cloudinary 画像・音声アップロード
│   ├── firebase/          # Firebase / Firestore アクセス
│   ├── gemini/            # Google Gemini 画像生成
│   ├── google_calendar/   # Google Calendar 予定取得・OAuth認証
│   ├── google_drive/      # Google Drive ファイルダウンロード・OAuth認証
│   ├── google_map/        # Google Maps API（ジオコーディング）
│   ├── line/              # LINE メッセージ送信・画像ダウンロード
│   ├── mureka/            # Mureka 楽曲・歌詞生成
│   ├── openai/            # OpenAI GPT 画像生成
│   ├── openweather/       # OpenWeatherMap 天気予報取得
│   ├── swarm/             # Swarm チェックイン取得
│   ├── todoist/           # Todoist タスク操作
│   ├── util/              # 汎用ユーティリティ
│   └── yamap/             # YAMAP 登山情報スクレイピング
├── gas/                   # Google Apps Script 連携コード
├── tmp/                   # 一時ファイル置き場（画像・音声など）
├── functions/             # Google Cloud Functions コード
│   └── src/
│       ├── index.ts             # Cloud Functions エントリポイント
│       ├── lib/                 # Cloud Functions 共通処理
│       ├── receiveLineMessage/  # LINE Webhook 受信・Firestore 保存
│       └── receiveGasRequest/   # GAS 経由の位置情報URL受信・EC2コマンド実行
└── .claude/
    ├── rules/             # 常時適用ルール（aoi.md から @import で参照される）
    │   ├── aoi_character.md    # エージェントの指針・伴侶の妖精ルリ
    │   ├── aoi_user_profile.md # ユーザーに関する基本情報
    │   ├── aoi_messaging.md    # 個人宛・家族グループ宛のメッセージ作法
    │   └── aoi_constraints.md  # 注意事項（口調・Log分離など）
    └── skills/            # Claude スキル定義（SKILL.md のみ、処理実装は src/ 配下）
```

## 4. 実行モードについて

碧衣は、日次の定期モードと登山・創作に関する特別モードを持ちます。各モードの詳細手順は `modes/*.md` に記載されています。

| モード名 | トリガーキー | 主な役割 |
|---|---|---|
| 暁（あかつき） | `daily message (暁)` | 朝の予定確認、タスク整理、天気予報の取得、一日の出発を導く |
| 望（のぞみ） | `daily message (望)` | 近日の登山計画や下山記録を踏まえ、昼の状況に合う短い言葉を届ける |
| 小夜（さよ） | `daily message (小夜)` | 一日の振り返り、完了タスク、行動記録、登山レポートをもとに夜の報告と画像を生成する |
| 門灯（もんとう） | `daily message (門灯)` | 入山直前に家族LINEグループへ登山開始を通知し、Firestore に `type: up_mountain` の記録を残す |
| 帰灯（きとう） | `daily message (帰灯)` | 下山直後に山行を振り返り、画像をユーザーと家族グループへ送り、家族向け下山報告とユーザー向け報告を送信する |
| 調べ（しらべ） | `daily message (調べ)` | 1週間の出来事・場所・天気から歌詞と楽曲を生成し、LINEへ届ける |

`send_daily_line.sh` は `morning` / `noon` / `night` / `up_mountain` / `off_mountain` / `song` の各モードを受け取り、対応するトリガーキーで碧衣を起動します。

## 5. 連携しているサービスについて

外部サービスへのアクセスは、Fetch MCP Server を除きすべて Claude スキルを通じて行います。

### LINE Messaging API

| 項目 | 内容 |
|------|------|
| サービス名 | LINE Messaging API |
| 役割 | 碧衣からユーザーまたは家族グループへのメッセージ・画像・音声送信、およびユーザーから受信した画像のダウンロードを担う |
| サービスURL | https://developers.line.biz/ja/services/messaging-api/ |
| スキル | `send_line_text` / `send_line_image` / `send_line_audio` / `download_line_image` |
| 送信先指定 | `send_line_*` は `--destination user\|group\|both` に対応。`group` / `both` では `LINE_DESTINATION_GROUP_ID` を使用 |

### Google Calendar API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Calendar API |
| 役割 | ユーザーのスケジュールを読み込み、メッセージ構築のための情報収集の中核を担う |
| サービスURL | https://developers.google.com/workspace/calendar/api/guides/overview?hl=ja/ |
| スキル | `get_google_calendar_events` → [SKILL.md](.claude/skills/get_google_calendar_events/SKILL.md) |

### Google Drive API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Drive API |
| 役割 | Google Calendar の予定に添付されたファイルを取得する |
| サービスURL | https://developers.google.com/workspace/drive/api/guides/overview?hl=ja |
| スキル | `download_google_drive_file` → [SKILL.md](.claude/skills/download_google_drive_file/SKILL.md) |

### Todoist API

| 項目 | 内容 |
|------|------|
| サービス名 | Todoist API |
| 役割 | ユーザーの TODO タスクの読み込み・作成・コメント取得を担う |
| サービスURL | https://developer.todoist.com/api/v1/ |
| スキル | `get_todoist_tasks` / `get_todoist_completed_tasks` / `get_todoist_comments` / `put_todoist_task` / `download_todoist_attachment` |

### Google Maps API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Maps API |
| 役割 | 住所・地点名を座標に変換するジオコーディングを担う。`get_openweather_forecast` スキル内で内部的に使用される |
| サービスURL | https://developers.google.com/maps?hl=ja |
| 実装 | `src/google_map/geocode.ts`（スキルから直接呼び出し） |

### OpenWeatherMap API

| 項目 | 内容 |
|------|------|
| サービス名 | OpenWeatherMap API |
| 役割 | 地点名・住所から天気予報を取得し、メッセージ構築のための情報収集を担う |
| サービスURL | https://openweathermap.org/api |
| スキル | `get_openweather_forecast` → [SKILL.md](.claude/skills/get_openweather_forecast/SKILL.md) |

### Swarm API

| 項目 | 内容 |
|------|------|
| サービス名 | Swarm API |
| 役割 | ユーザーの行動履歴（チェックイン履歴）を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://location.foursquare.com/developer/ |
| スキル | `get_swarm_checkins` → [SKILL.md](.claude/skills/get_swarm_checkins/SKILL.md) |

### YAMAP

| 項目 | 内容 |
|------|------|
| サービス名 | YAMAP |
| 役割 | ユーザーの登山計画・活動記録を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://yamap.com/ |
| スキル | `fetch_yamap_plan` / `fetch_yamap_activity`（Web スクレイピング） |

### Firebase / Firestore

| 項目 | 内容 |
|------|------|
| サービス名 | Firebase / Firestore |
| 役割 | ユーザーから碧衣へのメモ・メッセージ、モード間の引き継ぎ記録、位置情報URLを保存・取得するデータストアとして機能する。Cloud Functions 経由での書き込みと、スキルを通じた読み書きを行う |
| サービスURL | https://firebase.google.com/docs/firestore?hl=ja |
| スキル | `get_firestore_docs` / `put_firestore_doc` |
| `type` 定義 | `src/firebase/noteTypes.ts` の `NOTE_TYPE` を正とする |
| 取得仕様 | `get_firestore_docs` は `dateFrom` / `dateTo` による日付範囲指定で取得する |
| Cloud Functions | `functions/src/receiveLineMessage/`（LINE Webhook 受信 → Firestore 保存） / `functions/src/receiveGasRequest/`（GAS からの位置情報URL受信 → Firestore 保存 → EC2コマンド実行） |
| LINE受信トリガー | ユーザーからの `下山` / `無事下山` などのキーワードを受け、Firestore 保存後に EC2 コマンドを実行する |

### Google Apps Script

| 項目 | 内容 |
|------|------|
| サービス名 | Google Apps Script |
| 役割 | Gmail から指定条件に合う未読メールを確認し、本文内の位置情報URLを Cloud Functions へ中継する |
| サービスURL | https://developers.google.com/apps-script |
| 実装 | `gas/relay.gs` |
| 連携先 | `functions/src/receiveGasRequest/` |

### AWS Systems Manager

| 項目 | 内容 |
|------|------|
| サービス名 | AWS Systems Manager |
| 役割 | Cloud Functions から EC2 上の処理を起動するため、SSM 経由でコマンドを送信する |
| サービスURL | https://aws.amazon.com/systems-manager/ |
| 実装 | `functions/src/lib/execEc2Command.ts` |
| デプロイ関連 | `functions/deploy.sh` と `functions/README.md` に環境変数・Secrets・デプロイ手順を記載 |

### Google Gemini API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Gemini API |
| 役割 | 碧衣のキャラクターに合わせた画像を生成する |
| サービスURL | https://ai.google.dev/ |
| スキル | `generate_gemini_image` → [SKILL.md](.claude/skills/generate_gemini_image/SKILL.md) |

備考: 現在 `generate_gemini_image` は非推奨です（原則 `generate_gpt_image` を使用）。

### OpenAI ChatGPT API

| 項目 | 内容 |
|------|------|
| サービス名 | OpenAI ChatGPT API |
| 役割 | 碧衣のキャラクターに合わせた画像を生成する |
| サービスURL | https://platform.openai.com |
| スキル | `generate_gpt_image` → [SKILL.md](.claude/skills/generate_gpt_image/SKILL.md) |

### Cloudinary

| 項目 | 内容 |
|------|------|
| サービス名 | Cloudinary |
| 役割 | LINE への画像・音声メッセージ送信に際し、ファイルを公開URLとしてホスティングするために使用される |
| サービスURL | https://cloudinary.com/ |
| 利用スキル | `send_line_image` / `send_line_audio`（内部で使用） |

### Mureka API

| 項目 | 内容 |
|------|------|
| サービス名 | Mureka API |
| 役割 | 碧衣がユーザーへ送る楽曲・歌詞の生成を担う |
| サービスURL | https://www.mureka.ai/ |
| スキル | `generate_mureka_lyrics` / `generate_mureka_song` / `download_mureka_song` |

### Fetch MCP Server

| 項目 | 内容 |
|------|------|
| サービス名 | Fetch MCP Server |
| 役割 | Web ページを取得する MCP ツール。Claude 標準の fetch よりも性能が高いため導入 |
| MCP サーバー | https://github.com/modelcontextprotocol/servers/tree/main/src/fetch |

## 6. タイムアウト・リトライについて

`send_daily_line.sh` は、APIやMCPサーバーの無応答によるハングアップを防ぐため、シェルレベルのタイムアウトとリトライを実装しています。

| 項目 | 値 |
|---|---|
| タイムアウト | 1200秒（20分） |
| 最大リトライ回数 | 2回（初回含む） |
| リトライ間隔 | 30秒 |

また、Claude プロンプト層でもグレースフルデグレードを定義しています（[aoi_constraints.md](.claude/rules/aoi_constraints.md) 参照）。
ツール呼び出しが失敗した場合は1回だけ再試行し、それでも失敗した場合はそのステップをスキップして処理を継続します。

### 対応する障害パターン

| 障害パターン | 対策 |
|---|---|
| ツールが応答を返さず無限待ち（真のハング） | シェルレベルの `timeout` で強制終了 → リトライ |
| ツールがエラーを返す（APIエラー、認証失敗など） | Claudeルールに基づきスキップして続行 |
| 一時的な障害（API瞬断など） | シェルリトライ + Claudeルールによるスキップ |

## 7. ライセンスについて

本プロジェクトは MIT License のもとで公開されています。

```
MIT License

Copyright (c) 2026 kaneko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
