---
name: generate_mureka_song
description: Mureka APIを使って楽曲を生成する。歌詞とプロンプトを渡すと非同期で作曲を開始し、task_idを返す。ダウンロードはdownload_mureka_songスキルで行う。
---

# generate_mureka_song

Mureka APIを使って楽曲を生成するスタンドアロン CLI スクリプトです。

## 概要

- 歌詞（lyrics）とスタイルプロンプト（prompt）を受け取り、Mureka の曲生成APIで作曲を開始します
- 生成はバックグラウンドで行われるため、task_idを返して終了します
- 実際の楽曲ダウンロードは `download_mureka_song` スキルで行います
- n は 1 固定です
- モデルは環境変数 `MUREKA_MODEL` を使用します
- `MUREKA_VOCAL_ID` が設定されている場合、そのボーカルIDを使用します

## 事前準備

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
MUREKA_API_KEY="your_api_key"
MUREKA_MODEL="auto"

# 任意: ボーカルID
MUREKA_VOCAL_ID="vocal_id"
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/generate_song.ts "{歌詞}" "{プロンプト}"
```

例:

```bash
npx tsx scripts/generate_song.ts "[Verse]\nここに歌詞が入ります\n[Chorus]\nサビの歌詞" "明るいポップス調、女性ボーカル"
```

## 出力

成功時はJSON形式で以下を出力します。

```json
{
  "task_id": "生成タスクのID",
  "model": "使用したモデル名"
}
```

## Claudeへの指示

楽曲の生成が依頼されたとき、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/generate_song.ts "{歌詞}" "{プロンプト}"
```

   **注意:** 歌詞やプロンプトが複数行に渡る場合、改行を `\n` に置き換えて1行の文字列として渡してください。

   例:

   ```bash
   npx tsx scripts/generate_song.ts "[Verse]\n歌詞1行目\n歌詞2行目\n[Chorus]\nサビ" "明るいポップス調"
   ```

2. コマンドの出力から `task_id` を取得してください。

3. `task_id` をユーザーに伝え、楽曲のダウンロードには `download_mureka_song` スキルを使用するよう案内してください。
