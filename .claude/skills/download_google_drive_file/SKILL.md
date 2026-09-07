---
name: download_google_drive_file
description: Google DriveのファイルをfileIdを指定してダウンロードし、tmp/ディレクトリに保存する。
---

# download_google_drive_file

指定した fileId の Google Drive ファイルをダウンロードし、プロジェクトルートの `tmp/` ディレクトリに保存するスタンドアロン CLI スクリプトです。

## 概要

以下の処理を行い、結果を JSON 形式で標準出力に返します。

- **メタデータ取得**: ファイル名・MIME タイプを Drive API から取得
- **ファイルダウンロード**: バイナリストリームとして取得し `tmp/<ファイル名>` に保存

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"
```

ブラウザのクラウドセッションではファイルを置けないため、代わりに `GOOGLE_OAUTH_CREDENTIALS_JSON`（キーファイルの中身）と `GOOGLE_OAUTH_TOKENS_JSON`（`tokens.json` の中身）を設定します。いずれも設定されていればパス指定より優先されます（[README](../../../README.md#クラウドセッションへの資格情報の受け渡し)）。

### 初回認証

初回または再認証が必要な場合は以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/google_drive/auth.ts
```

表示された URL をブラウザで開いて Google アカウントを認証すると、
`~/.config/google-skills/tokens.json` に Calendar + Drive 両スコープの
トークンが保存されます。`GOOGLE_SKILLS_TOKEN_PATH` 環境変数でパスを変更できます。

この認証はブラウザでの同意と `localhost` へのリダイレクトを必要とするため、
クラウドセッションでは実行できません。ローカルで認証を済ませ、できた
`tokens.json` の中身を `GOOGLE_OAUTH_TOKENS_JSON` に渡してください。

## Claudeへの指示

以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/google_drive/download_file.ts {fileId}
```

- `fileId`: Google Drive のファイル ID（Drive URL の `/d/<fileId>/` の部分）
- ダウンロード成功時は `tmp/<ファイル名>` に保存され、保存パスを JSON で返します

ARGUMENTS として渡された fileId をそのまま引数に使用してください。
コマンドの実行結果（JSON）を解析し、ダウンロード成功・失敗をユーザーに分かりやすく提示してください。
成功した場合は `savedPath` のファイルパスも伝えてください。
