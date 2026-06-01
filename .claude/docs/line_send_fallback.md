# LINE 送信失敗時の Firestore 退避

`send_line_text` / `send_line_image` / `send_line_audio` の CLI が失敗したとき、**本来 LINE に届けるはずだった内容**を Firestore の `notes` に退避する手順です。

## いつ実行するか

次のいずれかに該当したら、本手順を実行してください。

- `send_line_*` の CLI が **非ゼロ終了**した
- 標準エラーに **429**、**quota**、レート制限、送信上限に関する記述がある
- ネットワーク障害などで **pushMessage が完了しなかった**と判断できる

**`from_aoi` やモード末尾の `put_firestore_doc`（`off_mountain` / `up_mountain` 等）とは別物**です。引き継ぎ要約用の記録と混同しないでください。

## 使用する type

[src/firebase/noteTypes.ts](../../src/firebase/noteTypes.ts) の **`line_undelivered`**（`NOTE_TYPE.LINE_UNDELIVERED`）を第3引数に指定してください。

## 本文の粒度

- **テキスト**: LINE に送る予定だった本文と**同一**（改行は `\n` リテラルで `put_firestore_doc` に渡す）
- **画像+テキスト**: 添えるテキストは同一。Cloudinary の `originalUrl` / `previewUrl` も `description` に含める（アップロード済みの場合）
- **音声+テキスト**: 添えるテキストは同一。Cloudinary の `url` と `duration` も `description` に含める（アップロード済みの場合）

## description の書式

1行目から次のメタデータ行を付け、その直後に空行を挟んで本文またはメディア情報を書きます。

```
[destination:user]
[media:text]

（ここから LINE 送信予定の本文）
```

| `[media:…]` | 用途 | メディア行の例（メタデータ直後） |
|-------------|------|----------------------------------|
| `text` | テキストのみ | （本文のみ） |
| `image` | 画像+テキスト | `originalUrl=…` / `previewUrl=…` の行のあと、空行、本文 |
| `audio` | 音声+テキスト | `url=…` / `duration=…` の行のあと、空行、本文 |

`[destination:…]` は **`user` / `group` のいずれか**（実際に送ろうとした宛先と一致させる）。

## 送信先 `both` の場合

`--destination both` で失敗した場合は、**宛先ごとに 1 件ずつ** `put_firestore_doc` を実行してください（計 2 件）。各 `description` の `[destination:…]` を `user` / `group` に分け、**本文・メディア URL は同一**とします。

## put_firestore_doc の実行例

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/put_doc.ts "{YYYY-MM-DD}" "[destination:user]\n[media:text]\n\n1行目\n2行目" "line_undelivered"
```

複数行は `put_firestore_doc` スキルと同様、引数内で `\n` に置換して **コマンドを 1 行**に収めてください。

## 報告

退避が完了したら、LINE 送信に失敗したことと Firestore に `line_undelivered` として保存した旨を報告してください。可能ならエラー概要（429 等）も簡潔に添えてください。
