---
name: fetch_yamap_activity
description: YAMAPの活動記録ページから情報を取得する。yamap.com/activities/で始まるURLが渡されたときに使用する。タイトル・日付・活動データ・チェックポイント通過時間などを抽出して返す。
---

# fetch_yamap_activity

YAMAPの活動記録ページから情報を取得するスタンドアロンCLIスクリプトです。

## 概要

指定したYAMAP活動記録ページのURLに対して Playwright（Chromium）でアクセスし、
レンダリング済みのHTMLから以下の情報を抽出して返します。

- 概要（タイトル・日付・ヘッダー画像）
- 活動データ（タイム・距離・のぼり・くだり・コース定数）
- チェックポイント通過時間（日別・行動開始〜行動終了）

## 対応URLフォーマット

以下のURLを受け付けます。それ以外はエラーとなります。

```
https://yamap.com/activities/{ID}
```

## 事前準備

依存パッケージはルートディレクトリで一元管理しています。
初回のみ、プロジェクトルートで以下を実行してください。

```bash
cd {プロジェクトルートの絶対パス}
npm install
npx playwright install chromium
```

## 実行方法

```bash
cd {Base directory for this skill の絶対パス}
npx tsx scripts/fetch.ts "https://yamap.com/activities/XXXX"
```

## 注意事項

- YAMAP側のページ構造（CSSクラス名など）が変更された場合、予告なく動作しなくなる可能性があります
- Playwright による実際のブラウザレンダリングを行うため、ネットワーク接続が必要です
- ログイン不要で閲覧できる公開活動記録ページのみ対象です

## Claudeへの指示

`yamap.com/activities/` で始まるURLが渡されたとき、このスキルを使用してください。
