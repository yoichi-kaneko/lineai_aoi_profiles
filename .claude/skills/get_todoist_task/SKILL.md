---
name: get_todoist_task
description: 指定した1件のTodoistタスクを取得する。引数はタスクID、またはタスクURL（https://app.todoist.com/app/task/... 形式）。完了済みのタスクも取得でき、返却フィールドは id / content / description / due / labels / checked / completedAt / url に絞り込み済み。
---

# get_todoist_task

タスクID（またはタスクURL）を指定して、Todoistのタスクを1件取得するスキルです。
返却される各タスクは、`id` / `content` / `description` / `due` / `labels` / `checked` / `completedAt` / `url` のみに絞り込まれています。

`get_todoist_tasks`（未完了タスクの一覧）と異なり、**完了済みのタスクも取得できます**。対象が完了済みかどうかは `checked` で判別してください。

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
pnpm exec tsx src/todoist/get_task.ts "{task_id または task_url}"
```

ARGUMENTS として渡された値をそのまま引数に使用してください。**URLをIDへ変換する処理はスクリプト側が行う**ため、呼び出す前にIDを取り出す必要はありません。

コマンドの実行結果（タスクのJSON）をそのままユーザーに提示してください。

## 引数について

以下のいずれの形式でも受け付けます。

| 形式 | 例 |
|---|---|
| タスクURL | `https://app.todoist.com/app/task/todoist-6hMrP2PjpPv46vQq` |
| タスクID | `6hMrP2PjpPv46vQq` |

タスクURLの `/task/` に続く部分は `{スラッグ}-{ID}` 形式で、スラッグはタスクのタイトルから作られます（タイトルが日本語のみの場合はスラッグが付きません）。スクリプトは末尾のハイフン以降をIDとして扱います。

## 注意事項

取得結果のタスクオブジェクトには、コメントの有無や件数を示すフィールドが含まれません。
コメント（添付ファイルを含む）を確認するには、同じ引数で `get_todoist_comments` を別途呼び出す必要があります。
