---
name: download_todoist_attachment
description: TodoistコメントのfileAttachment.fileUrlを、APIトークン認証付きでダウンロードしてtmp/ディレクトリに保存する。引数はfile_url（必須）とfilename（任意）。
---

# download_todoist_attachment

TodoistコメントのfileAttachment.fileUrlは認証が必要なため、通常の `download_image` スキルでは取得できません。
このスキルはTodoistのAPIトークンを使って認証付きでダウンロードします。

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
pnpm exec tsx src/todoist/download_attachment.ts "{file_url}" ["{filename}"]
```

- `file_url`: コメントの `fileAttachment.fileUrl` の値（必須）
- `filename`: 保存時のファイル名（任意）。省略した場合はURLまたはContent-Dispositionから自動決定。
  コメントに `fileAttachment.fileName` がある場合はそれを渡すことを推奨。

### 使用例

`get_todoist_comments` の結果から `fileAttachment.fileUrl` と `fileAttachment.fileName` を取り出して渡す:

```bash
pnpm exec tsx src/todoist/download_attachment.ts "https://files.todoist.com/user_upload/v2/.../file.JPG" "P3080841.JPG"
```

コマンドの実行結果（保存先パスなどのJSON）をそのままユーザーに提示してください。

## 注意事項

- `files.todoist.com` ドメイン以外のURLはSDK内部のセキュリティ検証でエラーになります
- ダウンロードした画像を送信する場合は `send_line_image` スキルを使用してください
