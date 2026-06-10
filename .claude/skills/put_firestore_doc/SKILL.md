---
name: put_firestore_doc
description: Firestoreのnotesにdocを追加する。引数は日付(YYYY-MM-DD)・説明文・任意のtype（許可値・省略時既定はsrc/firebase/noteTypes.tsのNOTE_TYPE参照）。未定義のtypeはCLIがエラー。
---

# put_firestore_doc

環境変数 `FIREBASE_CONFIG_PATH` に設定されたサービスアカウントを使って、Firestoreの `notes` コレクションにドキュメントを追加するスタンドアロン CLI スクリプトです。

## 概要

- **コレクション**: `notes`
- **認証**: 環境変数 `FIREBASE_CONFIG_PATH` で指定されたサービスアカウントJSONを使用
- **引数**: 日付（YYYY-MM-DD）と説明文

## ドキュメント構造

第3引数 `type` の取りうる値・意味・省略時のデフォルトは **[src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts)**（CLI は `NOTE_TYPE.FROM_AOI` と同値）を参照してください。定義にない文字列を渡すと CLI はエラーになります。

LINE 送信失敗時の退避では `line_undelivered` を指定します。手順の詳細は [LINE 送信失敗時の Firestore 退避](../../docs/line_send_fallback.md) を参照してください（`send_line_*` スキルから呼び出す想定）。

| フィールド    | 型        | 内容                         |
|-------------|-----------|------------------------------|
| date        | Timestamp | 引数の日付（Date型）           |
| description | string    | 引数の説明文                  |
| type        | string    | 第3引数（省略時は `from_aoi`）。許可値は `noteTypes.ts` |
| createdAt   | Timestamp | 登録日時（秒まで）             |

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
# typeを省略（デフォルトは noteTypes.ts の NOTE_TYPE.FROM_AOI と同じ）
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/put_doc.ts "2026-03-21" "今日のメモ"

# typeを指定（許可される文字列は noteTypes.ts の NOTE_TYPE を参照）
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/put_doc.ts "2026-03-21" "下山報告" "off_mountain"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
# type 省略時（デフォルトは src/firebase/noteTypes.ts の NOTE_TYPE.FROM_AOI と同じ）
pnpm exec tsx src/firebase/put_doc.ts "{date}" "{description}"
# type 指定時
pnpm exec tsx src/firebase/put_doc.ts "{date}" "{description}" "{type}"
```

`{type}` は省略可能です。既定値の詳細は [src/firebase/noteTypes.ts](../../../src/firebase/noteTypes.ts) の `NOTE_TYPE.FROM_AOI` を参照してください。`{type}` に空文字を渡すと CLI がエラーになるため、省略するか許可された値のみを渡してください。

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
> pnpm exec tsx src/firebase/put_doc.ts "{date}" "1行目
> 2行目"
> ```
>
> 良い例:
> ```bash
> pnpm exec tsx src/firebase/put_doc.ts "{date}" "1行目\n2行目"
> ```

ARGUMENTS として渡された `date`（YYYY-MM-DD形式）、 `description` をそのまま引数に使用してください。

**複数行のメッセージを送る場合には改行をクォート処理してコマンドを1行に収めること。**
これを行わないと正常に動作しない恐れがあります。

コマンドが成功したら、追加したドキュメントのIDと内容をユーザーに報告してください。
