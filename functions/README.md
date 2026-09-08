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
- 応答対象の特定が必要なモード（`talk`）では、保存したドキュメントの ID とイベント由来の JST 投稿日をコマンドへ渡す。ID が取得できない場合・保存に失敗した場合は起動しない

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
| `EC2_COMMAND_TEMPLATE` | EC2 上で実行するシェルコマンドのテンプレート（`{MODE}` をモード名に、`{TARGET_DOC_ID}` / `{POSTED_DATE}` を応答対象の情報に置換） |

### シークレット（`.secrets` / Secret Manager）

| 変数名 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE 署名検証用チャンネルシークレット |
| `AWS_ACCESS_KEY` | AWS 認証情報（アクセスキー ID） |
| `AWS_SECRET_KEY` | AWS 認証情報（シークレットアクセスキー） |
