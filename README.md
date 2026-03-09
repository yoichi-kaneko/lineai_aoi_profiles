# LINE AI「あおい」プロファイル

## 1. はじめに

このドキュメントは、LINE AI「碧衣（あおい）」のプロファイル定義に関するリポジトリの概要を説明するものです。
各セクションの詳細は随時更新されます。

## 2. このリポジトリについて

LINE AI「碧衣」のキャラクター設定や応答プロファイルを管理するリポジトリです。
プロファイルの定義・更新・バージョン管理を行います。

## 3. ファイル構成について

```
lineai_aoi_profiles/
├── README.md          # 本ファイル
├── aoi.md             # 碧衣のプロファイル定義
├── send_daily_line.sh # 碧衣の送信処理を実行するスクリプト
├── modes/             # モード別設定（morning / noon / night）
├── assets/            # 画像素材
└── .claude/
    └── skills/        # Claude スキル（各種情報取得処理）
```

## 4. 連携しているサービスについて

### LINE Messaging API

| 項目 | 内容 |
|------|------|
| サービス名 | LINE Messaging API |
| 役割 | 碧衣からユーザーへのメッセージ送信を担うメッセージング基盤 |
| サービスURL | https://developers.line.biz/ja/services/messaging-api/ |
| MCP サーバー | https://github.com/line/line-bot-mcp-server |
| 備考 | デフォルトではMCPサーバーに要する処理が重いため、メッセージ送信のため最低限のツールを残して他は削除した |

### Google Calendar API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Calendar API |
| 役割 | ユーザーのスケジュールを読み込み、メッセージ構築のための情報収集の中核を担う |
| サービスURL | https://developers.google.com/workspace/calendar/api/guides/overview?hl=ja/ |
| MCP サーバー | https://www.npmjs.com/package/@cocal/google-calendar-mcp （非公式） |

### Todoist API

| 項目 | 内容 |
|------|------|
| サービス名 | Todoist API |
| 役割 | ユーザーのTODOタスクを読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://developer.todoist.com/api/v1/ |
| MCP サーバー | https://github.com/yoichi-kaneko/todoist_mcp_for_lineai (非公式・kanekoの自作) |

### Google Maps API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Maps API |
| 役割 | 後述するOpenWeatherAPIを呼び出すため、情報内にある住所を座標に変換する処理を担う |
| サービスURL | https://developers.google.com/maps?hl=ja |
| MCP サーバー | https://www.npmjs.com/package/@modelcontextprotocol/server-google-maps |

### OpenWeatherAPI

| 項目 | 内容 |
|------|------|
| サービス名 | OpenWeatherAPI |
| 役割 | 座標情報を元に天気予報を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://openweathermap.org/api |
| スキル | `mountain_forecast`（自作スキル）→ [SKILL.md](.claude/skills/mountain_forecast/SKILL.md) |

### Swarm API

| 項目 | 内容 |
|------|------|
| サービス名 | Swarm API |
| 役割 | ユーザーの行動履歴（チェックイン履歴）を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://help.perforce.com/helix-core/helix-swarm/swarm/2024.1/Content/Swarm/swarm-apidoc.html |
| MCP サーバー | https://github.com/alexpriest/swarm-mcp (非公式) |

### YAMAP

| 項目 | 内容 |
|------|------|
| サービス名 | YAMAP |
| 役割 | ユーザーの登山情報を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://yamap.com/ |
| スキル | `fetch_yamap_plan`（自作スキル、APIでなく登山計画書のwebページをスクレイピングする）→ [SKILL.md](.claude/skills/fetch_yamap_plan/SKILL.md) |

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
