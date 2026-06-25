# 画像生成ログ（image_logs）スキーマ

碧衣が小夜モード／帰灯モードで画像を生成・送信した直後に、その1枚の情報を Firestore の **専用コレクション `image_logs`** に1ドキュメントずつ記録します。これは「似た構図・情景が続いていないか」という**偏りを主観でなく集計で検知する客観的な土台**であり、1〜3週間サイクルのレビュー（`review_image_feedback`）でのみ読まれます。

> **なぜ専用コレクションか**: `notes` は `get_firestore_docs` が日付範囲だけで `type` 無差別に全件返すため、暁・望・小夜・帰灯・調べの各モードが毎日読み込みます。image_logs を `notes` に混ぜると毎日の全モードのコンテキストへ無条件で流入し、トークンコスト増・ノイズ・誤取込の原因になります。読み手はレビュースキル1つだけなので、`image_logs` に隔離します。

## ドキュメント形状

`notes` と同じ `{ date, description, type, createdAt }` 形状を踏襲します（put/get の処理形状を流用するため）。構造化データは **`description` に JSON 文字列**で格納します（`notes` の `line_image` が `JSON.stringify({id})` を入れているのと同じ方式）。

| フィールド    | 型        | 内容                                                         |
|-------------|-----------|--------------------------------------------------------------|
| date        | Timestamp | 画像の対象日（＝生成日。1日1枚運用のため画像との紐付け鍵）       |
| description | string    | 下記スキーマの JSON 文字列                                     |
| type        | string    | `"image_log"` 固定（コレクション内識別用。`notes` の NOTE_TYPE とは別系統） |
| createdAt   | Timestamp | 登録日時                                                      |

## `description` の JSON スキーマ

```json
{
  "cloudinary_url": "https://res.cloudinary.com/.../xxxx.png",
  "mode": "night",
  "shot_size": "bust_shot",
  "camera_direction": "front",
  "outfit": "outfit_d",
  "scene_category": "home",
  "time_of_day": "night",
  "companions": ["ruri"],
  "prompt_digest": "自室の窓辺で夜景を眺めながら、一日を労う碧衣。ルリが肩に。"
}
```

| キー | 内容 | 取りうる値（正規化された語彙） |
|---|---|---|
| `cloudinary_url` | 送信画像の Cloudinary URL（永続）。`send_line_image` のアップロード出力 `originalUrl` をそのまま入れる | URL 文字列 |
| `mode` | どのモード由来か | `night` / `off_mountain` |
| `shot_size` | 抽選したショットサイズ（**偏り検知の主役**） | `close_up` / `bust_shot` / `waist_up` / `knee_shot` / `full_body` / `wide_shot` |
| `camera_direction` | 抽選したカメラ方向（**偏り検知の主役**） | `front` / `three_quarter` / `profile` / `back` / `over_the_shoulder` |
| `outfit` | 採用した衣装 | `outfit_a` / `outfit_b` / `outfit_c` / `outfit_d` |
| `scene_category` | 情景カテゴリ | `home`（自宅・自室） / `outing`（街・外出） / `hike`（山行・自然） / `other` |
| `time_of_day` | 時間帯 | `dawn`（暁） / `morning`（朝） / `day`（昼） / `evening`（夕） / `night`（夜） / `late_night`（深夜） |
| `companions` | ルリ／蛍の登場有無（配列。いなければ `[]`） | `[]` / `["ruri"]` / `["hotaru"]` / `["ruri","hotaru"]` |
| `prompt_digest` | プロンプトの要約（全文は重いので要点1〜2文のみ） | 文字列 |

### 値の正規化について
- `shot_size` / `camera_direction` は画像生成ガイドライン（[../../assets/image_guideline.md](../../assets/image_guideline.md) セクション8③）の語彙を `random_choice` で抽選します。ログには**上表の英語スネークケースの正規化値**で記録してください（例：「バストアップ（bust shot）」→ `bust_shot`、「斜め前（three-quarter view）」→ `three_quarter`）。柱C の偏り集計が値の表記揺れに影響されないようにするためです。
- どの選択肢にも当てはめにくい場合のみ、最も近いものを選ぶか、`scene_category` は `other` を使ってください。

## 記録コマンド

JSON はシェルのクォートで壊れやすいため、**`tmp/image_log.json` に Write ツールで書き出してから** `--description-file` で渡します（`tmp/line_message.txt` と同じ方式）。

1. 上記スキーマに沿った JSON（1行でよい）を `tmp/image_log.json` に書き出す。
2. 次のコマンドを実行する（`{date}` は画像の対象日 = 本日 YYYY-MM-DD）。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/put_doc.ts "{date}" "image_log" --collection image_logs --description-file tmp/image_log.json
```

- 第2位置引数の `"image_log"` が `type`（コレクション内識別用）。`--collection image_logs` のとき NOTE_TYPE 検証はバイパスされます。
- `--description-file` 指定時、`description` はファイルから読み込まれ、位置引数は `[date, type]` の順に解釈されます。

成功したら、追加したドキュメントの ID を報告してください。
