---
name: review_image_feedback
description: 2〜3週間サイクルで画像生成ログ（image_logs）とフィードバック（image_feedback）を集計し、構図の偏りと評価を分析して assets/image_guideline.md の修正案を提示する（人手承認で反映）。ユーザーが手動起動するバッチレビュー（柱C）。
---

# review_image_feedback

碧衣の画像生成について、一定期間に溜まった**画像生成ログ（`image_logs`）**と**ユーザーフィードバック（`image_feedback`）**をまとめてレビューし、`assets/image_guideline.md` の改善につなげるスキルです。issue #43 の柱Cにあたります。

## 前提・思想

- **手動起動・2〜3週間サイクル**: 自動実行はしません。ユーザーが「画像レビューして」等と手動で起動したときだけ動きます。
- **読み手はこのスキルだけ**: `image_logs` / `image_feedback` は日々の各モード（暁・望・小夜・帰灯・調べ）のコンテキストに流入しないよう専用コレクションに隔離されています。集計の土台と FB はこのスキルでのみ読み解きます。
- **客観的な土台**: 「似た構図・情景が続いていないか」を主観でなく**集計**で判定します（柱A の [image_logs スキーマ](../../docs/image_log_schema.md) が土台）。
- **human-in-the-loop**: ガイドラインの書き換えは必ず**修正差分案を提示し、ユーザーが承認してから**反映します。勝手に `assets/image_guideline.md` を編集しないでください。
- **「核 / 彩り」2層モデル**: 仕分けと修正方針は `assets/image_guideline.md` セクション1（核＝不変層／彩り＝可変層）に従います。核は安易に動かさず、彩りは積極的に揺らす――この非対称が要です。

## 使うもの

- 取得: **get_firestore_docs** スキル（`--collection` で専用コレクションを指定）
- マーカー記録: **put_firestore_doc** スキル（`--collection image_feedback_reviews`）
- 参照: [image_logs スキーマ](../../docs/image_log_schema.md) / [image_feedback スキーマ](../../docs/image_feedback_schema.md) / [画像生成ガイドライン](../../../assets/image_guideline.md)

---

## 手順

### ステップ0：レビュー対象期間の決定

1. **前回マーカーの参照**: `image_feedback_reviews` コレクションから直近のレビューマーカーを探します。広めの窓（例：今日から遡って180日）で取得し、`date` が最新のドキュメントを選びます。

   ```bash
   cd {プロジェクトルートの絶対パス}
   pnpm exec tsx src/firebase/get_docs.ts "{180日前}" "{今日}" --collection image_feedback_reviews
   ```

2. **対象期間（dateFrom 〜 dateTo）を決める**:
   - **dateTo** = 今日（JST）。
   - **dateFrom** = 直近マーカーの `description.period_to` の翌日。
   - マーカーが1件も無い（初回レビュー）場合は、`image_logs` の最も古いドキュメントの日付を dateFrom にするか、ユーザーに開始日を尋ねてください。

3. 決めた期間をユーザーに一言示してから次へ進みます（例：「2026-06-01〜2026-06-21 を対象にレビューします」）。

### ステップ1：image_logs と image_feedback の取得

対象期間で両コレクションを取得します。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "{dateFrom}" "{dateTo}" --collection image_logs
pnpm exec tsx src/firebase/get_docs.ts "{dateFrom}" "{dateTo}" --collection image_feedback
```

- 各ドキュメントの `description` は JSON 文字列です。パースして構造化データとして扱ってください（スキーマは上記スキーマ docを参照）。
- どちらかが空でも処理は続行します（ログだけ／FBだけのレビューも成立します）。両方空なら、その旨を伝えて終了します（マーカーは更新しない）。
- 取得件数（image_logs の N、image_feedback の件数）を控えておきます。

### ステップ2：個別評価の集約（image_feedback / kind=rating）

`kind` が `rating` のフィードバックを集約します。

- **スコア分布**: 1〜5 の各点の件数と平均（`score` が null のものは「スコアなし」として別カウント）。
- **称賛点 / 懸念点の抽出**: `comment` を読み、**繰り返し現れるポジティブ要素**（例：「ルリが可愛い」「夜の情景がよい」）と**繰り返し現れる懸念**（例：「背景が寂しい」「顔が前と違う」）を、件数とともに箇条書きで列挙します。1回だけの指摘も拾いますが、複数回現れたものを優先度高として扱います。
- `target_date` があるコメントは、対応する `image_logs`（同じ日付）と突き合わせ、「どの構図・情景への評価か」を可能な範囲で紐付けます。

### ステップ3：構図ログの偏り集計（image_logs）― 機械集計

`image_logs` の各ドキュメントを、以下のフィールドごとに**値の出現回数を数えて分布表**を作ります。表記揺れはスキーマの正規化値（英語スネークケース）で揃っている前提です。

集計対象フィールド: `shot_size` / `camera_direction` / `outfit` / `scene_category` / `time_of_day` / `companions`（companions は配列。`ruri` 単独・`hotaru` 単独・両方・なし の4区分で数える）。

各フィールドについて、値・件数・割合（件数 / N）を表で示します。そのうえで**偏りフラグ**を立てます（既定ルール。N が小さいときは弱いシグナルとして注記）:

- **過剰**: 単一の値が **40% 以上**、または上位2値の合計が **70% 以上**。
- **欠落（random_choice 軸のみ）**: `shot_size` / `camera_direction` で、語彙表（ガイドライン セクション8③）にあるのに**1サイクルを通して1度も選ばれていない値**。
- **主役は `shot_size` と `camera_direction`**（`random_choice` で抽選＝彩りが本当に多様かを測る軸）。`outfit` / `scene_category` / `time_of_day` の偏りは生活実態を反映するため、偏っていても直ちに問題ではありません（情報として提示）。
- N（image_logs 件数）が **7 未満**のときは、サンプルが小さい旨を明記し、偏り判定は参考扱いにします。

「似た構図が続いている」というFB（傾向／個別）があれば、この分布表が**客観的な裏付け**になります。両者を突き合わせて言及してください。

### ステップ4：「核 / 彩り」仕分け

ステップ2の評価・ステップ3の偏りを、`assets/image_guideline.md` セクション1の二層へ仕分けます。

- **核への指摘**（キャラクター同一性・品質の床・ラベル文字混入など。例：「顔が前回と違う」「線が荒い」「ラベルが写り込んだ」）→ 核を**締める**方向。
- **彩りへの指摘**（構図・情景・衣装・時間帯の偏りや、もっと自由に等。例：「バストアップ正面が続く」「もっと大胆な構図を」）→ 彩りを**広げる／配分し直す**方向。
- **衝突判定**（ガイドライン 1-3）: 2つのFBが本当に矛盾するのは**同じ層の同じ属性**を指すときだけ。「顔が違う（核）」と「同じ構図（彩り）」は別層なので両立し、両方対応します。矛盾が生じるのは「正面を基本に」対「正面が多すぎる」のように同じ彩りの同じ属性に相反要望が当たったときだけ。その場合のみ、どちらを採るか／配分をどう取るかの判断ポイントとして明示します。

### ステップ5：ガイドライン修正差分案の提示（承認 → 反映）

仕分け結果をもとに、`assets/image_guideline.md` への**具体的な修正差分案**を作り、ユーザーに提示します。

- どのセクション（核 or 彩りのどの項目）を、**どう変える**かを before/after で示します。例：
  - 彩りの是正：偏った値の重みを下げる／語彙を追加する旨をセクション8③に追記。
  - 核の引き締め：混入したラベル文字対策の文言を末尾注意文（セクション8⑤）に補強。
- 各案には**根拠**（ステップ2の評価件数・ステップ3の分布数値）を添えます。
- **ユーザーが承認した項目だけ** `assets/image_guideline.md` を Edit で反映します。未承認・保留の項目は反映しません。何も承認されなければガイドラインは変更しません。

### ステップ6：レビュー区切りマーカーの記録

次サイクルの起点を残すため、`image_feedback_reviews` コレクションにマーカーを1件記録します。

1. マーカー本文（JSON）を `tmp/firestore_doc.txt` に Write で書き出す（put_firestore_doc の作法）。スキーマ:

   ```json
   {
     "period_from": "2026-06-01",
     "period_to": "2026-06-21",
     "reviewed_at": "2026-06-21T21:30:00+09:00",
     "image_log_count": 18,
     "feedback_count": 5,
     "guideline_updated": true,
     "summary": "正面バストアップ過多を是正。背景の寂しさ指摘を彩りで対応。核は変更なし。"
   }
   ```

2. `date` には対象期間の末日（`period_to`）を渡して記録します。

   ```bash
   cd {プロジェクトルートの絶対パス}
   pnpm exec tsx src/firebase/put_doc.ts "{period_to}" "review_marker" --collection image_feedback_reviews --description-file tmp/firestore_doc.txt
   ```

   - 第2位置引数 `"review_marker"` が `type`（コレクション内識別用）。`--collection` 指定時は NOTE_TYPE 検証はバイパスされます。

3. 記録したマーカーのドキュメント ID を報告します。

---

## 出力（ユーザーへの報告）

最終的に以下を簡潔にまとめて報告してください。

1. 対象期間と取得件数（image_logs N 件 / image_feedback 件数）。
2. スコア分布と、繰り返し現れた称賛点・懸念点。
3. 偏り集計の分布表（特に `shot_size` / `camera_direction`）と、立った偏りフラグ。
4. 核 / 彩りの仕分け結果（衝突があればその判断ポイント）。
5. 提示したガイドライン修正案と、承認・反映の有無。
6. 記録したレビューマーカー（期間・ID）。
