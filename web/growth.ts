import type { Config, Data, Layout } from 'plotly.js';
import { bindCountryFilter } from './country-filter';
import { chooseCountrySeries, decadeAverages, type CountryChoice } from './country-series';
import type { DecadeAverage } from './country-series';
import type { Report } from './report';

type PlotlyStatic = typeof import('plotly.js');

declare global {
  interface Window {
    Plotly?: PlotlyStatic;
  }
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

function decadeTrace(averages: DecadeAverage[], color: string, name: string): Data {
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const customdata: (number[] | null)[] = [];
  let previous: DecadeAverage | undefined;
  for (const average of averages) {
    if (previous && average.start > previous.start + 10) {
      x.push(Math.min(previous.start + 10, previous.last + 1));
      y.push(previous.mean);
      customdata.push([previous.start, previous.count, previous.first, previous.last]);
      x.push(average.start);
      y.push(null);
      customdata.push(null);
    }
    x.push(average.start);
    y.push(average.mean);
    customdata.push([average.start, average.count, average.first, average.last]);
    previous = average;
  }
  if (previous) {
    x.push(Math.min(previous.start + 10, previous.last + 1));
    y.push(previous.mean);
    customdata.push([previous.start, previous.count, previous.first, previous.last]);
  }
  return {
    type: 'scatter' as const,
    mode: 'lines' as const,
    x,
    y,
    customdata,
    connectgaps: false,
    line: { color, width: 1.7, dash: 'dash' as const, shape: 'hv' as const },
    name: `${name} 10年平均`,
    hovertemplate:
      `<b>${name} · %{customdata[0]}s</b><br>10年平均：%{y:+.2f}%` +
      '<br>対象：%{customdata[1]}年（%{customdata[2]}–%{customdata[3]}）<extra></extra>',
  } as Data;
}

function tableRow(target: HTMLElement, values: string[], color?: string): void {
  const row = document.createElement('tr');
  if (color) row.style.setProperty('--row-country-color', color);
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  target.append(row);
}

function renderGrowthTables(choices: CountryChoice[]): void {
  const decadeDetails = byId('decade-details') as HTMLDetailsElement;
  const annualDetails = byId('annual-details') as HTMLDetailsElement;
  if (decadeDetails.open) {
    const body = byId('decade-growth-table');
    body.replaceChildren();
    for (const choice of choices) {
      for (const average of decadeAverages(choice.series.points)) {
        tableRow(
          body,
          [
            choice.name,
            `${average.start}s`,
            signed(average.mean),
            `${average.count}年`,
            `${average.first}–${average.last}年`,
          ],
          choice.color,
        );
      }
    }
  }
  if (annualDetails.open) {
    const body = byId('annual-growth-table');
    body.replaceChildren();
    for (const choice of choices) {
      for (const point of choice.series.points) {
        tableRow(body, [choice.name, String(point.year), signed(point.growth)], choice.color);
      }
    }
  }
}

function renderGrowthChart(
  plotly: PlotlyStatic,
  countries: CountryChoice[],
  selectedCodes: Set<string>,
): void {
  const selected = countries.filter((country) => selectedCodes.has(country.code));
  const traces: Data[] = selected.flatMap(({ name, series, color }) => {
    const points = series.points;
    const averages = decadeAverages(points);
    return [
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: points.map((point) => point.year),
        y: points.map((point) => point.growth),
        connectgaps: false,
        line: { color, width: 1.1 },
        name: `${name} 年次成長率`,
        hovertemplate: `<b>${name} · %{x}年</b><br>年次成長率：%{y:+.2f}%<extra></extra>`,
      } as Data,
      decadeTrace(averages, color, name),
    ];
  });
  const annotations = selected.length
    ? selected.some((country) => country.series.points.some((point) => point.growth !== null))
      ? []
      : [
          {
            text: '選択中の系列に算出可能な年次成長率がありません',
            xref: 'paper' as const,
            yref: 'paper' as const,
            x: 0.5,
            y: 0.5,
            showarrow: false,
          },
        ]
    : [
        {
          text: '表示する国・地域を選択してください',
          xref: 'paper' as const,
          yref: 'paper' as const,
          x: 0.5,
          y: 0.5,
          showarrow: false,
        },
      ];
  const layout: Partial<Layout> = {
    autosize: true,
    margin: { l: 62, r: 24, t: 18, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      color: '#647274',
      size: 11,
    },
    xaxis: { title: { text: '年' }, tickformat: 'd', gridcolor: '#e8e9e3', zeroline: false },
    yaxis: {
      title: { text: '成長率（%）' },
      ticksuffix: '%',
      gridcolor: '#e8e9e3',
      zerolinecolor: '#aebbb4',
    },
    showlegend: false,
    hovermode: 'closest',
    annotations,
  };
  const config: Partial<Config> = { responsive: true, displaylogo: false, scrollZoom: false };
  void plotly.react('growth-chart', traces, layout, config);
  byId('growth-chart-count').textContent =
    `${selected.length} / ${countries.length}か国・地域を表示中`;
  byId('growth-meta').textContent = selected.length
    ? selected.length === 1
      ? `表示系列：${selected[0].series.table} / 系列${selected[0].series.series_number} / ${selected[0].series.currency} / 基準年 ${selected[0].series.base_year} / ${selected[0].series.fiscal_year_type}（${selected[0].series.first}–${selected[0].series.last}年）。${selected[0].series.price_basis_verified ? '' : '価格基準を確認できないため、成長率は未算出です。'}`
      : `${selected.length}か国・地域の公式実質GDP系列を比較しています。系列の基準年・会計年度・収録期間は国ごとに異なります。`
    : '国・地域が選択されていません。';
  renderGrowthTables(selected);
}

async function main(): Promise<void> {
  try {
    const [response, plotly] = await Promise.all([fetch(`${base}report.json`), loadPlotly()]);
    if (!response.ok) throw new Error(`レポートの取得に失敗しました（${response.status}）`);
    const report = (await response.json()) as Report;
    const countries = chooseCountrySeries(report.series);
    byId('growth-snapshot').textContent =
      `${countries.length}か国・地域 / 2008SNA公式実質GDP / 取得スナップショット ${report.source_manifest.retrieved_at}`;

    const render = (codes: Set<string>) => renderGrowthChart(plotly, countries, codes);
    bindCountryFilter(byId('growth-country-filter'), countries, render);
    for (const id of ['decade-details', 'annual-details']) {
      byId(id).addEventListener('toggle', () => {
        if ((byId(id) as HTMLDetailsElement).open) {
          const selected = countries.filter((country) => {
            const checkbox = byId('growth-country-filter').querySelector<HTMLInputElement>(
              `input[value="${CSS.escape(country.code)}"]`,
            );
            return checkbox?.checked ?? false;
          });
          renderGrowthTables(selected);
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    byId('growth-error').hidden = false;
    byId('growth-error').textContent =
      `データを表示できませんでした：${message}。ページを再読込してください。`;
    byId('growth-snapshot').textContent = 'データの読み込みに失敗しました。';
  }
}

void main();
