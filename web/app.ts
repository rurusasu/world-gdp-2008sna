import type { Annotations, Config, Layout } from 'plotly.js';
import type { Country, DisplaySeries, GDPSourceFile, Point, Report } from './report';
import { bindCountryFilter } from './country-filter';
import { chooseCountrySeries, type CountryChoice } from './country-series';

type PlotlyStatic = typeof import('plotly.js');

declare global {
  interface Window {
    Plotly?: PlotlyStatic;
  }
}

type Mode = 'countries' | 'panel' | 'reference';
interface Controls {
  'panel-select': HTMLSelectElement;
  'from-year': HTMLInputElement;
  'to-year': HTMLInputElement;
  'audit-search': HTMLInputElement;
}

function $<Id extends string>(id: Id): Id extends keyof Controls ? Controls[Id] : HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`表示要素が見つかりません：${id}`);
  return element as Id extends keyof Controls ? Controls[Id] : HTMLElement;
}

function loadPlotly(): Promise<PlotlyStatic> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}plotly.min.js`;
    script.onload = () =>
      window.Plotly
        ? resolve(window.Plotly)
        : reject(new Error('グラフライブラリを初期化できませんでした'));
    script.onerror = () => reject(new Error('グラフライブラリを読み込めませんでした'));
    document.head.append(script);
  });
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  $('error').hidden = false;
  $('error').textContent =
    `レポートを表示できませんでした：${message}。ページを再読込するか、CSVを確認してください。`;
}
const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHTML = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (char) => escapes[char] ?? char);
const format = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '欠測'
    : new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(value);
const signed = (value: number | null | undefined) =>
  value === null || value === undefined ? '欠測' : `${value >= 0 ? '+' : ''}${format(value)}%`;
let report: Report,
  mode: Mode = 'countries',
  current: DisplaySeries | null | undefined,
  countries: Country[],
  choices: CountryChoice[],
  selectedCodes = new Set<string>(),
  plotly: PlotlyStatic;

function option(select: HTMLSelectElement, value: string, text: string) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = text;
  select.append(node);
}
function cellRow(target: HTMLElement, values: (string | number)[]) {
  const tr = document.createElement('tr');
  values.forEach((value) => {
    const td = document.createElement('td');
    td.textContent = String(value);
    tr.append(td);
  });
  target.append(tr);
}
function switchMode(nextMode: Mode) {
  mode = nextMode;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  $('panel-control').hidden = mode !== 'panel';
  $('country-filter').hidden = mode !== 'countries';
  $('combined-layout').classList.toggle('single-chart', mode !== 'countries');
  $('index-unit').textContent = mode === 'countries' ? '各系列の起点年 = 100' : '';
  $('point-details').hidden = mode === 'countries';
  chooseCurrent();
}
function chooseCurrent() {
  if (mode === 'countries') {
    current = null;
    const first = report.summary.real_first;
    const last = report.summary.real_last;
    for (const id of ['from-year', 'to-year'] as const) {
      $(id).min = String(first);
      $(id).max = String(last);
      $(id).setCustomValidity('');
    }
    $('from-year').value = String(first);
    $('to-year').value = String(last);
    $('data-badge').classList.remove('reference');
    $('data-badge').textContent = '2008SNA / 公式値';
    $('chart-title').textContent = `${choices.length}か国・地域の実質GDP推移`;
    $('chart-description').textContent =
      '各国の代表系列を1つずつ表示します。指数は国ごとの系列起点年を100とする推移で、国間のGDP水準比較ではありません。会計年度・基準年・収録期間は国ごとに異なります。';
    $('series-notes').textContent = '';
    $('members-details').hidden = true;
    $('members-table').replaceChildren();
    $('member-summary').textContent = '';
    $('excluded').textContent = '';
    renderCountryChart(selectedCodes);
    $('reading').replaceChildren();
    $('point-table').replaceChildren();
    return;
  }
  current =
    mode === 'panel'
      ? report.panels.find((p) => p.id === $('panel-select').value)
      : report.reference;
  if (!current) {
    $('chart-title').textContent = 'この条件では集計できる系列がありません';
    return;
  }
  for (const id of ['from-year', 'to-year'] as const) {
    $(id).min = String(current.first);
    $(id).max = String(current.last);
    $(id).setCustomValidity('');
  }
  $('from-year').value = String(current.first);
  $('to-year').value = String(current.last);
  $('data-badge').classList.toggle('reference', mode === 'reference');
  $('data-badge').textContent =
    mode === 'reference' ? '参考 / 推計・補完を含む' : '2008SNA / 公式値';
  $('chart-title').textContent = current.label;
  $('index-unit').textContent = `${current.index_base}年 = 100`;
  const description =
    current.kind === 'panel'
      ? `${current.country_count}か国・地域を全期間で固定。2020年の公式名目GDPと確認済み為替による固定ウェイト。世界全体の集計ではありません。`
      : '国連AMAの2020年価格米ドル系列。欠測補完・接続推計を含み、2008SNA公式値だけの集計ではありません。';
  $('chart-description').textContent = description;
  const notes = [...new Set(current.points.map((p) => p.notes).filter(Boolean))];
  $('series-notes').textContent = notes.length ? `原資料の注記：${notes.join(' / ')}` : '';
  $('members-details').hidden = mode !== 'panel';
  $('members-table').replaceChildren();
  if (current.kind === 'panel') {
    current.members.forEach((member) =>
      cellRow($('members-table'), [
        member.country,
        format(member.weight_share * 100, 4),
        member.series_id,
        member.fx.source_note,
      ]),
    );
    $('member-summary').textContent =
      `通貨換算：現地通貨 / 米ドル。ウェイトの価格・為替年：${current.benchmark_year}年。国・地域の追加や削除はこの期間内で行いません。`;
    $('excluded').textContent =
      `取得した公式実質GDPにある国・地域のうち、この集計の対象外：${current.excluded_countries.join('、')}。暦年・同通貨・同系列番号の2020年名目GDPと為替、対象期間の完全な実質系列をすべて満たすものに限定しています。詳細な系列除外理由は exclusions.csv に保存しています。`;
  }
  renderCharts();
}
function renderCharts() {
  if (!current) return;
  const first = Number($('from-year').value),
    last = Number($('to-year').value);
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first > last ||
    first < current.first ||
    last > current.last
  ) {
    $('from-year').setCustomValidity(
      '系列の収録期間内で、開始年 ≤ 終了年となる整数を指定してください。',
    );
    $('from-year').reportValidity();
    return;
  }
  $('from-year').setCustomValidity('');
  const points = current.points.filter((p) => p.year >= first && p.year <= last);
  const color = mode === 'reference' ? '#a97831' : '#147c75';
  const data = points.map((p) => [
    escapeHTML(format(p.value, 4)),
    escapeHTML(signed(p.growth)),
    escapeHTML(p.notes || ''),
  ]);
  const currency = escapeHTML(current.currency);
  const layout: Partial<Layout> = {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: 'Segoe UI, Yu Gothic, Meiryo, sans-serif', size: 11, color: '#526967' },
    margin: { l: 62, r: 20, t: 22, b: 48 },
    showlegend: false,
    hovermode: 'closest',
    xaxis: {
      title: { text: '年', standoff: 10 },
      tickformat: 'd',
      range: [first - 0.4, last + 0.4],
      showgrid: false,
      zeroline: false,
    },
    yaxis: {
      title: { text: `${current.kind === 'panel' ? '実質GDP指数' : '実質GDP指数'}` },
      gridcolor: '#e9ede7',
      zerolinecolor: '#d3ddd6',
      rangemode: 'tozero',
    },
    yaxis2: {
      title: { text: '前年比（%）' },
      overlaying: 'y',
      side: 'right',
      ticksuffix: '%',
      showgrid: false,
      zeroline: false,
    },
    hoverlabel: { bgcolor: '#ffffff', font: { size: 12, color: '#163940' }, bordercolor: color },
  };
  const config: Partial<Config> = {
    responsive: true,
    displaylogo: false,
    scrollZoom: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d'],
    toImageButtonOptions: { format: 'svg', filename: 'gdp-report' },
  };
  const annotations: Partial<Annotations>[] = points.some(
    (p) => p.index !== null || p.growth !== null,
  )
    ? []
    : [
        {
          text: '比較に必要な値を確認できません',
          xref: 'paper',
          yref: 'paper',
          x: 0.5,
          y: 0.5,
          showarrow: false,
        },
      ];
  const traces = [
    {
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      x: points.map((p) => p.year),
      y: points.map((p) => p.index),
      yaxis: 'y',
      connectgaps: false,
      line: { color, width: 2.5 },
      marker: { size: 4, color },
      customdata: data,
      name: '実質GDP指数',
      hovertemplate: `<b>%{x}年</b><br>指数：%{y:,.2f}<br>実質GDP：%{customdata[0]} ${currency}<br>前年比：%{customdata[1]}<extra></extra>`,
    },
    {
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      x: points.map((p) => p.year),
      y: points.map((p) => p.growth),
      yaxis: 'y2',
      connectgaps: false,
      line: { color, width: 1.8, dash: 'dash' as const },
      marker: { size: 4, color },
      customdata: data,
      name: '前年比',
      hovertemplate: `<b>%{x}年</b><br>前年比：%{y:+.2f}%<br>実質GDP：%{customdata[0]} ${currency}<extra></extra>`,
    },
  ];
  void plotly.react('combined-chart', traces, { ...layout, annotations }, config).catch(showError);
  $('point-table').replaceChildren();
  points.forEach((p) =>
    cellRow($('point-table'), [
      p.year,
      format(p.value, 4),
      format(p.index),
      p.growth === null ? '欠測' : format(p.growth),
      p.notes || '',
    ]),
  );
  const valid = points.filter(
    (p): p is Point & { value: number } => p.value !== null && p.value > 0,
  );
  $('reading').replaceChildren();
  if (current.kind === 'real' && current.price_basis_verified === false) {
    $('reading').textContent = '価格の比較基準を確認できないため、増加率は算出していません。';
  } else if (valid.length) {
    const begin = valid[0],
      end = valid[valid.length - 1];
    const stats = [
      [`${end.year}年の前年比`, signed(end.growth)],
      [`${begin.year}→${end.year}年の増加率`, signed(100 * (end.value / begin.value - 1))],
      ['表示中の観測値', `${valid.length} / ${points.length}年`],
    ];
    stats.forEach(([label, value]) => {
      const box = document.createElement('div');
      box.append(document.createTextNode(label + '　'));
      const strong = document.createElement('strong');
      strong.textContent = value;
      box.append(strong);
      $('reading').append(box);
    });
  }
}
function renderCountryChart(codes: Set<string>) {
  const selected = choices.filter((choice) => codes.has(choice.code));
  const requestedFirst = Number($('from-year').value);
  const requestedLast = Number($('to-year').value);
  const validPeriod =
    Number.isInteger(requestedFirst) &&
    Number.isInteger(requestedLast) &&
    requestedFirst <= requestedLast &&
    requestedFirst >= report.summary.real_first &&
    requestedLast <= report.summary.real_last;
  if (!validPeriod && selected.length > 0) {
    $('from-year').setCustomValidity('収録期間内で、開始年 ≤ 終了年となる整数を指定してください。');
    $('from-year').reportValidity();
    return;
  }
  $('from-year').setCustomValidity('');
  const first = validPeriod ? requestedFirst : report.summary.real_first;
  const last = validPeriod ? requestedLast : report.summary.real_last;
  if (!validPeriod) {
    $('from-year').value = String(first);
    $('to-year').value = String(last);
  }
  const traces = selected.flatMap(({ name, series, color }) => {
    const points = series.points.filter((point) => point.year >= first && point.year <= last);
    return [
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: points.map((point) => point.year),
        y: points.map((point) => point.index),
        connectgaps: false,
        yaxis: 'y',
        name: `${name} 実質GDP指数`,
        line: { color, width: 1.8 },
        customdata: points.map((point) => [name, point.year, point.growth]),
        hovertemplate: '<b>%{customdata[0]} · %{x}年</b><br>指数：%{y:,.2f}<extra></extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        x: points.map((point) => point.year),
        y: points.map((point) => point.growth),
        connectgaps: false,
        yaxis: 'y2',
        name: `${name} 前年比`,
        line: { color, width: 1.3, dash: 'dash' as const },
        marker: { color, size: 3.5 },
        customdata: points.map((point) => [name, point.year, point.index]),
        hovertemplate: '<b>%{customdata[0]} · %{x}年</b><br>前年比：%{y:+.2f}%<extra></extra>',
      },
    ];
  });
  const annotations: Partial<Annotations>[] =
    selected.length === 0
      ? [
          {
            text: '表示する国・地域を選択してください',
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5,
            showarrow: false,
          },
        ]
      : traces.some((trace) => trace.y.some((value) => value !== null))
        ? []
        : [
            {
              text: '選択中の系列に表示できる指数・前年比がありません',
              xref: 'paper',
              yref: 'paper',
              x: 0.5,
              y: 0.5,
              showarrow: false,
            },
          ];
  const layout: Partial<Layout> = {
    autosize: true,
    margin: { l: 62, r: 62, t: 18, b: 48 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: 'Segoe UI, Yu Gothic, Meiryo, sans-serif', size: 11, color: '#526967' },
    showlegend: false,
    hovermode: 'closest',
    xaxis: {
      title: { text: '年', standoff: 10 },
      tickformat: 'd',
      range: [first - 0.4, last + 0.4],
      showgrid: false,
      zeroline: false,
    },
    yaxis: { title: { text: '実質GDP指数' }, gridcolor: '#e9ede7', rangemode: 'tozero' },
    yaxis2: {
      title: { text: '前年比（%）' },
      overlaying: 'y',
      side: 'right',
      ticksuffix: '%',
      showgrid: false,
      zeroline: false,
    },
    annotations,
  };
  const config: Partial<Config> = {
    responsive: true,
    displaylogo: false,
    scrollZoom: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d'],
  };
  void plotly.react('combined-chart', traces, layout, config).catch(showError);
  $('chart-title').textContent = `${selected.length} / ${choices.length}か国・地域を表示中`;
}
function renderAudit() {
  const query = $('audit-search').value.trim().toLowerCase();
  const visible = countries.filter((c) => c.name.toLowerCase().includes(query));
  $('audit-table').replaceChildren();
  visible.forEach((c) =>
    cellRow($('audit-table'), [
      c.name,
      c.first,
      c.last,
      c.count,
      c.last === report.summary.real_last ? 'あり' : '未収録',
    ]),
  );
  $('audit-count').textContent =
    `${visible.length} / ${countries.length}か国・地域。実質GDPの公式系列を対象。全系列の基準年・会計年度・欠測は監査CSVで確認できます。`;
}
async function init() {
  try {
    const [response, renderer] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}report.json`),
      loadPlotly(),
    ]);
    plotly = renderer;
    if (!response.ok) throw new Error(`データ読込 HTTP ${response.status}`);
    report = (await response.json()) as Report;
    $('span').textContent = `${report.summary.real_first}–${report.summary.real_last}`;
    $('countries').textContent = `${report.summary.real_countries}か国・地域`;
    $('series-count').textContent = format(report.summary.real_series, 0);
    const date = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(report.source_manifest.retrieved_at));
    $('snapshot').textContent =
      `原データ取得：${date}（JST） · GDP最新収録：${report.summary.real_last}年 · 更新は手動の再取得後に反映`;
    report.panels.forEach((p) => option($('panel-select'), p.id, p.label));
    if (report.default_panel) $('panel-select').value = report.default_panel;
    const grouped = new Map<string, Country>();
    report.series.forEach((s) => {
      const c = grouped.get(s.country_code) || {
        code: s.country_code,
        name: s.country,
        first: s.first,
        last: s.last,
        count: 0,
      };
      c.first = Math.min(c.first, s.first);
      c.last = Math.max(c.last, s.last);
      c.count++;
      grouped.set(s.country_code, c);
    });
    countries = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
    choices = chooseCountrySeries(report.series);
    bindCountryFilter($('country-filter'), choices, (codes) => {
      selectedCodes = codes;
      if (mode === 'countries') renderCountryChart(codes);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) =>
      button.addEventListener('click', () => {
        const next = button.dataset.mode;
        if (next === 'panel' || next === 'countries' || next === 'reference') switchMode(next);
      }),
    );
    $('panel-select').addEventListener('change', chooseCurrent);
    $('from-year').addEventListener('change', () =>
      mode === 'countries' ? renderCountryChart(selectedCodes) : renderCharts(),
    );
    $('to-year').addEventListener('change', () =>
      mode === 'countries' ? renderCountryChart(selectedCodes) : renderCharts(),
    );
    $('reset').addEventListener('click', chooseCurrent);
    $('audit-search').addEventListener('input', renderAudit);
    const verified = report.source_manifest.files.filter((f): f is GDPSourceFile =>
      Boolean(f.group),
    );
    $('source-verification').textContent = `GDP取得件数 ${format(
      verified.reduce((sum, f) => sum + f.verified_rows, 0),
      0,
    )}行。${verified.length}表すべてで提供元表示件数と一致。原本のSHA-256を再計算してから分析しています。`;
    renderAudit();
    switchMode('countries');
  } catch (error) {
    showError(error);
  }
}
void init();
