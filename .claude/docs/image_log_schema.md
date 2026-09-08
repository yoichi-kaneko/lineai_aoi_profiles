# 画像生成ログ（image_logs）スキーマ

碧衣が小夜モード／帰灯モード／響モードで画像を生成し、`originalUrl` を取得できた場合に、その1枚の情報を Firestore の **専用コレクション `image_logs`** に1ドキュメントずつ記録します。LINE 送信の成否は問いません（後段「モード別の値」参照）。**綴葉モードの SNS レポート画像は対象外**です（後段「綴葉モードの画像を対象外とする理由」参照）。これは「似た構図・情景が続いていないか」という**偏りを主観でなく集計で検知する客観的な土台**であり、1〜3週間サイクルのレビュー（`review_image_feedback`）でのみ読まれます。

> **なぜ専用コレクションか**: `notes` は `get_firestore_docs` が日付範囲だけで `type` 無差別に全件返すため、暁・望・小夜・帰灯・調べ・響の各モードが毎日読み込みます。image_logs を `notes` に混ぜると毎日の全モードのコンテキストへ無条件で流入し、トークンコスト増・ノイズ・誤取込の原因になります。読み手はレビュースキル1つだけなので、`image_logs` に隔離します。

## ドキュメント形状

`notes` と同じ `{ date, description, type, createdAt }` 形状を踏襲します（put/get の処理形状を流用するため）。構造化データは **`description` に JSON 文字列**で格納します（`notes` の `line_image` が `JSON.stringify({id})` を入れているのと同じ方式）。

| フィールド    | 型        | 内容                                                         |
|-------------|-----------|--------------------------------------------------------------|
| date        | Timestamp | 画像の対象日（小夜・帰灯は生成日、響は呼びかけの投稿日）。同じ日に複数枚ある場合の識別は `description` の `image_id` で行う |
| description | string    | 下記スキーマの JSON 文字列                                     |
| type        | string    | `"image_log"` 固定（コレクション内識別用。`notes` の NOTE_TYPE とは別系統） |
| createdAt   | Timestamp | 登録日時                                                      |

## `description` の JSON スキーマ

```json
{
  "cloudinary_url": "https://res.cloudinary.com/.../xxxx.png",
  "image_id": "night-2210",
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
| `image_id` | この1枚の識別子。同じ日に複数枚を届けた日に、ユーザーが評価で名指しできるようにするための値（下記「画像の識別子」参照） | `{モード名}-{HHMM}` 形式の文字列（例：`night-2210` / `talk-2135`） |
| `mode` | どのモード由来か | `night` / `off_mountain` / `talk` |
| `shot_size` | 採用したショットサイズ（**偏り検知の主役**。再抽選があれば引き直し後の値） | `close_up` / `bust_shot` / `waist_up` / `knee_shot` / `full_body` / `wide_shot` |
| `camera_direction` | 採用したカメラ方向（**偏り検知の主役**。再抽選があれば引き直し後の値） | `front` / `three_quarter` / `profile` / `back` / `over_the_shoulder` |
| `shot_size_rerolled_from` | （**任意**・ショットサイズを再抽選した場合のみ）初回抽選から除外したショットサイズ。抽選順の配列 | `shot_size` と同じ語彙の配列（例：`["knee_shot"]`） |
| `shot_size_reroll_reason` | （**任意**・ショットサイズを再抽選した場合のみ）再抽選と判断した理由（1文） | 文字列 |
| `camera_direction_rerolled_from` | （**任意**・カメラ方向を再抽選した場合のみ）初回抽選から除外したカメラ方向 | `camera_direction` と同じ語彙（例：`"back"`） |
| `camera_direction_reroll_reason` | （**任意**・カメラ方向を再抽選した場合のみ）再抽選と判断した理由（1文） | 文字列 |
| `outfit` | 採用した衣装 | `outfit_a` / `outfit_b` / `outfit_c` / `outfit_d` / `outfit_e` |
| `scene_category` | 情景カテゴリ | `home`（自宅・自室） / `outing`（街・外出） / `hike`（山行・自然） / `other` |
| `time_of_day` | 時間帯 | `dawn`（暁） / `morning`（朝） / `day`（昼） / `evening`（夕） / `night`（夜） / `late_night`（深夜） |
| `companions` | ルリ／デジタル上の友人（蛍・漆）の登場有無（配列。いなければ `[]`）。ガイドライン セクション6・7の `random_choice` 2本の結果を配列へ正規化して記録する | `[]` / `["ruri"]` / `["hotaru"]` / `["urushi"]` / `["ruri","hotaru"]` / `["ruri","urushi"]` |
| `codex_review` | プロンプトの外部レビュー（[codexレビュー](codex_review.md)）の結果。値の対応は同ドキュメントのセクション6を正とする | `applied`（指摘を反映） / `not_applied`（指摘はあったが全て不採用） / `no_findings`（指摘なし） / `skipped`（レビューが行われなかった） |
| `user_specified` | （**任意**）ユーザーが依頼で明示的に指定した可変要素（響モードのみ。指定が無ければ省略） | 上表の語彙またはキーワードの配列（例：`["companions","scene_category"]`） |
| `prompt_digest` | プロンプトの要約（全文は重いので要点1〜2文のみ） | 文字列 |

### 画像の識別子（`image_id`）

同じ日に複数枚の画像を届けることがあるため（響モードの個別生成と、その日の小夜モードの一枚など）、日付だけでは評価の対象を一意に決められません。`image_id` は、ユーザーが `評価 #<画像ID> <1-5> <コメント>` の形でその1枚を名指しできるようにするための識別子です。

- **形式は `{モード名}-{HHMM}`** とします。`{モード名}` は `mode` と同じ値（`night` / `off_mountain` / `talk`）、`{HHMM}` は**送信時点の JST の時刻**を4桁で表したものです（例：21時35分 → `2135`）。
- 使える文字は英数字・ハイフン・アンダースコアのみ、64文字以内です（この範囲を超えるとパーサーが識別子として解釈しません。[image_feedback スキーマ](image_feedback_schema.md) 参照）。
- **同じ値を本文にも添えてください**。ユーザーが手元で参照できなければ名指しの評価はできません。添え方は各モードの手順（響モードは [talk.md](../../modes/talk.md) ステップ5、小夜モードは [night.md](../../modes/night.md) ステップ3）に従います。

#### 一意性の範囲：日付との組で特定する

`image_id` は日付を含まないため、**それ単体では一意ではありません**。別日の同じモード・同じ時刻は同じ値になります（例：`night-2210` は毎日の小夜が同じ時刻に送れば繰り返し現れます）。

- **同じ日の中では**、分単位まで含めるため衝突は実運用上ほぼ起きません（例外は同じ分に複数枚を届けた響モードです）。
- **対象期間をまたぐと同じ値が再出現します**。したがって評価との突き合わせは、**`(対象日, image_id)` の組**で行います。ID単体で照合すると別日の画像へ誤帰属します。照合手順は [review_image_feedback](../skills/review_image_feedback/SKILL.md) のステップ2を正とします。
- 候補が0件・複数件になった場合、レビューは特定の1枚へ恣意的に紐付けず、「対象が曖昧な評価」として扱います。

#### モード名のみの略記を受け付ける

ユーザーは `{HHMM}` を書き写さず、**モード名だけ**（`評価 #night 4 ...` / `評価 #talk 4 ...` / `評価 #off_mountain 4 ...`）で名指しできます。同じ日にモードが重複しない限り、モード名だけでその日の一枚が特定できるためです。

- 略記は**入力側の便宜であり、`image_logs` に記録する `image_id` は常に完全形（`{モード名}-{HHMM}`）**です。略記を記録しないでください。
- 略記の解決はレビュー側で行います。同じ日に複数の `talk` 画像がある日に `#talk` と書かれた場合は候補が複数件となり、曖昧扱いになります。これは略記を受け入れる代わりの割り切りです（その日を名指しするには完全形を使います）。
- **本文へ添えるのは完全形のままにしてください**。略記の案内をメッセージ本文へ書き足す必要はありません（碧衣の語りの分量を増やさないため）。

### 綴葉モードの画像を対象外とする理由

綴葉（scribe）モードが SNS へ代筆投稿する際に添えるレポート風レイアウト画像は、**`image_logs` に記録しません**。画像生成フィードバック・サイクル（柱A〜C）の対象外です。

- **生成のルールが別系統である**: 綴葉の画像は [scribe_image_guideline.md](../../assets/scribe_image_guideline.md) を正とし、構図は `report_template.png` のレイアウトに固定され、**抽選を行いません**。本スキーマの主役である `shot_size` / `camera_direction` / `companions` / `scene_category` は、固定値か無意味な値になります。混ぜると偏り集計（`review_image_feedback` ステップ3）が実態と乖離します。
- **改善の宛先が別である**: レビューの修正対象は `assets/image_guideline.md` ですが、綴葉の画像はそのガイドラインの管轄外です（同ガイドラインの枠組みを流用しないことが scribe_image_guideline.md セクション2で明示されています）。評価方式も、肖像の構図の多様性ではなく「差し込みテキストの正確さ・レイアウトの再現性」を見るものになり、別の尺度が必要です。
- **現時点の改善経路**: レイアウトやチップ資料への要望は、`aoi.md` の**共通ステップ：要望のフィードバック**（Todoist）で受けます（scribe_image_guideline.md セクション4）。`評価` による数値評価の経路は設けていません。
- **誤帰属の防止**: 綴葉実行日はユーザーへ画像が2枚届く一方、ログには小夜の1件しか残りません。そのままでは宛先未指定の `評価` がすべて小夜の一枚へ紐付いてしまうため、レビュー側で綴葉実行日（`scribe_handover` の有無）を確認し、宛先未指定の評価を曖昧扱いにします（[review_image_feedback](../skills/review_image_feedback/SKILL.md) ステップ2）。小夜の一枚を評価したい日は、識別子（`#night` の略記で足ります）を添えてもらう形になります。

### ユーザーが指定した可変要素（`user_specified`）

響モードでは、ユーザーが依頼の中で構図・登場人物・情景などを指定することがあります（「ルリと一緒に」「山で」など）。指定に従って生成した結果を、定期生成の惰性による偏りと取り違えないよう、**指定された可変要素のキー名を配列で記録**してください。

- 記録するのは**どの軸が指定されたか**であり、指定の文言ではありません。上表のキー名（`shot_size` / `camera_direction` / `outfit` / `scene_category` / `time_of_day` / `companions`）から該当するものを選びます。
- 指定が無かった場合、および小夜・帰灯モードでは、このキーを**省略**してください（空配列は入れません）。
- 集計での扱いは [review_image_feedback](../skills/review_image_feedback/SKILL.md) のステップ3を正とします。

### 値の正規化について
- `shot_size` / `camera_direction` は画像生成ガイドライン（[../../assets/image_guideline.md](../../assets/image_guideline.md) セクション8③）の語彙を `random_choice` で抽選します。ログには**上表の英語スネークケースの正規化値**で記録してください（例：「バストアップ（bust shot）」→ `bust_shot`、「斜め前（three-quarter view）」→ `three_quarter`）。柱C の偏り集計が値の表記揺れに影響されないようにするためです。
- `companions` は2本の抽選（ルリ／友人）の結果を統合し、`ruri` → `["ruri"]`、`hotaru` → `["hotaru"]`、`urushi` → `["urushi"]`、`none` → `[]` と正規化します。canonical order は `ruri` → `hotaru` → `urushi` の順で、ルリと友人がともに登場する場合は `["ruri","hotaru"]` / `["ruri","urushi"]` となります。友人の抽選は蛍・漆・不在の三択を1回引く形のため、`["hotaru","urushi"]` は生じません。`none` という文字列は配列へ保存しないでください。
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

| キー | 小夜（`night`） | 帰灯（`off_mountain`） | 響（`talk`） |
|---|---|---|---|
| `mode` | `night` | `off_mountain` | `talk` |
| `date` | 本日（YYYY-MM-DD） | 本日（YYYY-MM-DD） | 呼びかけの投稿日（YYYY-MM-DD） |
| `image_id` | `night-{HHMM}` | `off_mountain-{HHMM}` | `talk-{HHMM}` |
| `cloudinary_url` | 報告送信に使った `send_line_image` の出力 `originalUrl` | 同左。家族グループ・ユーザーへ**同じ画像**を送るため、宛先ごとに分けず**ログは1件のみ**記録する | 返信送信に使った `send_line_image` の出力 `originalUrl` |
| `outfit` | 採用した衣装（`outfit_a`〜`outfit_e`） | 登山シーンが基本のため通常は `outfit_b` | 依頼の指定があればそれに従い、無ければ情景に合わせて選ぶ |
| `scene_category` | 分析結果から判断（`home` / `outing` / `hike` / `other`） | 山行のため通常は `hike` | 依頼が求める情景から判断 |
| `companions` | ルリ・友人（蛍・漆）の抽選結果を正規化した配列 | ルリの抽選結果のみ（山行シーンでは友人は抽選対象外）。`["ruri"]` または `[]` | 依頼に指定があればその内容、無ければ抽選結果を正規化した配列 |
| `shot_size` / `camera_direction` | 抽選した構図軸の正規化値（値を変えた場合は前節「構図軸の再抽選が発生した場合」に従う） | 同左 | 同左（依頼に指定があればその値） |
| `user_specified` | 省略 | 省略 | 依頼で指定された可変要素のキー名の配列（指定が無ければ省略） |
| `codex_review` | [画像生成ガイドライン](../../assets/image_guideline.md) セクション3の共通手順3（プロンプトのレビュー）の結果 | 同左 | 同左 |
| `time_of_day` / `prompt_digest` | 各モードの分析とプロンプトから判断 | 同左 | 依頼が求める情景から判断 |

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
- `{date}` は小夜・帰灯では本日、響では呼びかけの投稿日です。
- `--description-file` 指定時、`description` はファイルから読み込まれ、位置引数は `[date, type]` の順に解釈されます。

成功したら、追加したドキュメントの ID を報告してください。
