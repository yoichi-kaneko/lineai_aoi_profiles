# PR 本文の形式

[SKILL.md](SKILL.md) の手順 11 で作る PR 本文の雛形。次の点に従って埋める。

- 根拠の示し方、判定の基準、外部の PR・issue やユーザーへのメンションを避けるルールは [shared/writing-rules.md](../dev_handle_renovate_pr/shared/writing-rules.md) に従う。
- このリポジトリの PR への参照 `#<番号>` は、「取り込んだ PR」「外した PR」の表の先頭列にだけ書く。手順 11 の確認では、表の先頭列以外にある `#<番号>` を外部への参照として検出する。
- これらの表の先頭列以外には、リンクやリリースノート・CHANGELOG の文言を書かない。手順 11 の PR・issue への参照の確認は、先頭列が `#<番号>` の表の行を検査から外すので、そこに紛れ込んだ外部への参照を検出できない。
- グループ化された PR で複数のパッケージを更新する場合は、パッケージごとに行を分け、2行目以降の先頭列にも同じ `#<番号>` を書く。
- `<…>` は実際の内容に置き換える。当てはまらない行や節（外した PR が無い、functions の依存を更新していない、Renovate 以外のコミットがある PR を取り込んでいない、など）は削除する。

```markdown
## 概要

Renovate が作成した次の PR の依存関係の更新を、1本にまとめて適用する。マージ後、取り込んだ PR は Renovate の次回の巡回で自動的に閉じられる。

**総合判定: <低 / 中 / 高>**

### 取り込んだ PR

| PR      | パッケージ | 変更                | 種類                    | 使用先                      | 区分                                                                                               | 判定           |
| ------- | ---------- | ------------------- | ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- | -------------- |
| #<番号> | `<pkg>`    | `<旧版>` → `<新版>` | <patch / minor / major> | <ルート / functions / 両方> | <dependencies / devDependencies / optionalDependencies / packageManager / Node.js / GitHub Actions> | <低 / 中 / 高> |

### 外した PR

| PR      | 理由                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| #<番号> | <メジャー更新のため別に処理する / 公開から日が浅い（<取り込める日時> 以降に取り込める） / 検証が失敗した / base 側で別に更新された> |

外した PR は Renovate の PR として残る。

## パッケージごとの調査

### `<pkg>` <旧版> → <新版>

- **主な変更**: <リリースノートの要点>
- **破壊的変更・非推奨**: <なし / 内容>
- **このリポジトリへの影響**: <使用箇所（`src/...`、`functions/src/...`）と照合した結果。使用箇所が無ければその旨>
- **参照**: [リリースノート](<リリースの URL>) / [差分](<compare の URL>)

## 変更内容

- `<base>` から作業ブランチを作り、取り込んだ PR の版の書き換えを適用
- `pnpm install` で `pnpm-lock.yaml` を生成
  - Renovate の PR の lockfile は互いに競合するため、取り込まず1回だけ生成した
- `scripts/regenerate-functions-lock.mjs` で `functions/package-lock.json` を再生成
  - Renovate が更新した `functions/package-lock.json` は `functions/package.json` と一致せず、元の PR では CI の `pnpm check:functions-lock` が失敗していた

主な変更ファイル: <`package.json` / `functions/package.json` / `.nvmrc` / `.github/workflows/*.yml` / `pnpm-lock.yaml` / `functions/package-lock.json`>

## 検査結果

| コマンド                                        | 結果          |
| ----------------------------------------------- | ------------- |
| `pnpm install --frozen-lockfile`                | <成功 / 失敗> |
| `pnpm test:all`                                 | <成功 / 失敗> |
| `pnpm exec tsc --noEmit`                        | <成功 / 失敗> |
| `pnpm --filter aoi-functions exec tsc --noEmit` | <成功 / 失敗> |

## 注意

- `functions/` の実行時の依存を更新している。マージしただけでは LINE Webhook に反映されず、`functions/deploy.sh` での再デプロイが一度必要になる。
- `<pkg>` を更新する PR は Renovate 以外のコミットがあり、Renovate が自動では閉じないので、マージ後に手で閉じる。
```
