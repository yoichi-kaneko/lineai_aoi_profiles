---
name: fetch_yamap_activity
description: 【未実装・実行不可】YAMAPの活動記録ページから情報を取得するスキル。yamap.com/activities/で始まるURLが渡されても、現時点では実装が完了していないため実行しないこと。
---

# fetch_yamap_activity

YAMAPの活動記録ページから情報を取得するスタンドアロンCLIスクリプトです。

> **注意: このスキルは現在実装途中です。HTMLの取得までは実装済みですが、データ抽出処理は未実装です。実行しないでください。**

## 概要

指定したYAMAP活動記録ページのURLに対して Playwright（Chromium）でアクセスし、
レンダリング済みのHTMLを取得します（データ抽出処理は今後実装予定）。

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

**このスキルは未実装のため、実行しないでください。**
fetch_yamap_activity スキルを使って欲しいという明示的な指示があるのでない限り、実装が終わるまで `fetch` で代替してください。
明示的な指示があった場合、ユーザーに「fetch_yamap_activity スキルは現在実装中のため、使用できません」と伝えてください。
