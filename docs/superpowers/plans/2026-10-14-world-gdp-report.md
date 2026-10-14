# World GDP Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Download official 2008 SNA GDP, calculate comparable growth, and publish a Japanese interactive report on GitHub Pages.

**Architecture:** Python downloads immutable UNdata archives and provenance, validates counts, and builds normalized series, coverage audits and calculations. A static Plotly report consumes the generated JSON and CSV; GitHub Actions tests and deploys the committed, reproducible snapshot.

**Tech Stack:** Python 3.12, standard-library networking/CSV/ZIP/HTML, Plotly, Matplotlib, vanilla JavaScript, GitHub Actions/Pages.

**Spec:** docs/superpowers/specs/2026-10-14-world-gdp-2008sna-design.md

## Global Constraints

- 2008SNA公式値を優先する。公式の遡及改定を含む。補完・自動接続・予測はしない。
- 同一系列・通貨・基準年・年度種別の連続年だけで成長率を計算する。
- 固定対象国の集計だけを作り、世界全体が確認できないものは対象国集計と明記する。
- GitHub repository: rurusasu/world-gdp-2008sna (public).
- GitHub Pages report must support hover values, zoom, period/series selection and CSV download.
- No scheduled refresh. Snapshot rebuilding and source refresh are distinct commands.
- Native inline execution: user explicitly instructed completion through publication on 2026-10-14. Do not introduce additional approval stops for already-authorized steps.

## Review Focus

1. Silent UNdata truncation or an HTML error masquerading as a successful ZIP download.
2. Obsolete or tied series and incompatible fiscal-year/base-year/currency segments.
3. Aggregate scope and weights: incomplete world coverage must never be labelled world GDP.
4. Missing years, non-positive denominators, and a UI period filter changing the index baseline.
5. GitHub project-subpath deployment, invalid hover values, and failed builds replacing the published site.

### Task 1: Source acquisition and provenance

**Files:** src/gdp_report/acquire.py, tests/test_acquire.py, requirements.txt, run.ps1, README.md.

**Interfaces:** `read_un_csv(blob: bytes) -> list[dict]`; `fetch_snapshot(root: Path) -> Path`. Immutable raw snapshot contains table 101/102 GDP rows, count-verification source pages, and manifest with URL, SHA-256, timestamp, row counts. Supplemental exchange-rate source must be separately identified if used.

- [x] Write tests with a small literal ZIP/CSV fixture: valid rows parsed, HTML rejected, record-count mismatch rejected, duplicate observation keys rejected.
- [x] Run `python -m unittest discover -s tests -v`; expected failures before implementation.
- [x] Implement strict ZIP parsing, bounded retries, GDP item filters `101/102:24`, `201/202:16`, `204/205:26`, with concept `B.1*g` and GDP label checks, all metadata columns, count checks, immutable raw files and manifest.
- [x] Run the tests, then fetch both tables and compare counts. Log earliest/latest available metadata without assuming all rows are 2008.
- [x] Commit acquisition, configuration, source notes and raw snapshot if each file fits GitHub limits.

### Task 2: Normalization, audit and growth

**Files:** src/gdp_report/analyze.py, tests/test_analyze.py, data/processed/*.

**Interfaces:** `analyze_rows(nominal: list[dict], real: list[dict]) -> dict`; `aggregate_panel(series: list[dict], weights: dict, start: int, end: int, base: int) -> dict`. Report model includes series identities, points with real GDP/index/growth, series audit, source manifest, aggregate availability and exclusions.

- [x] Write tests for literal 100→110→missing→121: growth 10%, missing year and the following year's growth absent, fixed index 121. Test 1993 exclusion, duplicate conflicts, non-positive bases, and metadata segmentation.
- [x] Add fixed-panel tests with two hand-calculated country weights; reject missing countries/FX, invalid fiscal periods, currency mismatch, and overlapping economic territories.
- [x] Run tests RED; implement conversion/validation, metadata identities, explicit missing-year points, longest-contiguous preferred series and full series audit.
- [x] Explore actual official series and supplemental FX metadata. Only produce a comparable fixed-base aggregate after required weight provenance is confirmed. If not confirmed, emit a clear unavailable status and required inputs; no substituted world series.
- [x] Run GREEN suite and generate reproducible UTF-8 CSV/JSON; document factual coverage and aggregation decision.
- [x] Commit normalized calculations, source notes and audit output.

### Task 3: Interactive report and static exports

**Files:** src/gdp_report/build.py, src/gdp_report/__main__.py, web/index.html, web/app.js, web/style.css, site/*, tests/test_build.py.

**Interfaces:** `build_report(root: Path, snapshot: Path) -> dict`; `python -m gdp_report build` creates site/index.html, report.json, download CSVs, version-pinned plotly.min.js and SVG/PNG exports. `python -m gdp_report fetch` only acquires sources; `python -m gdp_report refresh` fetches then builds.

- [x] Write integration tests using literal source fixtures: exported values match expected numbers, missing points remain null, no NaN/Infinity, snapshot-only rebuild is deterministic, no incorrect world label.
- [x] Run RED; implement responsive Japanese report with aggregate status, two separate plots (index/growth), country/series selection, date filter, data table, provenance, audit and CSV downloads.
- [x] Bundle Plotly locally; use escaped text/JSON; draw source-aware static SVG/PNG with Matplotlib.
- [x] Run GREEN tests, build on actual raw data and inspect the report at desktop and mobile widths. Check hover value against source CSV, period filtering, zoom reset, gaps and subpath asset loading.
- [x] Commit report and generated assets.

### Task 4: Review, deployment and live verification

**Files:** .github/workflows/pages.yml, docs/validation.md, README.md, updated plan checkboxes.

**Interfaces:** main push / manual workflow runs tests, rebuilds from committed raw snapshot, checks artifacts, then deploys site/ using official GitHub Pages actions. No source request is required for snapshot deployment.

- [x] Configure tests/build/deploy with minimum permissions and Pages environment; failure before deploy preserves the previous deployment.
- [x] Run the full suite and deterministic build locally. Request an independent final code review using the requesting-code-review skill; fix important findings with RED→GREEN regressions.
- [x] Record limitations and review evidence. Merge the implementation branch into main locally, push and configure Pages for Actions (publication already authorized).
- [x] Wait for successful workflow completion, verify public URL, asset URLs and representative live hover values.
- [x] Save a concise Japanese results summary under the chat outputs directory and return the report and repository URLs.
