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
  "codex_review": "applied",
  "prompt_digest": "自室の窓辺で夜景を眺めながら、一日を労う碧衣。ルリが肩に。"
}
```

| キー | 内容 | 取りうる値（正規化された語彙） |
|---|---|---|
| `cloudinary_url` | 送信画像の Cloudinary URL（永続）。`send_line_image` のアップロード出力 `originalUrl` をそのまま入れる | URL 文字列 |
| `mode` | どのモード由来か | `night` / `off_mountain` |
| `shot_size` | 採用したショットサイズ（**偏り検知の主役**。再抽選があれば引き直し後の値） | `close_up` / `bust_shot` / `waist_up` / `knee_shot` / `full_body` / `wide_shot` |
| `camera_direction` | 採用したカメラ方向（**偏り検知の主役**。再抽選があれば引き直し後の値） | `front` / `three_quarter` / `profile` / `back` / `over_the_shoulder` |
| `shot_size_rerolled_from` | （**任意**・ショットサイズを再抽選した場合のみ）初回抽選から除外したショットサイズ。抽選順の配列 | `shot_size` と同じ語彙の配列（例：`["knee_shot"]`） |
| `shot_size_reroll_reason` | （**任意**・ショットサイズを再抽選した場合のみ）再抽選と判断した理由（1文） | 文字列 |
| `camera_direction_rerolled_from` | （**任意**・カメラ方向を再抽選した場合のみ）初回抽選から除外したカメラ方向 | `camera_direction` と同じ語彙（例：`"back"`） |
| `camera_direction_reroll_reason` | （**任意**・カメラ方向を再抽選した場合のみ）再抽選と判断した理由（1文） | 文字列 |
| `outfit` | 採用した衣装 | `outfit_a` / `outfit_b` / `outfit_c` / `outfit_d` / `outfit_e` |
| `scene_category` | 情景カテゴリ | `home`（自宅・自室） / `outing`（街・外出） / `hike`（山行・自然） / `other` |
| `time_of_day` | 時間帯 | `dawn`（暁） / `morning`（朝） / `day`（昼） / `evening`（夕） / `night`（夜） / `late_night`（深夜） |
| `companions` | ルリ／蛍の登場有無（配列。いなければ `[]`）。ガイドライン セクション6・7の `random_choice` の単一結果を配列へ正規化して記録する | `[]` / `["ruri"]` / `["hotaru"]` / `["ruri","hotaru"]` |
| `codex_review` | プロンプトの外部レビュー（[codexレビュー](codex_review.md)）の結果。値の対応は同ドキュメントのセクション6を正とする | `applied`（指摘を反映） / `not_applied`（指摘はあったが全て不採用） / `no_findings`（指摘なし） / `skipped`（レビューが行われなかった） |
| `prompt_digest` | プロンプトの要約（全文は重いので要点1〜2文のみ） | 文字列 |

### 値の正規化について
- `shot_size` / `camera_direction` は画像生成ガイドライン（[../../assets/image_guideline.md](../../assets/image_guideline.md) セクション8③）の語彙を `random_choice` で抽選します。ログには**上表の英語スネークケースの正規化値**で記録してください（例：「バストアップ（bust shot）」→ `bust_shot`、「斜め前（three-quarter view）」→ `three_quarter`）。柱C の偏り集計が値の表記揺れに影響されないようにするためです。
- `companions` は各抽選の単一結果を統合し、`ruri` → `["ruri"]`、`hotaru` → `["hotaru"]`、`none` → `[]` と正規化します。両方が登場する場合の canonical order は `["ruri","hotaru"]` です。`none` という文字列は配列へ保存しないでください。
- どの選択肢にも当てはめにくい場合のみ、最も近いものを選ぶか、`scene_category` は `other` を使ってください。

### 構図軸の再抽選が発生した場合
[画像生成ガイドライン](../../assets/image_guideline.md) セクション8③の **構図軸の再抽選ログ** に従い、許可された理由で初回の抽選結果から値を変えた場合は、該当する再抽選キーを追加します。対象は次の2パターンです。

1. **シーンとの噛み合わせ** — 抽選結果がシーンとどうしても合わないため、ショットサイズまたはカメラ方向（または両方）を選び直した場合
2. **抽選した2軸の成立チェック** — 2軸どうしが構図として成立しにくいため、ショットサイズのみ引き直した場合

柱C の偏り集計が実態と乖離しないようにするための記録です。

- `shot_size` / `camera_direction` には**実際にプロンプトへ入れた（引き直し後の）値**を入れます。
- ショットサイズを変えた場合は `shot_size_rerolled_from` / `shot_size_reroll_reason` を追加します。引き直しが複数回に及んだ場合は、除外した値を**抽選順**に並べて配列に入れます（例：`["knee_shot","close_up"]`）。
- カメラ方向を変えた場合は `camera_direction_rerolled_from` / `camera_direction_reroll_reason` を追加します（初回抽選から1値のみ）。
- 再抽選が無かった日は、上記4キー（`shot_size_rerolled_from` / `shot_size_reroll_reason` / `camera_direction_rerolled_from` / `camera_direction_reroll_reason`）は**すべて省略**してください（空配列・空文字列は入れません）。

```json
{
  "cloudinary_url": "https://res.cloudinary.com/.../xxxx.png",
  "mode": "night",
  "shot_size": "waist_up",
  "camera_direction": "over_the_shoulder",
  "shot_size_rerolled_from": ["knee_shot"],
  "shot_size_reroll_reason": "肩越しは背後へ寄る構図、膝上はカメラを引く構図で、両立させると肩越しの狙い（見ている対象を一緒に見せる）が失われるため",
  "outfit": "outfit_c",
  "scene_category": "outing",
  "time_of_day": "night",
  "companions": [],
  "codex_review": "no_findings",
  "prompt_digest": "大塚のクラフトビアバーで、卓上のジョッキに手を添える碧衣。"
}
```

## モード別の値

記録するのは**画像を生成したモードだけ**です（生成をスキップした場合はログも記録しません）。モードごとに固定・既定となる値は次のとおりです。

| キー | 小夜（`night`） | 帰灯（`off_mountain`） |
|---|---|---|
| `mode` | `night` | `off_mountain` |
| `date` | 本日（YYYY-MM-DD） | 本日（YYYY-MM-DD） |
| `cloudinary_url` | 報告送信に使った `send_line_image` の出力 `originalUrl` | 同左。家族グループ・ユーザーへ**同じ画像**を送るため、宛先ごとに分けず**ログは1件のみ**記録する |
| `outfit` | 採用した衣装（`outfit_a`〜`outfit_e`） | 登山シーンが基本のため通常は `outfit_b` |
| `scene_category` | 分析結果から判断（`home` / `outing` / `hike` / `other`） | 山行のため通常は `hike` |
| `companions` | ルリ・蛍の抽選結果を正規化した配列 | ルリの抽選結果のみ（山行シーンでは蛍は抽選対象外）。`["ruri"]` または `[]` |
| `shot_size` / `camera_direction` | 抽選した構図軸の正規化値（値を変えた場合は前節「構図軸の再抽選が発生した場合」に従う） | 同左 |
| `codex_review` | [画像生成ガイドライン](../../assets/image_guideline.md) セクション3の共通手順3（プロンプトのレビュー）の結果 | 同左 |
| `time_of_day` / `prompt_digest` | 各モードの分析とプロンプトから判断 | 同左 |

- `companions` は、抽選結果を選び直した場合は**実際にプロンプトへ入れた内容**を使い、`none` は保存しません。
- **LINE送信が失敗していても `originalUrl` が取得できていれば記録してください**。アップロードも失敗して URL が無い場合はスキップして構いません。

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
