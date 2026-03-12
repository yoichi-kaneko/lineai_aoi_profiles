---
name: upload_and_send_line_image
description: 画像をCloudinaryにアップロードし、そのURLを使ってLINEに画像メッセージを送信する。環境変数で設定されたアクセストークンと送信先ユーザーIDを使用し、プッシュ通知で送る。
---

# upload_and_send_line_image

画像をCloudinaryにアップロードして公開URLを取得し、そのURLをLINE Messaging APIに渡して画像メッセージをプッシュ送信するスタンドアロン CLI スクリプトです。

## 概要

2つのスクリプトで構成されています。

| スクリプト | 役割 |
|---|---|
| `scripts/upload.ts` | 画像をCloudinaryにアップロードし、オリジナルURLとプレビューURLを返す |
| `scripts/send.ts` | originalContentUrl と previewImageUrl を受け取り、LINEに画像メッセージを送信する |

- **プレビューサイズ**: 長辺が512pxを超える場合は縦横比を維持して512pxにリサイズしたURLを生成。512px以下の場合はオリジナルサイズ。
- **送信先**: 環境変数 `LINE_DESTINATION_USER_ID` に固定
- **認証 (LINE)**: 環境変数 `LINE_ACCESS_TOKEN` を使用
- **認証 (Cloudinary)**: 環境変数 `CLOUDINAY_CLOUD_NAME` / `CLOUDINAY_API_KEY` / `CLOUDINAY_API_SECRET` を使用

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
CLOUDINAY_CLOUD_NAME="your_cloud_name"
CLOUDINAY_API_KEY="your_api_key"
CLOUDINAY_API_SECRET="your_api_secret"
LINE_ACCESS_TOKEN="your_access_token"
LINE_DESTINATION_USER_ID="your_user_id"
```

## 実行方法

### ステップ1: 画像をCloudinaryにアップロード

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/upload.ts "{ルートからの相対パス}"
```

例:

```bash
npx tsx scripts/upload.ts "tmp/image.png"
```

出力（JSON）:

```json
{
  "originalUrl": "https://res.cloudinary.com/.../image.jpg",
  "previewUrl": "https://res.cloudinary.com/.../w_512,h_384,c_fit/image.jpg",
  "originalSize": { "width": 1920, "height": 1440 },
  "previewSize": { "width": 512, "height": 384 }
}
```

### ステップ2: LINEに画像メッセージを送信

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/send.ts "{originalUrl}" "{previewUrl}"
```

例:

```bash
npx tsx scripts/send.ts "https://res.cloudinary.com/.../image.jpg" "https://res.cloudinary.com/.../preview.jpg"
```

## Claudeへの指示

画像をLINEに送信する依頼があったとき、このスキルを使用してください。

### 手順

1. **アップロード**: 以下のコマンドを実行して画像をCloudinaryにアップロードしてください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/upload.ts "{ARGUMENTSとして渡されたファイルパス}"
```

2. 出力JSONから `originalUrl` と `previewUrl` を取得してください。

3. **LINE送信**: 取得したURLを使って以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/send.ts "{originalUrl}" "{previewUrl}"
```

4. コマンドが成功したら、画像を送信した旨をユーザーに報告してください。
