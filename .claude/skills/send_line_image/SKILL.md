---
name: send_line_image
description: 画像をCloudinaryにアップロードし、そのURLと添えるテキストを使ってLINEに画像＋テキストを1回のプッシュで送信する。表示順は画像→テキスト。送信失敗時は line_undelivered として Firestore に退避する。環境変数で設定されたアクセストークンと送信先ユーザーID/グループIDを使用。送信先はuser（デフォルト）/group/bothから選択可能。
---

# send_line_image

画像をCloudinaryにアップロードして公開URLを取得し、画像メッセージとテキストメッセージを**同一の pushMessage リクエスト**（最大5件のうち2件）でプッシュ送信するスキルです。

## 概要

- **送信内容**: 画像 → テキストの順で `messages` 配列に格納して送信します（[LINE Push Message](https://developers.line.biz/ja/reference/messaging-api/#send-push-message) 仕様）。
- **プレビューサイズ**: 長辺が512pxを超える場合は縦横比を維持して512pxにリサイズしたURLを生成。512px以下の場合はオリジナルサイズ。
- **送信先**: `--destination` オプションで指定（デフォルト: `user`）
  - `user` → `LINE_DESTINATION_USER_ID`
  - `group` → `LINE_DESTINATION_GROUP_ID`
  - `both` → 上記2件に順番に送信（宛先ごとに画像+テキストを1リクエストずつ）
- **認証 (LINE)**: 環境変数 `LINE_ACCESS_TOKEN` を使用
- **認証 (Cloudinary)**: 環境変数 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` を使用

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
LINE_ACCESS_TOKEN="your_access_token"
LINE_DESTINATION_USER_ID="your_user_id"
LINE_DESTINATION_GROUP_ID="your_group_id"   # group / both を使う場合に必要
```

## Claudeへの指示

画像と添えるテキストをLINEに送信する依頼があったとき、このスキルを使用してください。**画像だけを送る場合は使わず**、必ず添えるテキスト本文も用意してから実行してください。

### 入力（ARGUMENTS）

- **画像ファイルパス**（必須）: 送信する画像の相対パス（例: `tmp/image.png`）
- **テキスト本文**（必須）: 画像の直後に届けるメッセージ
- **送信先**（任意）: `user`（デフォルト）/ `group` / `both`

### 手順

1. **アップロード**: 以下のコマンドを実行して画像をCloudinaryにアップロードしてください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/cloudinary/upload_image.ts "{画像ファイルパス}"
```

2. 出力JSONから `originalUrl` と `previewUrl` を取得してください。

3. **LINE送信（画像+テキスト）**: 取得したURLとテキスト本文を使って以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_image.ts {destination_option} "{originalUrl}" "{previewUrl}" "{message}"
```

- destination が指定されている場合は `--destination user|group|both` を先頭に追加してください。指定なしの場合はオプション不要です。

> **⚠️ 警告: 複数行のメッセージを送る場合は必ずクォート処理すること**
>
> 改行を含むメッセージは `\n` に置換して、コマンドを必ず1行に収めてください。
> スクリプト内部で `\n`（リテラル2文字）を実際の改行文字に変換します。

4. コマンドが成功したら、画像とテキストを送信した旨をユーザーに報告してください。

**画像送信のあとに `send_line_text` を別途呼び出さないでください。** テキストは本スキルに含めて送ります。

## 送信失敗時（Firestore 退避）

ステップ3の LINE 送信が失敗した場合（非ゼロ終了、429・クオータ等）は、Cloudinary アップロード済みであれば **`originalUrl` / `previewUrl` を含め**、**[LINE 送信失敗時の Firestore 退避](../../docs/line_send_fallback.md)** に従い **`put_firestore_doc`** で `type: line_undelivered` を保存してください。添えるテキストは送信予定と同一、`[media:image]` を使用。`both` のときは宛先ごとに 1 件ずつ退避します。
