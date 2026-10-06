---
name: download_line_image
description: LINEで受け取った画像を、messageIdを指定してtmp/ディレクトリに保存する。受信時に非公開で保存したCloudinaryから取得し、無ければLINE Messaging APIの「コンテンツを取得する」エンドポイントから取得する。
---

# download_line_image

ユーザーから LINE で受け取った画像をダウンロードし、`tmp/` ディレクトリに保存するスタンドアロン CLI スクリプトです。

## 概要

- **取得先1（Cloudinary）**: 受け取った画像は、Webhook が受信時に Cloudinary へ非公開（配信タイプ `authenticated`）で保存しています。public_id（`line_aoi_{messageId}`）から署名付き URL をその場で作って取得します
- **取得先2（LINE）**: Cloudinary に無い場合や、Cloudinary から取得できなかった場合は、`GET https://api-data.line.me/v2/bot/message/{messageId}/content` から取得します（`@line/bot-sdk` の `MessagingApiBlobClient`）。LINE 側のコンテンツには保存期間があり、期間を過ぎると取得できません
- **認証**: Cloudinary は `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_SECRET`、LINE は `LINE_ACCESS_TOKEN` を使用します。Cloudinary の設定が無い場合は LINE からだけ取得します
- **引数**: `messageId`（LINE メッセージの ID。英数字・ハイフン・アンダースコアの64文字以内）
- **保存先**: `{プロジェクトルート}/tmp/line_image_{messageId}.jpg`（拡張子は画像の形式に合わせて `.jpg` / `.png` / `.gif`）

署名付き URL には期限が無く、知っていれば誰でも画像を見られるため、スクリプトは URL を出力しません。

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_SECRET="your_api_secret"
LINE_ACCESS_TOKEN="your_access_token"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/download_image.ts "{messageId}"
```

例:

```bash
pnpm exec tsx src/line/download_image.ts "123456789012345678"
```

## 出力

成功時はJSON形式で以下を出力します。`source` は取得先（`cloudinary` / `line`）です。

```json
{
  "messageId": "123456789012345678",
  "contentType": "image/jpeg",
  "savedPath": "/absolute/path/to/tmp/line_image_123456789012345678.jpg",
  "source": "cloudinary"
}
```

Cloudinary から取得できずに LINE へ切り替えた場合は、その旨が標準エラーに出ます。LINE からも取得できなかった場合は、終了コード 1 で終わります。

## Claudeへの指示

LINE のメッセージIDが渡されたとき、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/download_image.ts "{ARGUMENTS として渡された messageId}"
```

2. コマンドの出力から `savedPath` を取得してください。

3. `savedPath` のファイルを Read ツールで読み取り、画像の内容を解析してください。

4. 解析結果をユーザーに報告してください。
