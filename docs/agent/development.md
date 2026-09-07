# 開発ガイド

この文書は、開発タスクで必要になったときに読む詳細ガイドです。常時適用する短い規則は [AGENTS.md](../../AGENTS.md) を正本とします。碧衣の日次実行には適用しません。

## ディレクトリ構成

```text
lineai_aoi_profiles/
├── AGENTS.md                 # 開発・レビューの共通常時指示
├── CLAUDE.md                 # Claude Code のモード切り替え
├── README.md                 # プロジェクト概要と利用者向け説明
├── aoi.md                    # 碧衣のメインプロファイル
├── assets/                   # 画像・楽曲・綴葉のガイドと素材
├── modes/                    # 暁・望・小夜・登山・調べ・綴葉のモード定義
├── src/                      # Skill の TypeScript 実装
├── test/                     # ルート src に対するテスト
├── functions/                # LINE Webhook の Cloud Functions とテスト
├── scripts/
│   └── sync-agent-config.mjs # 共有 Skill の同期・差分検査
├── docs/
│   └── agent/
│       ├── development.md    # 本文書
│       ├── git-workflow.md   # Git・PR 運用
│       └── review-policy.md  # コードレビュー方針
├── .agents/
│   └── skills/               # 共有開発 Skill の正本
│       ├── dev_ship_change/
│       └── dev_apply_pr_review/
├── .claude/
│   ├── hooks/                # Claude Code 専用フック
│   ├── rules/                # 碧衣の常時ルール
│   ├── docs/                 # 碧衣の実行に使う補助資料
│   ├── settings.json         # Claude Code 専用設定
│   └── skills/               # 共有 Skill の生成物と Claude 専用 Skill
├── .cursor/
│   └── BUGBOT.md             # Bugbot 固有の入口
└── .github/workflows/test.yml
```

## 変更内容ごとの編集先

### プロファイルとモード

| 変更内容 | 主な編集先 |
|---|---|
| 共通フロー・モード構成 | `aoi.md` |
| キャラクター、利用者、メッセージ作法、制約 | `.claude/rules/*.md` |
| 暁・望・小夜 | `modes/morning.md`、`modes/noon.md`、`modes/night.md` |
| 入山・山小屋到着・下山 | `modes/up_mountain.md`、`modes/stay_mountain.md`、`modes/off_mountain.md` |
| 楽曲・SNS 代筆 | `modes/song.md`、`modes/scribe.md` |
| 画像生成 | `assets/image_guideline*.md` |
| 楽曲生成 | `assets/songs_guideline*.md`、`assets/songs_lyrics_samples.md` |
| 綴葉の画像 | `assets/scribe_image_guideline.md` |
| モード横断の実行手順 | `.claude/docs/*.md` |

プロファイルには現在有効な判断材料だけを書きます。移行や仕様変更の経緯は追記しません。

### Skill と TypeScript

- Claude Code 専用 Skill の定義: `.claude/skills/{skill_name}/SKILL.md`
- Claude Code と Codex が共有する開発 Skill の正本: `.agents/skills/{skill_name}/SKILL.md`
- Skill の実装: `src/{module}/`
- テスト: `test/{module}/`

共有 Skill の `.claude/skills/` 側は生成物です。正本を編集して `pnpm agent-config:sync` を実行し、`pnpm agent-config:check` で一致を確認します。

## TypeScript 実装

- 実行形式は `pnpm exec tsx src/{module}/{entry}.ts [引数]` とする。
- `src/{module}/` からリポジトリルートの `.env` を読み込む。
- 通常の CLI は失敗を標準エラーへ出し、終了コード 1 で終了する。
- `src/codex/review.ts` は日次処理の補助工程であるため、`unavailable`、`timeout`、`error` もステータスとして返し、引数不正だけを終了コード 1 とする。
- テストしたい判断ロジックは I/O から分離して export する。`main()` は直接実行時だけ呼び、import で外部処理を開始しない。
- Firestore CLI は `src/firebase/client.ts` の `initFirestore()`、`withFirestoreTimeout()`、`finishFirestoreCli()`、`handleFirestoreCliError()` を使用する。`initializeApp` を個別に書かない。

## パッケージ管理と検査

pnpm 10.x を使用します。依存追加時は `package.json` と `pnpm-lock.yaml` を同じ変更に含めます。

```text
pnpm install --frozen-lockfile
pnpm test
pnpm test:watch
pnpm test:functions
pnpm test:all
pnpm exec tsc --noEmit
```

`pnpm test:all` は共有 Skill の同期検査、ルートのテスト、`functions` のテストを実行します。テストは外部 API に接続しない純関数を中心とし、取得失敗の実例を修正するときは再現用フィクスチャを先に追加します。詳細は [test/README.md](../../test/README.md) を参照してください。

## 環境変数と秘密情報

- 必要な値と説明は `.env.example` を正本とする。
- `.env`、サービスアカウント、API キー、アクセストークンをコミットしない。
- ログと例外へ秘密情報や LINE メッセージ本文などの PII を含めない。
- Claude Code のクラウドセッションでは `.claude/hooks/session-start.sh` が `pnpm install --frozen-lockfile` を実行する。ローカルでは必要に応じて手動で依存関係を導入する。

## 一時ファイル

`tmp/` は `send_daily_line.sh` が実行ごとに掃除する、碧衣の処理専用領域です。開発中の下書きや PR 本文にはリポジトリ外のスクラッチ領域を使います。

複数行テキストを受け取る次の Skill は、シェル引数ではなく指定された `tmp/` 内のファイルを介して実行します。

- `send_line_text`、`send_line_image`、`send_line_audio`
- `generate_mureka_lyrics`、`generate_mureka_song`
- `put_firestore_doc`、`put_todoist_task`
- `generate_gpt_image`

ファイル名と引数は各 Skill の `SKILL.md` を参照してください。

## データ分離に関する実装方針

- Todoist のコメントは、碧衣宛と `【対応方針】` / `[対応方針]` で始まる開発方針を分離する。通常取得では開発方針を除外し、`dev_apply_todoist_request` だけが読む。
- 画像の `image_logs`、`image_feedback`、`image_feedback_reviews` は `notes` と別コレクションに置き、日次モードの通常コンテキストへ混ぜない。
- 楽曲の `song_logs`、`song_feedback`、`song_feedback_reviews` も専用コレクションに置く。
- スキーマとモード固有の扱いは `.claude/docs/*_schema.md` を参照する。
