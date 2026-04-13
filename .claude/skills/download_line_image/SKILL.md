---
name: download_line_image
description: LINE Messaging API の「コンテンツを取得する」エンドポイントを使い、指定したmessageIdの画像バイナリをダウンロードしてtmp/ディレクトリに保存する。
---

# download_line_image

LINE Messaging API からメッセージの画像コンテンツをダウンロードし、`tmp/` ディレクトリに保存するスタンドアロン CLI スクリプトです。

## 概要

- **API**: `GET https://api-data.line.me/v2/bot/message/{messageId}/content`
- **SDK**: `@line/bot-sdk` の `MessagingApiBlobClient.getMessageContent` を使用
- **認証**: 環境変数 `LINE_ACCESS_TOKEN` を使用
- **引数**: `messageId`（LINE メッセージの ID）
- **保存先**: `{プロジェクトルート}/tmp/line_image_{messageId}.jpg`

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
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

成功時はJSON形式で以下を出力します。

```json
{
  "messageId": "123456789012345678",
  "savedPath": "/absolute/path/to/tmp/line_image_123456789012345678.jpg"
}
```

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
