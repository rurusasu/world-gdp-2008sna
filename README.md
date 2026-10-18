# World GDP / 2008 SNA

国連の各国公式GDPを取得し、SNA System が2008の系列を選別する、再実行可能な分析プロジェクトです。

**Report:** https://rurusasu.github.io/world-gdp-2008sna/

## 読み方

- 公式値の対象国集計は、通貨・会計年度・2020年名目GDPと為替を照合し、欠測のない対象国を期間中固定した独自集計です。世界全体の2008SNA直接集計ではありません。
- 国・地域別の表示では公式実質GDPの全系列を選択でき、最古年から最新の収録年まで確認できます。基準年・系列を自動接続しません。
- 参考の国連世界合計はAMAの推計・補完を含む系列です。公式値だけの部分集計と分けています。
- 出典・注記・取得履歴・SHA-256・件数照合結果とCSVを保存しています。原データは `data/raw/`、Pythonが生成する公開用データは `site/`、Astroが生成する公開サイトは `dist/` です。

## Linuxで再実行

Linux（x86_64 / aarch64）と、Flakesを有効にしたNix、[シェルフックを設定済みのdirenv](https://direnv.net/docs/hook.html)を使用します。`flake.lock` で固定したNix環境がuv・Python 3.15・Node.js 24・npm・必要な共有ライブラリを提供します。Pythonの最低バージョンは `pyproject.toml` の `requires-python = ">=3.15"` で指定し、依存関係は `uv.lock` で固定します。Astro・TypeScript・Vite+は `package-lock.json` で固定します。Vite+はプロジェクト内のCLIをNix製Node.js/npmで動かし、Astroが利用するViteも同じVite+ coreへ統一します。

```bash
direnv allow  # 初回、および .envrc を変更したときのみ
vp run test
vp run data:build    # 保存したスナップショットから再計算。データ取得なし
vp run dev
# http://localhost:4321/world-gdp-2008sna/。Ctrl+Cで終了
```

リポジトリのルートから実行してください。direnvはディレクトリに入るとNix環境を読み込み、`uv sync --locked` と `npm ci --no-audit --no-fund` で依存関係を同期して `.venv/` を有効化します。`pyproject.toml`・`uv.lock`・`package.json`・`package-lock.json`・`flake.nix`・`flake.lock` の変更時にも再読み込みします。

Nixシェルは `node_modules/.bin` もPATHへ追加するため、依存同期後は `vp` を直接使えます。グローバルCLIのインストールは不要です。Astroの開発には `vp run dev`、ビルドには `vp run build` を使います。`vp dev`・`vp build` はVite単体のコマンドです。

Pythonがデータ取得・検証・集計・JSON/CSV/静止画の生成を担当し、Astroは `web/` の画面と `site/` のデータから静的サイトを生成します。グラフ操作はブラウザのTypeScriptで実行します。公開用ビルドとローカル確認:

```bash
vp run build    # Vite+検査とAstro型検査の後に dist/ を生成
vp run preview  # http://localhost:4321/world-gdp-2008sna/
```

`site/` はAstroの公開用データ入力、`dist/` はビルドの出力として分けています。`site/` のデータは保存済みスナップショットから再構築でき、`dist/` と `node_modules/` はコミットしません。

`vp check` はVite+による整形・lint・TypeScript検査、`vp run check` はそれに `astro check` を加えた検査です。`.astro` の型検査にはAstro側の検査も使用します。`vp fmt` でソースを整形できます。原本・生成データ・過去の設計/検証文書は整形対象から除外しています。

データ更新は `uv run --locked -m gdp_report refresh` で新しい原データを取得して再計算し、`vp run build` で画面へ反映します。`uv run --locked -m gdp_report fetch` は原データ取得だけを実行します。失敗した取得はLATESTを更新しません。

Nix環境では `UV_PYTHON` がNix提供のPythonを指し、uvによる別のPythonの自動ダウンロードを無効にしています。`PYTHONPATH=src` と描画用の `MPLBACKEND=Agg` も設定されます。ロックファイルが依存定義と一致しない場合は自動同期が失敗するので、下記の `uv lock` で明示的に更新してください。

## GitHub Actions

CIも同じNix環境とロックファイルを使います。direnvを使わず個別に実行する場合（既定では `.venv/` を使用）:

```bash
nix develop --command uv sync --locked
nix develop --command npm ci --no-audit --no-fund
nix develop --command vp run test
nix develop --command vp run data:build
nix develop --command vp run build
```

GitHub Actionsはmainへの更新または手動実行で、Vite+経由のテスト・保存済み原データの再計算・検査・Astroビルド後に `dist/` をPagesへ配備します。Node.js/npmもNixから供給し、ローカルとCIで同じロックファイルを使用します。定期取得は行いません。更新時は `refresh` の結果と原データを確認してコミット・pushしてください。

Pythonの依存関係を変更したら `pyproject.toml` を編集し、`nix develop --command uv lock` で `uv.lock` を更新してください。フロントエンドの依存はNixシェル内の `vp add --save-exact` / `vp add -D --save-exact` で変更し、`package-lock.json` も更新します。Vite+の更新時は[公式の移行手順](https://viteplus.dev/guide/migrate)に従い、`vite-plus` と `vite` のcore overrideを同じ版にそろえてください。Nix側のツールは `nix flake update` で更新します。対応するロックファイルも一緒にコミットします。

## 出典

- [UN National Accounts Official Country Data](https://unstats.un.org/unsd/nationalaccount/madt.asp): Tables 1.1/1.2, 2.1/2.2, 2.4/2.5 のGDP本体。各行の採用SNA、系列、通貨、基準年、会計年度を保持。
- [UNSD AMA Downloads](https://unstats.un.org/unsd/snaama/downloads): 補助為替ファイルのIMF-based exchange rate（IMF出典注記を照合）。参考の世界GDPは2020年価格米ドル。
- [UNSD methodology](https://unstats.un.org/unsd/snaama/assets/pdf/methodology.pdf): AMAの接続・補完・換算方法。

取得したデータは各提供元に帰属します。SNA欄の2008という登録に基づく抽出であり、各国の全概念への完全準拠を独立に証明するものではありません。

設計・実装計画は `docs/superpowers/`、実際の検証結果と制約は `docs/validation.md` に記録します。
