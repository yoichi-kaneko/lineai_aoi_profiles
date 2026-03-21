---
name: download_image
description: 公開URLから画像をダウンロードし、tmp/ディレクトリに保存する。保存後、画像ファイルをReadツールで読み取り、内容を解析して返す。
---

# download_image

公開URLから画像ファイルをダウンロードし、`tmp/` ディレクトリに保存するスタンドアロンCLIスクリプトです。

## 概要

指定したURLに対してHTTP GETリクエストを行い、画像ファイルをダウンロードします。
保存後、Readツールで画像を読み取り、内容を解析します。

- **対応形式**: JPEG・PNG・GIF・WebP・SVG・BMP・TIFF
- **認証**: 不要（公開URLのみ対象）
- **保存先**: `{プロジェクトルート}/tmp/`

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/fetch.ts "{画像のURL}"
```

## 出力

成功時はJSON形式で以下を出力します。

```json
{
  "url": "ダウンロード元URL",
  "filename": "保存ファイル名",
  "contentType": "image/jpeg",
  "savedPath": "保存先の絶対パス",
  "sizeBytes": 12345
}
```

## 注意事項

- `image/` で始まる Content-Type のレスポンスのみ対象です。HTMLページなどは処理しません
- 同名ファイルが存在する場合は上書きします
- ネットワーク接続が必要です

## Claudeへの指示

画像URLが渡されたとき、このスキルを使用してください。

### 手順

1. スキルを起動し、以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/fetch.ts "{ARGUMENTSとして渡されたURL}"
```

2. コマンドの出力から `savedPath` を取得してください。

3. `savedPath` のファイルをReadツールで読み取り、画像の内容を解析してください。

4. 解析結果をユーザーに報告してください。
