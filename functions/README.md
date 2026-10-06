# functions

このディレクトリには Google Cloud Functions 用のコードが格納されています。

## テスト

`functions/` は独立ワークスペースとして `functions/test/` に Vitest を持ちます。
ルート `test/` とは分離し、CommonJS 出力や Functions 固有の依存関係をここで閉じます。

```bash
cd functions
pnpm test        # functions のみ
pnpm test:watch  # ウォッチ実行

# ルートから全体実行
cd ..
pnpm test:all
```

### 現在のカバー範囲

- 直接テスト:
  - `src/receiveLineMessage/parseRating.ts`
  - `src/receiveLineMessage/parseImageFeedback.ts`
  - `src/firebase/noteTypes.ts`
  - `src/receiveLineMessage/routing.ts`
  - `src/receiveLineMessage/jstDate.ts`
  - `src/receiveLineMessage/handler.ts`
  - `src/lib/execEc2Command.ts`
  - `src/lib/lineImageStore.ts`
- 間接カバー:
  - `src/receiveLineMessage/index.ts` は handler 登録のみのため、`handler.ts` のテストで間接カバーする
  - `src/index.ts` は `receiveLineMessage/index.ts` の import のみのため、個別テストは持たない

方針:

- 実 Firestore / LINE / AWS / Cloudinary には接続せず、モックで分岐と保存内容を検証する
- group/room の無視、署名検証、ユーザー制限、フィードバック隔離、EC2 トリガー抑止/発火、受け取った画像の保存に失敗しても記録と応答が続くことを自動テストで担保する
- 署名検証や Functions Framework 登録の薄い部分は、依存注入可能な `createReceiveLineMessageHandler()` を中心に検証する

## 関数一覧

### `receiveLineMessage`

LINE Webhook からのリクエストを受け取る HTTP 関数。

- LINE の署名検証（`x-line-signature`）を行い、不正なリクエストを弾く
- テキスト・画像メッセージを Firestore の `notes` に保存する（`type` は [../src/firebase/noteTypes.ts](../src/firebase/noteTypes.ts) の `LINE_TEXT` / `LINE_IMAGE` と同値）。ただしフィードバックのキーワードで始まるテキストは専用コレクションへ振り分ける（後述）
- 画像メッセージは、`notes` へ記録した後に Cloudinary へ非公開で保存する（後述）
- 未対応のメッセージタイプはエラーをスローする
- テキストメッセージの内容が特定のキーワードで始まる場合、Firestore への保存後に EC2 コマンドを実行する（後述）
- 応答対象の特定が必要なモード（`talk`）では、保存したドキュメントの ID とイベント由来の JST 投稿日をコマンドへ渡す。ID が取得できない場合・保存に失敗した場合は起動しない

#### フィードバックの振り分け

以下のキーワードに前方一致するテキストメッセージは、碧衣の生成物へのフィードバックとして `notes` ではなく専用コレクションへ保存します。**`line_text` としては保存せず、EC2 コマンドのトリガーも発火しません**（日々のモードがフィードバック文を「ユーザーの言葉」として誤取込するのを防ぐため）。

| キーワード | 保存先コレクション | 内容 |
|---|---|---|
| `評価`, `傾向` | `image_feedback` | 画像生成へのフィードバック（[スキーマ・パース仕様](../.claude/docs/image_feedback_schema.md)） |

パースの実体は `src/receiveLineMessage/parseImageFeedback.ts` です（日付・スコアの抽出は `parseRating.ts` を共用）。

#### EC2 コマンドのトリガー

`src/receiveLineMessage/routing.ts` の `TRIGGER_MODE_MAP` に定義されたキーワードへ前方一致するテキストメッセージ（フィードバックの振り分けに該当しなかったもの）を受信すると、AWS SSM 経由で EC2 インスタンス上のコマンドを実行します。

現在のトリガーキーワードとモード:

| キーワード | モード |
|---|---|
| `下山`, `無事下山` | `off_mountain`（帰灯） |
| `登山開始` | `up_mountain`（門灯） |
| `山小屋` | `stay_mountain`（継灯） |
| `碧衣` | `talk`（響） |

実行されるコマンドの内容は環境変数 `EC2_COMMAND_TEMPLATE`（`.env.yaml`）で設定します。テンプレート中の次のプレースホルダが置換されます。

| プレースホルダ | 置換される値 |
|---|---|
| `{MODE}` | 上表のモード名 |
| `{TARGET_DOC_ID}` | 応答対象として保存した `notes` ドキュメントの ID（`talk` のみ。他モードでは空文字） |
| `{POSTED_DATE}` | LINE イベントの timestamp を基準にした JST の暦日 `YYYY-MM-DD`（`talk` のみ。他モードでは空文字） |

#### 響（`talk`）の起動情報と配備順

`talk` は「どの呼びかけへの応答か」を渡さないと成立しないため、次の検証を行います（`src/lib/execEc2Command.ts` の `buildEc2Command`）。

- `mode` は `^[a-z][a-z0-9_]*$`、ドキュメント ID は `^[A-Za-z0-9_-]{1,128}$`、投稿日は `^\d{4}-\d{2}-\d{2}$` に一致する場合のみ埋め込みます。LINE の本文はコマンドへ渡さず、ログにも出しません。
- **`EC2_COMMAND_TEMPLATE` に `{TARGET_DOC_ID}` と `{POSTED_DATE}` が含まれていない場合、`talk` の起動は失敗します**（ID と投稿日を落としたまま起動しないため）。

そのため配備は次の順で行ってください。片側だけを更新しても、ID・投稿日が黙って失われることはありません。

1. **EC2 側**: 新しい引数を受け取る `send_daily_line.sh` を配備する（`send_daily_line.sh talk <対象ドキュメントID> <投稿日>`）。旧来のモードは引数なしで従来どおり動きます。
2. **`.env.yaml`**: `EC2_COMMAND_TEMPLATE` に `{TARGET_DOC_ID}` と `{POSTED_DATE}` を追加する。既存モードではこの2つが空文字に置換されるため、追加しても従来の起動は変わりません。
3. **Functions**: `receiveLineMessage` をデプロイする。

順序を入れ替えて Functions を先に配備した場合、`talk` の起動は例外となり（ログに `EC2_COMMAND_TEMPLATE must contain ...`）、呼びかけへの応答は行われません。既存モードの起動には影響しません。

#### 受け取った画像の保存（Cloudinary）

LINE 側のコンテンツは一定期間で削除され、`line_image` に残るのはメッセージ ID だけです。そのため、受け取った画像を受信時に Cloudinary へ非公開で保存します（実体は `src/lib/lineImageStore.ts`）。

1. `notes` へ `line_image` を記録する（従来どおり）
2. LINE から画像を取得し（`LINE_ACCESS_TOKEN`）、Cloudinary へ配信タイプ `authenticated` でアップロードする

- **配信タイプ**: `authenticated` は、原本も加工版も署名付き URL でしか取得できません。`private` は加工版が既定で公開のままで、それを塞ぐ Strict Transformations はアカウント全体の設定のため、碧衣の送信画像のプレビュー URL（署名なしの縮小 URL）まで止まります。
- **public_id**: `line_aoi_<メッセージID>`。碧衣側の `download_line_image`（[../src/line/download_image.ts](../src/line/download_image.ts)）が同じ規則で組み立てて取得するため、Firestore には保存先を記録しません。接頭辞を変える場合は両方をそろえてください（ルートの `test/line/download_image.test.ts` が一致を検査します）。
- **保存フォルダ**: `.env.yaml` の `CLOUDINARY_RECEIVED_IMAGE_ASSET_FOLDER`。送信画像のフォルダ（ルート `.env` の `CLOUDINARY_IMAGE_ASSET_FOLDER`）とは分けてください。未設定の場合は、フォルダを指定せずに保存します。
- **順序**: 記録を先に残すのは、写真の直後の呼びかけで起動した響モードが、記録を見つけられるようにするためです。アップロードは LINE へ 200 を返す前に済ませます（Cloud Functions では、応答後の処理が最後まで動く保証が無いため）。
- **失敗時**: 取得・アップロードに失敗しても、ログに出すだけで処理を続け、200 を返します。記録は残っているため、碧衣は LINE からの取得に回ります。ログには例外の名前・メッセージ・HTTP ステータスだけを出し、画像の URL やトークンは出しません。
- **設定が無いとき**: `LINE_ACCESS_TOKEN` や Cloudinary の設定が無い場合は、不足している変数名を警告して、保存だけを飛ばします。シークレットの登録とデプロイの順番に関係なく、従来の記録は続きます。

## デプロイ

`deploy.sh` を使ってデプロイします。

```bash
cd functions
./deploy.sh receiveLineMessage
```

スクリプトは `src/<function_name>/` 配下の `.env.yaml`（環境変数）と `.secrets`（Secret Manager 参照）を自動検出して `gcloud functions deploy` コマンドに渡します。

### `package-lock.json` の管理

Cloud Build は `npm ci` で依存をインストールするため、`functions/package-lock.json` をコミットしておく必要があります。リポジトリ全体は pnpm ワークスペースですが、このロックは Cloud Functions のビルド専用で、`pnpm-lock.yaml` とは独立しています（ローカルのテスト実行には使われません）。

`functions/package.json` の依存を変更したら、プロジェクトルートで次のコマンドを実行してロックも再生成してください。`functions/` の中で直接 `npm install` は実行しないでください。

```shell
npm --prefix functions run lock:regenerate
```

このコマンドは、node_modules の無い一時ディレクトリへ `package.json` と既存のロックをコピーしてから `npm install --package-lock-only` を実行し、成功したロックだけを `functions/package-lock.json` へ反映します。これにより、pnpm が作った `functions/node_modules`（`.pnpm` へのシンボリックリンク）を npm が取り込んだ壊れたロックの生成を防ぎ、今回変えた依存以外の差分も抑えます。

検証は [`scripts/check-functions-lock.mjs`](../scripts/check-functions-lock.mjs) が担い、次の3点を確認します。

- `package-lock.json` が存在すること
- `.pnpm` へのシンボリックリンク（`"link": true`）を取り込んでいないこと
- ロックのルートエントリが `package.json` の `dependencies` / `devDependencies` と一致し、各直接依存がレジストリ URL として記録されていること

このスクリプトは CI（`pnpm test:all`）でも実行されるため、ロックの更新漏れは push した時点で検出されます。`deploy.sh` もデプロイ前に同じ検証を行い、該当すればデプロイせずに中断します。

デプロイ時に検証を省略したい場合は `SKIP_LOCK_CHECK=1 ./deploy.sh <function_name>` で実行します。

なお、ビルドイメージの npm は 10 系のため、ロックが無いと buildpack が実行する `npm install --package-lock-only` が `vitest` の peer 依存解決でクラッシュします（`Cannot read properties of null (reading 'edgesOut')`）。ロックをコミットしておくことは、この回避も兼ねています。

### 環境変数（`.env.yaml`）

| 変数名 | 用途 |
|---|---|
| `LINE_USER_ID` | LINEのユーザーID |
| `AWS_REGION` | AWS リージョン |
| `EC2_INSTANCE_ID` | SSM コマンドの送信先 EC2 インスタンス ID |
| `EC2_COMMAND_TEMPLATE` | EC2 上で実行するシェルコマンドのテンプレート（`{MODE}` をモード名に、`{TARGET_DOC_ID}` / `{POSTED_DATE}` を応答対象の情報に置換） |
| `CLOUDINARY_CLOUD_NAME` | 受け取った画像の保存先の Cloudinary の Cloud Name（ルート `.env` と同じ値） |
| `CLOUDINARY_RECEIVED_IMAGE_ASSET_FOLDER` | 受け取った画像の保存フォルダ（任意。送信画像の `aoi_daily` とは分ける） |

### シークレット（`.secrets` / Secret Manager）

| 変数名 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE 署名検証用チャンネルシークレット |
| `AWS_ACCESS_KEY` | AWS 認証情報（アクセスキー ID） |
| `AWS_SECRET_KEY` | AWS 認証情報（シークレットアクセスキー） |
| `LINE_ACCESS_TOKEN` | 受け取った画像を LINE から取得するためのチャネルアクセストークン（碧衣のチャネル。ルート `.env` と同じ値） |
| `CLOUDINARY_API_KEY` | 受け取った画像を Cloudinary へ保存するための API Key（ルート `.env` と同じ値） |
| `CLOUDINARY_API_SECRET` | 受け取った画像を Cloudinary へ保存するための API Secret（ルート `.env` と同じ値） |

#### Secret Manager への登録

`.secrets` で参照するシークレットは、**デプロイより前に** Secret Manager へ登録しておく必要があります。未登録のシークレットを参照すると、デプロイが失敗します。

- シークレットの名前は、`.secrets` の右辺（`ENV_VAR_NAME=SECRET_NAME:VERSION` の `SECRET_NAME`）に合わせる
- 関数の実行サービスアカウント（既定では Compute Engine のデフォルトサービスアカウント）に、各シークレットの `roles/secretmanager.secretAccessor` を付与する。プロジェクト単位で付与済みなら不要
- 値の末尾に改行を入れない。受け取った画像の保存処理は前後の空白を取り除くが、`LINE_CHANNEL_SECRET` などの既存の値はそのまま使われる

値をシェルの履歴に残さず、末尾の改行も付けずに登録する例です。

```bash
read -rs VALUE && printf '%s' "$VALUE" | gcloud secrets create LINE_ACCESS_TOKEN --replication-policy=automatic --data-file=-; unset VALUE

gcloud secrets add-iam-policy-binding LINE_ACCESS_TOKEN \
  --member="serviceAccount:<実行サービスアカウント>" \
  --role="roles/secretmanager.secretAccessor"
```
