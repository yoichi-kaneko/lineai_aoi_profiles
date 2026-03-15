---
name: download_mureka_song
description: Murekaのtask_idを使って生成済み楽曲をクエリし、choicesの1件目をtmp/ディレクトリにダウンロードしてパスを返す。
---

# download_mureka_song

Mureka APIでタスクをクエリし、楽曲ファイルをダウンロードするスタンドアロン CLI スクリプトです。

## 概要

- `generate_mureka_song` で取得した `task_id` を受け取ります
- `GET /v1/song/query/{task_id}` で生成状況をクエリします
- `choices` がある場合、1件目の楽曲を `tmp/` ディレクトリにダウンロードします
- 保存パスをJSON形式で返します
- `choices` がまだない場合（生成中）は状態を返して終了します

## 事前準備

```bash
cd {プロジェクトルートの絶対パス}
npm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
MUREKA_API_KEY="your_api_key"
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/download_song.ts "<task_id>"
```

例:

```bash
npx tsx scripts/download_song.ts "task_abc123"
```

## 出力

楽曲が利用可能な場合:

```json
{
  "task_id": "task_abc123",
  "status": "succeeded",
  "savedPath": "/absolute/path/to/tmp/mureka_song_task_abc123_1234567890.mp3",
  "audioUrl": "https://..."
}
```

まだ生成中の場合:

```json
{
  "task_id": "task_abc123",
  "status": "processing",
  "message": "choicesがまだありません。生成が完了していない可能性があります。",
  "raw": {...}
}
```

## Claudeへの指示

楽曲のダウンロードが依頼されたとき、またはgenerate_mureka_songでtask_idを取得した後にダウンロードが必要な場合、このスキルを使用してください。

### 手順

1. 以下のコマンドを実行してください。

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/download_song.ts "{task_id}"
```

2. `savedPath` が返された場合、ダウンロード完了です。パスをユーザーに伝えてください。

3. `message` に「choicesがまだありません」と返された場合、楽曲がまだ生成中です。しばらく待ってから再度実行してください（Murekaの生成には通常45秒程度かかります）。
