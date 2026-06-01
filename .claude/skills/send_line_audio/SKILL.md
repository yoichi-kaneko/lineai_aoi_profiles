---
name: send_line_audio
description: 音声ファイル（mp3）をCloudinaryにアップロードし、そのURL・再生時間と添えるテキストを使ってLINEに音声＋テキストを1回のプッシュで送信する。表示順は音声→テキスト。環境変数で設定されたアクセストークンと送信先ユーザーID/グループIDを使用。送信先はuser（デフォルト）/group/bothから選択可能。
---

# send_line_audio

音声ファイル（mp3）をCloudinaryにアップロードして公開URLと再生時間を取得し、音声メッセージとテキストメッセージを**同一の pushMessage リクエスト**（最大5件のうち2件）でプッシュ送信するスキルです。

## 概要

- **送信内容**: 音声 → テキストの順で `messages` 配列に格納して送信します（[LINE Push Message](https://developers.line.biz/ja/reference/messaging-api/#send-push-message) 仕様）。
- **送信先**: `--destination` オプションで指定（デフォルト: `user`）
  - `user` → `LINE_DESTINATION_USER_ID`
  - `group` → `LINE_DESTINATION_GROUP_ID`
  - `both` → 上記2件に順番に送信（宛先ごとに音声+テキストを1リクエストずつ）
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

音声と添えるテキストをLINEに送信する依頼があったとき、このスキルを使用してください。**音声だけを送る場合は使わず**、必ず添えるテキスト本文も用意してから実行してください。

### 入力（ARGUMENTS）

- **音声ファイルパス**（必須）: 送信する mp3 の相対パス
- **テキスト本文**（必須）: 音声の直後に届けるメッセージ
- **送信先**（任意）: `user`（デフォルト）/ `group` / `both`

### 手順

1. **アップロード**: 以下のコマンドを実行して音声ファイルをCloudinaryにアップロードしてください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/cloudinary/upload_audio.ts "{音声ファイルパス}"
```

2. 出力JSONから `url` と `duration` を取得してください。

3. **LINE送信（音声+テキスト）**: 取得した値とテキスト本文を使って以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_audio.ts {destination_option} "{url}" "{duration}" "{message}"
```

- destination が指定されている場合は `--destination user|group|both` を先頭に追加してください。指定なしの場合はオプション不要です。

> **⚠️ 警告: 複数行のメッセージを送る場合は必ずクォート処理すること**
>
> 改行を含むメッセージは `\n` に置換して、コマンドを必ず1行に収めてください。
> スクリプト内部で `\n`（リテラル2文字）を実際の改行文字に変換します。

4. コマンドが成功したら、音声とテキストを送信した旨をユーザーに報告してください。

**音声送信のあとに `send_line_text` を別途呼び出さないでください。** テキストは本スキルに含めて送ります。
