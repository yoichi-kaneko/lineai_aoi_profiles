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
│   ├── firebase/          # Firebase / Firestore アクセス
│   ├── google_map/        # Google Maps API（ジオコーディング）
│   ├── line/              # LINE 画像ダウンロード
│   ├── mureka/            # Mureka 楽曲・歌詞生成
│   ├── openweather/       # OpenWeatherMap 天気予報取得
│   ├── todoist/           # Todoist タスク操作
│   ├── util/              # 汎用ユーティリティ
│   └── yamap/             # YAMAP 登山情報スクレイピング
├── tmp/                   # 一時ファイル置き場（画像・音声など）
├── functions/             # Google Cloud Functions コード
│   └── src/
│       └── receiveLineMessage/  # LINE Webhook 受信・Firestore 保存
└── .claude/
    └── skills/            # Claude スキル定義（指示のみ、処理実装は src/ 配下）
```

> **注記**: スキル定義（`.claude/skills/`）は指示のみを記述し、処理の実装は `src/` 配下に集約しています。一部スキルはまだ移行途中です。

## 4. 連携しているサービスについて

外部サービスへのアクセスは、Fetch MCP Server を除きすべて Claude スキルを通じて行います。

### LINE Messaging API

| 項目 | 内容 |
|------|------|
| サービス名 | LINE Messaging API |
| 役割 | 碧衣からユーザーへのメッセージ・画像・音声送信、およびユーザーから受信した画像のダウンロードを担う |
| サービスURL | https://developers.line.biz/ja/services/messaging-api/ |
| スキル | `send_line_text` / `upload_and_send_line_image` / `upload_and_send_line_audio` / `download_line_image` |

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
| スキル | `get_todoist_tasks` / `get_todoist_completed_tasks` / `get_todoist_comments` / `put_todoist_task` |

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

### Cloudinary

| 項目 | 内容 |
|------|------|
| サービス名 | Cloudinary |
| 役割 | LINE への画像・音声メッセージ送信に際し、ファイルを公開URLとしてホスティングするために使用される |
| サービスURL | https://cloudinary.com/ |
| 利用スキル | `upload_and_send_line_image` / `upload_and_send_line_audio`（内部で使用） |

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

## 5. ライセンスについて

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
