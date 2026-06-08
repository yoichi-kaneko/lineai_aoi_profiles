---
name: send_line_text
description: LINEにテキストメッセージのみを単独で送信する。画像や音声に添える本文は send_line_image / send_line_audio を使う。送信失敗時は line_undelivered として Firestore に退避する。環境変数で設定されたアクセストークンと送信先ユーザーID/グループIDを使用し、プッシュ通知で送る。送信先はuser（デフォルト）/group/bothから選択可能。
---

# send_line_text

環境変数で指定された LINE アクセストークンと送信先ID を使って、**テキストのみ**をプッシュ送信するスタンドアロン CLI スクリプトです。

画像や音声と一緒に送るテキストは **`send_line_image` / `send_line_audio`** を使用してください（同一リクエストでメディア→テキストの順に送信され、リクエスト件数を節約できます）。

## 概要

- **SDK**: `@line/bot-sdk` の `MessagingApiClient.pushMessage` を使用
- **送信先**: `--destination` オプションで指定（デフォルト: `user`）
  - `user` → `LINE_DESTINATION_USER_ID`
  - `group` → `LINE_DESTINATION_GROUP_ID`
  - `both` → 上記2件に順番に送信
- **認証**: 環境変数 `LINE_ACCESS_TOKEN` を使用

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
LINE_DESTINATION_USER_ID="your_user_id"
LINE_DESTINATION_GROUP_ID="your_group_id"   # group / both を使う場合に必要
```

## メッセージの受け渡し方法（ファイル経由）

メッセージ本文は**コマンド引数で直接渡さず**、一時ファイル `tmp/line_message.txt` に保存し、そのパスを引数で渡します。スクリプトはファイルを読み込んで本文として送信します。これにより、改行を含むメッセージでもシェルのエスケープ事故（`\n` が崩れる等）が起きません。

> **改行の扱い**: ファイルに書いた内容（実際の改行を含む）が**そのまま**送信されます。`\n` への置換やクォート処理は不要です。

## 実行方法

1. 送信したい本文を `tmp/line_message.txt` に保存する（Write ツールで本文をそのまま書き込む。改行はそのまま改行として書いてよい）。
2. ファイルパスを引数に渡してスクリプトを実行する。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_text.ts [--destination user|group|both] "tmp/line_message.txt"
```

例:

```bash
# ユーザーに送信（デフォルト）
pnpm exec tsx src/line/send_text.ts "tmp/line_message.txt"

# グループに送信
pnpm exec tsx src/line/send_text.ts --destination group "tmp/line_message.txt"

# ユーザーとグループ両方に送信
pnpm exec tsx src/line/send_text.ts --destination both "tmp/line_message.txt"
```

## Claudeへの指示

1. ARGUMENTS として渡された message を、そのまま `tmp/line_message.txt` に保存してください（改行はそのまま改行として書き込み、`\n` への置換はしない）。
2. 以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_text.ts {destination_option} "tmp/line_message.txt"
```

- destination が指定されている場合は `--destination user|group|both` をファイルパスの前に追加してください。指定なしの場合はオプション不要です。

コマンドが成功したら、メッセージを送信した旨をユーザーに報告してください。

## 送信失敗時（Firestore 退避）

CLI が非ゼロ終了した場合、または 429・クオータ・レート制限などで送信できなかった場合は、**[LINE 送信失敗時の Firestore 退避](../../docs/line_send_fallback.md)** に従い、**`put_firestore_doc` スキル**で `type: line_undelivered` を指定して保存してください。

- 本文は LINE に送る予定だったテキストと**同一**
- `[media:text]`、`[destination:…]` の書式は退避ドキュメントを参照
- `--destination both` のときは `user` / `group` それぞれ 1 件ずつ退避
- **`from_aoi` には保存しない**（引き継ぎ要約用の type とは別）
