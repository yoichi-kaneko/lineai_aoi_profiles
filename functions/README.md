# functions

このディレクトリには Google Cloud Functions 用のコードが格納されています。

## 関数一覧

### `receiveLineMessage`

LINE Webhook からのリクエストを受け取る HTTP 関数。

- LINE の署名検証（`x-line-signature`）を行い、不正なリクエストを弾く
- テキスト・画像メッセージを Firestore の `notes` に保存する（`type` は [../src/firebase/noteTypes.ts](../src/firebase/noteTypes.ts) の `LINE_TEXT` / `LINE_IMAGE` と同値）
- 未対応のメッセージタイプはエラーをスローする
- テキストメッセージの内容が特定のキーワードで始まる場合、Firestore への保存後に EC2 コマンドを実行する（後述）

#### EC2 コマンドのトリガー

`src/receiveLineMessage/index.ts` の冒頭で定義された `EC2_TRIGGER_KEYWORDS` のいずれかに前方一致するテキストメッセージを受信すると、AWS SSM 経由で EC2 インスタンス上のコマンドを実行します。

現在のトリガーキーワード: `"下山"`, `"無事下山"`

実行されるコマンドの内容は環境変数 `EC2_COMMAND`（`.env.yaml`）で設定します。

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
| `EC2_COMMAND` | EC2 上で実行するシェルコマンド |

### シークレット（`.secrets` / Secret Manager）

| 変数名 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE 署名検証用チャンネルシークレット |
| `AWS_ACCESS_KEY` | AWS 認証情報（アクセスキー ID） |
| `AWS_SECRET_KEY` | AWS 認証情報（シークレットアクセスキー） |
