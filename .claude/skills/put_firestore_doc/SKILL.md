---
name: put_firestore_doc
description: 特定の要件に基づいてFirestoreにdocを追加する。引数は日付(YYYY-MM-DD)と説明文、末尾に collection（notes/records、省略時 notes）。type=from_aoi、isRead=false固定。
---

# put_firestore_doc

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの指定コレクション（`notes` または `records`）にドキュメントを追加するスタンドアロン CLI スクリプトです。

## 概要

- **コレクション**: `notes` / `records`（省略時 `notes`）
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: 日付（YYYY-MM-DD）、説明文、任意の collection（`notes` / `records`）

## ドキュメント構造

| フィールド    | 型        | 内容                         |
|-------------|-----------|------------------------------|
| date        | Timestamp | 引数の日付（Date型）           |
| description | string    | 引数の説明文                  |
| type        | string    | `"from_aoi"` 固定            |
| isRead      | boolean   | `false` 固定（作成時）        |
| createdAt   | Timestamp | 登録日時（秒まで）             |

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
FIREBASE_CONFIG_PATH="/path/to/serviceaccount.json"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/put_doc.ts "2026-03-21" "今日のメモ"
```

`records` に追加したい場合は、末尾に `records` を追加してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/put_doc.ts "2026-03-21" "今日のメモ" "records"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/put_doc.ts "{date}" "{description}" "{collection?}"
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
> npx tsx src/firebase/put_doc.ts "{date}" "1行目
> 2行目"
> ```
>
> 良い例:
> ```bash
> npx tsx src/firebase/put_doc.ts "{date}" "1行目\n2行目"
> ```

ARGUMENTS として渡された `date`（YYYY-MM-DD形式）、 `description` をそのまま引数に使用してください。

`collection` が指定された場合は末尾引数に `notes` または `records` を設定してください（省略時は `notes`）。
**明示的に `records` が指定された場合のみ**追加先を `records` に切り替えてください。

**複数行のメッセージを送る場合には改行をクォート処理してコマンドを1行に収めること。**
これを行わないと正常に動作しない恐れがあります。

コマンドが成功したら、追加したドキュメントのIDと内容をユーザーに報告してください。
