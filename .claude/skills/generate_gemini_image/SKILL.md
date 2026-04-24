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

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
GOOGLE_GEMINI_API_KEY="your_api_key"
GOOGLE_GEMINI_GENERATE_IMAGEMODEL="gemini-3.1-flash-image-preview"

# 任意: 参考画像ディレクトリ（ルートからの相対パス）
GENERATE_IMAGE_IMPORT_DIR="assets/images"
```

## Claudeへの指示

画像生成が依頼されたとき、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/gemini/generate_image.ts "{ARGUMENTSとして渡されたプロンプト}"
```

   **注意:** 用意したプロンプトが複数行に渡る場合、そのまま実行すると文字列が正しく渡されません。必ずクオート処理を行い、コマンドとして成立するようにしてください。

   例（複数行プロンプトの場合）:

   ```bash
   # 改行を \n に置き換えて1行の文字列として渡す
   pnpm exec tsx src/gemini/generate_image.ts "青い空と白い雲。\n遠くに山並みが見える風景画。"
   ```

2. コマンドの出力から `savedPaths` を取得してください。

3. `savedPaths` の各ファイルをReadツールで読み取り、生成された画像をユーザーに提示してください。

4. 生成結果（モデル名・参考画像数・保存パスなど）をユーザーに報告してください。
