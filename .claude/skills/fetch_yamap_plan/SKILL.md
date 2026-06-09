---
name: fetch_yamap_plan
description: 【計画書URL用】YAMAPの山行計画ページから計画情報を取得する。yamap.com/plans/code/で始まるURLが渡されたときに使用する。計画タイトル・山域・距離・標高差・移動計画などを抽出して返す。
---

# fetch_yamap_plan

YAMAPの山行計画ページから計画情報を取得するスタンドアロンCLIスクリプトです。

## 概要

指定したYAMAP山行計画ページのURLに対して Playwright（Chromium）でアクセスし、
レンダリング済みのHTMLから以下の情報を抽出して標準出力に返します。

- **概要**: 計画タイトル・山域・メンバーなどのサマリー情報
- **計画データ**: 距離・標高差・コース定数・ペース倍率など
- **移動計画**: 日程ごとのチェックポイント・時刻・宿泊情報

## 対応URLフォーマット

以下の2種類のURLを受け付けます。それ以外はエラーとなります。

```
https://yamap.com/plans/code/{CODE}
https://yamap.com/plans/code/{CODE}/printing  # 末尾の /printing は自動的に除去されます
```

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm install
pnpm run setup:browsers
```

## 実行方法

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/yamap/fetch_plan.ts "https://yamap.com/plans/code/XXXX"
```

`/printing` 付きURLも使用可能です：

```bash
pnpm exec tsx src/yamap/fetch_plan.ts "https://yamap.com/plans/code/XXXX/printing"
```

## 注意事項

- YAMAP側のページ構造（CSSクラス名など）が変更された場合、予告なく動作しなくなる可能性があります
- Playwright による実際のブラウザレンダリングを行うため、ネットワーク接続が必要です
- ログイン不要で閲覧できる公開計画ページのみ対象です

## Claudeへの指示

`yamap.com/plans/code/` で始まるURLが渡されたとき、このスキルを使用してください。
以下のコマンドをプロジェクトルートから実行してください。

```bash
cd {プロジェクトルートの絶対パス}
pnpm exec tsx src/yamap/fetch_plan.ts "{ARGUMENTS として渡された URL}"
```

ARGUMENTSとして渡されたURLをそのまま引数に使用してください。
コマンドの実行結果を、そのままユーザーに提示してください。
