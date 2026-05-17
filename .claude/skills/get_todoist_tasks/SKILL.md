---
name: get_todoist_tasks
description: Todoistの全タスクを取得する。返却フィールドは id / content / description / due / labels に絞り込み済み。
---

# get_todoist_tasks

Todoist Inbox を含む全タスクを取得するスキルです。
返却される各タスクは、`id` / `content` / `description` / `due` / `labels` のみに絞り込まれています。

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
TODOIST_API_TOKEN="your_api_token"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/todoist/get_tasks.ts
```

コマンドの実行結果（タスク一覧のJSON）をそのままユーザーに提示してください。

## 注意事項

取得結果のタスクオブジェクトには、コメントの有無や件数を示すフィールドが含まれません。
コメント（添付ファイルを含む）を確認するには、タスクIDを引数に `get_todoist_comments` を別途呼び出す必要があります。
