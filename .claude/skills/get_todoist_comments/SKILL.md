---
name: get_todoist_comments
description: 指定したタスクのTodoistコメントを取得する。引数はタスクID、またはタスクURL（https://app.todoist.com/app/task/... 形式）。開発上の対応方針コメント（【対応方針】で始まるもの）は既定で除外され、除外件数のみが excludedPolicyComments として返る。
---

# get_todoist_comments

指定したタスクに紐づくTodoistのコメントを取得するスキルです。

このリポジトリでは、Todoistのコメントを2つの用途で使い分けています。

| 種別 | 書き手・宛先 | 目印 | 既定の取得 |
|---|---|---|---|
| 碧衣宛のコメント | ユーザー → 碧衣（完了報告・レポートURL・代表写真など） | なし | **含まれる** |
| 開発上の対応方針 | ユーザー → 開発フロー（要望への対応方針の記録） | `【対応方針】` で始まる | **除外される** |

そのため、**碧衣の各モード（小夜・綴葉など）はオプションを付けずに呼び出してください**。開発上の対応方針が碧衣のコンテキストへ流入しません。方針そのものを読む必要があるのは開発フロー（[dev_apply_todoist_request](../dev_apply_todoist_request/SKILL.md)）だけで、そのときに限り `--include-policy` を付けます。

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
```

プロジェクトルートの `.env` に以下の環境変数が必要です。

```
TODOIST_API_TOKEN="your_api_token"
```

## Claudeへの指示

以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/todoist/get_comments.ts "{task_id または task_url}"
```

ARGUMENTS として渡された値をそのまま引数に使用してください。**URLをIDへ変換する処理はスクリプト側が行う**ため、呼び出す前にIDを取り出す必要はありません。

開発フローで対応方針まで読む場合のみ、`--include-policy` を付けます。

```bash
pnpm exec tsx src/todoist/get_comments.ts "{task_id または task_url}" --include-policy
```

コマンドの実行結果（コメント一覧のJSON）をそのままユーザーに提示してください。

## 取得結果の読み方

- `results`: コメントの配列。`--include-policy` を付けない限り、`【対応方針】` で始まるコメントは含まれません
- `excludedPolicyComments`: 除外した対応方針コメントの件数（`--include-policy` を付けた場合は出力されません）

`excludedPolicyComments` が1件以上あるタスクは、**開発上の対応方針が書かれた＝碧衣のしくみに関わるタスク**です。中身は伏せられていますが、件数そのものを手掛かりとして扱って構いません（小夜モードでの技術・運用連絡の判別など）。

方針コメントの除外によって `results` が空になることもあります。**コメントが0件であることは、そのタスクに文脈が無いことを意味しません**。

## 注意事項

コメントに添付ファイルがある場合、`fileAttachment` に情報が入ります。`files.todoist.com` の URL は認証が必要なため、`download_todoist_attachment` スキルで取得してください。
