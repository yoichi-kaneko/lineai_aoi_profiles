---
name: get_firestore_docs
description: 指定した日付範囲（dateFrom〜dateTo、YYYY-MM-DD）に一致するFirestoreのnotesコレクションのドキュメントを取得し、isRead=trueに更新して返す。
---

# get_firestore_docs

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションから指定日付範囲のドキュメントを取得するスタンドアロン CLI スクリプトです。

## 概要

- **コレクション**: `notes`
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: `dateFrom`（YYYY-MM-DD）と `dateTo`（YYYY-MM-DD）の2つ
- **動作**: `dateFrom` の0:00:00 〜 `dateTo` の23:59:59 の範囲に一致するドキュメントを全件取得し、取得後に `isRead: true` へ更新する

## ドキュメント構造

| フィールド    | 型        | 内容                         |
|-------------|-----------|------------------------------|
| date        | Timestamp | ドキュメントの日付             |
| description | string    | 説明文                       |
| type        | string    | ドキュメントの種別             |
| isRead      | boolean   | 既読フラグ（取得後 `true` に更新）|
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

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "{dateFrom}" "{dateTo}"
```

ARGUMENTS として渡された `dateFrom` と `dateTo`（どちらも YYYY-MM-DD形式）をそのまま引数に使用してください。
同日を指定する場合は `dateFrom` と `dateTo` に同じ日付を渡してください。

コマンドが成功したら、取得したドキュメントの一覧（ID・内容）をユーザーに報告してください。
一致するドキュメントがなかった場合もその旨を報告してください。
