---
name: get_firestore_doc
description: 指定した日付（YYYY-MM-DD）に一致するFirestoreのnotesコレクションのドキュメントを取得し、isRead=trueに更新して返す。
---

# get_firestore_doc

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションから指定日付のドキュメントを取得するスタンドアロン CLI スクリプトです。

## 概要

- **コレクション**: `notes`
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: 日付（YYYY-MM-DD）
- **動作**: dateが一致するドキュメントを全件取得し、取得後に `isRead: true` へ更新する

## ドキュメント構造

| フィールド   | 型        | 内容                         |
|------------|-----------|------------------------------|
| date       | Timestamp | ドキュメントの日付             |
| descript   | string    | 説明文                       |
| type       | string    | ドキュメントの種別             |
| isRead     | boolean   | 既読フラグ（取得後 `true` に更新）|
| createdAt  | Timestamp | 登録日時                      |

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
npx tsx src/firebase/get_doc.ts "2026-03-21"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/firebase/get_doc.ts "{date}"
```

ARGUMENTS として渡された `date`（YYYY-MM-DD形式）をそのまま引数に使用してください。

コマンドが成功したら、取得したドキュメントの一覧（ID・内容）をユーザーに報告してください。
一致するドキュメントがなかった場合もその旨を報告してください。
