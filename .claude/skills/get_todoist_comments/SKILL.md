---
name: get_todoist_comments
description: 指定したタスクIDのTodoistコメントを全件取得する。引数はtask_id。
---

# get_todoist_comments

指定したタスクIDに紐づくTodoistのコメントを全件取得するスキルです。

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
npx tsx src/todoist/get_comments.ts "{task_id}"
```

ARGUMENTS として渡された `task_id` をそのまま引数に使用してください。

コマンドの実行結果（コメント一覧のJSON）をそのままユーザーに提示してください。
