---
name: send_line_audio
description: 音声ファイル（mp3）をCloudinaryにアップロードし、そのURLと再生時間を使ってLINEに音声メッセージを送信する。環境変数で設定されたアクセストークンと送信先ユーザーID/グループIDを使用し、プッシュ通知で送る。送信先はuser（デフォルト）/group/bothから選択可能。
---

# send_line_audio

音声ファイル（mp3）をCloudinaryにアップロードして公開URLと再生時間を取得し、そのURLをLINE Messaging APIに渡して音声メッセージをプッシュ送信するスキルです。

## 概要

- **送信先**: `--destination` オプションで指定（デフォルト: `user`）
  - `user` → `LINE_DESTINATION_USER_ID`
  - `group` → `LINE_DESTINATION_GROUP_ID`
  - `both` → 上記2件に順番に送信
- **認証 (LINE)**: 環境変数 `LINE_ACCESS_TOKEN` を使用
- **認証 (Cloudinary)**: 環境変数 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` を使用
- **保存先フォルダ**: 環境変数 `CLOUDINARY_SONG_ASSET_FOLDER` を使用（未設定時はデフォルトフォルダ）

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
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
CLOUDINARY_SONG_ASSET_FOLDER="your_asset_folder"
LINE_ACCESS_TOKEN="your_access_token"
LINE_DESTINATION_USER_ID="your_user_id"
LINE_DESTINATION_GROUP_ID="your_group_id"   # group / both を使う場合に必要
```

## Claudeへの指示

音声ファイルをLINEに送信する依頼があったとき、このスキルを使用してください。

### 手順

1. **アップロード**: 以下のコマンドを実行して音声ファイルをCloudinaryにアップロードしてください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/cloudinary/upload_audio.ts "{ARGUMENTSとして渡されたファイルパス}"
```

2. 出力JSONから `url` と `duration` を取得してください。

3. **LINE送信**: 取得した値を使って以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_audio.ts {destination_option} "{url}" "{duration}"
```

- destination が指定されている場合は `--destination user|group|both` を先頭に追加してください。指定なしの場合はオプション不要です。

4. コマンドが成功したら、音声メッセージを送信した旨をユーザーに報告してください。
