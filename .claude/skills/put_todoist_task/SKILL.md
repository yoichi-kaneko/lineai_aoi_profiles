---
name: put_todoist_task
description: TodoistのInboxに新しいタスクを作成する。タイトル（content）は引数で渡し、詳細（description）は一時ファイル(tmp/todoist_task.txt)に保存してそのパスを渡す。
---

# put_todoist_task

Todoist の Inbox に新しいタスクを作成するスキルです。

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

### 手順

1. **詳細（description）の保存**: 詳細を添える場合は、その本文を `tmp/todoist_task.txt` に保存してください。**詳細を引数で直接渡すことはできません**（改行を含む本文はコマンドライン引数では正しくクォート処理されないため）。改行はそのまま改行として書けばよく、`\n` への置換は不要です。

2. **タスクの作成**: 以下のコマンドをプロジェクトルートから実行してください。

   **詳細（description）を添える場合:**

   ```bash
   cd {プロジェクトルートの絶対パス}
   pnpm exec tsx src/todoist/put_task.ts "{content}" --description-file tmp/todoist_task.txt
   ```

   **タイトルのみの場合:**

   ```bash
   cd {プロジェクトルートの絶対パス}
   pnpm exec tsx src/todoist/put_task.ts "{content}"
   ```

   - 第1引数: `content`（タスクタイトル）。1行に収まる短い文字列であるため、従来どおり引数で渡します。
   - `--description-file`: 詳細を保存した一時ファイルのパス（任意）。プロジェクトルート内のパスを指定してください。

3. 標準出力に作成されたタスクの JSON が返ります。その内容をそのままユーザーに提示してください。

## 注意事項

- **詳細（description）は必ず一時ファイル経由で渡すこと。** 詳細を第2位置引数として渡した場合、コマンドは終了コード1で失敗します。
- `--description-file` に指定したファイルが空の場合も、終了コード1で失敗します。詳細が不要な場合はオプションごと省略してください。
- `--description-file` はプロジェクトルート外のパス（絶対パスや `../` による脱出）を受け付けません。
- タイトルに改行を含めないでください（Todoist のタスクタイトルは1行が前提です）。
