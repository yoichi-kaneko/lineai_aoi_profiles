---
name: generate_gpt_image
description: OpenAI GPT Image APIを使って画像を生成する。プロンプトを一時ファイル(tmp/gpt_image_prompt.txt)に保存し、そのパスと参考画像ファイル名を渡すと画像を生成し、tmp/ディレクトリに保存する。
---

# generate_gpt_image

OpenAI GPT Image APIを使って画像を生成するスタンドアロン CLI スクリプトです。

プロンプトは引数で直接渡さず、**一時ファイル `tmp/gpt_image_prompt.txt` に保存してそのパスを渡す方式**です（`send_line_*` / mureka スキルと同じ作法）。改行はそのまま改行として書けばよく、`\n` への置換やクォート処理は不要です。

## 概要

- プロンプトを保存した一時ファイルのパスを受け取り、OpenAI の画像生成モデルで画像を生成します
- 生成した画像は `tmp/` ディレクトリに保存します
- 第二引数で指定した参考画像ファイルを送信します
- 参考画像ファイルは `GENERATE_IMAGE_IMPORT_DIR` 配下のファイル名のみを指定します
- 画像サイズ: `1536x1024`（横長・固定）
- 画質: `medium`（固定）
- 出力形式: `png`（固定）

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```dotenv
OPENAI_GPT_API_KEY="your_api_key"
OPENAI_GPT_GENERATE_IMAGE_MODEL="gpt-image-2"

# 参考画像ディレクトリ（ルートからの相対パス）
GENERATE_IMAGE_IMPORT_DIR="assets/images"
```

## Claudeへの指示

画像生成が依頼されたとき、このスキルを使用してください。

### 手順

1. **プロンプトの保存**: 生成したプロンプト本文を、そのまま `tmp/gpt_image_prompt.txt` に保存してください（Write ツールで書き込み。改行はそのまま改行として書き、`\n` への置換やクォート処理はしない）。

2. **画像生成コマンドの実行**: 以下をプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/openai/generate_image.ts "tmp/gpt_image_prompt.txt" "{添付するファイル名}"
```

   - プロンプトは引数で直接渡さず、`tmp/gpt_image_prompt.txt` 経由で受け渡します。スクリプトがファイルを読み込み、**書いた内容（実際の改行を含む）をそのまま**プロンプトとして使用します。
   - **第二引数**には `GENERATE_IMAGE_IMPORT_DIR` 配下にあるファイル名のみを指定してください。ディレクトリパスは付けません。複数のファイルを添付する場合は、カンマ `,` で区切ります。

   ```bash
   pnpm exec tsx src/openai/generate_image.ts "tmp/gpt_image_prompt.txt" "reference.png,style.webp"
   ```

3. コマンドの出力から `savedPaths` を取得してください。

4. `savedPaths` の各ファイルをReadツールで読み取り、生成された画像をユーザーに提示してください。

5. 生成結果（モデル名・参考画像数・保存パスなど）をユーザーに報告してください。

6. `referenceImagesCount` が 1 以上の場合は、参考画像を使った生成として説明してください。
