# LINE AI「碧衣（あおい）」プロファイル

## 1. はじめに

このドキュメントは、LINE AI「碧衣（あおい）」のプロファイル定義に関するリポジトリの概要を説明するものです。
各セクションの詳細は随時更新されます。

## 2. このリポジトリについて

LINE AI「碧衣」のキャラクター設定や応答プロファイルを管理するリポジトリです。
プロファイルの定義・更新・バージョン管理を行います。

## 3. 開発環境のセットアップ

ローカルでスキルを実行する場合（対話モードの `run_aoi_daily`、手動での `pnpm exec tsx` 実行など）は、プロジェクトルートで以下の手順を行ってください。

### 前提条件

- [Node.js](https://nodejs.org/)（LTS 推奨）
- [pnpm](https://pnpm.io/) 10.x（`package.json` の `packageManager` に合わせる）

### 手順

```bash
# 1. リポジトリをクローンしたらプロジェクトルートへ移動
cd lineai_aoi_profiles

# 2. npm パッケージをインストール
pnpm install

# 3. 環境変数を設定
cp .env.example .env
# .env を編集して各 API キー・認証情報を設定
```

### スキル実行時の注意

- 処理の実装は `src/` 配下にあり、依存パッケージ（`cheerio` など）はルートの `package.json` で一元管理しています。
- `.claude/skills/`（または `~/.claude/skills/` にリンクされたスキル）には `SKILL.md` のみが置かれ、`node_modules` は含まれません。**コマンドは必ずプロジェクトルートから** `pnpm exec tsx src/...` の形式で実行してください。
- `random_choice` は通常は等確率で抽選します。選択肢ごとの重みを指定する場合のみ、`--weighted` と `選択肢:重み` 形式を使用します（詳細は [random_choice](.claude/skills/random_choice/SKILL.md)）。
- YAMAP の計画書・活動記録の取得（`fetch_yamap_plan` / `fetch_yamap_activity`）は、DOM のクラス名を辿るスクレイピングではなく、ページに埋め込まれたデータ（Next.js の `__NEXT_DATA__` JSON）を読み取る方式です（`cheerio` はその埋め込み JSON の取り出しにのみ使用）。いずれも素の HTTP GET でページを取得し、ブラウザによるレンダリングは行いません（ネットワーク接続のみ必要）。活動記録の読み解き方は[ガイド](.claude/docs/yamap_activity_guide.md)を参照してください。

### 自動テスト

`src/` の純関数（ネットワークへ出ない処理）に対するテストを `test/` 配下に置き、vitest で実行します。

```bash
pnpm test        # 全テストを実行する
pnpm test:watch  # ウォッチ実行
```

GitHub へプッシュすると、`.github/workflows/test.yml` が同じ `pnpm test:all` を実行します（`workflow_dispatch` で手動実行も可能）。テストはいずれも外部 API へ接続しないため、CI 側にシークレット（`.env`）の設定は不要です。対象範囲とフィクスチャの追加手順は [test/README.md](test/README.md) を参照してください。

## 4. アクティビティ駆動フレームワークについて

碧衣の設計は、以下の2層で捉えると理解しやすくなります。

| レイヤー | 呼称 | 説明 |
|---|---|---|
| 上位（運用目的） | 登山アシスタント AI | 登山計画・登山中・下山後のサポートを通じて、ユーザーの山行体験を支える |
| 下位（根本の設計思想） | アクティビティ駆動フレームワーク | ユーザーのスケジュールや行動履歴といった「アクティビティ情報」を収集・解析し、それに基づいてアクションを行う仕組み |

このセクションでは、下位レイヤーである「アクティビティ駆動フレームワーク（Activity-Driven Framework）」について説明します。

### 名称の意図

| 用語 | 意味するところ |
|---|---|
| アクティビティ | YAMAP の活動記録に限らず、Swarm のチェックイン、Google カレンダーの予定、Todoist のタスクなど「人間の活動全般」を対象に含めることを表す |
| 駆動（Driven） | 受け身のチャットボットではなく、一日の時間軸やイベントの発生（登山開始・下山など）をトリガーに自律的に動作することを表す |
| フレームワーク | データ収集 → 解析 → 出力（テキスト・画像・音楽）という一連のプロセスを、単一機能ではなく統合された「仕組み」として備えていることを表す |

### 特徴

- 複数のサードパーティサービス（Google Calendar / Todoist / Swarm / YAMAP / OpenWeatherMap など）を横断的に集約する
- 集約した情報を、人格（ペルソナ）を持ったエージェントが解釈し、メッセージ・画像・楽曲として還元する
- Firestore を用いてモード間で情報を引き継ぎ、前日の夜から翌朝への日跨ぎ引き継ぎ（`night_handover`）を含め、ユーザーの移動距離や予定の性質から「明日の重要度」を判定するなど、生活に密着した動的なコンテキスト解析を行う
- 上記のプロセス全体を、自律的なプロンプトフローとして実行する

## 5. ファイル構成について

```
lineai_aoi_profiles/
├── CLAUDE.md              # エージェントのモード切り替え定義
├── README.md              # 本ファイル
├── aoi.md                 # 碧衣のプロファイル定義
├── package.json           # pnpm パッケージ管理（ルート）
├── send_daily_line.sh     # 碧衣の送信処理を実行するスクリプト
├── refresh_tmp.sh         # tmp/ ディレクトリのクリーンアップスクリプト
├── modes/                 # モード別設定（morning / noon / night / up_mountain / stay_mountain / off_mountain / song / scribe）
├── assets/                # 画像素材・生成ガイドライン（画像／山行構図／SNS投稿画像／楽曲）
├── src/                   # 各スキルの処理実装
│   ├── cloudinary/        # Cloudinary 画像・音声アップロード
│   ├── firebase/          # Firebase / Firestore アクセス
│   ├── gemini/            # Google Gemini 画像生成
│   ├── google_calendar/   # Google Calendar 予定取得・OAuth認証
│   ├── google_drive/      # Google Drive ファイルダウンロード・OAuth認証
│   ├── google_map/        # Google Maps API（ジオコーディング）
│   ├── image/             # 画像へのQRコード埋め込み（ローカル画像処理）
│   ├── line/              # LINE メッセージ送信・画像ダウンロード
│   ├── mureka/            # Mureka 楽曲・歌詞生成
│   ├── openai/            # OpenAI GPT 画像生成
│   ├── openweather/       # OpenWeatherMap 天気予報取得
│   ├── swarm/             # Swarm チェックイン取得
│   ├── todoist/           # Todoist タスク操作
│   ├── util/              # 汎用ユーティリティ
│   └── yamap/             # YAMAP 計画書・活動記録の取得（埋め込み JSON のパース）
├── test/                  # ルート src/ に対する vitest のテスト（詳細は test/README.md）
├── tmp/                   # 一時ファイル置き場（画像・音声など）
├── functions/             # Google Cloud Functions コード
│   └── src/
│       ├── index.ts             # Cloud Functions エントリポイント
│       ├── lib/                 # Cloud Functions 共通処理
│       └── receiveLineMessage/  # LINE Webhook 受信・Firestore 保存・登山/下山トリガー
├── .github/
│   └── workflows/
│       └── test.yml      # プッシュ時に pnpm test:all を実行する GitHub Actions
└── .claude/
    ├── coding_agent.md    # コーディングエージェントモードのガイドライン
    ├── rules/             # 常時適用ルール（aoi.md から @import で参照される）
    │   ├── aoi_character.md    # エージェントの指針・伴侶の妖精ルリ
    │   ├── aoi_user_profile.md # ユーザーに関する基本情報
    │   ├── aoi_messaging.md    # 個人宛・家族グループ宛のメッセージ作法
    │   └── aoi_constraints.md  # 注意事項（口調など）
    ├── docs/              # 補助ドキュメント（Firestore スキーマ・退避運用・モード横断の判断手順・開発の Git 運用）
    │   ├── dev_git_workflow.md       # 開発作業のブランチ・コミット・PR 規約（開発者向け）
    │   ├── image_log_schema.md       # image_logs（画像生成ログ）のスキーマ・モード別の値
    │   ├── image_feedback_schema.md  # image_feedback（画像フィードバック）のスキーマ・パース仕様
    │   ├── song_log_schema.md        # song_logs（楽曲生成ログ）のスキーマ
    │   ├── song_feedback_schema.md   # song_feedback（楽曲フィードバック）のスキーマ・パース仕様
    │   ├── line_send_fallback.md     # LINE 送信失敗時の Firestore 退避
    │   ├── long_sleep_execution.md   # 長時間 sleep の実行方法
    │   ├── mountain_notice_guide.md  # 山行連絡モード（継灯・帰灯）の共通手順
    │   ├── night_image_theme.md      # 小夜モードの画像テーマ抽選
    │   ├── song_from_aoi_extract.md  # 調べモードの from_aoi 抽出手順
    │   └── yamap_activity_guide.md   # YAMAP 活動記録レポートの重点チェックガイド
    └── skills/            # Claude スキル定義（SKILL.md のみ、処理実装は src/ 配下）
```

## 6. 実行モードについて

碧衣は、日次の定期モードと登山・創作に関する特別モードを持ちます。各モードの詳細手順は `modes/*.md` に記載されています。

| モード名 | 入力トリガー形式 | 主な役割 |
|---|---|---|
| 暁（あかつき） | `daily message (暁): YYYY-MM-DD` | 前日の振り返り（`night_handover`）、朝の予定確認、タスク整理、天気予報の取得、一日の出発を導く |
| 望（のぞみ） | `daily message (望): YYYY-MM-DD` | 近日の登山計画や下山記録を踏まえ、昼の状況に合う短い言葉を届ける |
| 小夜（さよ） | `daily message (小夜): YYYY-MM-DD` | 一日の振り返り、完了タスク、行動記録をもとに夜の報告と画像を生成し、綴葉の `scribe_handover` がある場合はそれを「登山レポートへの想い」の素材にする（レポート自体は再読しない）。翌朝の暁へ `night_handover` で引き継ぐ。画像を生成した場合は構図・情景を `image_logs` に1件記録する |
| 門灯（もんとう） | LINE `登山開始...` → `up_mountain` | 入山直前に家族LINEグループへ登山開始を通知し、Firestore に `type: up_mountain` の記録を残す |
| 継灯（けいとう） | LINE `山小屋...` → `stay_mountain` | 宿泊を伴う山行でその日の宿泊地（山小屋）に到着した際、家族LINEグループへその日の行動終了を通知し、Firestore に `type: stay_mountain` の記録を残す。まだ下山はしておらず翌日も山行が続く。ユーザー個人への送信・画像生成は行わない（この日の画像は小夜モードが通常どおり生成する） |
| 帰灯（きとう） | LINE `下山...` / `無事下山...` → `off_mountain` | 下山直後に山行を振り返り、画像をユーザーと家族グループへ送り、家族向け下山報告とユーザー向け報告を送信する。送信画像は `image_logs` に1件記録する |
| 調べ（しらべ） | `daily message (調べ): YYYY-MM-DD` | 1週間の出来事・場所・天気から歌詞と楽曲を生成し、LINEへ届ける。フェーズA完了時に生成内容を `song_logs` に記録し、次回以降の重複回避に使う |
| 綴葉（つづりは） | `run_aoi_scribe`（手動起動） | ユーザーが綴った YAMAP 登山レポートを碧衣が読み解き、SNS（Twitter/X）へ**代筆投稿**する。投稿に添えるレポート画像には、レポートURLのQRコードを後付けで埋め込む。`run_aoi_scribe` スキル経由の手動起動のみで、自動トリガーはない。同日の小夜モードの前に実行する想定で、碧衣→ユーザー視点の感想を `scribe_handover` として小夜へ引き継ぐ（小夜モードが担っていたYAMAPレポート読解は本モードへ移設） |

`send_daily_line.sh` は `morning` / `noon` / `night` / `up_mountain` / `stay_mountain` / `off_mountain` / `song` の各モードを受け取り、対応するトリガーキーで碧衣を起動します。`morning` / `noon` / `night` については実行前に Firestore の `run_logs` コレクションを確認し、当日分が実行済みの場合はスキップします（二重送信防止）。登山開始・山小屋到着・下山の即時連絡は、LINE Webhook を受けた Cloud Functions が AWS SSM 経由で EC2 上の `send_daily_line.sh` を該当モード付きで起動します。

`scribe`（綴葉）モードは `send_daily_line.sh` の対象外で、自動トリガーを持ちません。実行は `run_aoi_scribe` スキル（対話モードでの手動起動）経由のみです。

対話モードでの起動には `run_aoi_daily` スキルを使用します。スキルは現在の日本標準時（JST）からモードを自動判定し、`aoi.md` の該当フローを現在のセッション内で実行します。綴葉（`scribe`）モードは時間帯自動判定の対象外のため、専用の `run_aoi_scribe` スキル（モードは `scribe` 固定）で手動起動します。

## 7. 連携しているサービスについて

外部サービスへのアクセスは、Fetch MCP Server を除きすべて Claude スキルを通じて行います。

### LINE Messaging API

| 項目 | 内容 |
|------|------|
| サービス名 | LINE Messaging API |
| 役割 | 碧衣からユーザーまたは家族グループへのメッセージ・画像・音声送信、ユーザーから受信したテキスト・画像の Webhook 取り込み、および画像ダウンロードを担う |
| サービスURL | https://developers.line.biz/ja/services/messaging-api/ |
| スキル | `send_line_text` / `send_line_image` / `send_line_audio` / `download_line_image` |
| 送信仕様 | Push Message の `messages` に最大5件まで同梱可能。[`send_line_image`](.claude/skills/send_line_image/SKILL.md) / [`send_line_audio`](.claude/skills/send_line_audio/SKILL.md) はメディア→テキストの順で**1リクエスト**にまとめて送信。[`send_line_text`](.claude/skills/send_line_text/SKILL.md) はテキスト単独送信用 |
| 送信先指定 | `send_line_*` は `--destination user\|group\|both` に対応。`group` / `both` では `LINE_DESTINATION_GROUP_ID` を使用 |
| 送信失敗時 | Push 失敗（429・クオータ等）時は [LINE 送信失敗時の Firestore 退避](.claude/docs/line_send_fallback.md) に従い `put_firestore_doc` で `type: line_undelivered` に退避 |

### Google Calendar API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Calendar API |
| 役割 | ユーザーのスケジュールを読み込み、メッセージ構築のための情報収集の中核を担う |
| サービスURL | https://developers.google.com/workspace/calendar/api/guides/overview?hl=ja/ |
| スキル | `get_google_calendar_events` → [SKILL.md](.claude/skills/get_google_calendar_events/SKILL.md) |

### Google Drive API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Drive API |
| 役割 | Google Calendar の予定に添付されたファイルを取得する |
| サービスURL | https://developers.google.com/workspace/drive/api/guides/overview?hl=ja |
| スキル | `download_google_drive_file` → [SKILL.md](.claude/skills/download_google_drive_file/SKILL.md) |

### Todoist API

| 項目 | 内容 |
|------|------|
| サービス名 | Todoist API |
| 役割 | ユーザーの TODO タスクの読み込み・作成・コメント取得を担う |
| サービスURL | https://developer.todoist.com/api/v1/ |
| スキル | `get_todoist_tasks` / `get_todoist_completed_tasks` / `get_todoist_comments` / `put_todoist_task` / `download_todoist_attachment` |

### Google Maps API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Maps API |
| 役割 | 住所・地点名を座標に変換するジオコーディングを担う。`get_openweather_forecast` スキル内で内部的に使用される |
| サービスURL | https://developers.google.com/maps?hl=ja |
| 実装 | `src/google_map/geocode.ts`（スキルから直接呼び出し） |

### OpenWeatherMap API

| 項目 | 内容 |
|------|------|
| サービス名 | OpenWeatherMap API |
| 役割 | 地点名・住所から天気予報を取得し、メッセージ構築のための情報収集を担う |
| サービスURL | https://openweathermap.org/api |
| スキル | `get_openweather_forecast` → [SKILL.md](.claude/skills/get_openweather_forecast/SKILL.md) |

### Swarm API

| 項目 | 内容 |
|------|------|
| サービス名 | Swarm API |
| 役割 | ユーザーの行動履歴（チェックイン履歴）を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://location.foursquare.com/developer/ |
| スキル | `get_swarm_checkins` → [SKILL.md](.claude/skills/get_swarm_checkins/SKILL.md) |

### YAMAP

| 項目 | 内容 |
|------|------|
| サービス名 | YAMAP |
| 役割 | ユーザーの登山計画・活動記録を読み込み、メッセージ構築のための情報収集を担う |
| サービスURL | https://yamap.com/ |
| スキル | `fetch_yamap_plan`（山行計画ページの埋め込み計画データを取得）／`fetch_yamap_activity`（活動記録ページの埋め込み記録データを取得。本文・活動データ・チェックポイントを整形して返す。[ガイド](.claude/docs/yamap_activity_guide.md)） |

### Firebase / Firestore

| 項目 | 内容 |
|------|------|
| サービス名 | Firebase / Firestore |
| 役割 | ユーザーから碧衣へのメモ・LINEメッセージ、モード間の引き継ぎ記録を保存・取得するデータストアとして機能する。Cloud Functions 経由での書き込みと、スキルを通じた読み書きを行う |
| サービスURL | https://firebase.google.com/docs/firestore?hl=ja |
| スキル | `get_firestore_docs` / `put_firestore_doc` / `review_image_feedback`（画像フィードバックの定期レビュー） / `review_song_feedback`（楽曲フィードバックの定期レビュー） |
| `type` 定義 | `notes` コレクションの `type` は `src/firebase/noteTypes.ts` の `NOTE_TYPE` を正とする（日跨ぎ引き継ぎは `night_handover`）。専用コレクション（`image_logs` / `song_logs` 等）の `type` はコレクション内識別用の別系統 |
| 取得仕様 | `get_firestore_docs` は `dateFrom` / `dateTo` による日付範囲指定で取得する。`--collection` オプションで `notes` 以外の専用コレクション（`image_logs` / `song_logs` 等）も読み書きできる（デフォルトは `notes` で後方互換。`notes` 以外は `NOTE_TYPE` 検証をバイパス） |
| 絞り込み | `get_firestore_docs` の `--type "line_text,line_image"`（繰り返し指定も可）で `type` を絞り込める。数日以上の範囲を取得すると長文の引き継ぎ記録（`from_aoi` / `night_handover` / `up_mountain` 等）でレスポンスが読み込めない大きさになるため、使う `type` が決まっている処理では絞って取得する（調べモードは `line_text` / `line_image` / `from_aoi` に固定）。`date` 範囲との併用で複合インデックスが要らないよう、絞り込みは取得後にクライアント側で行う |
| Cloud Functions | `functions/src/receiveLineMessage/`（LINE Webhook 受信 → Firestore 保存 → 必要に応じて EC2 コマンド実行） |
| LINE受信トリガー | ユーザーからの `登山開始` は `up_mountain`、`山小屋` は `stay_mountain`、`下山` / `無事下山` は `off_mountain` として扱い、Firestore 保存後に EC2 コマンドを実行する。`評価` / `傾向` で始まる返信は画像フィードバックとして `image_feedback` コレクションへ、`楽曲評価` / `音楽評価` で始まる返信は楽曲フィードバックとして `song_feedback` コレクションへ振り分け、いずれも `line_text` には保存せず EC2 トリガーも発火させない（[image_feedback_schema.md](.claude/docs/image_feedback_schema.md) / [song_feedback_schema.md](.claude/docs/song_feedback_schema.md)） |
| `line_undelivered` | LINE Push 失敗時に碧衣発の送信予定本文（および必要ならメディア URL）を退避する type。詳細は [line_send_fallback.md](.claude/docs/line_send_fallback.md) |
| `run_logs` コレクション | `morning` / `noon` / `night` の各モード実行後に保存されるログ。`date`（Timestamp）・`mode`（string）・`createdAt`（Timestamp）の3フィールドを持つ。`send_daily_line.sh` 実行時に `src/firebase/has_log.ts` で参照し、当日分が存在する場合はスキップする（二重実行防止）。実行後は headless では `send_daily_line.sh` が `src/firebase/put_log.ts` を、対話モードでは `run_aoi_daily` スキルが同スクリプトを呼んで書き込む。綴葉（`scribe`）モードも `run_aoi_scribe` スキル完了時に記録するが、手動起動のため `send_daily_line.sh` の二重実行チェックの対象ではない。許可される `mode` 値は `src/firebase/runLogModes.ts` の `RUN_LOG_MODE` を正とする |
| `image_logs` コレクション | 小夜・帰灯モードが画像生成直後に1枚=1ドキュメント記録する専用コレクション（`type: image_log`）。構図・情景の偏り検知の客観的土台で、日々の各モードのコンテキストには流入させず `review_image_feedback`（柱C）でのみ参照する。形状は [image_log_schema.md](.claude/docs/image_log_schema.md) を正とする |
| `song_logs` コレクション | 調べモードのフェーズA完了時に1曲=1ドキュメント記録する専用コレクション（`type: song_log`）。タイトル・スタイルパッケージ・ジャンル・タグ・テーマ要約・歌詞全文・Mureka task_id を保存し、次回以降の調べモードで直近2〜3件を参照して曲調や主要モチーフの重複を避けるほか、`review_song_feedback` の傾向集計の土台になる。形状は [song_log_schema.md](.claude/docs/song_log_schema.md) を正とする |
| `image_feedback` コレクション | ユーザーが LINE 返信（`評価` / `傾向`）で寄せた画像フィードバックを `receiveLineMessage` Webhook が振り分けて保存する専用コレクション（`type: image_feedback`）。形状・パース仕様は [image_feedback_schema.md](.claude/docs/image_feedback_schema.md) を正とする |
| `song_feedback` コレクション | ユーザーが LINE 返信（`楽曲評価` / `音楽評価`）で寄せた楽曲フィードバックを `receiveLineMessage` Webhook が振り分けて保存する専用コレクション（`type: song_feedback`）。画像側と異なり傾向フィードバックは持たない（個別評価のみ）。形状・パース仕様は [song_feedback_schema.md](.claude/docs/song_feedback_schema.md) を正とする |
| `image_feedback_reviews` コレクション | `review_image_feedback`（柱C）が1〜3週間サイクルのレビュー完了時に記録する区切りマーカー（`type: review_marker`）。`period_from` / `period_to` 等を保持し、次サイクルの起点（dateFrom）に使う |
| `song_feedback_reviews` コレクション | `review_song_feedback` が月次サイクルのレビュー完了時に記録する区切りマーカー（`type: review_marker`）。`period_from` / `period_to` 等を保持し、次サイクルの起点（dateFrom）に使う |

#### 画像生成フィードバック・サイクル（image_logs / image_feedback）

碧衣の画像生成（小夜・帰灯）を継続的に改善するため、次の3本柱で「生成ログの蓄積 → フィードバック収集 → 定期レビュー」を回します。いずれも専用コレクションに隔離し、日々のモードのコンテキストへは流入させません（混入すると小夜モードがフィードバック文を「ユーザーの言葉」として誤取込する副作用が出るため）。

1. **柱A：`image_logs`** — 画像生成直後に構図・情景・衣装などを1件記録し、「似た構図が続いていないか」を主観でなく集計で測る客観的土台にする（[image_log_schema.md](.claude/docs/image_log_schema.md)）。
2. **柱B：`image_feedback`** — ユーザーが画像の届いたチャットへ `評価 <1-5> <コメント>` / `傾向 <コメント>` で返信すると、`receiveLineMessage` Webhook が振り分けて保存する（[image_feedback_schema.md](.claude/docs/image_feedback_schema.md)）。
3. **柱C：`review_image_feedback` スキル** — 1〜3週間サイクルでユーザーが手動起動。個別評価の集約と構図ログの偏り集計を行い、`assets/image_guideline.md`（核＝不変層／彩り＝可変層の2層構成）への修正案を human-in-the-loop で提示・反映する。レビューの区切りは `image_feedback_reviews` に記録し、次サイクルの起点とする。

「安定した生成を維持したい」「ガイドラインに縛られず自由に生成したい」という相反する要望は、ガイドラインを**核（安定・変更は慎重）／彩り（意図的に多様化）**の2層に分けることで、別層の指摘として両立させます。

#### 楽曲フィードバック・サイクル（song_logs / song_feedback）

碧衣の楽曲生成（調べ）についても、画像側と同じ3本柱の仕組みを回します（issue #71）。

1. **柱A：`song_logs`** — 調べモードのフェーズA完了時に曲調・題材などを1件記録する（[song_log_schema.md](.claude/docs/song_log_schema.md)）。
2. **柱B：`song_feedback`** — ユーザーが `楽曲評価 <1-5> <コメント>`（`音楽評価` も同義）で返信すると、`receiveLineMessage` Webhook が振り分けて保存する。画像側と異なり傾向フィードバックは設けない（[song_feedback_schema.md](.claude/docs/song_feedback_schema.md)）。
3. **柱C：`review_song_feedback` スキル** — 月次サイクルでユーザーが手動起動。個別評価の集約とパッケージ・題材の傾向集計を行い、`assets/songs_guideline.md` への修正案を human-in-the-loop で提示・反映する。レビューの区切りは `song_feedback_reviews` に記録し、次サイクルの起点とする。

### AWS Systems Manager

| 項目 | 内容 |
|------|------|
| サービス名 | AWS Systems Manager |
| 役割 | Cloud Functions から EC2 上の処理を起動するため、SSM 経由でコマンドを送信する。`EC2_COMMAND_TEMPLATE` の `{MODE}` を `up_mountain` / `off_mountain` に置換して実行する |
| サービスURL | https://aws.amazon.com/systems-manager/ |
| 実装 | `functions/src/lib/execEc2Command.ts` |
| デプロイ関連 | `functions/deploy.sh` と `functions/README.md` に環境変数・Secrets・デプロイ手順を記載 |

### Google Gemini API

| 項目 | 内容 |
|------|------|
| サービス名 | Google Gemini API |
| 役割 | 碧衣のキャラクターに合わせた画像を生成する |
| サービスURL | https://ai.google.dev/ |
| スキル | `generate_gemini_image` → [SKILL.md](.claude/skills/generate_gemini_image/SKILL.md) |

備考: 現在 `generate_gemini_image` は非推奨です（原則 `generate_gpt_image` を使用）。

### OpenAI ChatGPT API

| 項目 | 内容 |
|------|------|
| サービス名 | OpenAI ChatGPT API |
| 役割 | 碧衣のキャラクターに合わせた画像を生成する |
| サービスURL | https://platform.openai.com |
| スキル | `generate_gpt_image` → [SKILL.md](.claude/skills/generate_gpt_image/SKILL.md) |

### Cloudinary

| 項目 | 内容 |
|------|------|
| サービス名 | Cloudinary |
| 役割 | LINE への画像・音声メッセージ送信に際し、ファイルを公開URLとしてホスティングするために使用される |
| サービスURL | https://cloudinary.com/ |
| 利用スキル | `send_line_image` / `send_line_audio`（アップロード後、LINEへメディア+テキストを同梱送信） |

### Mureka API

| 項目 | 内容 |
|------|------|
| サービス名 | Mureka API |
| 役割 | 碧衣がユーザーへ送る楽曲・歌詞の生成を担う |
| サービスURL | https://www.mureka.ai/ |
| スキル | `generate_mureka_lyrics` / `generate_mureka_song` / `download_mureka_song` |

### Fetch MCP Server

| 項目 | 内容 |
|------|------|
| サービス名 | Fetch MCP Server |
| 役割 | Web ページを取得する MCP ツール。Claude 標準の fetch よりも性能が高いため導入 |
| MCP サーバー | https://github.com/modelcontextprotocol/servers/tree/main/src/fetch |

## 8. 二重実行防止・タイムアウト・リトライについて

### 設計方針（同時実行・複数回実行）

本プロジェクトは個人利用のスケジュール起動が中心であり、同時実行や意図しない複数回実行は運用上ほぼ起きない前提で設計しています。そのため、原子的な実行予約・分散ロック・idempotency key・明示的な再実行フラグによるガードなど、システムとしての厳密な同時実行・重複実行防止機構は**導入予定がありません**。

レビューや一般的なベストプラクティスを理由に、そうした機構の追加を求めないでください。対策が必要な場合は運用（手動起動の抑制・スケジュールの見直し）で扱います。

### 二重実行防止（run_logs チェック）

現状の対策は次のベストエフォートのみです。

- `send_daily_line.sh` は `morning` / `noon` / `night` の実行前に Firestore の `run_logs` コレクションを参照し、当日の同モードの実行ログが存在する場合は Claude の起動をスキップして終了します。これにより、定期実行の重複や再起動によるメッセージの二重送信を抑えます
- 同スクリプトは Claude が正常終了（exit 0）したあとに `src/firebase/put_log.ts` で当日分の実行ログを書き込みます。この書き込みが無いと上記の実行前チェックが機能しないため、両者は対で扱ってください（記録に失敗しても警告のみで処理は成功扱いとします）
- 綴葉（`scribe`）など手動起動モードは、この実行前チェックの対象外です。同一日付の再実行による二重投稿・二重送信の回避は運用者の判断に委ねます
- `run_logs` への書き込みは処理完了後の記録であり、排他制御や原子的予約の代替ではありません

`run_aoi_daily` / `run_aoi_scribe` スキルを対話モードから実行した場合も、モード処理完了後に `run_logs` へログを書き込みます（ただし実行前チェックはスキップします）。

### タイムアウト・リトライ

タイムアウトは3つの層に分かれています。内側の層ほど短く、外側の層は最後の砦として働きます。

#### 層1: シェル（`send_daily_line.sh`）

APIやMCPサーバーの無応答によるハングアップを防ぐため、Claude の起動を `timeout` で包んでいます。

| 項目 | 値 |
|---|---|
| タイムアウト（通常モード） | 1800秒（30分） |
| タイムアウト（調べモード フェーズA / フェーズB） | 1800秒 / 900秒 |
| 最大リトライ回数 | 2回（初回含む） |
| リトライ間隔 | 30秒 |

#### 層2: Bash ツール（`.claude/settings.json`）

Claude 内部の各コマンド実行の上限です。既定の120秒では画像生成や楽曲生成が収まらずバックグラウンドへ回されるため、`env` で引き上げています。

| 環境変数 | 値 | 意味 |
|---|---|---|
| `BASH_DEFAULT_TIMEOUT_MS` | 300000（5分） | 明示指定がない場合の上限 |
| `BASH_MAX_TIMEOUT_MS` | 600000（10分） | 明示指定できる上限 |

#### 層3: CLI 自身（Firestore のみ）

Firestore は他の連携先（Todoist / Swarm / Calendar 等の REST）と異なり gRPC で接続するため、接続が詰まると google-gax が指数バックオフで再試行し続け、クライアント側に期限がありません。上位任せにすると「結果不明のまま宙ぶらりん」になるので、`src/firebase/client.ts` で明示的に打ち切ります。

| 項目 | 値 |
|---|---|
| タイムアウト | 30000ms（`FIRESTORE_TIMEOUT_MS` で上書き可） |
| 終了コード | `124`（`timeout(1)` の慣習に合わせる） |

打ち切りは「待つのをやめる」だけでサーバ側の処理をキャンセルしないため、書き込み系のタイムアウトは**失敗ではなく結果不明**として扱う必要があります。標準エラーにその旨を出力します。

#### プロンプト層のグレースフルデグレード

Claude プロンプト層でも degradation を定義しています（[aoi_constraints.md](.claude/rules/aoi_constraints.md) 参照）。
ツール呼び出しが失敗した場合は1回だけ再試行し、それでも失敗した場合はそのステップをスキップして処理を継続します。
ただし**タイムアウトは「失敗」ではなく「結果不明」**として別扱いとし、書き込み・送信系は確認なしに再実行しません。

### 対応する障害パターン

| 障害パターン | 対策 |
|---|---|
| ツールが応答を返さず無限待ち（真のハング） | シェルレベルの `timeout` で強制終了 → リトライ |
| ツールがエラーを返す（APIエラー、認証失敗など） | Claudeルールに基づきスキップして続行 |
| 一時的な障害（API瞬断など） | シェルリトライ + Claudeルールによるスキップ |
| Firestore（gRPC）の接続が詰まる | CLI 自身が30秒で打ち切り、終了コード `124` で結果不明を明示 |
| コマンドがBashツールの時間切れでバックグラウンドへ回される | 完了を確認してからターンを終える。書き込み・送信は再実行しない（[aoi_constraints.md](.claude/rules/aoi_constraints.md) / [long_sleep_execution.md](.claude/docs/long_sleep_execution.md)） |

## 9. ライセンスについて

本プロジェクトは MIT License のもとで公開されています。

```
MIT License

Copyright (c) 2026 kaneko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
