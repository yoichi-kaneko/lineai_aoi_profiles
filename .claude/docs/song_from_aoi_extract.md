# `from_aoi` からの天候の傾向の抽出（調べモード）

調べ（`song`）モードのステップ1で、暁モードの引き継ぎ記録 `from_aoi` から**天候の傾向だけ**を取り出すための手順です。調べモードが `from_aoi` から使うのは天候の傾向だけで、登山予定の分析や移動予定の詳細は楽曲のインスピレーションには不要です。`from_aoi` は1日あたり2,000〜3,000字あり、7日分では50KBを超えるため、全文を読まずに済むよう、一時ファイルへ落としてから必要な節だけを抜き出してください。

**手順1：一時ファイルへ保存する**（標準出力に流さない）

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/firebase/get_docs.ts "{7日前}" "{本日}" --type "from_aoi" > tmp/song_from_aoi.json
```

**手順2：天候の節だけを抜き出して読む**

暁モードは天候の傾向を `【天気予報の概要】` の見出しで記録しています（[modes/morning.md](../../modes/morning.md) のステップ4「見出し表記の約束」）。以下をそのまま実行してください。

```bash
cd {プロジェクトルートの絶対パス}
node <<'EOF'
const fs = require("fs");
const raw = fs.readFileSync("tmp/song_from_aoi.json", "utf8");
const end = raw.lastIndexOf("]");
if (end === -1) {
  console.error("from_aoi の取得に失敗しています（JSON 配列が見つかりません）");
  process.exit(1);
}
const docs = JSON.parse(raw.slice(0, end + 1));
if (!Array.isArray(docs)) {
  console.error("from_aoi の取得結果が配列ではありません");
  process.exit(1);
}
const jstDate = (d) =>
  d && typeof d._seconds === "number"
    ? new Date(d._seconds * 1000).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "日付不明";
let found = 0;
for (const doc of docs) {
  const section = (doc.description || "").match(/【天気予報の概要】[\s\S]*?(?=\n【|$)/);
  if (section) {
    found++;
    console.log(jstDate(doc.date) + "\n" + section[0] + "\n");
  }
}
if (docs.length === 0) console.log("該当する from_aoi の記録がありません（0件）");
else if (found === 0) console.log("【天気予報の概要】の節を抽出できませんでした");
EOF
```

出力は8KB前後に収まり、そのまま読めます。各節の前には、その記録の `date` を日本時間で整形した日付（`2026/8/17` 形式）を添えて出力します（`date` は JSON 化の際に UTC 秒（`_seconds`）へ変換されるため、タイムゾーンを指定せずに日付へ直すと1日ずれます。上のスクリプトは `Asia/Tokyo` を明示しています）。

**注意**

- **`tmp/song_from_aoi.json` を Read ツールで開かないでください**。全文を読んでしまうと二段構えの意味がなくなります。このファイルはフェーズA のステップ1で使い切る作業用で、後続のステップやフェーズBからは参照しません
- **`grep` で節を抜こうとしないでください**。CLI の出力は `JSON.stringify(..., null, 2)` のため `description` 内の改行が `\n` へエスケープされて**1件が1行に潰れており**、行単位の `grep` は節ではなくそのドキュメント全文（最大7KB）を返します。加えて実行環境のロケールは `C.UTF-8` で、`[^】]` のような日本語の文字クラス否定はバイト単位で誤動作します
- 「**from_aoi の取得に失敗しています（JSON 配列が見つかりません）**」と出た場合は、手順1のコマンド自体が失敗して `tmp/song_from_aoi.json` が空（または JSON になっていない）ということで、記録が0件だった場合とは区別されます（0件のときは `[]` が書き出され、下の「0件」のメッセージになります）。手順1から1回だけやり直し、それでも同じであればこのステップは諦め、天候の傾向は空欄のままステップ2へ進んでください
- 「**該当する from_aoi の記録がありません（0件）**」と出た場合は、その期間に暁モードの引き継ぎ記録が無い（または保存されていない）ということです。取得し直しても結果は変わらないため、天候の傾向は空欄のまま、他の材料でステップ2へ進んでください
- 「**`【天気予報の概要】` の節を抽出できませんでした**」と出た場合は、記録はあるのに見出しが拾えていない（表記揺れなど）ということです。対象日を直近2〜3日に絞って `--type "from_aoi"` を取り直し、その範囲だけを標準出力で読んでください。7日分を標準出力で取り直さないこと
