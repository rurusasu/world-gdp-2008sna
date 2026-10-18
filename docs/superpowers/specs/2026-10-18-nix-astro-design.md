# Nix管理のAstro・Vite+開発環境

## 合意した目的

Astro＋TypeScript＋Vite+を導入し、現在の画面・グラフ操作・Pythonの集計結果を維持する。
ユーザーの追加条件に従い、開発とCIの実行環境を既存のNix Flakeで管理する。

## 構成

- `flake.lock`で固定したnixpkgsのNode.js 24（npm同梱）と既存のuv・Python 3.15を使用する。
- Astro・TypeScript・型検査ツールはプロジェクト依存として`package-lock.json`で固定する。
- Vite+はプロジェクト依存として固定し、既存のNix製Node.js/npmでローカルCLIを動かす。
- Viteの解決をVite+のcoreへ統一し、Astroの開発・ビルドは`vp run`経由で実行する。
- Vite+の検査・整形とAstroの型検査を併用する。集計のPythonテストを維持する。
- Vite+のグローバルインストーラーやNode.js自動管理は使用しない。
- Pythonは検証済み原本からJSON・CSV・Plotly・静止画を`site/`へ出力する。
- Astroは`web/`をソース、`site/`を公開用データの入力、`dist/`を最終成果物とする。
- `web/pages/index.astro`で既存の画面を生成し、`web/app.ts`で既存の操作を処理する。
- GitHub Pagesのベースパスは`/world-gdp-2008sna/`。リンク・JSON・Plotlyを同パスで参照する。
- direnvはNix環境の読込後にuvとnpmの依存をロックファイルから同期する。
- CIは同じNixシェルでPythonテスト・集計・型検査・Astroビルドを実行し、`dist/`を配備する。

## 完了条件

Nixシェルで必要なツールが利用可能。PythonテストとAstro型検査・ビルドが成功。
サブパスでHTML・JS・CSS・JSON・Plotly・CSVが取得でき、既存のグラフ操作を確認する。
データ取得の追加実行と集計方法の変更は今回の範囲に含めない。
ユーザーの追加指定に従い、検証完了後に変更を`origin/main`へpushし、GitHub Actionsの結果を確認する。
