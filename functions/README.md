# functions

このディレクトリには Google Cloud Functions 用のコードが格納されています。

## 関数一覧

### `receiveLineMessage`

LINE Webhook からのリクエストを受け取る HTTP 関数。

- LINE の署名検証（`x-line-signature`）を行い、不正なリクエストを弾く
- テキストメッセージ（`line_text`）と画像メッセージ（`line_image`）を Firestore の `notes` コレクションに保存する
- 未対応のメッセージタイプはエラーをスローする

## デプロイ

以下は `gcloud` を使ったデプロイコマンドのサンプルです。

```bash
gcloud functions deploy receiveLineMessage \
  --runtime nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-northeast1 \
  --gen2 \
  --set-secrets LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest \
  --source .
```

> `--set-secrets` オプションにより、Google Secret Manager に登録済みの `LINE_CHANNEL_SECRET` が環境変数として関数に渡されます。

---

### `execEc2Command`

Bearer トークン認証付きの HTTP 関数。AWS Systems Manager (SSM) を経由して、指定した EC2 インスタンスに対してシェルコマンドを実行する。

- `Authorization: Bearer <token>` ヘッダーで認証を行い、不正なリクエストを弾く
- AWS SSM の `SendCommand`（`AWS-RunShellScript` ドキュメント）を使って EC2 インスタンスにコマンドを送信する
- 実行するコマンドは環境変数 `EC2_COMMAND` で指定する

## デプロイ（`execEc2Command`）

`deploy.sh` を使ってデプロイします。`src/execEc2Command/.env.yaml` が存在する場合、自動的に環境変数として読み込まれます。

```bash
./deploy.sh execEc2Command
```

## 環境変数（`src/execEc2Command/.env.yaml`）

| 変数名 | 概要 |
|---|---|
| `AWS_REGION` | SSM クライアントが接続する AWS リージョン |
| `EC2_INSTANCE_ID` | コマンドを送信する対象の EC2 インスタンス ID |
| `EC2_COMMAND` | EC2 インスタンス上で実行するシェルコマンド |
| `AWS_ACCESS_KEY` | AWS 認証に使用するアクセスキー ID |
| `AWS_SECRET_KEY` | AWS 認証に使用するシークレットアクセスキー |
| `BEARER_TOKEN` | HTTP リクエストの認証に使用する Bearer トークン |
