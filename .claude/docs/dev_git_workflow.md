# 開発作業の Git 運用

このリポジトリで**コーディングエージェントモード**が変更を加えるときの、ブランチ・コミット・プッシュ・PR の共通規約です。
`dev_ship_change` / `dev_apply_pr_review` の各スキルは、この文書を参照して手順を実行します。

対象は開発作業のみで、碧衣の各モード（暁・望・小夜など）の実行には関係しません。

## GitHub 操作の手段（`gh` / GitHub MCP ツール）

PR の作成・参照・コメントは、実行環境によって使える手段が異なる。**`gh` が使えるなら `gh` を使い、使えなければ GitHub MCP ツール（`mcp__github__*`）で同じことを行う。**

- ターミナルのローカルセッションには `gh` がある想定
- ブラウザのクラウドセッション（Claude Code on the web）には `gh` が無く、代わりに GitHub MCP ツールが提供される

作業の冒頭で一度だけ確認する。

```bash
command -v gh >/dev/null 2>&1 && gh auth status
```

`gh` が無い、または未認証だった場合は、以降の GitHub 操作を下表のとおり読み替える。`git`（ブランチ・コミット・プッシュ）はどちらの環境でも認証済みのため、読み替えの対象外。

MCP ツールは `owner` / `repo` を引数で要求するため、リモートから取る。

```bash
git remote get-url origin
```

| 用途 | `gh` | GitHub MCP ツール |
|---|---|---|
| PR を作成する | `gh pr create --title ... --body-file ...` | `create_pull_request`（`title` / `head` / `base` / `body`） |
| ブランチの PR を探す | `gh pr list --head {ブランチ}` | `list_pull_requests`（`head` は `{owner}:{ブランチ}` 形式、`state: "open"`） |
| PR の情報を見る | `gh pr view {番号} --json ...` | `pull_request_read`（`method: "get"`） |
| レビュー本文を取る | `gh pr view {番号} --json reviews` | `pull_request_read`（`method: "get_reviews"`） |
| インラインコメントを取る | `gh api graphql`（`reviewThreads`） | `pull_request_read`（`method: "get_review_comments"`。スレッド単位で返る。`perPage` と `after` でページング） |
| 通常のコメントを取る | `gh api .../issues/{番号}/comments` | `pull_request_read`（`method: "get_comments"`） |
| PR にコメントする | `gh pr comment {番号} --body-file ...` | `add_issue_comment`（`issue_number` に PR 番号を渡す） |
| インラインへ返信する | `gh api .../comments/{databaseId}/replies` | `add_reply_to_pull_request_comment`（`commentId` は数値のコメント ID、`pullNumber` も必須） |

MCP ツールを使う場合の差分は2点。

- **本文をファイル経由で渡せない。** `body` は文字列引数のため、下書きしたファイルを読み込んで渡す（下書きをスクラッチパッドに置くこと自体は変わらない）
- **マージ系のツールは使わない。** `gh pr merge` を実行しないのと同じく、`merge_pull_request` も実行しない

## ブランチ

- `main` 上で直接作業しない。変更を始める前に必ずブランチを切る
- 命名は `{種別}/{topic}_{YYYYMMDD}` 形式

| 種別 | 用途 | 例 |
|---|---|---|
| `feature/` | 機能追加・プロファイル調整・フィードバック対応 | `feature/update_feedback_20260825` |
| `refactor/` | 挙動を変えない整理・重複解消 | `refactor/profile_dedup_20260824` |

- `{topic}` は英小文字のスネークケースで、変更の主題を短く表す
- `{YYYYMMDD}` は日本標準時（JST）の当日。POSIX TZ 形式を使う

```bash
TZ='JST-9' date +%Y%m%d
```

- 既に `main` 以外のブランチ上にいて、その作業の続きであれば新規作成せずそのまま使う

## コミット

- **1行目**: 日本語の要約。1行で変更の主題が分かるようにする（例: `暁モードの計画書取得基準と小夜モードの完了タスク分類基準を明確化`）
  - Conventional Commits のような英語プレフィックス（`feat:` / `fix:` など）は使わない
- **本文**: 変更が複数の主題にまたがる場合は番号付きで列挙し、各項目の下にインデント付き箇条書きで詳細を書く
- **トレーラー**: 末尾に実行中のモデル名で `Co-Authored-By` を付ける

```text
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- **粒度**: 論理単位で分ける。無関係な変更を1コミットに混ぜない
- **レビュー対応**: PR レビューの指摘に応じた修正は、要約を `レビュー指摘に対応` とする。何に対応したかを本文に書く

## プッシュ前の確認

- `pnpm test:all` が通ることを確認する。GitHub へプッシュすると `.github/workflows/test.yml` が同じコマンドを実行するため、ここで落ちるものは CI でも落ちる（ルートの `pnpm test` に加え `functions` のテストも含む）

```bash
pnpm test:all
```

- `.env`（Git 管理外）と `tmp/` 配下を変更に含めない
- 開発作業で一時ファイルが必要な場合、`tmp/` は使わない。`tmp/` は碧衣の各モードが使う揮発領域で `refresh_tmp.sh` に掃除されるため、スクラッチパッドなどリポジトリ外に置く

## プルリクエスト

- **タイトル**: 日本語。対応項目が複数ある場合は `（A / B / C）` のように括弧内で列挙してよい
- **本文**: `##` 見出しで対応項目ごとに区切り、それぞれ「何が問題だったか」「どう直したか」「どのファイルを触ったか」を書く
- **確認いただきたい点**: 判断が要る事柄（要望のスコープ外まで踏み込んだ箇所、別解がある箇所など）があれば、末尾に `## 確認いただきたい点` 節を設けて挙げる
- **フッター**: 末尾に以下を付ける

```text
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- 本文は複数行かつ Markdown を含むため、シェルに直接書かず**ファイル経由**で渡す（前節のとおり `tmp/` は使わない）

```bash
gh pr create --title "{タイトル}" --body-file {本文ファイルのパス}
```

- `gh` が使えない場合は `create_pull_request`（`title` / `head` / `base` / `body`）で作成する。本文はファイルに下書きしてから読み込み、`body` に渡す（前節「GitHub 操作の手段」を参照）
- マージはスカッシュせず、`Merge pull request #N from ...` のマージコミットを作る運用（マージの実行はユーザーが行う）

## ファイル構成の記載を更新する

`.claude/docs/` や `.claude/skills/`、`modes/`、`src/` にファイルを追加・削除した場合は、次の2箇所のディレクトリ構成の記載も同じコミットで更新する。

- [.claude/coding_agent.md](../coding_agent.md) の「ディレクトリ構成」
- [README.md](../../README.md) の「ファイル構成について」

## 変更方針の判断基準

「その修正を入れるべきか」の判断は、[.claude/coding_agent.md](../coding_agent.md) の「注意事項」を正とする。本文書では重複して掲げない。
