---
name: get_google_calendar_events
description: 指定した日付範囲のGoogleカレンダー予定を取得する。環境変数で設定されたカレンダーIDとタイムゾーンを使用し、予定一覧をJSON形式で返す。
---

# get_google_calendar_events

環境変数で指定されたGoogleカレンダーから、指定日時範囲の予定を取得するスタンドアロン CLI スクリプトです。

## 概要

以下の情報を取得して JSON 形式で標準出力に返します。

- **予定一覧**: タイトル（summary）・説明（description）・場所（location）・開始日時（start）・終了日時（end）
- **終日予定の実際の最終日**: `allDayLastDate`（終日予定のときのみ付加。詳細は下記）
- ステータスが `cancelled` の予定はスキル側で除外されます

### 終日予定の日付の読み方（重要）

Google Calendar の終日予定は、`end.date` が**排他（非包含）**です。つまり `end.date` に入っている日は予定に含まれません。

例：カレンダー上で「8月15日 ～ 8月16日」と表示される1泊2日の予定は、以下のように返ります。

```json
{
  "summary": "笠ヶ岳（北アルプス）",
  "start": { "date": "2026-08-15" },
  "end": { "date": "2026-08-17" },
  "allDayLastDate": "2026-08-16"
}
```

`end.date` をそのまま最終日と読むと**山行日数を1日多く誤認**します（8月15日だけの単日予定でも `end.date` は `2026-08-16` になります）。

このため本スキルは、終日予定に限り **`allDayLastDate`（実際の最終日 = `end.date` の前日）を計算して付加**します。終日予定の期間・最終日を判断する際は、`end.date` ではなく **`allDayLastDate` を使用してください**。時刻付き予定（`dateTime`）にはこのフィールドは付きません（`end.dateTime` はそのまま終了時刻を表します）。

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"
GOOGLE_CALENDAR_ID="primary"
GOOGLE_CALENDAR_TIMEZONE="Asia/Tokyo"
```

ブラウザのクラウドセッションではファイルを置けないため、代わりに `GOOGLE_OAUTH_CREDENTIALS_JSON`（キーファイルの中身）と `GOOGLE_OAUTH_TOKENS_JSON`（`tokens.json` の中身）を設定します。いずれも設定されていればパス指定より優先されます（[README](../../../README.md#クラウドセッションへの資格情報の受け渡し)）。

### 初回認証

初回または再認証が必要な場合は以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/google_calendar/auth.ts
```

表示された URL をブラウザで開いて Google アカウントを認証すると、
`~/.config/google-skills/tokens.json` に Calendar + Drive 両スコープの
トークンが保存されます。`GOOGLE_SKILLS_TOKEN_PATH` 環境変数でパスを変更できます。

この認証はブラウザでの同意と `localhost` へのリダイレクトを必要とするため、
クラウドセッションでは実行できません。ローカルで認証を済ませ、できた
`tokens.json` の中身を `GOOGLE_OAUTH_TOKENS_JSON` に渡してください。

## Claudeへの指示

以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/google_calendar/get_events.ts {dateFrom} {dateTo}
```

- `dateFrom` / `dateTo`: `YYYY-MM-DD` 形式
- 時刻は自動的に付与されます（`dateFrom` は `T00:00:00`、`dateTo` は `T23:59:59`）
- タイムゾーンは環境変数 `GOOGLE_CALENDAR_TIMEZONE` が自動適用されます
- カレンダーIDは環境変数 `GOOGLE_CALENDAR_ID` が使用されます

ARGUMENTS として渡された dateFrom・dateTo をそのまま引数に使用してください。
コマンドの実行結果（JSON）を解析してユーザーに分かりやすく提示してください。

終日予定（`start.date` を持つ予定）の期間・最終日を判断するときは、`end.date` ではなく `allDayLastDate` を参照してください。天気予報の取得日、門灯／継灯／帰灯モードの起動日判定、家族グループへ伝える下山予定日は、いずれもこの最終日の解釈に直結します。
