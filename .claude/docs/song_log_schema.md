# 楽曲生成ログ（song_logs）スキーマ

碧衣が調べモードのフェーズAで歌詞・楽曲プロンプトを作り、Mureka の楽曲生成を開始した直後に、その1曲の情報を Firestore の **専用コレクション `song_logs`** に1ドキュメントずつ記録します。これは歌詞・曲調・題材の傾向をあとから検証し、直近の曲との重複を避けるための客観的な土台です。

> **なぜ専用コレクションか**: `notes` は `get_firestore_docs` が日付範囲だけで `type` 無差別に全件返すため、暁・望・小夜・帰灯・調べの各モードが読み込みます。song_logs を `notes` に混ぜると日々の各モードのコンテキストへ無条件で流入し、トークンコスト増・ノイズ・誤取込の原因になります。読み手は調べモードの重複回避と将来の楽曲レビューだけなので、`song_logs` に隔離します。

## ドキュメント形状

`notes` / `image_logs` と同じ `{ date, description, type, createdAt }` 形状を踏襲します（put/get の処理形状を流用するため）。構造化データは **`description` に JSON 文字列**で格納します。

| フィールド    | 型        | 内容                                                         |
|-------------|-----------|--------------------------------------------------------------|
| date        | Timestamp | 楽曲の対象日（＝調べモードの実行日）                           |
| description | string    | 下記スキーマの JSON 文字列                                     |
| type        | string    | `"song_log"` 固定（コレクション内識別用。`notes` の NOTE_TYPE とは別系統） |
| createdAt   | Timestamp | 登録日時                                                      |

## `description` の JSON スキーマ

```json
{
  "title": "薄明の航跡",
  "package": "ambient_folk",
  "genres": ["Celtic Folk", "Ambient Pop"],
  "tags": ["Ethereal", "Meditative", "Calm", "Introspective", "Minimalist"],
  "theme_digest": "雨の記憶と待つ時間から、雲の切れ間を信じる夜の情景へ転写した。",
  "lyrics": "[Verse 1]\n...",
  "task_id": "mureka-task-id"
}
```

| キー | 内容 | 取りうる値・形式 |
|---|---|---|
| `title` | `generate_mureka_lyrics` が返した曲タイトル。手直しした場合は最終タイトル | 文字列 |
| `package` | 採用したスタイルパッケージ（正規化値） | 下記「スタイルパッケージ正規化値」 |
| `genres` | `tmp/mureka_song_prompt.txt` の `genres:` に入れたジャンル | 文字列配列 |
| `tags` | `tmp/mureka_song_prompt.txt` の `tags:` に入れたタグ | 文字列配列 |
| `theme_digest` | インスピレーション源を、元の出来事が特定されない粒度で要約した1〜2文 | 文字列 |
| `lyrics` | Mureka に渡した最終歌詞全文 | 文字列 |
| `task_id` | `generate_mureka_song` が返した Mureka の task_id | 文字列 |

### スタイルパッケージ正規化値

`package` は [../../assets/songs_guideline.md](../../assets/songs_guideline.md) セクション4の A〜G を、以下の英語スネークケースで記録してください。直近ログ参照時に表記揺れなく除外候補を判定するためです。

| ガイド上の表記 | `package` |
|---|---|
| パッケージA：叙事詩（Symphonic / Epic） | `symphonic_epic` |
| パッケージB：静謐（Ambient / Folk） | `ambient_folk` |
| パッケージC：躍動（J-Pop / Electronic） | `jpop_electronic` |
| パッケージD：郷愁（Lo-fi / Chillhop） | `lofi_chillhop` |
| パッケージE：幻想（Celtic / Fantasy Folk） | `celtic_fantasy_folk` |
| パッケージF：和風（Shakuhachi / Koto フュージョン） | `japanese_fusion` |
| パッケージG：残響（Shoegaze / Dream Pop） | `shoegaze_dream_pop` |

## 記録コマンド

JSON はシェルのクォートで壊れやすいため、**`tmp/song_log.json` に Write ツールで書き出してから** `--description-file` で渡します（`tmp/line_message.txt` と同じ方式）。

1. 上記スキーマに沿った JSON を `tmp/song_log.json` に書き出す。
2. 次のコマンドを実行する（`{date}` は調べモードの対象日 = 本日 YYYY-MM-DD）。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/put_doc.ts "{date}" "song_log" --collection song_logs --description-file tmp/song_log.json
```

- 第2位置引数の `"song_log"` が `type`（コレクション内識別用）。`--collection song_logs` のとき NOTE_TYPE 検証はバイパスされます。
- `--description-file` 指定時、`description` はファイルから読み込まれ、位置引数は `[date, type]` の順に解釈されます。

成功したら、追加したドキュメントの ID を報告し、Bash で `: > tmp/song_log.ok` を実行して**成功マーカー `tmp/song_log.ok`** を作成してください。このマーカーは `send_daily_line.sh` がフェーズAの完了を検証するために必須です（`song_logs` 記録失敗時に待機・ダウンロードへ進まないため）。**記録が成功した場合に限り作成**してください。
