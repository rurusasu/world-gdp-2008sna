# World GDP / 2008 SNA

国連の各国公式GDPを取得し、SNA System が2008の系列を選別する、再実行可能な分析プロジェクトです。

**Report:** https://rurusasu.github.io/world-gdp-2008sna/

## 読み方

- 公式値の対象国集計は、通貨・会計年度・2020年名目GDPと為替を照合し、欠測のない対象国を期間中固定した独自集計です。世界全体の2008SNA直接集計ではありません。
- 国・地域別の表示では公式実質GDPの全系列を選択でき、最古年から最新の収録年まで確認できます。基準年・系列を自動接続しません。
- 参考の国連世界合計はAMAの推計・補完を含む系列です。公式値だけの部分集計と分けています。
- 出典・注記・取得履歴・SHA-256・件数照合結果とCSVを保存しています。原データは `data/raw/`、公開レポートは `site/` です。

## Linuxで再実行

Linux（x86_64 / aarch64）と、Flakesを有効にしたNix、[シェルフックを設定済みのdirenv](https://direnv.net/docs/hook.html)を使用します。`flake.lock` で固定したNix環境がuv・Python 3.15・必要な共有ライブラリを提供します。Pythonの最低バージョンは `pyproject.toml` の `requires-python = ">=3.15"` で指定し、依存関係はuvで管理します。

```bash
direnv allow  # 初回、および .envrc を変更したときのみ
uv run --locked -m unittest discover -s tests -v
uv run --locked -m gdp_report build    # 保存したスナップショットから再計算。データ取得なし
uv run --locked -m http.server 8000 --bind 127.0.0.1 --directory site
# http://127.0.0.1:8000。Ctrl+Cで終了
uv run --locked -m gdp_report refresh  # 新しい原データを取得して再計算
```

リポジトリのルートから実行してください。direnvはディレクトリに入るとNix環境を読み込み、`uv sync --locked` で依存関係を同期して `.venv/` を有効化します。`pyproject.toml`・`uv.lock`・`flake.nix`・`flake.lock` の変更時にも再読み込みします。`uv run --locked -m gdp_report fetch` は原データ取得だけを実行します。失敗した取得はLATESTを更新しません。

Nix環境では `UV_PYTHON` がNix提供のPythonを指し、uvによる別のPythonの自動ダウンロードを無効にしています。`PYTHONPATH=src` と描画用の `MPLBACKEND=Agg` も設定されます。ロックファイルが依存定義と一致しない場合は自動同期が失敗するので、下記の `uv lock` で明示的に更新してください。

## GitHub Actions

CIも同じNix環境とロックファイルを使います。direnvを使わず個別に実行する場合（既定では `.venv/` を使用）:

```bash
nix develop --command uv sync --locked
nix develop --command uv run --locked -m unittest discover -s tests -v
nix develop --command uv run --locked -m gdp_report build
```

GitHub Actionsはmainへの更新または手動実行で、保存済み原データから検証・再計算・Pages配備を行います。定期取得は行いません。更新時は `refresh` の結果と原データを確認してコミット・pushしてください。

依存関係を変更したら `pyproject.toml` を編集し、`nix develop --command uv lock` で `uv.lock` を更新してください。Nix側のツールは `nix flake update` で更新します。対応するロックファイルも一緒にコミットします。

## 出典

- [UN National Accounts Official Country Data](https://unstats.un.org/unsd/nationalaccount/madt.asp): Tables 1.1/1.2, 2.1/2.2, 2.4/2.5 のGDP本体。各行の採用SNA、系列、通貨、基準年、会計年度を保持。
- [UNSD AMA Downloads](https://unstats.un.org/unsd/snaama/downloads): 補助為替ファイルのIMF-based exchange rate（IMF出典注記を照合）。参考の世界GDPは2020年価格米ドル。
- [UNSD methodology](https://unstats.un.org/unsd/snaama/assets/pdf/methodology.pdf): AMAの接続・補完・換算方法。

取得したデータは各提供元に帰属します。SNA欄の2008という登録に基づく抽出であり、各国の全概念への完全準拠を独立に証明するものではありません。

設計・実装計画は `docs/superpowers/`、実際の検証結果と制約は `docs/validation.md` に記録します。
