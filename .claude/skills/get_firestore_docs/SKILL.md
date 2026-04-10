---
name: get_firestore_docs
description: 指定した日付（YYYY-MM-DD）に一致するFirestoreのドキュメントを取得し、isRead=trueに更新して返す。collection は notes/records（省略時 notes）。
---

# get_firestore_docs

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの指定コレクション（`notes` または `records`）から指定日付のドキュメントを取得するスタンドアロン CLI スクリプトです。

## 概要

- **コレクション**: `notes` / `records`（省略時 `notes`）
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: 日付（YYYY-MM-DD）と任意の collection（`notes` / `records`）
- **動作**: dateが一致するドキュメントを全件取得し、取得後に `isRead: true` へ更新する

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
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
FIREBASE_CONFIG_PATH="/path/to/serviceaccount.json"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/get_docs.ts "2026-03-21"
```

`records` を対象にする場合は、末尾に `records` を追加してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/get_docs.ts "2026-03-21" "records"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/get_docs.ts "{date}" "{collection?}"
```

ARGUMENTS として渡された `date`（YYYY-MM-DD形式）をそのまま第1引数に使用してください。

`collection` が指定された場合は第2引数に `notes` または `records` を設定してください（省略時は `notes`）。
**明示的に `records` が指定された場合のみ**参照先を `records` に切り替えてください。

コマンドが成功したら、取得したドキュメントの一覧（ID・内容）をユーザーに報告してください。
一致するドキュメントがなかった場合もその旨を報告してください。
