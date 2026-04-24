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
├── modes/                 # モード別設定（morning / noon / night）
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
├── tmp/                   # 一時ファイル置き場（画像・音声など）
├── functions/             # Google Cloud Functions コード
│   └── src/
│       └── receiveLineMessage/  # LINE Webhook 受信・Firestore 保存
└── .claude/
    ├── rules/             # 常時適用ルール（aoi.md から @import で参照される）
    │   ├── aoi_character.md    # エージェントの指針・伴侶の妖精ルリ
    │   ├── aoi_user_profile.md # ユーザーに関する基本情報
    │   └── aoi_constraints.md  # 注意事項（口調・Log分離など）
    └── skills/            # Claude スキル定義（SKILL.md のみ、処理実装は src/ 配下）
```

## 4. 連携しているサービスについて

外部サービスへのアクセスは、Fetch MCP Server を除きすべて Claude スキルを通じて行います。

### LINE Messaging API

| 項目 | 内容 |
|------|------|
| サービス名 | LINE Messaging API |
| 役割 | 碧衣からユーザーへのメッセージ・画像・音声送信、およびユーザーから受信した画像のダウンロードを担う |
| サービスURL | https://developers.line.biz/ja/services/messaging-api/ |
| スキル | `send_line_text` / `send_line_image` / `send_line_audio` / `download_line_image` |

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
| 役割 | ユーザーから碧衣へのメモ・メッセージを保存・取得するデータストアとして機能する。Cloud Functions 経由での書き込みと、スキルを通じた読み込みを行う |
| サービスURL | https://firebase.google.com/docs/firestore?hl=ja |
| スキル | `get_firestore_docs` / `put_firestore_doc` |
| Cloud Functions | `functions/src/receiveLineMessage/`（LINE Webhook 受信 → Firestore 保存） |

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
| サービスURL | https://chatgpt.com/ |
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

## 5. タイムアウト・リトライについて

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

## 6. PR #4 で反映された差分

対象PR: [Add off_mountain mode and improve LINE flow #4](https://github.com/yoichi-kaneko/lineai_aoi_profiles/pull/4)

### 追加・更新された主な内容

- **モード仕様の拡張**
  - `modes/off_mountain.md` が「帰灯（きとう）モード」として実運用手順を持つ内容に拡張
  - `modes/noon.md` / `modes/night.md` で、帰灯モード実行後の分岐（Firestore記録を優先する判断）を追加

- **Firestore取得仕様の更新（日付範囲対応）**
  - `src/firebase/get_docs.ts` が単一日付引数から `dateFrom` / `dateTo` の2引数へ変更
  - `.claude/skills/get_firestore_docs/SKILL.md` の説明と実行例を日付範囲取得前提に更新
  - 暁/望/小夜/帰灯モードからの `get_firestore_docs` 呼び出し指示が範囲指定前提に更新

- **Cloud Functions（LINE受信）の機能拡張**
  - `functions/src/receiveLineMessage/index.ts` に、特定キーワード（`下山` / `無事下山`）受信時のEC2コマンド実行フローを追加
  - `functions/src/receiveLineMessage/execEc2Command.ts` を新規追加（AWS SSM経由でEC2コマンドを送信）
  - `functions/src/receiveLineMessage/.secrets` と `functions/.gitignore` を追加・更新し、Secrets/環境変数の管理手順を整理
  - `functions/README.md` を更新し、トリガー条件・必要環境変数・デプロイ手順を明文化
  - `functions/deploy.sh` を新規追加し、`.env.yaml` と `.secrets` を自動解決してデプロイ可能に変更

- **依存関係・ワークスペース設定の更新**
  - `functions/package.json` に `@aws-sdk/client-ssm` を追加
  - `pnpm-lock.yaml` を更新（AWS SDK関連依存を反映）
  - `pnpm-workspace.yaml` に `allowBuilds` 設定を追加（`@firebase/util`, `esbuild`, `protobufjs`）

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
