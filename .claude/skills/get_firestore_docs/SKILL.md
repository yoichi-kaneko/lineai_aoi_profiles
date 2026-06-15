---
name: get_firestore_docs
description: 指定した日付範囲（dateFrom〜dateTo、YYYY-MM-DD）に一致するFirestoreのnotesコレクションのドキュメントを取得して返す。--collectionで専用コレクション（image_logs等）も取得可能。
---

# get_firestore_docs

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションから指定日付範囲のドキュメントを取得するスタンドアロン CLI スクリプトです。`--collection` オプションで `notes` 以外の専用コレクション（`image_logs` / `image_feedback` / `image_feedback_reviews` など）も取得できます。

## 概要

- **コレクション**: 既定は `notes`（`--collection <name>` で変更可能）
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: `dateFrom`（YYYY-MM-DD）と `dateTo`（YYYY-MM-DD）の2つ。任意で `--collection <name>`
- **動作**: `dateFrom` の0:00:00 〜 `dateTo` の23:59:59.999 の範囲（`date` フィールド）に一致するドキュメントを全件取得する

## ドキュメント構造

`type` フィールドの取りうる値と各値の意味は **[src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts)** を参照してください。

| フィールド    | 型        | 内容                         |
|-------------|-----------|------------------------------|
| date        | Timestamp | ドキュメントの日付             |
| description | string    | 説明文                       |
| type        | string    | 上記 `noteTypes.ts` の定義に従う |
| createdAt   | Timestamp | 登録日時                      |

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
FIREBASE_CONFIG_PATH="/path/to/serviceaccount.json"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "2026-03-21" "2026-03-21"
```

専用コレクションを対象にする場合は `--collection` を付けます。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "2026-06-01" "2026-06-21" --collection image_logs
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "{dateFrom}" "{dateTo}"
```

ARGUMENTS として渡された `dateFrom` と `dateTo`（どちらも YYYY-MM-DD形式）をそのまま引数に使用してください。
同日を指定する場合は `dateFrom` と `dateTo` に同じ日付を渡してください。
`notes` 以外のコレクション（`image_logs` など）を取得したい場合は、末尾に `--collection {コレクション名}` を付けてください。

コマンドが成功したら、取得したドキュメントの一覧（ID・内容）をユーザーに報告してください。
一致するドキュメントがなかった場合もその旨を報告してください。
