# 公開からの経過時間・functions のロック・ローカル検証

`dev_handle_renovate_pr` と `dev_bundle_renovate_prs` の両方から参照する共通の手順です。手順を変えるときは、両方のスキルから見ても成り立つかを確かめます。どちらかのスキルを廃止するときは、この `shared/` ディレクトリを残る側へ移し、参照しているリンクを書き換えます。

## 背景

Renovate の PR がこのリポジトリの CI（`pnpm install --frozen-lockfile` と `pnpm test:all`）で失敗する要因は、主に次の2つです。

- **公開からの経過時間が足りない**: pnpm は、公開から `minimumReleaseAge`（既定 1440 分）が経っていない版を拒否する。Renovate は公開直後の版で PR を作ることがあり、その場合は CI の `pnpm install --frozen-lockfile` が lockfile の検証で失敗する。時間が経てば解消するため、設定を緩めずに待つ。
- **`functions/package-lock.json` のずれ**: Cloud Functions のデプロイ（Cloud Build）は `npm ci` を使うため、`functions/` は pnpm の lockfile とは別に `functions/package-lock.json` を持つ。Renovate が更新したこのロックは `functions/package.json` と一致せず（更新した依存の実体が抜け落ちる）、CI の `pnpm check:functions-lock` が失敗する。`scripts/regenerate-functions-lock.mjs` で再生成すれば一致する。

## 公開からの経過時間

- 待つ時間は `pnpm-workspace.yaml` の `minimumReleaseAge`（分）とし、記載が無ければ 1440 分とする。
- 公開日時は `pnpm view <pkg> time --json` の `<版>` の値で確かめる。取り込める日時は、公開日時に待つ時間を足したもので、ユーザーへは日本標準時で示す。
- `pnpm install` が `minimumReleaseAge` を理由に失敗したことは、エラー文に `minimumReleaseAge` を含むこと、または `ERR_PNPM_NO_MATURE_MATCHING_VERSION` で見分ける。エラーに挙がる版は、更新した依存そのものとは限らず、推移的な依存のこともある。
- 未達を `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` への追記などで回避しない。すでに `minimumReleaseAgeExclude` に載っている版は、待たずに取り込める。
- 未達だったときの扱い（中断する、その PR を外す、など）は、呼び出し元のスキルの手順に従う。

## functions のロックを再生成する

`functions/package.json` を更新している場合だけ行います。

```sh
node scripts/regenerate-functions-lock.mjs
git status --porcelain
pnpm check:functions-lock
```

- `scripts/regenerate-functions-lock.mjs` は、pnpm 管理の `functions/node_modules` を npm に読ませないよう、一時ディレクトリで `npm install --package-lock-only` を実行してロックだけを更新する。`functions/` で `npm install` を直接実行しない。
- この再生成で変わったのが `functions/package-lock.json` だけであること。他のファイルが変わっていたら中断する。
- `pnpm check:functions-lock` が通ること。

## ローカルで検証する

```sh
pnpm install --frozen-lockfile
pnpm test:all
pnpm exec tsc --noEmit
pnpm --filter aoi-functions exec tsc --noEmit
```

- `pnpm test:all` は CI と同じ検査（共有 Skill の同期、functions のロック、ルートと functions のテスト）。型検査は CI では実行しないが、依存の型定義の変更を拾うために行う。
- 検証で追跡対象のファイルが書き換わったら（呼び出し元のスキルが意図して書き換えたファイルは除く）、その内容を調査結果に記録し、`git restore <file>` で戻す（コミットには含めない）。
- 失敗したときの扱いは、呼び出し元のスキルの手順に従う。失敗した場合、リスクの判定は「高」になる（[investigation.md](investigation.md) の「リスクの判定」）。
