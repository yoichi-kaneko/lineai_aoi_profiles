---
name: record-start
description: 指定日の Firestore ドキュメントを getFireStoreDocs で取得する。
metadata:
  require-secret: true
  require-secret-description: getFireStoreDocs 用の BEARER_TOKEN（Bearer と一致する値）を入力してください。
---

# Record Start Skill

## Overview
`date` とシークレット（BEARER_TOKEN）で Cloud Function `getFireStoreDocs` を呼び出し、取得結果を返す。

## Instructions
Call the `run_js` tool with the following parameters:

- script name: `index.html`
- data: A JSON string with the following field:
  - `date`: string (`YYYY-MM-DD`)

シークレットはアプリのダイアログで入力され、スクリプトの第2引数に渡される（BEARER_TOKEN）。

## Expected behavior
- Parse incoming JSON safely.
- Return a stringified JSON object:
  - On success: `{ "result": ... }`（HTTP 200 のレスポンス本文）
  - On error: `{ "error": "..." }`
