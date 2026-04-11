---
name: record-start
description: 「記録開始」「今日の記録を始めて」「登山記録スタート」などのフレーズで、その日の登山記録をAIエージェント碧衣から受け取り、読み上げる。date を省略した場合はスクリプト側で JST の当日を使う。
metadata:
  require-secret: true
  require-secret-description: getFireStoreDocs 用の BEARER_TOKEN（Bearer と一致する値）を入力してください。
---

# Record Start Skill

## Overview

このスキルは、AIエージェント「碧衣（あおい）」との連携によって動作します。碧衣は、ユーザーの一日に寄り添う知的なアシスタントで、登山の計画や記録もサポートします。碧衣が Firestore に書き込んだ当日の登山記録（行程メモ・チェックポイントなど）を、このスキルを通じて取得し、あなたに読み上げます。

## Instructions

Call the `run_js` tool with the following parameters:

- script name: `index.html`
- data: A JSON string with the following fields:
  - `date`（任意）: string (`YYYY-MM-DD`)。ユーザーまたは指示で日付が明記されている場合のみセットする。省略時はスクリプトが JST の当日を使う。

シークレットはアプリのダイアログで入力され、スクリプトの第2引数に渡される（BEARER_TOKEN）。

## Expected behavior
- Parse incoming JSON safely.
- Return a stringified JSON object:
  - On success: `{ "result": ... }`（HTTP 200 のレスポンス本文）
  - On error: `{ "error": "..." }`

## After the script runs

スクリプトから結果を受け取ったら、取得した文書の内容を自然な会話調でユーザーに読み上げてください。重要なポイント（例：今日のルート、チェックポイント、碧衣からのメモなど）を明確かつ簡潔に要約してください。
