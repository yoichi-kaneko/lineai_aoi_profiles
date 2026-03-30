---
name: get_todoist_completed_tasks
description: 指定した日付に完了したTodoistタスクを取得する。引数は日付（YYYY-MM-DD）。
---

# get_todoist_completed_tasks

指定した日付に完了したTodoistタスクを完了日時で絞り込んで取得するスキルです。

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
TODOIST_API_TOKEN="your_api_token"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npx tsx src/todoist/get_completed_tasks.ts "{date}"
```

ARGUMENTS として渡された `date`（YYYY-MM-DD形式）をそのまま引数に使用してください。

コマンドの実行結果（完了タスク一覧のJSON）をそのままユーザーに提示してください。

## 注意事項

取得結果のタスクオブジェクトには、コメントの有無や件数を示すフィールドが含まれません。
コメント（添付ファイルを含む）を確認するには、タスクIDを引数に `get_todoist_comments` を別途呼び出す必要があります。
