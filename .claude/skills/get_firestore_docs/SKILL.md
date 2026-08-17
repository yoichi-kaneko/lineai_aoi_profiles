---
name: get_firestore_docs
description: 指定した日付範囲（dateFrom〜dateTo、YYYY-MM-DD）に一致するFirestoreのnotesコレクションのドキュメントを取得して返す。--collectionで専用コレクション（image_logs等）も、--typeでtypeによる絞り込みも可能。
---

# get_firestore_docs

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションから指定日付範囲のドキュメントを取得するスタンドアロン CLI スクリプトです。`--collection` オプションで `notes` 以外の専用コレクション（`image_logs` / `image_feedback` / `image_feedback_reviews` など）も取得でき、`--type` オプションで `type` による絞り込みもできます。

## 概要

- **コレクション**: 既定は `notes`（`--collection <name>` で変更可能）
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: `dateFrom`（YYYY-MM-DD）と `dateTo`（YYYY-MM-DD）の2つ。任意で `--collection <name>` / `--type <type[,type...]>`
- **動作**: `dateFrom` の0:00:00 〜 `dateTo` の23:59:59.999 の範囲（`date` フィールド）に一致するドキュメントを取得する（`--type` 指定時は該当する `type` のみを出力する）

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

`type` で絞り込む場合は `--type` を付けます（**値は必ず引用符で囲んでください**。囲まないと PowerShell 経由の実行時にカンマ区切りが配列として解釈されます）。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "2026-08-09" "2026-08-16" --type "line_text,line_image"
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

### `--type` による絞り込み

`--type "{type1},{type2}"` を付けると、指定した `type` のドキュメントだけが出力されます（`--type line_text --type line_image` のように繰り返し指定しても同じです）。

- **使いどころ**: 日付範囲が数日以上に及ぶ場合、`from_aoi` / `night_handover` / `up_mountain` / `stay_mountain` / `off_mountain` といった引き継ぎ記録が長文になり、レスポンス全体が読み込めない大きさに膨らむことがあります。**その処理で実際に使う `type` があらかじめ決まっている場合は、`--type` で絞って取得してください**（呼び出し元のモード文書が対象 `type` を指定している場合は、その指定に従ってください）。
- **1日分の取得**（暁・望・小夜など、当日〜前日の記録を漏れなく把握したい場合）では、絞り込まず全件取得して構いません。
- **値の指定**: `notes` コレクションでは [src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts) の `NOTE_TYPE` にある値のみ指定できます（不正な値は実行前にエラーになります）。`notes` 以外の専用コレクションでは検証をバイパスするため、`image_log` / `song_log` などコレクション内の識別値をそのまま指定できます。
- **注意**: 絞り込みは取得後に行われるため、除外された件数が出力の末尾に「（type 絞り込みで N 件を除外）」として表示されます。絞り込みの結果が0件でも、それは「指定した `type` の記録が無かった」という意味であり、失敗ではありません。

コマンドが成功したら、取得したドキュメントの一覧（ID・内容）をユーザーに報告してください。
一致するドキュメントがなかった場合もその旨を報告してください。

## タイムアウト

Firestore は gRPC 接続のため、詰まるとクライアント側に期限がなく長時間ぶら下がります。これを避けるため、CLI は30秒（`FIRESTORE_TIMEOUT_MS` で変更可）で自ら打ち切り、標準エラーに `[TIMEOUT]` を出力して終了コード `124` を返します。

本スキルは**読み取り専用**のため、タイムアウトした場合はそのまま1回だけ再試行して構いません。
