# 依存関係の更新内容の調査

`dev_handle_renovate_pr` と `dev_bundle_renovate_prs` の両方から参照する共通の手順です。手順を変えるときは、両方のスキルから見ても成り立つかを確かめます。どちらかのスキルを廃止するときは、この `shared/` ディレクトリを残る側へ移し、参照しているリンクを書き換えます。

パッケージごとに、旧版より後から新版までのすべての版を調べます（途中の版を飛ばさない）。調査の深さは更新の大きさに合わせます。patch 更新なら変更点の確認と使用箇所の照合で足り、major 更新なら移行ガイドまで読みます。結果は作業ファイルに書き溜め、リスクがあると判断しても処理は続けます。

## 調べること

1. 変更内容
   - リポジトリ: npm パッケージは `pnpm view <pkg>@<新版> repository.url`、または PR 本文の source リンク。GitHub Actions は `uses:` の `<owner>/<repo>` がそのままリポジトリになる。
   - リリースノート: `gh api "repos/<owner>/<repo>/releases?per_page=100"` から該当するタグを探して本文を読む。モノレポではタグの付け方がパッケージごとに違う（`v11.3.0`、`<pkg>@1.2.3` など）。
   - リリースノートが空または見つからない場合は CHANGELOG を読む（`gh api repos/<owner>/<repo>/contents/<path>`）。それも無ければ `gh api repos/<owner>/<repo>/compare/<旧タグ>...<新タグ>` のコミット一覧から判断する。
2. 互換性
   - npm パッケージ: `pnpm view <pkg>@<新版> engines peerDependencies --json` で、`engines.node` が `.nvmrc` と `functions/deploy.sh` の `--runtime` の Node.js メジャーを満たすかと、peer の要求がこのリポジトリの版と合うかを確認する。
   - GitHub Actions: 新しいタグの `action.yml`（無ければ `action.yaml`）を読み、`.github/workflows/*.yml` での使い方と照合する。`runs.using`（アクションを動かす Node.js）の変更と、`with:` で渡している入力の削除・改名・既定値の変更が無いかを見る。

     ```sh
     gh api -H "Accept: application/vnd.github.raw+json" "repos/<owner>/<repo>/contents/action.yml?ref=<新タグ>"
     ```

   - 破壊的変更（BREAKING CHANGES、非推奨化、既定値の変更、API の削除）を拾う。
3. このリポジトリでの使われ方
   - `src/`、`functions/src/`、`test/`、`functions/test/`、`scripts/`、設定ファイル（`tsconfig.json`、`functions/tsconfig.json`、`vitest.config.ts` など）で該当パッケージを import・参照している箇所を検索し、変更点が当たるかを照合する。
   - テストは外部 API に接続しない純関数が中心のため、外部 API クライアント（`openai`、`@google/genai`、`@line/bot-sdk`、`googleapis` など）の通信や応答形式の変更はローカル検証（[verification.md](verification.md)）では検出できない。リリースノートと使用箇所の照合で判断する。
   - 次の「このリポジトリ固有の確認事項」に該当するものは必ず確認する。

## このリポジトリ固有の確認事項

- ルートと `functions/` の両方で使う依存（`@line/bot-sdk`、`google-auth-library`、`@types/node`、`typescript`、`vitest` など）: `package.json` と `functions/package.json` の両方が同じ版へ更新されているか。片方だけなら調査結果で指摘する。
- `functions/package.json` の `dependencies`: Cloud Functions の実行環境（`functions/deploy.sh` の `--runtime`）で動くか。PR をマージしただけでは LINE Webhook に反映されず、`functions/deploy.sh` での再デプロイが必要になる旨を調査結果に書く。
- `@types/node`: メジャーが `.nvmrc` と `functions/deploy.sh` の `--runtime` の Node.js メジャーと一致するか。
- `.nvmrc`（Node.js）: CI の `actions/setup-node` はこのファイルを読む。`functions/deploy.sh` の `--runtime` は Renovate が更新しないので、メジャーを上げる場合は別途の変更が必要になる。
- `typescript`: `tsconfig.json` と `functions/tsconfig.json` で使っているオプションに、非推奨や削除が無いか。
- `dotenv`: `dotenv.config()` に渡している `quiet: true` が引き続き有効か（AGENTS.md の TypeScript Conventions、`test/env/dotenv_quiet.test.ts`）。実行時ログの既定が変わると、CLI の出力を読む Skill や `send_daily_line.sh` の判定が壊れる。
- `pnpm`（`packageManager`）: CI の `pnpm/action-setup` はこの値を読む。`minimumReleaseAge` や `allowBuilds` など、`pnpm-workspace.yaml` の設定に関わる既定値の変更が無いか。
- `tsx` / `esbuild` / `@esbuild/linux-x64`: `optionalDependencies` で明示している `@esbuild/linux-x64` が、更新後に `tsx` が使う `esbuild`（`pnpm-lock.yaml` で確認する）と同じ版か。ずれていれば調査結果で指摘する。

## リスクの判定

| 判定 | 基準 |
|---|---|
| 高 | 破壊的変更がこのリポジトリの使用箇所に当たる / 移行作業が必要 / ローカル検証（[verification.md](verification.md)）が失敗した |
| 中 | 破壊的変更や挙動の変更はあるが該当箇所は見当たらない / リリースノートが得られず判断しきれない / 実行時の依存（`dependencies`）の minor 以上の更新 |
| 低 | バグ修正のみで該当する懸念が無い / 開発用の依存（`devDependencies`）で、検証が通った |

Renovate PR 全体の判定は、含まれるパッケージの判定のうち最も高いものとします。`dev_bundle_renovate_prs` では、取り込む Renovate PR ごとの判定と、作成する PR 全体の判定の両方をこの方法で決めます。
