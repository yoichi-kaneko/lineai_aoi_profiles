---
name: generate_mureka_song
description: Mureka APIを使って楽曲を生成する。歌詞とプロンプトを渡すと非同期で作曲を開始し、task_idを返す。ダウンロードはdownload_mureka_songスキルで行う。
---

# generate_mureka_song

Mureka APIを使って楽曲を生成するスタンドアロン CLI スクリプトです。

## 概要

- 歌詞（lyrics）とスタイルプロンプト（prompt）を受け取り、Mureka の曲生成APIで作曲を開始します
- 生成はバックグラウンドで行われるため、task_idを返して終了します
- 実際の楽曲ダウンロードは `download_mureka_audio` スキルで行います
- n は 1 固定です
- モデルは環境変数 `MUREKA_MODEL` を使用します
- `MUREKA_VOCAL_ID` が設定されている場合、そのボーカルIDを使用します
- 連携先APIの文字数制限として、`lyrics` は3000文字以内・`prompt` は1024文字以内です

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
MUREKA_MODEL="auto"

# 任意: ボーカルID
MUREKA_VOCAL_ID="vocal_id"
```

## 歌詞・プロンプトの受け渡し方法（ファイル経由）

歌詞とプロンプトは**コマンド引数で直接渡さず**、一時ファイルに保存し、そのパスを引数で渡します。

| 内容 | ファイル |
| --- | --- |
| 歌詞（lyrics） | `tmp/mureka_song_lyrics.txt` |
| スタイルプロンプト（prompt） | `tmp/mureka_song_prompt.txt` |

スクリプトは各ファイルを読み込んで API に渡します。これにより、改行を含む歌詞やプロンプトでもシェルのエスケープ事故が起きません。

> **改行の扱い**: ファイルに書いた内容（実際の改行を含む）が**そのまま**使われます。`\n` への置換やクォート処理は不要です。

## 実行方法

1. 歌詞を `tmp/mureka_song_lyrics.txt` に保存する（Write ツールで本文をそのまま書き込む。改行はそのまま改行として書いてよい）。
2. プロンプトを `tmp/mureka_song_prompt.txt` に保存する（同上）。
3. 両方のファイルパスを引数に渡してスクリプトを実行する。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/mureka/generate_song.ts "tmp/mureka_song_lyrics.txt" "tmp/mureka_song_prompt.txt"
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

1. 歌詞を、そのまま `tmp/mureka_song_lyrics.txt` に保存してください（改行はそのまま改行として書き込み、`\n` への置換はしない）。

2. プロンプトを、そのまま `tmp/mureka_song_prompt.txt` に保存してください（同上）。連携先API制限のため、`prompt` は1024文字以内、`lyrics` は3000文字以内に収めてください。

3. 以下のコマンドを実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/mureka/generate_song.ts "tmp/mureka_song_lyrics.txt" "tmp/mureka_song_prompt.txt"
```

4. コマンドの出力から `task_id` を取得してください。

5. `task_id` をユーザーに伝え、楽曲のダウンロードには `download_mureka_audio` スキルを使用するよう案内してください。
