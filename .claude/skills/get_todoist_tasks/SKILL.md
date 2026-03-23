---
name: get_todoist_tasks
description: Todoistの全タスクを取得する。
---

# get_todoist_tasks

Todoist Inbox を含む全タスクを取得するスキルです。

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
npx tsx src/todoist/get_tasks.ts
```

コマンドの実行結果（タスク一覧のJSON）をそのままユーザーに提示してください。
