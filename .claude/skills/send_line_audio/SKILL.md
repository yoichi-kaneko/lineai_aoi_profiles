---
name: send_line_audio
description: 音声ファイル（mp3）をCloudinaryにアップロードし、そのURLと再生時間を使ってLINEに音声メッセージを送信する。環境変数で設定されたアクセストークンと送信先ユーザーIDを使用し、プッシュ通知で送る。
---

# send_line_audio

音声ファイル（mp3）をCloudinaryにアップロードして公開URLと再生時間を取得し、そのURLをLINE Messaging APIに渡して音声メッセージをプッシュ送信するスキルです。

## 概要

- **送信先**: 環境変数 `LINE_DESTINATION_USER_ID` に固定
- **認証 (LINE)**: 環境変数 `LINE_ACCESS_TOKEN` を使用
- **認証 (Cloudinary)**: 環境変数 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` を使用
- **保存先フォルダ**: 環境変数 `CLOUDINARY_SONG_ASSET_FOLDER` を使用（未設定時はデフォルトフォルダ）

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
CLOUDINARY_SONG_ASSET_FOLDER="your_asset_folder"
LINE_ACCESS_TOKEN="your_access_token"
LINE_DESTINATION_USER_ID="your_user_id"
```

## Claudeへの指示

音声ファイルをLINEに送信する依頼があったとき、このスキルを使用してください。

### 手順

1. **アップロード**: 以下のコマンドを実行して音声ファイルをCloudinaryにアップロードしてください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/cloudinary/upload_audio.ts "{ARGUMENTSとして渡されたファイルパス}"
```

2. 出力JSONから `url` と `duration` を取得してください。

3. **LINE送信**: 取得した値を使って以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/line/send_audio.ts "{url}" "{duration}"
```

4. コマンドが成功したら、音声メッセージを送信した旨をユーザーに報告してください。
