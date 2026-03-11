---
name: generate_gemini_image
description: Google Gemini APIを使って画像を生成する。プロンプトを渡すと画像を生成し、tmp/ディレクトリに保存する。参考画像ディレクトリが設定されている場合は自動的に添付して生成する。
---

# generate_gemini_image

Google Gemini APIを使って画像を生成するスタンドアロン CLI スクリプトです。

## 概要

- プロンプトを受け取り、Gemini の画像生成モデルで画像を生成します
- 生成した画像は `tmp/` ディレクトリに保存します
- 参考画像ディレクトリが設定されている場合、その画像を自動的に参考として送信します
- アスペクト比: `1:1`（固定）
- 解像度: `1K`（固定）

## 事前準備

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_GEMINI_API_KEY="your_api_key"
GOOGLE_GEMINI_GENERATE_IMAGEMODEL="gemini-3.1-flash-image-preview"

# 任意: 参考画像ディレクトリ（ルートからの相対パス）
GOOGLE_GEMINI_GENERATE_IMAGE_IMPORT_DIR="assets/images"
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/generate_image.ts "{プロンプト}"
```

例:

```bash
npx tsx scripts/generate_image.ts "青い空と白い雲が広がる山の風景"
```

## 出力

成功時はJSON形式で以下を出力します。

```json
{
  "prompt": "入力したプロンプト",
  "model": "使用したモデル名",
  "aspectRatio": "1:1",
  "resolution": "1K",
  "referenceImagesCount": 2,
  "savedPaths": ["/absolute/path/to/tmp/gemini_image_1234567890.png"],
  "texts": []
}
```

## Claudeへの指示

画像生成が依頼されたとき、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/generate_image.ts "{ARGUMENTSとして渡されたプロンプト}"
```

2. コマンドの出力から `savedPaths` を取得してください。

3. `savedPaths` の各ファイルをReadツールで読み取り、生成された画像をユーザーに提示してください。

4. 生成結果（モデル名・参考画像数・保存パスなど）をユーザーに報告してください。
