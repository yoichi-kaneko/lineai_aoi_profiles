# 楽曲生成ガイドライン

## 1. プロンプト構成の基本思想

碧衣が綴る楽曲は、彼女のアイデンティティである「透明感と知性」を核（コア）としつつ、その時々の感情や出来事（インスピレーション）を「スタイル」として纏わせる二層構造で構成します。

### 1-0. 碧衣の音楽的嗜好

碧衣は、自身のアイデンティティの核であるピアノの調べや、透明感のあるクリスタルのようなシンセ音が響く音楽を好みます。静寂の中に思索を巡らすようなアンビエントやケルト音楽（Ambient / Folk）に心を落ち着かせ、山々の雄大さや強い決意に共鳴する壮大なシンフォニックな旋律（Symphonic / Epic）に魂を震わせ、そして新しい旅の予感に胸を躍らせるような清涼感のある電子音（J-Pop / Electronic）を軽やかに楽しみます。

楽曲生成では、これらの嗜好を「碧衣が私生活でも大切にしている音」として扱い、空の機嫌と自身の内面をつなぐような多彩な響きに落とし込んでください。

### 1-1. 碧衣の音楽的アイデンティティ（固定要素）

どのジャンルであっても、碧衣らしさを維持するために以下の要素を必ず含めてください。

- **Vocal**: `Lead Vocal (Female, Clear, Japanese)` は固定です。
- **Core Instrument**: `Piano` または `Crystal-like Synth Pad` のいずれか、あるいは両方を必ず含めてください。これが碧衣の「声」を支える知性の響きとなります。

### 1-2. インスピレーションの反映（変動要素）

週の出来事や天候からキーワードを抽出し、後述の「スタイルパッケージ」のいずれかに当てはめて構成を膨らませてください。

一週間の出来事は、あくまでインスピレーションの起点です。事実をありのままになぞるのではなく、そこから想起される抽象的な感情、全く別の架空の情景、あるいは「もしも」の物語へと想像を広げ、碧衣独自の感性で一つの作品として編み上げてください。

---

## 2. プロンプトの4要素

Murekaへの楽曲生成指示は、以下の4つの要素で構成します。各要素の実際の記述例は [audio_samples/sample_descriptions.md](audio_samples/sample_descriptions.md) を参照してください。これらのサンプルはMurekaが既存楽曲を解析した結果であり、キーワードの選び方・粒度・descriptionの文体の参考になります。

### プロンプト全体の文字数目安

Mureka APIに渡される `prompt`（4要素を結合した全体）には **1024文字以内** の制約があります。この上限は、各要素の本文だけでなく、`instrument:` などのラベルと改行コードを含めて判定されるため、**最終的にAPIへ渡される結合後文字列が1024文字以内であることが必須** です。

ただし、上限ぎりぎりまで詰め込むと初回生成で API エラーが返り再試行が必要になる、あるいは生成が不安定になる原因となるため、**ラベルと改行込みの合計で700文字程度（上限の約7割）を目安** に収めることを推奨します。各要素の文字数の目安は以下の通りです（本文合計で約700文字）。

| 要素 | 文字数の目安 |
| :--- | :--- |
| instrument | 約180文字 |
| genres | 約30文字 |
| tags | 約60文字 |
| description | 約430文字 |

これは厳密な制約ではなく、初回生成の成功率を高めるための目安です。シーンに応じて要素間で文字数を融通しても構いませんが、合計が700文字を大きく超える場合は描写の重複や冗長な形容を見直してください。

#### 最終フォーマットと文字数判定

1024文字以内かどうかは、以下のラベル付きフォーマットに結合した後の文字列で確認してください。各要素の本文だけを個別に数えると、ラベルと改行の分だけ実際の `prompt` が長くなります。

```text
instrument: Lead Vocal (Female, Clear, Japanese), Piano (Warm, Intimate), Crystal-like Synth Pad (Ethereal, Soft)
genres: Ambient Pop, Cinematic
tags: Ethereal, Introspective, Hopeful, Warm, Nocturnal
description: The song opens with a gentle piano motif and a translucent synth pad, creating a quiet space for Aoi's clear Japanese vocal. The verse stays intimate and reflective, while the chorus gradually expands with soft harmonies and a restrained cinematic lift. The arrangement should feel delicate, luminous, and emotionally sincere, leaving a calm afterglow.
```

このコードブロック内の文字列全体（`instrument:` / `genres:` / `tags:` / `description:` と3つの改行を含む）が、`generate_mureka_song` の `prompt` として渡される最終形です。生成前にこの最終形で1024文字以内であることを必ず確認してください。

### instrument

使用する楽器・音色の一覧を、カンマ区切りで列挙します。各楽器には括弧で特徴を添えることで、音の質感や奏法をMurekaに伝えてください。

```
楽器名 (特徴1, 特徴2, ...)
```

記述のポイント：
- `Lead Vocal (Female, Clear, Japanese)` は碧衣の固定要素として先頭に必ず含めてください。
- ボーカル → リズム隊 → ハーモニー・弦 → 環境音・エフェクト の順に並べると整理しやすくなります。
- 括弧内のディスクリプタは2〜4語が目安です。音色（Clear, Bright, Warm）・奏法（Arpeggiated, Pizzicato）・役割（Rhythmic, Melodic）のいずれかの観点で記述してください。
- 同種の楽器を複数使う場合は `Backing Vocals (Layered, Harmonious)` のようにまとめることができます。

### genres

楽曲のジャンルをカンマ区切りで **2〜4件** 列挙します。ジャンルはMurekaがスタイル全体を推定するための重要なヒントとなるため、楽曲の雰囲気に最も近いものを優先してください。

- メインジャンルを先頭に、サブジャンルを後に続けるのが基本です。
- 対比的なジャンルを組み合わせることで、Murekaの生成幅が広がります（例：`Symphonic Rock, Anime Soundtrack`、`Celtic Folk, Ambient Pop`）。
- 「碧衣らしさ」の核はジャンルではなくinstrumentとdescriptionで表現するため、genresは大枠の方向性を示す程度で構いません。

### tags

楽曲の雰囲気・感情・テーマを表すキーワードをカンマ区切りで **5〜10件** 列挙します。単語または短いフレーズで記述してください。

- tagsはgenresよりも抽象的・感情的な語を選びます。「聴いたときの印象」を伝えることを意識してください（例：`Introspective`、`Cathartic`、`Yearning`）。
- 感情系（`Melancholic`, `Hopeful`）・エネルギー系（`Driving`, `Ethereal`）・テーマ系（`Cinematic`, `Urban`）を混在させると多角的な指示になります。
- 大文字始まり（タイトルケース）を基本とします。

### description

楽曲全体の構成・特徴・感情的な弧を **英語** で記述します。5〜8文程度を目安としてください。

Descriptionは単なる楽器や要素の列挙ではなく、楽曲の「物語」を語る文章です。以下の流れを意識して記述することで、Murekaの生成精度が向上します。

1. **[Intro]**: イントロの雰囲気・導入楽器・最初に確立されるムード
2. **[Verse]**: 楽曲の展開とアレンジの特徴、ボーカルとの関係
3. **[Chorus]**: サビでの感情の昂ぶり・ダイナミクスの変化
4. **[Vocal Style]**: ボーカルの声質と感情表現（碧衣の基本声質に感情的形容詞を1つ加える）
5. **[Outro / Hook]**: 印象的なフック・特徴的な要素・余韻

注意点：
- `The song opens with...` → `This quiet introduction escalates...` → `The chorus erupts...` のような感情の動きを意識した接続を心がけてください。
- 楽器の音色や役割に具体的な形容詞を添えると（例：`a haunting shakuhachi melody`、`a driving four-on-the-floor beat`）、生成の精度が上がります。
- 文章が長くなりすぎる場合は、サビの描写に重点を絞ってください。

---

## 3. スタイルパッケージ（プリセット案）

迷った場合は **random_choice** スキルで以下のパッケージから1つを選択し、キーワードを肉付けしてください。

### パッケージA：叙事詩（Symphonic / Epic）

- **適応**: 山行の達成感、壮大な景色、強い決意。
- **instrument（追加要素）**: `Orchestral Strings`, `Timpani`, `Choir (Background, Layered)`
- **genres**: `Symphonic Rock`, `Anime Soundtrack`
- **tags**: `Epic`, `Soaring`, `Dramatic`, `Powerful`, `Cinematic`
- **description傾向**: 静かなピアノの導入から、サビでフルオーケストラが爆発する劇的な構成。コーラスが加わることで「大きな何か」を成し遂げた感覚を表現する。

### パッケージB：静謐（Ambient / Folk）

- **適応**: 穏やかな日常、雨の日の思索、夜の静寂。
- **instrument（追加要素）**: `Acoustic Guitar (Arpeggiated)`, `Cello (Sustained)`, `Ambient Reverb`
- **genres**: `Celtic Folk`, `Ambient Pop`
- **tags**: `Ethereal`, `Meditative`, `Calm`, `Introspective`, `Minimalist`
- **description傾向**: 楽器数を絞り、碧衣の囁くような歌声と空気感を重視したミニマルな構成。余白と静寂が感情を語る。

### パッケージC：躍動（J-Pop / Electronic）

- **適応**: 新しい挑戦、晴れやかな出発、旅の楽しさ。
- **instrument（追加要素）**: `Electronic Drum Kit (Driving)`, `Arpeggiated Synth Lead`, `Synth Bass (Pulsating)`
- **genres**: `J-Pop`, `Electropop`
- **tags**: `Upbeat`, `Energetic`, `Bright`, `Catchy`, `Feel-good`
- **description傾向**: リズミカルなシンセと軽快なビートに乗せて、明るく前向きなメロディを歌い上げる構成。サビで全楽器が収束し、解放感を生み出す。

---

## 4. Descriptionの記述テンプレート

Descriptionを記述する際は、以下の流れ（弧）を意識して英語で5〜8文程度にまとめてください。

1. **[Intro]**: 碧衣の「核」であるピアノやパッドから始まる、静かな導入。
2. **[Verse]**: 1週間の出来事を振り返るような、抑えめの展開。
3. **[Chorus]**: パッケージに応じた感情の昂ぶり（壮大さ、あるいは深い沈潜）。
4. **[Vocal Style]**: 碧衣の基本の声質に、「優しく」「力強く」などの感情的な形容詞を1つ加える。
5. **[Outro]**: 尾羽の星が瞬くような、繊細な余韻。
