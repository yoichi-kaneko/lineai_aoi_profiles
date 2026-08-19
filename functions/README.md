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
  - `src/receiveLineMessage/parseSongFeedback.ts`
  - `src/firebase/noteTypes.ts`
  - `src/receiveLineMessage/routing.ts`
  - `src/receiveLineMessage/jstDate.ts`
  - `src/receiveLineMessage/handler.ts`
  - `src/lib/execEc2Command.ts`
- 間接カバー:
  - `src/receiveLineMessage/index.ts` は handler 登録のみのため、`handler.ts` のテストで間接カバーする
  - `src/index.ts` は `receiveLineMessage/index.ts` の import のみのため、個別テストは持たない

方針:

- 実 Firestore / LINE / AWS には接続せず、モックで分岐と保存内容を検証する
- group/room の無視、署名検証、ユーザー制限、フィードバック隔離、EC2 トリガー抑止/発火を自動テストで担保する
- 署名検証や Functions Framework 登録の薄い部分は、依存注入可能な `createReceiveLineMessageHandler()` を中心に検証する

## 関数一覧

### `receiveLineMessage`

LINE Webhook からのリクエストを受け取る HTTP 関数。

- LINE の署名検証（`x-line-signature`）を行い、不正なリクエストを弾く
- テキスト・画像メッセージを Firestore の `notes` に保存する（`type` は [../src/firebase/noteTypes.ts](../src/firebase/noteTypes.ts) の `LINE_TEXT` / `LINE_IMAGE` と同値）。ただしフィードバックのキーワードで始まるテキストは専用コレクションへ振り分ける（後述）
- 未対応のメッセージタイプはエラーをスローする
- テキストメッセージの内容が特定のキーワードで始まる場合、Firestore への保存後に EC2 コマンドを実行する（後述）

#### フィードバックの振り分け

以下のキーワードに前方一致するテキストメッセージは、碧衣の生成物へのフィードバックとして `notes` ではなく専用コレクションへ保存します。**`line_text` としては保存せず、EC2 コマンドのトリガーも発火しません**（日々のモードがフィードバック文を「ユーザーの言葉」として誤取込するのを防ぐため）。

| キーワード | 保存先コレクション | 内容 |
|---|---|---|
| `評価`, `傾向` | `image_feedback` | 画像生成へのフィードバック（[スキーマ・パース仕様](../.claude/docs/image_feedback_schema.md)） |
| `楽曲評価`, `音楽評価` | `song_feedback` | 楽曲生成へのフィードバック（[スキーマ・パース仕様](../.claude/docs/song_feedback_schema.md)） |

パースの実体は `src/receiveLineMessage/parseImageFeedback.ts` / `parseSongFeedback.ts` です（日付・スコアの抽出は `parseRating.ts` を共用）。

#### EC2 コマンドのトリガー

`src/receiveLineMessage/routing.ts` の `TRIGGER_MODE_MAP` に定義されたキーワードへ前方一致するテキストメッセージ（フィードバックの振り分けに該当しなかったもの）を受信すると、AWS SSM 経由で EC2 インスタンス上のコマンドを実行します。

現在のトリガーキーワードとモード:

| キーワード | モード |
|---|---|
| `下山`, `無事下山` | `off_mountain`（帰灯） |
| `登山開始` | `up_mountain`（門灯） |
| `山小屋` | `stay_mountain`（継灯） |

実行されるコマンドの内容は環境変数 `EC2_COMMAND_TEMPLATE`（`.env.yaml`）で設定します。テンプレート中の `{MODE}` プレースホルダが上記のモード名に置換されます。

## デプロイ

`deploy.sh` を使ってデプロイします。

```bash
cd functions
./deploy.sh receiveLineMessage
```

スクリプトは `src/<function_name>/` 配下の `.env.yaml`（環境変数）と `.secrets`（Secret Manager 参照）を自動検出して `gcloud functions deploy` コマンドに渡します。

### 環境変数（`.env.yaml`）

| 変数名 | 用途 |
|---|---|
| `LINE_USER_ID` | LINEのユーザーID |
| `AWS_REGION` | AWS リージョン |
| `EC2_INSTANCE_ID` | SSM コマンドの送信先 EC2 インスタンス ID |
| `EC2_COMMAND_TEMPLATE` | EC2 上で実行するシェルコマンドのテンプレート（`{MODE}` をモード名に置換） |

### シークレット（`.secrets` / Secret Manager）

| 変数名 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE 署名検証用チャンネルシークレット |
| `AWS_ACCESS_KEY` | AWS 認証情報（アクセスキー ID） |
| `AWS_SECRET_KEY` | AWS 認証情報（シークレットアクセスキー） |
