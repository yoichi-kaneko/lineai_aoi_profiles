---
name: generate_mureka_lyrics
description: Mureka APIを使って歌詞を生成する。プロンプトを渡すとMurekaフォーマットに適した歌詞を生成して返す。
---

# generate_mureka_lyrics

Mureka APIを使って歌詞を生成するスタンドアロン CLI スクリプトです。

## 概要

- プロンプトを受け取り、Mureka の歌詞生成APIで歌詞を生成します
- 生成された歌詞はJSON形式で出力されます

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
MUREKA_API_KEY="your_api_key"
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/mureka/generate_lyrics.ts "{プロンプト}"
```

例:

```bash
pnpm exec tsx src/mureka/generate_lyrics.ts "夏の海と青空をテーマにした明るいポップソング"
```

## 出力

成功時はJSON形式で以下を出力します。

```json
{
  "prompt": "入力したプロンプト",
  "lyrics": "生成された歌詞テキスト"
}
```

## Claudeへの指示

歌詞の生成が依頼されたとき、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/mureka/generate_lyrics.ts "{プロンプト}"
```

   **注意:** プロンプトが複数行に渡る場合、改行を `\n` に置き換えて1行の文字列として渡してください。

   例:

   ```bash
   pnpm exec tsx src/mureka/generate_lyrics.ts "夏の海をテーマに。\n明るく元気なポップス調で。"
   ```

2. コマンドの出力から `lyrics` を取得してください。

3. 生成された歌詞をユーザーに提示してください。
