---
name: get_google_calendar_events
description: 指定した日付範囲のGoogleカレンダー予定を取得する。環境変数で設定されたカレンダーIDとタイムゾーンを使用し、添付ファイルのURLも含む予定一覧をJSON形式で返す。
---

# get_google_calendar_events

環境変数で指定されたGoogleカレンダーから、指定日時範囲の予定を取得するスタンドアロン CLI スクリプトです。

## 概要

以下の情報を取得して JSON 形式で標準出力に返します。

- **予定一覧**: タイトル・日時・場所・説明・参加者・添付ファイル（fileUrl を含む）など
- **時間範囲**: 指定した timeMin〜timeMax の期間に開始する予定

## 事前準備

```bash
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"
GOOGLE_CALENDAR_ID="primary"
GOOGLE_CALENDAR_TIMEZONE="Asia/Tokyo"
```

### 初回認証

初回または再認証が必要な場合は以下を実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/auth.ts
```

表示された URL をブラウザで開いて Google アカウントを認証すると、
`~/.config/google-skills/tokens.json` に Calendar + Drive 両スコープの
トークンが保存されます。`GOOGLE_SKILLS_TOKEN_PATH` 環境変数でパスを変更できます。

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/get_events.ts <timeMin> <timeMax>
```

例（2026年3月8日の予定を取得）:

```bash
npx tsx scripts/get_events.ts 2026-03-08T00:00:00 2026-03-08T23:59:59
```

- `timeMin` / `timeMax`: `YYYY-MM-DDTHH:MM:SS` 形式（タイムゾーンなし）
- タイムゾーンは環境変数 `GOOGLE_CALENDAR_TIMEZONE` が自動適用されます
- カレンダーIDは環境変数 `GOOGLE_CALENDAR_ID` が使用されます

## Claudeへの指示

スキル起動時に提示される `Base directory for this skill` の絶対パスに `cd` した上で、
以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/get_events.ts {timeMin} {timeMax}
```

ARGUMENTS として渡された timeMin・timeMax をそのまま引数に使用してください。
コマンドの実行結果（JSON）を解析してユーザーに分かりやすく提示してください。
