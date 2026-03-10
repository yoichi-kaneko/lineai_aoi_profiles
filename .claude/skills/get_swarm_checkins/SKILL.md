---
name: get_swarm_checkins
description: 指定した日付範囲のSwarm（Foursquare）チェックインを取得する。環境変数で設定されたOAuthトークンを使用し、場所・コメント・写真URLを含むチェックイン一覧をJSON形式で返す。
---

# get_swarm_checkins

環境変数で指定されたSwarm OAuthトークンを使って、指定日時範囲のチェックインを取得するスタンドアロン CLI スクリプトです。

## 概要

以下の情報を取得して JSON 形式で標準出力に返します。

- **チェックイン一覧**: ID・日時・場所・コメント（shout）・写真URL など
- **時間範囲**: 指定した start_date〜end_date の期間のチェックイン

## 事前準備

```bash
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
SWARM_OAUTH_TOKEN="swarm_access_token"
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/get_checkins.ts <start_date> <end_date>
```

例（2024年1月のチェックインを取得）:

```bash
npx tsx scripts/get_checkins.ts 2024-01-01 2024-01-31
```

例（2024年3月8日のチェックインを取得）:

```bash
npx tsx scripts/get_checkins.ts 2024-03-08 2024-03-08
```

- `start_date` / `end_date`: `YYYY-MM-DD` 形式
- end_date は当日の終わりまで含まれます（翌日0時未満）
- OAuthトークンは環境変数 `SWARM_OAUTH_TOKEN` が使用されます

## Claudeへの指示

スキル起動時に提示される `Base directory for this skill` の絶対パスに `cd` した上で、
以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/get_checkins.ts {start_date} {end_date}
```

ARGUMENTS として渡された start_date・end_date をそのまま引数に使用してください。
コマンドの実行結果（JSON）を解析してユーザーに分かりやすく提示してください。
