# ノートブック

[next_word_race.ipynb](next_word_race.ipynb) は、馬券風 次単語予想モード（裏モード）で使う
`races.csv` を作ります。仕様は [../docs/betting-mode.md](../docs/betting-mode.md) を参照してください。

**ローカルでも Colab でも動きます。GPU は不要です。**

## ローカルで動かす

Python 3.10〜3.12 を想定しています。**プロジェクトの Python 環境を汚さないよう仮想環境を作ります。**

```bash
cd notebooks
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/jupyter lab next_word_race.ipynb
```

**1 回の実行で 1 レース**ぶんを作ります。上から順に実行すると、同じディレクトリに
`races_01.csv` ができます。それをアプリの設定画面「コンテンツ」→ 馬券風 次単語予想 →
「races_NN.csv を取り込む…」で選びます。

4 章に戻って `RACE_NO` と `PROMPT` を変えて回すと `races_02.csv` … と増えていきます。
**取り込みは追加なので、1 つずつ取り込んでいけば溜まります。**
アプリ側は登録されたレースから毎回ランダムに 5 つ選ぶので、多いほど飽きません。

### かかる時間とメモリ

既定のモデル（`llm-jp-3-150m`、12層 → 1200m）で、

- 初回のダウンロード … 約 0.6GB（2 回目からは `~/.cache/huggingface` から読むだけ）
- メモリ … 1GB 弱
- 1 レースの計算 … CPU で数秒

大きいモデルに変えると距離が伸びます。`llm-jp-3-1.8b`（24層 → 2400m）はメモリを
8GB 近く使うので、16GB の PC でぎりぎりです。まず 150m で一通り通してください。

## 困ったとき

**`A module that was compiled using NumPy 1.x cannot be run in NumPy 2.x`**
torch 2.2 系は numpy 2 系と ABI が合いません。`requirements.txt` で `numpy<2` に
固定してあるので、**仮想環境の外の Python を使っていないか**確認してください。

**`PyTorch >= 2.4 is required but found 2.2.2`**
transformers 5 系が入っています。`requirements.txt` は 4 系に固定しているので、
仮想環境を作り直してください。

**グラフの日本語が □ になる**
ノートブックが OS のフォントを自動で探します（macOS の Hiragino、Windows の Yu Gothic など）。
見つからなければその旨を表示します。Colab では次を実行してランタイムを再起動してください。

```
!apt-get -qq install fonts-ipafont-gothic
```

**モデルのダウンロードが途中で切れる**
社内プロキシなどで Hugging Face の Xet CDN が通らないことがあります。
環境変数 `HF_HUB_DISABLE_XET=1` を付けると従来の CDN を使います。

```bash
HF_HUB_DISABLE_XET=1 ./venv/bin/jupyter lab
```

## Colab で動かす

ノートブックをそのままアップロードして上から実行するだけです。
1 つ目のセルが Colab を検出して、必要なものを入れます。
最後のセルで `races.csv` が自動的にダウンロードされます。
