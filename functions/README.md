# functions

このディレクトリには Google Cloud Functions 用のコードが格納されています。

## 関数一覧

### `receiveLineMessage`

LINE Webhook からのリクエストを受け取る HTTP 関数。

- LINE の署名検証（`x-line-signature`）を行い、不正なリクエストを弾く
- テキストメッセージ（`line_text`）と画像メッセージ（`line_image`）を Firestore の `notes` コレクションに保存する
- 未対応のメッセージタイプはエラーをスローする

#### Secret Manager 設定（`src/receiveLineMessage/.secrets`）

```txt
LINE_CHANNEL_SECRET=LINE_CHANNEL_SECRET:latest
```

## デプロイ

`deploy.sh` を使ってデプロイします。実行方法は従来どおりで、引数には関数名のみを指定します。

```bash
./deploy.sh <function_name>
```

`deploy.sh` は関数ディレクトリ内の設定ファイルを自動的に読み取ります。

- `src/<function_name>/.env.yaml` があれば `--env-vars-file` を付与
- `src/<function_name>/.secrets` があれば `--set-secrets` を付与

`.secrets` は1行ごとに `環境変数名=Secret名:version` 形式で記述します。

---

### `getFireStoreDocs`

Bearer トークン認証付きの HTTP 関数。指定した日付に一致する Firestore の `records` コレクションのドキュメントを取得し、`isRead: true` に更新して返す。

- `Authorization: Bearer <token>` ヘッダーで認証を行い、不正なリクエストを弾く
- `date` パラメータ（`YYYY-MM-DD`）を query または body から受け取る
- `date` フィールドが指定日の 00:00:00〜23:59:59 に含まれるドキュメントを取得する
- 取得後、該当ドキュメントを一括で `isRead: true` に更新する

#### デプロイ（`getFireStoreDocs`）

```bash
./deploy.sh getFireStoreDocs
```

#### Secret Manager 設定（`src/getFireStoreDocs/.secrets`）

```txt
BEARER_TOKEN=BEARER_TOKEN:latest
```

---

### `putFireStoreDoc`

Bearer トークン認証付きの HTTP 関数。Firestore の `records` コレクションにドキュメントを1件追加する。

- `Authorization: Bearer <token>` ヘッダーで認証を行い、不正なリクエストを弾く
- `date`（`YYYY-MM-DD`）と `description` を query または body から受け取る
- `type: "from_aoi"`、`isRead: false` を固定値として保存する
- `description` 中のリテラル `\n` は改行文字に変換して保存する
- 追加したドキュメントの `id` と内容をレスポンスとして返す

#### 保存されるドキュメント構造

| フィールド | 型 | 内容 |
|---|---|---|
| `date` | Timestamp | 引数の日付（当日 00:00:00） |
| `description` | string | 引数の説明文 |
| `type` | string | `"from_aoi"` 固定 |
| `isRead` | boolean | `false` 固定 |
| `createdAt` | Timestamp | 登録日時 |

#### デプロイ（`putFireStoreDoc`）

```bash
./deploy.sh putFireStoreDoc
```

#### Secret Manager 設定（`src/putFireStoreDoc/.secrets`）

```txt
BEARER_TOKEN=BEARER_TOKEN:latest
```

---

### `execEc2Command`

Bearer トークン認証付きの HTTP 関数。AWS Systems Manager (SSM) を経由して、指定した EC2 インスタンスに対してシェルコマンドを実行する。

- `Authorization: Bearer <token>` ヘッダーで認証を行い、不正なリクエストを弾く
- AWS SSM の `SendCommand`（`AWS-RunShellScript` ドキュメント）を使って EC2 インスタンスにコマンドを送信する
- 実行するコマンドは環境変数 `EC2_COMMAND` で指定する

## デプロイ（`execEc2Command`）

`deploy.sh` を使ってデプロイします。`src/execEc2Command/.env.yaml` と `src/execEc2Command/.secrets` は両方とも自動的に読み込まれます。

```bash
./deploy.sh execEc2Command
```

## 通常環境変数（`src/execEc2Command/.env.yaml`）

| 変数名 | 概要 |
|---|---|
| `AWS_REGION` | SSM クライアントが接続する AWS リージョン |
| `EC2_INSTANCE_ID` | コマンドを送信する対象の EC2 インスタンス ID |
| `EC2_COMMAND` | EC2 インスタンス上で実行するシェルコマンド |

## Secret Manager 設定（`src/execEc2Command/.secrets`）

```txt
BEARER_TOKEN=BEARER_TOKEN:latest
AWS_ACCESS_KEY=AWS_ACCESS_KEY:latest
AWS_SECRET_KEY=AWS_SECRET_KEY:latest
```
