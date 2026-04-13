---
name: put_todoist_task
description: TodoistのInboxに新しいタスクを作成する。引数はcontent（タイトル）と任意のdescription（詳細）。
---

# put_todoist_task

Todoistの Inbox に新しいタスクを作成するスキルです。

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

description がある場合：
```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/todoist/put_task.ts "{content}" "{description}"
```

description がない場合：
```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/todoist/put_task.ts "{content}"
```

ARGUMENTS として渡された `content`（タスクタイトル）と `description`（任意の詳細）をそれぞれ引数に使用してください。

> **⚠️ 警告: 複数行のメッセージを送る場合は必ずクォート処理すること**
>
> 改行を含むメッセージをそのままコマンドに渡すと、シェルが途中で行を分割してコマンドが正常に動作しません。
> **複数行のメッセージは `\n` に置換して、コマンドを必ず1行に収めてください。**
>
> 悪い例（動作しない可能性あり）:
> ```bash
> pnpm exec tsx src/todoist/put_task.ts "タスクタイトル" "1行目
> 2行目"
> ```
>
> 良い例:
> ```bash
> pnpm exec tsx src/todoist/put_task.ts "タスクタイトル" "1行目\n2行目"
> ```

**複数行のメッセージを送る場合には改行をクォート処理してコマンドを1行に収めること。**
これを行わないと正常に動作しない恐れがあります。

コマンドの実行結果（作成されたタスクのJSON）をそのままユーザーに提示してください。
