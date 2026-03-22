---
name: get_google_geolocation
description: 住所文字列をGoogle Geocoding APIで緯度・経度に変換する。formatted_address と place_id も返す。
---

# get_google_geolocation

住所文字列をGoogle Geocoding APIに渡し、緯度・経度・整形済み住所・place_idを返すCLIスクリプトです。

## 概要

- **入力**: 住所文字列（日本語・英語どちらも可）
- **出力**: `location`（lat/lng）・`formatted_address`・`place_id` をJSON形式で標準出力

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_MAPS_API_KEY="your_api_key"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/google_map/geocode.ts "東京都新宿区西新宿2-8-1"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/google_map/geocode.ts "{住所}"
```

ARGUMENTS として渡された住所をそのまま引数に使用してください。
コマンドの実行結果（JSON）を、そのままユーザーに提示してください。
