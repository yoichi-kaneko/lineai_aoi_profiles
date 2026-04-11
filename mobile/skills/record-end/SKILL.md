---
name: record-end
description: 「記録終了」「今日の記録を終わる」などのフレーズで、record-start / record-add で蓄積した localStorage の記録をAIエージェント碧衣向けメッセージに変換して保存し、応答トリガーを起動して記録を破棄する。
metadata:
  require-secret: true
  require-secret-description: putFireStoreDoc / execEc2Command 呼び出し用の BEARER_TOKEN（Bearer と一致する値）を入力してください。
---

# Record End Skill

## Overview

このスキルは、`record-start` と `record-add` で localStorage に保持している記録データを回収し、碧衣（メインAI）へ渡すための文章を生成・保存し、応答トリガーを起動して記録セッションを終了するためのスキルです。

AIによる文章生成を途中に挟むため、`run_js` は1回で完結させず、同一スキル内で複数回（最大4回）呼び出してください。

## Trigger Conditions

- ユーザーが「記録終了」「記録おわり」「今日の記録を締める」など、記録セッションの終了を示す発話をしたとき

## Instructions

`run_js` は必ず以下の順序で実行してください。

### Step 1: localStorage から記録を取得

Call the `run_js` tool with:

- script name: `index.html`
- data: `{"action":"load_records"}`

期待値:
- 成功時に、記録配列またはそれに準ずるデータを取得する
- 取得結果をもとに、次ステップで碧衣へ渡す要約文（description）を作るための材料を揃える

### Step 2: 碧衣向け description を作成（LLM処理）

このステップは `run_js` ではなく、エージェント側の通常応答処理で行ってください。

- Step 1 の取得データを要約し、碧衣向けの自然文 `description` を生成する
- 要約は「登山記録」のユースケースを前提とし、時系列（古い順→新しい順）で整理する
- 各記録について、可能な限り「時刻」「保存されたメッセージ内容」「写真メモ（どんな写真を撮影したか）」を列挙する
- 碧衣が後段でユーザー向け文面を再生成する前提のため、`description` は簡潔さより情報量を優先し、冗長でも省略しない
- 以降の Step 3 で `description` を `putFireStoreDoc` に渡す
- `description` が空文字にならないことを確認する

### Step 3: putFireStoreDoc 実行

Call the `run_js` tool with:

- script name: `index.html`
- data: `{"action":"put_firestore_doc","description":"..."}`

補足:
- `date` は引数で渡さない。スクリプト側で JST 現在日時から `YYYY-MM-DD` を生成し、自動設定する
- secret（第2引数）には BEARER_TOKEN を渡す

### Step 4: execEc2Command 実行

Call the `run_js` tool with:

- script name: `index.html`
- data: `{"action":"exec_ec2_command"}`

補足:
- secret（第2引数）には BEARER_TOKEN を渡す
- この API は非同期トリガーであり、HTTP 200 は実行受付成功を意味する

### Step 5: localStorage を削除

Call the `run_js` tool with:

- script name: `index.html`
- data: `{"action":"clear_records"}`

**重要:** `clear_records` は Step 3 と Step 4 が成功した場合のみ実行してください。

## Failure Handling

- Step 1 が失敗した場合: 以降を実行せず中断し、ユーザーに失敗を通知
- Step 3 が失敗した場合: 以降を実行せず中断し、ユーザーに失敗を通知（Step 4 / Step 5 は実行しない）
- Step 4 が失敗した場合: 以降を実行せず中断し、ユーザーに失敗を通知（Step 5 は実行しない）
- Step 5 が失敗した場合: 記録が端末側に残っている可能性を明示して通知

## Expected Behavior

各 `run_js` の戻り値は文字列化JSONを想定:

- 成功時: `{"result": ...}`
- 失敗時: `{"error":"..."}`

## After the script runs

- 全ステップ成功時:
  - 「記録の保存を終了し、碧衣に通知した」ことをユーザーへ簡潔に案内する
- 失敗時:
  - どのステップで失敗したかを明示し、処理が中断されたことを伝える
  - 必要に応じて再実行を案内する
