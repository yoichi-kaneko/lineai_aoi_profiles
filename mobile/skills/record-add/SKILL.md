---
name: record-add
description: 「記録 ...」で追記メモを保存する。テキストは「記録」を除いた本文を保存し、画像は風景の構成要素を中心に解釈して説明文を生成して保存する。
---

# Record Add Skill

## Overview

このスキルは、`record-start` で初期化された localStorage の記録配列へ、1件ずつメモを追加するためのスキルです。ユーザーが「記録」に続けて入力したテキスト、または添付画像の内容を解釈して作成した文章を `message` として保存します。

## Trigger Conditions

- ユーザーが「記録」の後ろにテキストを続けて送ったとき
- ユーザーが「記録」と画像を送ったとき

## Instructions

### 1. テキスト入力の場合

- 入力文の先頭にある「記録」を除いた本文を `message` として扱う
- 余分な空白は取り除く

### 2. 画像入力の場合

- 画像を見て、風景の構成要素（山容、空、雲、植生、地形、水辺、人工物など）を主軸に解釈する
- 生成する文章は必ず `ユーザが写真を撮影。` で始める
- 続けて「どのような写真か」を自然文で説明する
- できあがった文章を `message` として扱う

### 3. run_js 呼び出し

Call the `run_js` tool with:

- script name: `index.html`
- data: `{"message":"..."}`（文字列化した JSON）

`dateTime` はスクリプト側で JST 時刻を自動付与するため、入力 JSON には含めません。

## Expected Behavior

- 成功時: `{"result":{"appended":{"message":"...","dateTime":"..."}, "count": number}}`
- 失敗時: `{"error":"..."}`

## After the script runs

追加した内容をユーザーへ簡潔に伝えてください。必要なら「何件保存されているか」も添えて案内してください。
