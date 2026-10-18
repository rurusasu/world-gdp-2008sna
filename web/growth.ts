import type { Config, Layout } from 'plotly.js';
import type { CountrySeries, Point, Report } from './report';

type PlotlyStatic = typeof import('plotly.js');

declare global {
  interface Window {
    Plotly?: PlotlyStatic;
  }
}

interface DecadeAverage {
  start: number;
  mean: number;
  count: number;
  first: number;
  last: number;
}

const base = import.meta.env.BASE_URL;
const format = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '欠測'
    : new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(value);
const signed = (value: number | null | undefined) =>
  value === null || value === undefined ? '欠測' : `${value >= 0 ? '+' : ''}${format(value)}%`;

function byId<Id extends string>(id: Id): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`表示要素が見つかりません：${id}`);
  return element;
}

function loadPlotly(): Promise<PlotlyStatic> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}plotly.min.js`;
    script.onload = () =>
      window.Plotly ? resolve(window.Plotly) : reject(new Error('グラフを初期化できませんでした'));
    script.onerror = () => reject(new Error('グラフライブラリを読み込めませんでした'));
    document.head.append(script);
  });
}

function representativeSeries(series: CountrySeries[]): CountrySeries[] {
  const selected = new Map<string, CountrySeries>();
  for (const item of series) {
    const current = selected.get(item.country_code);
    if (
      !current ||
      Number(item.preferred) > Number(current.preferred) ||
      (item.preferred === current.preferred &&
        (item.last > current.last ||
          (item.last === current.last && item.id.localeCompare(current.id) < 0)))
    ) {
      selected.set(item.country_code, item);
    }
  }
  return [...selected.values()].sort((a, b) => a.country.localeCompare(b.country, 'ja'));
}

function decadeAverages(points: Point[]): DecadeAverage[] {
  const grouped = new Map<number, Point[]>();
  for (const point of points) {
    if (point.growth === null) continue;
    const decade = Math.floor(point.year / 10) * 10;
    grouped.set(decade, [...(grouped.get(decade) ?? []), point]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, values]) => ({
      start,
      mean: values.reduce((total, point) => total + (point.growth ?? 0), 0) / values.length,
      count: values.length,
      first: values[0].year,
      last: values[values.length - 1].year,
    }));
}

function addTableRow(target: HTMLElement, values: string[]): void {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  target.append(row);
}

function plot(
  plotly: PlotlyStatic,
  item: CountrySeries,
  points: Point[],
  averages: DecadeAverage[],
): void {
  const layout: Partial<Layout> = {
    autosize: true,
    margin: { l: 55, r: 22, t: 18, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      color: '#647274',
      size: 11,
    },
    xaxis: { title: { text: '年' }, gridcolor: '#e8e9e3', zeroline: false },
    yaxis: {
      title: { text: '成長率（%）' },
      ticksuffix: '%',
      gridcolor: '#e8e9e3',
      zerolinecolor: '#aebbb4',
    },
    showlegend: false,
  };
  const config: Partial<Config> = { responsive: true, displaylogo: false, scrollZoom: false };
  const validPoints = points.filter((point) => point.growth !== null);
  void plotly.react(
    'annual-growth-chart',
    [
      {
        type: 'bar',
        x: points.map((point) => point.year),
        y: points.map((point) => point.growth),
        marker: {
          color: points.map((point) =>
            point.growth !== null && point.growth < 0 ? '#b75946' : '#147c75',
          ),
        },
        hovertemplate: '<b>%{x}年</b><br>前年比：%{y:+.2f}%<extra></extra>',
      },
    ],
    {
      ...layout,
      annotations: validPoints.length
        ? []
        : [
            {
              text: '比較可能な価格基準を確認できる成長率がありません',
              xref: 'paper',
              yref: 'paper',
              x: 0.5,
              y: 0.5,
              showarrow: false,
            },
          ],
    },
    config,
  );

  const decadeLabels = averages.map((row) => `${row.start}s`);
  void plotly.react(
    'decade-growth-chart',
    [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: averages.map((row) => row.start),
        y: averages.map((row) => row.mean),
        customdata: averages.map((row) => [row.count, row.first, row.last]),
        connectgaps: false,
        line: { color: '#147c75', width: 2.5 },
        marker: { size: 7, color: '#147c75' },
        hovertemplate:
          '<b>%{x}s</b><br>平均：%{y:+.2f}%<br>対象：%{customdata[0]}年（%{customdata[1]}–%{customdata[2]}）<extra></extra>',
      },
    ],
    {
      ...layout,
      xaxis: {
        ...layout.xaxis,
        tickmode: 'array',
        tickvals: averages.map((row) => row.start),
        ticktext: decadeLabels,
      },
      annotations: averages.length
        ? []
        : [
            {
              text: '10年平均を計算できる年次データがありません',
              xref: 'paper',
              yref: 'paper',
              x: 0.5,
              y: 0.5,
              showarrow: false,
            },
          ],
    },
    config,
  );

  byId('decade-growth-table').replaceChildren();
  for (const row of averages) {
    addTableRow(byId('decade-growth-table'), [
      `${row.start}s`,
      signed(row.mean),
      `${row.count} / 10年`,
      `${row.first}–${row.last}年`,
    ]);
  }
  byId('annual-growth-table').replaceChildren();
  for (const point of points) {
    addTableRow(byId('annual-growth-table'), [String(point.year), signed(point.growth)]);
  }
  byId('growth-meta').textContent =
    `系列：表${item.table} / 系列${item.series_number} / ${item.currency} / 基準年 ${item.base_year} / ${item.fiscal_year_type}（${item.first}–${item.last}年）。` +
    (item.price_basis_verified ? '' : '価格基準を確認できないため、成長率は未算出です。');
}

async function main(): Promise<void> {
  try {
    const [response, plotly] = await Promise.all([fetch(`${base}report.json`), loadPlotly()]);
    if (!response.ok) throw new Error(`レポートの取得に失敗しました（${response.status}）`);
    const report = (await response.json()) as Report;
    const countries = representativeSeries(report.series);
    const selector = byId('growth-country') as HTMLSelectElement;
    selector.replaceChildren();
    for (const item of countries) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.country;
      selector.append(option);
    }
    byId('growth-snapshot').textContent =
      `${countries.length}か国・地域 / 2008SNA公式実質GDP / 取得スナップショット ${report.source_manifest.retrieved_at}`;
    const update = () => {
      const item = countries.find((candidate) => candidate.id === selector.value);
      if (!item) return;
      plot(plotly, item, item.points, decadeAverages(item.points));
    };
    selector.addEventListener('change', update);
    update();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    byId('growth-error').hidden = false;
    byId('growth-error').textContent =
      `データを表示できませんでした：${message}。ページを再読込してください。`;
    byId('growth-snapshot').textContent = 'データの読み込みに失敗しました。';
  }
}

void main();
