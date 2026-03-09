---
name: mountain_forecast
description: 緯度・経度を指定して山岳の天気予報を取得する。OpenWeatherMap API を使用し、現在の天気・時間別予報（24時間）・日別予報（8日間）を返す。
---

# mountain_forecast

指定した緯度・経度の天気予報を OpenWeatherMap API から取得するスタンドアロン CLI スクリプトです。

## 概要

以下の情報を取得して標準出力に返します。

- **現在の天気**: 気温・天気・湿度・風速・気圧・雲量・日の出/日の入り
- **時間別予報**: 今後 24 時間の気温・天気・風速・雲量・降水確率
- **日別予報**: 今後 8 日間の天気サマリー

## 事前準備

```bash
npm install
```

また、プロジェクトルートの `.env` に以下の環境変数が必要です。

```
OPEN_WEATHER_APP_ID="your_api_key"
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/forecast.ts <緯度> <経度>
```

例:

```bash
npx tsx scripts/forecast.ts 35.6762 139.6503
```

## Claudeへの指示

スキル起動時に提示される `Base directory for this skill` の絶対パスに `cd` した上で、
以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/forecast.ts {緯度} {経度}
```

ARGUMENTS として渡された緯度・経度をそのまま引数に使用してください。
コマンドの実行結果を、そのままユーザーに提示してください。
