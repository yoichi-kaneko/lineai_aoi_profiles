---
name: dev_ship_change
description: 開発者向け。リポジトリへの修正を、ブランチ作成から実装・コミット・push・PR作成まで一括で行う。「修正してPRまで出して」「ブランチを切って対応して」のように、変更を仕上げてPull Requestとして提出するところまで任されたときに使う。碧衣のモード実行では使用しない。
---

# dev_ship_change

リポジトリへの修正を、ブランチ作成、実装、コミット、push、PR 作成まで一続きで行う開発用 Skill です。

## 参照する正本

- Git と PR の規約: [docs/agent/git-workflow.md](../../../docs/agent/git-workflow.md)
- 実装と構成の詳細: [docs/agent/development.md](../../../docs/agent/development.md)
- 変更方針と常時指示: [AGENTS.md](../../../AGENTS.md)
- レビュー上の採否基準: [docs/agent/review-policy.md](../../../docs/agent/review-policy.md)

## 前提

- GitHub を操作できること。認証済みの `gh` が使えるなら使用し、使えなければ実行環境の GitHub 連携を使用する。
- 作業ツリーに今回と無関係な未コミット差分がないこと。

## エージェントへの指示

### 1. 作業ブランチを用意する

`git status --short` と `git branch --show-current` で状態を確認します。

- `main` にいる場合は、Git 運用文書の命名規約に従って `{type}/{topic}_{YYYYMMDD}` ブランチを作る。日付は日本標準時の当日とする。
- `main` 以外で同じ作業の続きなら、そのブランチを使う。
- 別件のブランチ、または無関係な未コミット差分がある場合は、勝手に処理せずユーザーへ確認する。

### 2. 実装する

通常の開発作業として変更を実装します。一般的なベストプラクティスとリポジトリ方針が衝突しそうな場合は、`AGENTS.md` とレビュー方針を確認します。

共有開発 Skill は `.agents/skills/` の正本だけを編集し、`pnpm agent-config:sync` で `.claude/skills/` へ反映します。構成を変更した場合は、開発ガイドに記載された構成説明も更新します。

### 3. 検査する

プロジェクトルートで `pnpm test:all` を実行します。失敗した場合は push せず、原因を修正して再実行します。今回と無関係な既存障害なら、状態をユーザーへ報告して判断を求めます。

### 4. コミットする

diff と staged diff を確認し、`.env` と `tmp/` が含まれていないことを確認します。変更を論理単位でコミットし、メッセージは Git 運用文書に従います。

### 5. push する

同じ head branch の open PR がないか確認します。検査が成功していれば、初回は `git push -u origin {branch}`、以降は `git push` を実行します。

### 6. PR を作成する

同じブランチの open PR がなければ PR を作成します。タイトルと本文は Git 運用文書に従います。

複数行の本文はリポジトリ外のスクラッチファイルへ保存し、`gh pr create --title {title} --body-file {path}` で渡します。`gh` が使えない場合は、その本文を読み取り、GitHub 連携の PR 作成操作へ渡します。

既存 PR がある場合は新しく作成せず、push だけで更新します。PR はマージしません。

### 7. 報告する

PR の URL、変更の要点、主な変更ファイル、コミットの内訳、検査結果をユーザーへ報告します。途中で止まった場合は、失敗内容と現在のブランチ・コミット・push 状態を報告します。
