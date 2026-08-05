---
name: put_firestore_doc
description: Firestoreにdocを追加する。日付(YYYY-MM-DD)と、本文を保存した一時ファイル(tmp/firestore_doc.txt)を渡す。任意のtype（許可値・省略時既定はsrc/firebase/noteTypes.tsのNOTE_TYPE参照）。未定義のtypeはCLIがエラー。--collectionで専用コレクション（image_logs等）にも書き込み可能。
---

# put_firestore_doc

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションにドキュメントを追加するスタンドアロン CLI スクリプトです。`--collection` オプションで `notes` 以外の専用コレクション（`image_logs` など）にも書き込めます。

本文（`description`）は引数で直接渡さず、**一時ファイル `tmp/firestore_doc.txt` に保存してそのパスを渡す方式**です（`send_line_*` スキルの `tmp/line_message.txt` と同じ作法）。改行はそのまま改行として書けばよく、`\n` への置換やクォート処理は不要です。

## 概要

- **コレクション**: 既定は `notes`（`--collection <name>` で変更可能）
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: 日付（YYYY-MM-DD）と、本文を保存した一時ファイルのパス

## ドキュメント構造

`type` の取りうる値・意味・省略時のデフォルトは **[src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts)**（CLI は `NOTE_TYPE.FROM_AOI` と同値）を参照してください。`notes` コレクションでは定義にない文字列を渡すと CLI はエラーになります。

LINE 送信失敗時の退避では `line_undelivered` を指定します。手順の詳細は [LINE 送信失敗時の Firestore 退避](../../docs/line_send_fallback.md) を参照してください（`send_line_*` スキルから呼び出す想定）。

| フィールド    | 型        | 内容                         |
|-------------|-----------|------------------------------|
| date        | Timestamp | 引数の日付（Date型）           |
| description | string    | `tmp/firestore_doc.txt` の内容 |
| type        | string    | 任意指定（省略時は `from_aoi`）。許可値は `noteTypes.ts` |
| createdAt   | Timestamp | 登録日時（秒まで）             |

## オプション

- **`--description-file <path>`**: 本文をファイル（プロジェクトルート相対）から読み込みます。**本スキルの標準の渡し方**です。`tmp/firestore_doc.txt` を指定してください。
  - このオプション指定時、位置引数は `[date, type]` の順に解釈されます（本文の位置引数はありません）。
- **`--collection <name>`**: 書き込み先コレクションを指定します（省略時は `notes`）。
  - `notes` のときは `type` を NOTE_TYPE で検証します（省略時 `from_aoi`）。
  - `notes` 以外（`image_logs` 等の専用コレクション）のときは **NOTE_TYPE 検証をバイパス**し、`type` をコレクション内識別用の任意文字列として**必須**にします。

`image_logs` への記録の具体的な手順・JSON スキーマは **[画像生成ログ（image_logs）スキーマ](../../docs/image_log_schema.md)** を参照してください。

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

## Claudeへの指示

### 手順

1. **本文の保存**: 記録したい本文を、そのまま `tmp/firestore_doc.txt` に保存してください（Write ツールで書き込み。改行はそのまま改行として書き、`\n` への置換やクォート処理はしない）。

2. **記録コマンドの実行**: 以下をプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
# type 省略時（デフォルトは src/firebase/noteTypes.ts の NOTE_TYPE.FROM_AOI と同じ）
pnpm exec tsx src/firebase/put_doc.ts "{date}" --description-file tmp/firestore_doc.txt
# type 指定時（許可される文字列は noteTypes.ts の NOTE_TYPE を参照）
pnpm exec tsx src/firebase/put_doc.ts "{date}" "{type}" --description-file tmp/firestore_doc.txt
```

- `{date}` は YYYY-MM-DD 形式で渡してください。
- 本文は引数で直接渡さず、`tmp/firestore_doc.txt` 経由で受け渡します。スクリプトがファイルを読み込み、**書いた内容（実際の改行を含む）をそのまま** `description` に保存します。
- `tmp/firestore_doc.txt` を本文の位置引数として渡してはいけません。必ず `--description-file tmp/firestore_doc.txt` を指定してください。
- `{type}` は省略可能です。既定値の詳細は [src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts) の `NOTE_TYPE.FROM_AOI` を参照してください。`{type}` に空文字を渡すと CLI がエラーになるため、省略するか許可された値のみを渡してください。

3. コマンドが成功したら、追加したドキュメントのIDと内容をユーザーに報告してください。

## タイムアウト

Firestore は gRPC 接続のため、詰まるとクライアント側に期限がなく長時間ぶら下がります。これを避けるため、CLI は30秒（`FIRESTORE_TIMEOUT_MS` で変更可）で自ら打ち切り、標準エラーに `[TIMEOUT]` を出力して終了コード `124` を返します。

打ち切りは「待つのをやめる」だけで、**サーバ側の書き込みをキャンセルするものではありません**。本スキルは書き込みのため、タイムアウトした場合は**そのまま再実行しないでください**。`get_firestore_docs` に書き込み時と**同じ `--collection`** を必ず指定して対象レコードを照合し、記録が無いことを確認できた場合に限り1回だけやり直します。対象を照合できない場合は「記録がない」と判定せず、再実行しないでください（[aoi_constraints.md の「タイムアウトの扱い」](../../rules/aoi_constraints.md) を正とします）。
