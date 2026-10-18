# 国別GDP複合グラフ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームと国別成長率ページに、全150か国・地域を選択できる複合時系列グラフを実装する。

**Architecture:** 代表系列の選択、色、10年平均の算出を共有TypeScriptモジュールへ集約する。共有の国選択コンポーネントを両ページに接続し、ホームでは指数と前年比を左右2軸、国別ページでは年次成長率と10年平均を共通の成長率軸に描画する。Plotlyと既存report.jsonを使い、データ生成・取得は変更しない。

**Tech Stack:** Astro、TypeScript、Plotly.js（ローカル配布版）、既存のPythonデータ出力。

**Spec:** `docs/superpowers/specs/2026-10-18-multi-country-combined-charts-design.md`

## Global Constraints

- 初期状態は全150か国・地域を選択済みにする。
- `Clear All`は選択を0件にし、グラフのトレースをすべて消す。
- 検索で隠れた国のチェック状態を保持する。
- 同じ国は両ページおよび2指標で同じ安定色を使う。
- 指数は系列ごとの起点を維持し、国間の水準比較ではない旨を表示する。
- 系列を接続・補間せず、未算出値はグラフ上で欠測として表示する。
- 固定対象国集計、参考世界合計、期間指定、監査・CSVへの導線を維持する。
- `/world-gdp-2008sna/`サブパスで静的ビルドする。

## Review Focus

1. 150か国・地域を初期選択したときの描画負荷と凡例の混雑 — Plotlyの凡例を隠し、サイドバーで国名・色・選択状態を示す。
2. `Clear All`後や選択0件の状態 — 0トレースと空状態メッセージを表示する。
3. 検索後に絞り込みを解除した場合 — 検索外の選択状態を維持する。
4. 欠測や未確認の価格基準 — 数値を補間せず、線が欠測箇所で途切れる。
5. 1国に複数の系列がある場合 — `preferred`、終了年、系列ID順で代表系列を1つだけ選ぶ。

## File Structure

- Create `web/country-series.ts`: 代表系列、安定色、10年平均の共有処理。
- Create `web/country-filter.ts`: 検索・選択数・チェックボックス・Clear Allの共有UI。
- Modify `web/pages/index.astro` and `web/app.ts`: 初期「国別比較」モードと、2軸の複合グラフ。既存の集計・参考タブを維持。
- Modify `web/pages/growth.astro` and `web/growth.ts`: 全件選択の複合成長率グラフ。
- Modify `web/style.css`: 2カラムチャート／右サイドバー配置と狭幅レイアウト。

---

### Task 1: 共有系列・国選択モジュール

**Files:**
- Create: `web/country-series.ts`
- Create: `web/country-filter.ts`

**Interfaces:**
- `country-series.ts` exports `CountryChoice { code: string; name: string; series: CountrySeries; color: string }` and `DecadeAverage { start: number; mean: number; count: number; first: number; last: number }`.
- `chooseCountrySeries(series: CountrySeries[]): CountryChoice[]` uses preference descending, `last` descending, then `id` ascending, and sorts output by country name.
- `countryColor(code: string): string` returns the same deterministic CSS color for a code on both pages.
- `decadeAverages(points: Point[]): DecadeAverage[]` averages non-null annual growth by `Math.floor(year / 10) * 10` and records count/first/last year.
- `country-filter.ts` exports `bindCountryFilter(root: HTMLElement, countries: CountryChoice[], onChange: (codes: Set<string>) => void): void`. Expected child IDs: `country-filter-search`, `country-filter-list`, `country-filter-count`, `country-filter-clear`. It initially selects every code, keeps hidden checked items during search, and calls back with an empty set on Clear All.

- [ ] `CountryChoice`用の代表系列選択・色・10年平均関数を作る。
- [ ] 検索可能なチェックリストを共通DOM IDで両ページから利用できるようにする。イベントは`textContent`とDOM APIで構築し、国名をHTMLとして挿入しない。
- [ ] 共通関数とUIの整形・型検査を通す。

### Task 2: ホームの全国家比較グラフ

**Files:**
- Modify: `web/pages/index.astro`
- Modify: `web/app.ts`
- Modify: `web/style.css`

**Interfaces:**
- Home mode becomes `'countries' | 'panel' | 'reference'`; initial mode is `'countries'`.
- `renderCountryChart(selectedCodes: Set<string>): void` draws selected representative series as paired traces in `#combined-chart`.
- Country traces use `y` for index on the left axis and `y2` for growth percent on the right axis. Index uses a solid line; growth uses same-color dashed lines with small markers. Hover includes country and year.
- Panel/reference modes draw one index trace and one growth trace in the same chart, hide the country filter, and retain existing period controls and descriptions.

- [ ] Country comparison tabを最初にし、`#combined-chart`と共通選択欄を追加する。既存index/growthの別チャートは統合する。
- [ ] `report.series`から共有関数で代表系列を作り、初期状態の150件を描画する。checkbox変更は該当国の2トレースを反映し、期間範囲は全系列の有効範囲とする。
- [ ] Aggregate/referenceの既存データと期間入力を1つの2軸グラフに移す。既存の集計メンバー、読取値、注記はそのモードで維持する。
- [ ] `Clear All`を押したときグラフを空にして、選択0件の案内を出す。

### Task 3: 国別成長率ページの複合グラフ

**Files:**
- Modify: `web/pages/growth.astro`
- Modify: `web/growth.ts`
- Modify: `web/style.css`

**Interfaces:**
- `renderGrowthChart(selectedCodes: Set<string>): void` draws two traces per selected representative country in one `#growth-chart` plot.
- Annual growth is a thin solid line. Decade average is a dashed step line at the same percent scale, using `decadeAverages()` output. Hover shows year and decade sample count.
- Shared selector defaults to all countries and uses the same country codes/colors as home.

- [ ] Country `<select>`と2つの既存チャートを、共通国選択欄と1つの複合グラフへ置き換える。
- [ ] 選択国ごとに年次率と10年平均を重ね、0選択時はトレースを消して空状態を表示する。
- [ ] 各国の年次表・10年平均表は、選択状態と同期する。平均対象数と年の範囲を残す。

### Task 4: レスポンシブ表示・全体確認

**Files:**
- Modify: `web/style.css`
- Review: `web/pages/index.astro`, `web/app.ts`, `web/pages/growth.astro`, `web/growth.ts`

- [ ] デスクトップではチャートを主領域、国選択欄を右側に配置する。
- [ ] 狭幅では選択欄をチャートより前に縦配置し、横スクロールを強制しない。
- [ ] `nix develop --command vp run build`を実行し、整形・lint・型検査・Astro静的ビルドが成功することを確認する。
- [ ] 生成された`dist/index.html`と`dist/growth/index.html`にグラフ領域、国選択欄、`Clear All`が含まれることを確認する。
- [ ] 両ページで初期全選択、検索後の選択保持、単独国の切替、`Clear All`後の空状態、欠測箇所の切れ目、150件選択時の操作性をブラウザで確認する。
- [ ] 最終差分と欠測・系列選択・左右軸の範囲をレビューしてコミットする。
