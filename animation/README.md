# animation

碧衣の画像生成プロセスを表す 3D アニメーションです。Three.js で描画し、Vite の開発サーバーで表示します。

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

## アニメーションの流れ

40 秒で 1 周し、最初へ戻ってループします。舞台は暗いサイバー空間・宇宙空間です。画面下部には、ワイヤーフレームの山並みを3層重ねています。山並みは光の線の進行に合わせて流れ、遠い層ほどゆっくり動きます。

| 時刻（秒） | 場面 |
|---|---|
| 0.0〜3.2 | 画面左から中央へ光の線が伸びる |
| 2.0〜4.3 | 中央に `/run_aoi_daily` のノードが現れ、光の線がつながって起動する |
| 4.0〜4.5 | ノードの右下に `night` が現れる |
| 5.4〜8.4 | 光の線が右へ伸び、`/run_aoi_daily` は左へ流れて見えなくなる |
| 8.6〜11.6 | 左上・左下から Tasks / Calendar / Weather / Memo が集まり、光の線の先端へ取り込まれる |
| 12.8〜15.9 | Guideline と Reference（設定資料）が中央へ移り、走査されて読み込まれる |
| 15.6〜21.8 | Guideline から観点のキーワードが運ばれ、Prompt のパネルにプロンプトが打ち込まれる（途中で一度書き直す） |
| 22.0〜24.8 | 右下に Image AI が現れ、Reference と Prompt が運び込まれる |
| 25.8〜31.5 | ノイズから新しい画像が立ち上がる |
| 31.8〜33.0 | 生成した画像が中央へ返される |
| 34.2〜37.3 | 右上に Chat が現れ、画像にメッセージを添えて送る |
| 37.2〜40.0 | 光の線が消え、全体がフェードアウトする |

アイコンは、データの種別を表すピクトグラムをキャンバスに線画で描いています。実在するサービスのロゴは使っていません。

## 確認用の操作

| 操作 | 内容 |
|---|---|
| Space | 一時停止・再開 |
| ← / → | 1 秒戻る・進む（Shift で 5 秒） |
| D | 時刻と場面名の表示を切り替える |

URL パラメータでも指定できます。例えば `?t=18&pause&debug` は、18 秒の時点で一時停止し、時刻を表示した状態で開きます。

## 構成

```text
animation/
├── index.html                 # エントリ。canvas#scene と src/main.ts を読み込む
├── src/
│   ├── main.ts                # レンダラー・ブルーム・カメラ・再生ループ・確認用の操作
│   ├── story.ts               # 12 の場面の振り付け（時刻 t から全オブジェクトの状態を決める）
│   ├── timeline.ts            # ループの長さ、イージング、キーフレーム、場面名
│   ├── layout.ts              # 16 × 9 の設計枠と、それを収めるカメラ距離
│   ├── textures.ts            # カード・バッジ・ピクトグラム・生成画像のイラストをキャンバスで描く
│   ├── style.css
│   └── objects/
│       ├── beam.ts            # 光の線（本線と曲線の枝線）のシェーダー
│       ├── card.ts            # ノードのカード、光の玉、リング、描画順
│       ├── mountains.ts       # ワイヤーフレームの山並み
│       ├── background.ts      # 星空と星雲
│       ├── particles.ts       # データの流れを表す光の粒
│       ├── ripples.ts         # 接続・到着の瞬間に広がる光の輪
│       ├── promptPanel.ts     # プロンプトを打ち込むパネル
│       └── generatedImage.ts  # ノイズから立ち上がる生成画像
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml        # このディレクトリをルートのワークスペースから切り離す
└── tsconfig.json
```

場面の時刻は `story.ts` にまとめています。ループの長さを変える場合は、`timeline.ts` の `LOOP_DURATION` と、`story.ts` の各時刻をあわせて調整してください。

## リポジトリ本体との関係

- 専用の `pnpm-workspace.yaml` を置いているため、pnpm はこのディレクトリをワークスペースのルートとして扱います。ここでの `pnpm install` はリポジトリルートの `node_modules` や `pnpm-lock.yaml` に触れません。
- 碧衣の実行・`deploy.sh`・ルートの `pnpm test:all`（CI）の対象外です。
- Node.js と pnpm のバージョンは、ルートの `.nvmrc` と `package.json` の `packageManager` に揃えています。
- フォントは [Fontsource](https://fontsource.org/) の Rajdhani と JetBrains Mono（いずれも SIL Open Font License 1.1）を同梱しています。
