---
name: session_store
description: セッション間でパラメータを受け渡すための一時ストレージ。tmp/session_store.json にkey-value形式で保存・取得する。
---

# session_store

セッションをまたいでパラメータを受け渡すためのシンプルなKVストアです。
`tmp/session_store.json` にデータを保存し、別セッションで取得します。

## 概要

- **保存先**: プロジェクトルートの `tmp/session_store.json`
- **操作**: `save`（保存）/ `load`（取得＆削除）/ `dump`（内容確認）
- **load** は取得したキーを自動削除し、全キーが空になったらファイルごと削除する

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}

# 保存
npx tsx scripts/main.ts save key=value [key2=value2 ...]

# 取得（取得後にキーを削除）
npx tsx scripts/main.ts load key [key2 ...]

# 全件確認（削除なし・デバッグ用）
npx tsx scripts/main.ts dump
```

例:

```bash
# task_id を保存
npx tsx scripts/main.ts save task_id=abc123

# task_id を取得
npx tsx scripts/main.ts load task_id
# 出力例: task_id=abc123
```

> **⚠️ 警告: 複数行の値を保存する場合は必ずクォート処理すること**
>
> 改行を含む値をそのままコマンドに渡すと、シェルが途中で行を分割してコマンドが正常に動作しません。
> **複数行の値は改行を `\n` に置換して、コマンドを必ず1行に収めてください。**
>
> スクリプト内部で `\n`（リテラル2文字）を自動的に実際の改行文字に変換してJSONに保存します。
>
> 悪い例（動作しない可能性あり）:
> ```bash
> npx tsx scripts/main.ts save lyrics="1行目
> 2行目"
> ```
>
> 良い例:
> ```bash
> npx tsx scripts/main.ts save lyrics="1行目\n2行目"
> ```

## Claudeへの指示

### save

スキル起動時に提示される `Base directory for this skill` の絶対パスに `cd` した上で、以下を実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/main.ts save {key}="{value}" [{key2}="{value2}" ...]
```

**複数行の値を渡す場合には改行をクォート処理（`\n`に置換）してコマンドを1行に収めること。**
これを行わないと正常に動作しない恐れがあります。

### load

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/main.ts load {key} [{key2} ...]
```

出力は `key=value` 形式です。取得したキーはストアから削除されます。

### dump（デバッグ用）

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/main.ts dump
```
