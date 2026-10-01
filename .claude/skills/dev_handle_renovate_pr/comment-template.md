# PR コメントの形式

[SKILL.md](SKILL.md) の手順 9 で投稿するコメントの雛形。次の点に従って埋める。

- 1行目のマーカー `<!-- dev_handle_renovate_pr -->` は消さない。再実行時にこのコメントを見分けて更新するのに使う。
- `<…>` は実際の内容に置き換える。当てはまらない行や節（base をマージしていない、ロックを再生成していない、CI を再実行していない、functions の依存を更新していない、など）は削除する。
- 調査結果は事実と根拠（リリースノートの該当箇所、照合したファイル）を示し、推測は推測と書く。
- 判定は SKILL.md の「リスクの判定」の基準に従う。
- 外部リポジトリの PR・issue へのリンクや参照は書かない。このリポジトリは公開されているため、コメントに書くと参照先の PR・issue に自動でメンション（タイムラインへの言及）が飛ぶ。次の形はいずれも書かない。
  - `https://github.com/<owner>/<repo>/pull/<番号>` / `.../issues/<番号>` の URL（`/files` や `#issuecomment-...` が付いたもの、Renovate の PR 本文にある `redirect.github.com` 経由のものも含む）
  - `<owner>/<repo>#<番号>` の短縮形
  - リリースノートや CHANGELOG にある `(#1234)` のような番号だけの参照。書き写すとこのリポジトリの PR・issue へのリンクになり、別物を指してしまう
- 根拠は、リリースや compare へのリンクと、リリースノートの該当箇所の見出しや文言で示す。リリース（`.../releases/tag/<タグ>`）や compare（`.../compare/<旧タグ>...<新タグ>`）へのリンクはメンションにならないので書いてよい。
- 同じ理由で、リリースノートにある `@<ユーザー名>` も書き写さない（そのユーザーへのメンションになる）。

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
