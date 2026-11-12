# animation

Three.js で書いた 3D アニメーションを、Vite の開発サーバーで表示するための独立したプロジェクトです。

## 起動

このディレクトリで実行します。

```text
pnpm install   依存関係を導入
pnpm dev       開発サーバーを起動（http://localhost:5173/）
pnpm build     型検査のうえ dist/ へ本番用にビルド
pnpm preview   ビルド結果を配信して確認
pnpm typecheck 型検査のみ
```

同じ LAN 内の別端末から見る場合は `pnpm dev --host` で起動します。

## 構成

```text
animation/
├── index.html           # エントリ。canvas#scene と src/main.ts を読み込む
├── src/
│   ├── main.ts          # シーン・カメラ・描画ループ
│   └── style.css        # canvas を画面全体に広げる
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml  # このディレクトリをルートのワークスペースから切り離す
└── tsconfig.json
```

## リポジトリ本体との関係

- 専用の `pnpm-workspace.yaml` を置いているため、pnpm はこのディレクトリをワークスペースのルートとして扱います。ここでの `pnpm install` はリポジトリルートの `node_modules` や `pnpm-lock.yaml` に触れません。
- 碧衣の実行・`deploy.sh`・ルートの `pnpm test:all`（CI）の対象外です。
- Node.js と pnpm のバージョンは、ルートの `.nvmrc` と `package.json` の `packageManager` に揃えています。
