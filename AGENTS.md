# AGENTS.md

このファイルは、このリポジトリで開発・コードレビューを行うエージェントが共有する常時指示です。碧衣の日次実行では使用せず、`CLAUDE.md` のモード判定に従って `aoi.md` を読みます。

## Project Overview

LINE AI アシスタント「碧衣（あおい）」のプロファイル、実行 Skill、外部 API クライアント、LINE Webhook を管理するリポジトリです。

- `aoi.md`、`modes/`、`.claude/rules/`、`assets/`: 碧衣のプロファイルと生成ガイドライン
- `.agents/skills/`: Claude Code と Codex が共有する開発 Skill の正本
- `.claude/skills/`: Claude Code が利用する Skill。共有開発 Skillは自動生成、日次実行 Skill はここで直接管理
- `src/`: 外部 API クライアントなどの TypeScript 実装
- `send_daily_line.sh` / `refresh_tmp.sh`: 碧衣のモードを起動する runner と、作業領域 `tmp/` の掃除
- `functions/`: LINE Webhook を受ける Firebase Cloud Functions
- `docs/agent/`: 開発・Git 運用・レビューの詳細規則

## Basic Commands

プロジェクトルートで実行します。パッケージ管理には pnpm 10.x を使用します。

```text
pnpm install --frozen-lockfile   依存関係をロックファイルどおりに導入
pnpm test                        ルートのテスト
pnpm test:functions              Cloud Functions のテスト
pnpm test:all                    Agent 設定の同期検査を含む全テスト
pnpm exec tsc --noEmit           ルート TypeScript の静的検査
pnpm agent-config:sync           共有 Skill を Claude Code 向けに同期
pnpm agent-config:check          共有 Skill と生成物の差分検査
```

## Working Rules

- 変更前に `git status --short` と現在のブランチを確認する。無関係な既存差分は変更・破棄・コミットしない。
- `main` に直接変更や push をせず、作業ブランチを使う。
- `.env` は読み取りが必要な場合を除き触らず、絶対にコミットしない。秘密情報や PII をソース、ログ、エラーへ出さない。
- `tmp/` は碧衣の実行専用の揮発領域であり、開発用ファイルや PR 本文を置かず、コミットしない。固定名の一時ファイルが実行間で衝突しないよう、`send_daily_line.sh` は `tmp/.runner.lock` の `flock` で実行を直列化する。ドット始まりのファイルは `refresh_tmp.sh` の掃除対象外とする。
- 共有開発 Skill は `.agents/skills/` だけを編集し、変更後に `pnpm agent-config:sync` を実行する。対応する `.claude/skills/` は直接編集しない。
- `.claude/docs/`、`.claude/skills/`、`.agents/skills/`、`docs/agent/`、`modes/`、`src/` の構成を変えたら、このファイルと `README.md` の構成説明も更新する。

## TypeScript Conventions

- CLI はプロジェクトルートから `pnpm exec tsx src/{module}/{entry}.ts [args]` で実行できるようにする。
- 環境変数は `dotenv` でリポジトリルートの `.env` から読み込む。
- 通常の CLI は失敗時に `console.error` と終了コード 1 を使う。`src/codex/review.ts` は補助工程のため、引数不正以外をステータス付きの正常終了として扱う。
- テスト対象の判断ロジックは副作用から分離して export し、CLI の `main()` は直接実行時だけ呼ぶ。テストは `test/` に置く。
- Firestore CLI は `src/firebase/client.ts` の初期化、タイムアウト、終了、エラー処理を再利用し、個別に `initializeApp` を呼ばない。
- JSON 形式の資格情報は `src/util/credentials.ts` の `loadJsonCredential()` で読み、パスを直接読み込まない。Google OAuth では `src/util/google_oauth.ts` の共通処理も使う。

## Explicit Non-Goals

- 原子的な実行予約、分散ロック、idempotency key、再実行フラグなど、厳密な重複実行防止機構は既定では提案・導入しない。
- プロファイル文書へ仕様変更や移設の経緯を書かない。現在有効な規則だけを記載し、経緯は Issue と Git 履歴に残す。

## Code Review Rules

- `src/**/*.ts`: シークレット、外部 API レスポンスの検証、例外処理、型の整合性を重点確認する。
- `functions/**/*.ts`: LINE 署名検証、入力検証、例外処理、PII・シークレットのログ漏洩を重点確認する。
- `**/*.md`: 相対リンク、プロファイル間の矛盾、キャラクター・用語の整合性を確認する。
- `**/*.sh`: クォート、変数展開、異常終了時の挙動を確認する。
- 前節の Explicit Non-Goals に反する一般論だけの提案は行わない。

レビューの対象外、採否基準、パス別の詳細は [docs/agent/review-policy.md](docs/agent/review-policy.md) を読みます。

## Read Details When Needed

- 実装場所、ディレクトリ構成、環境変数、テスト規約: [docs/agent/development.md](docs/agent/development.md)
- ブランチ、コミット、テスト、push、PR: [docs/agent/git-workflow.md](docs/agent/git-workflow.md)
- レビューの対象、重点観点、指摘の採否: [docs/agent/review-policy.md](docs/agent/review-policy.md)
