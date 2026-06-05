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

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_text.ts [--destination user|group|both] "送信したいメッセージ"
```

例:

```bash
# ユーザーに送信（デフォルト）
pnpm exec tsx src/line/send_text.ts "こんにちは"

# グループに送信
pnpm exec tsx src/line/send_text.ts --destination group "こんにちは"

# ユーザーとグループ両方に送信
pnpm exec tsx src/line/send_text.ts --destination both "こんにちは"
```

> **⚠️ 警告: 複数行のメッセージを送る場合は必ずクォート処理すること**
>
> 改行を含むメッセージをそのままコマンドに渡すと、シェルが途中で行を分割してコマンドが正常に動作しません。
> **複数行のメッセージは `\n` に置換して、コマンドを必ず1行に収めてください。**
>
> スクリプト内部で `\n`（リテラル2文字）を自動的に実際の改行文字に変換するため、
> コマンド引数として `\n` を渡すだけで LINE 上で改行されます。
>
> 悪い例（動作しない可能性あり）:
> ```bash
> pnpm exec tsx src/line/send_text.ts "1行目
> 2行目"
> ```
>
> 良い例:
> ```bash
> pnpm exec tsx src/line/send_text.ts "1行目\n2行目"
> ```

## Claudeへの指示

以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/line/send_text.ts {destination_option} "{message}"
```

- ARGUMENTS として渡された message をそのまま引数に使用してください。
- destination が指定されている場合は `--destination user|group|both` をメッセージの前に追加してください。指定なしの場合はオプション不要です。

**複数行のメッセージを送る場合には改行をクォート処理してコマンドを1行に収めること。**
これを行わないと正常に動作しない恐れがあります。

コマンドが成功したら、メッセージを送信した旨をユーザーに報告してください。

## 送信失敗時（Firestore 退避）

CLI が非ゼロ終了した場合、または 429・クオータ・レート制限などで送信できなかった場合は、**[LINE 送信失敗時の Firestore 退避](../../docs/line_send_fallback.md)** に従い、**`put_firestore_doc` スキル**で `type: line_undelivered` を指定して保存してください。

- 本文は LINE に送る予定だったテキストと**同一**
- `[media:text]`、`[destination:…]` の書式は退避ドキュメントを参照
- `--destination both` のときは `user` / `group` それぞれ 1 件ずつ退避
- **`from_aoi` には保存しない**（引き継ぎ要約用の type とは別）
