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
  --set-secrets LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest \
  --source .
```

> `--set-secrets` オプションにより、Google Secret Manager に登録済みの `LINE_CHANNEL_SECRET` が環境変数として関数に渡されます。
