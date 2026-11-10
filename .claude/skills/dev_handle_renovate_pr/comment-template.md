# PR コメントの形式

[SKILL.md](SKILL.md) の手順 9 で投稿するコメントの雛形。次の点に従って埋める。

- 1行目のマーカー `<!-- dev_handle_renovate_pr -->` は消さない。再実行時にこのコメントを見分けて更新するのに使う。
- `<…>` は実際の内容に置き換える。当てはまらない行や節（base をマージしていない、ロックを再生成していない、CI を再実行していない、functions の依存を更新していない、など）は削除する。
- 根拠の示し方、判定の基準、外部の PR・issue やユーザーへのメンションを避けるルールは [shared/writing-rules.md](shared/writing-rules.md) に従う。

```markdown
<!-- dev_handle_renovate_pr -->

## 依存関係の更新の確認結果

**総合判定: <低 / 中 / 高>**

| パッケージ | 変更                | 種類                    | 使用先                      | 区分                             | 判定           |
| ---------- | ------------------- | ----------------------- | --------------------------- | -------------------------------- | -------------- |
| `<pkg>`    | `<旧版>` → `<新版>` | <patch / minor / major> | <ルート / functions / 両方> | <dependencies / devDependencies> | <低 / 中 / 高> |

### パッケージごとの調査

#### `<pkg>` <旧版> → <新版>

- **主な変更**: <リリースノートの要点>
- **破壊的変更・非推奨**: <なし / 内容>
- **このリポジトリへの影響**: <使用箇所（`src/...`、`functions/src/...`）と照合した結果。使用箇所が無ければその旨>
- **参照**: [リリースノート](<リリースの URL>) / [差分](<compare の URL>)

### 実施した作業

- `<base>` をマージ（base より遅れていたため）
- `scripts/regenerate-functions-lock.mjs` で `functions/package-lock.json` を再生成（<コミットのハッシュ>）
  - Renovate が更新した `functions/package-lock.json` が `functions/package.json` と一致せず、CI の `pnpm check:functions-lock` が失敗していた
- 失敗していた CI を再実行（公開からの経過時間が `minimumReleaseAge` を満たしたため）
- コミット・push は行っていない（Renovate の生成物のままローカル検証が通ったため）

### ローカル検証

| コマンド                                        | 結果          |
| ----------------------------------------------- | ------------- |
| `pnpm install --frozen-lockfile`                | <成功 / 失敗> |
| `pnpm test:all`                                 | <成功 / 失敗> |
| `pnpm exec tsc --noEmit`                        | <成功 / 失敗> |
| `pnpm --filter aoi-functions exec tsc --noEmit` | <成功 / 失敗> |

<失敗した場合は、失敗したコマンドとエラーの要点をここに書く>

### 注意

- `functions/` の実行時の依存を更新している。マージしただけでは LINE Webhook に反映されず、`functions/deploy.sh` での再デプロイが必要になる。
- このブランチに Renovate 以外のコミットが入ったため、Renovate はこの PR を自動では rebase しなくなる。PR 本文の rebase/retry にチェックを入れるとこのコミットは破棄されるので、その後は `dev_handle_renovate_pr` を再実行する。
```
