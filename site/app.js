'use strict';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const format = (value, digits = 2) => value === null || value === undefined || !Number.isFinite(value) ? '欠測' : new Intl.NumberFormat('ja-JP', {maximumFractionDigits: digits}).format(value);
const signed = value => value === null || value === undefined ? '欠測' : `${value >= 0 ? '+' : ''}${format(value)}%`;
let report, mode = 'panel', current, countries;

function option(select, value, text) {
  const node = document.createElement('option'); node.value = value; node.textContent = text; select.append(node);
}
function cellRow(target, values) {
  const tr = document.createElement('tr');
  values.forEach(value => {const td = document.createElement('td'); td.textContent = value; tr.append(td);});
  target.append(tr);
}
function baseLabel(series) {
  return series.base_year === '-1' || !series.base_year ? `基準年コード ${series.base_year || '未記載'}` : `価格基準 ${series.base_year}`;
}
function selectCountry() {
  const code = $('country-select').value;
  const choices = report.series.filter(s => s.country_code === code).sort((a,b) => Number(b.preferred)-Number(a.preferred) || b.last-a.last || a.id.localeCompare(b.id));
  $('series-select').replaceChildren();
  choices.forEach(s => option($('series-select'), s.id, `表${s.table} / 系列${s.series_number} / ${baseLabel(s)} / ${s.first}–${s.last}${s.preferred ? ' ★' : ''}`));
  chooseCurrent();
}
function switchMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('[data-mode]').forEach(button => {button.classList.toggle('active', button.dataset.mode === mode); button.setAttribute('aria-pressed', String(button.dataset.mode === mode));});
  $('panel-control').hidden = mode !== 'panel';
  $('country-control').hidden = $('series-control').hidden = mode !== 'country';
  chooseCurrent();
}
function chooseCurrent() {
  current = mode === 'panel' ? report.panels.find(p => p.id === $('panel-select').value) : mode === 'reference' ? report.reference : report.series.find(s => s.id === $('series-select').value);
  if (!current) { $('chart-title').textContent = 'この条件では集計できる系列がありません'; return; }
  for (const id of ['from-year','to-year']) {$(id).min = current.first; $(id).max = current.last; $(id).setCustomValidity('');}
  $('from-year').value = current.first; $('to-year').value = current.last;
  $('data-badge').classList.toggle('reference', mode === 'reference');
  $('data-badge').textContent = mode === 'reference' ? '参考 / 推計・補完を含む' : '2008SNA / 公式値';
  $('chart-title').textContent = mode === 'country' ? `${current.country} — 公式実質GDP` : current.label;
  $('index-unit').textContent = `${current.index_base}年 = 100`;
  const description = mode === 'panel'
    ? `${current.country_count}か国・地域を全期間で固定。2020年の公式名目GDPと確認済み為替による固定ウェイト。世界全体の集計ではありません。`
    : mode === 'reference'
      ? '国連AMAの2020年価格米ドル系列。欠測補完・接続推計を含み、2008SNA公式値だけの集計ではありません。'
      : `表 ${current.table} / 系列 ${current.series_number} / ${baseLabel(current)} / ${current.currency} / ${current.fiscal_year_type}。指数は${current.index_base}年を100とします。`;
  $('chart-description').textContent = description;
  if (mode === 'country' && !current.price_basis_verified) $('chart-description').textContent += ' 固定価格で比較できる基準年を確認できないため、指数・前年比は未算出です。元の値は表とCSVに保存しています。';
  const notes = mode === 'country' ? [...new Set(current.points.map(p => p.notes).filter(Boolean))] : [];
  $('series-notes').textContent = notes.length ? `原資料の注記：${notes.join(' / ')}` : '';
  $('members-details').hidden = mode !== 'panel';
  $('members-table').replaceChildren();
  if (mode === 'panel') {
    current.members.forEach(member => cellRow($('members-table'), [member.country, format(member.weight_share * 100, 4), member.series_id, member.fx.source_note]));
    $('member-summary').textContent = `通貨換算：現地通貨 / 米ドル。ウェイトの価格・為替年：${current.benchmark_year}年。国・地域の追加や削除はこの期間内で行いません。`;
    $('excluded').textContent = `取得した公式実質GDPにある国・地域のうち、この集計の対象外：${current.excluded_countries.join('、')}。暦年・同通貨・同系列番号の2020年名目GDPと為替、対象期間の完全な実質系列をすべて満たすものに限定しています。詳細な系列除外理由は exclusions.csv に保存しています。`;
  }
  renderCharts();
}
function renderCharts() {
  if (!current) return;
  const first = Number($('from-year').value), last = Number($('to-year').value);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first > last || first < current.first || last > current.last) {
    $('from-year').setCustomValidity('系列の収録期間内で、開始年 ≤ 終了年となる整数を指定してください。');
    $('from-year').reportValidity(); return;
  }
  $('from-year').setCustomValidity('');
  const points = current.points.filter(p => p.year >= first && p.year <= last);
  const color = mode === 'reference' ? '#a97831' : '#147c75';
  const data = points.map(p => [escapeHTML(format(p.value, 4)), escapeHTML(signed(p.growth)), escapeHTML(p.notes || '')]);
  const currency = escapeHTML(current.currency);
  const layout = {
    paper_bgcolor:'#ffffff', plot_bgcolor:'#ffffff', font:{family:'Segoe UI, Yu Gothic, Meiryo, sans-serif',size:11,color:'#526967'},
    margin:{l:62,r:20,t:22,b:48}, showlegend:false, hovermode:'closest',
    xaxis:{title:{text:'年',standoff:10},tickformat:'d',range:[first-.4,last+.4],showgrid:false,zeroline:false},
    yaxis:{gridcolor:'#e9ede7',zerolinecolor:'#d3ddd6',rangemode:'tozero'},
    hoverlabel:{bgcolor:'#ffffff',font:{size:12,color:'#163940'},bordercolor:color},
  };
  const config = {responsive:true,displaylogo:false,scrollZoom:false,modeBarButtonsToRemove:['select2d','lasso2d'],toImageButtonOptions:{format:'svg',filename:'gdp-report'}};
  const emptyAnnotations = field => points.some(p=>p[field]!==null) ? [] : [{text:'比較に必要な価格基準または値を確認できません',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false,font:{size:11,color:'#647274'}}];
  Plotly.react('index-chart', [{type:'scatter',mode:'lines+markers',x:points.map(p=>p.year),y:points.map(p=>p.index),connectgaps:false,
    line:{color,width:2.5},marker:{size:4,color},customdata:data,
    hovertemplate:`<b>%{x}年</b><br>指数：%{y:,.2f}<br>実質GDP：%{customdata[0]} ${currency}<br>前年比：%{customdata[1]}<extra></extra>`}], {...layout,annotations:emptyAnnotations('index')}, config);
  Plotly.react('growth-chart', [{type:'bar',x:points.map(p=>p.year),y:points.map(p=>p.growth),customdata:data,
    marker:{color:points.map(p=>p.growth < 0 ? '#b75946' : color)},
    hovertemplate:`<b>%{x}年</b><br>前年比：%{y:+.2f}%<br>実質GDP：%{customdata[0]} ${currency}<extra></extra>`}], {...layout,annotations:emptyAnnotations('growth'),yaxis:{...layout.yaxis,ticksuffix:'%'}}, config);
  $('point-table').replaceChildren();
  points.forEach(p => cellRow($('point-table'),[p.year,format(p.value,4),format(p.index),p.growth===null?'欠測':format(p.growth),p.notes || '']));
  const valid = points.filter(p=>p.value!==null && p.value>0);
  $('reading').replaceChildren();
  if (current.price_basis_verified === false) {
    $('reading').textContent = '価格の比較基準を確認できないため、増加率は算出していません。';
  } else if (valid.length) {
    const begin=valid[0], end=valid[valid.length-1];
    const stats = [[`${end.year}年の前年比`,signed(end.growth)],
      [`${begin.year}→${end.year}年の増加率`,signed(100*(end.value/begin.value-1))],
      ['表示中の観測値',`${valid.length} / ${points.length}年`]];
    stats.forEach(([label,value])=>{const box=document.createElement('div');box.append(document.createTextNode(label+'　'));const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$('reading').append(box);});
  }
}
function renderAudit() {
  const query=$('audit-search').value.trim().toLowerCase();
  const visible=countries.filter(c=>c.name.toLowerCase().includes(query));
  $('audit-table').replaceChildren();
  visible.forEach(c=>cellRow($('audit-table'),[c.name,c.first,c.last,c.count,c.last===report.summary.real_last?'あり':'未収録']));
  $('audit-count').textContent=`${visible.length} / ${countries.length}か国・地域。実質GDPの公式系列を対象。全系列の基準年・会計年度・欠測は監査CSVで確認できます。`;
}
async function init() {
  try {
    const response=await fetch('report.json');
    if (!response.ok) throw new Error(`データ読込 HTTP ${response.status}`);
    report=await response.json();
    $('span').textContent=`${report.summary.real_first}–${report.summary.real_last}`;
    $('countries').textContent=`${report.summary.real_countries}か国・地域`;
    $('series-count').textContent=format(report.summary.real_series,0);
    const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(report.source_manifest.retrieved_at));
    $('snapshot').textContent=`原データ取得：${date}（JST） · GDP最新収録：${report.summary.real_last}年 · 更新は手動の再取得後に反映`;
    report.panels.forEach(p=>option($('panel-select'),p.id,p.label));
    if(report.default_panel) $('panel-select').value=report.default_panel;
    const grouped=new Map();
    report.series.forEach(s=>{const c=grouped.get(s.country_code) || {code:s.country_code,name:s.country,first:s.first,last:s.last,count:0};c.first=Math.min(c.first,s.first);c.last=Math.max(c.last,s.last);c.count++;grouped.set(s.country_code,c);});
    countries=[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name));
    countries.forEach(c=>option($('country-select'),c.code,c.name));
    if(grouped.has('392')) $('country-select').value='392';
    selectCountry();
    document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>switchMode(button.dataset.mode)));
    $('country-select').addEventListener('change',selectCountry);
    $('series-select').addEventListener('change',chooseCurrent);
    $('panel-select').addEventListener('change',chooseCurrent);
    $('from-year').addEventListener('change',renderCharts);$('to-year').addEventListener('change',renderCharts);
    $('reset').addEventListener('click',chooseCurrent);$('audit-search').addEventListener('input',renderAudit);
    const verified=report.source_manifest.files.filter(f=>f.group);
    $('source-verification').textContent=`GDP取得件数 ${format(verified.reduce((sum,f)=>sum+f.verified_rows,0),0)}行。${verified.length}表すべてで提供元表示件数と一致。原本のSHA-256を再計算してから分析しています。`;
    renderAudit();
    switchMode('panel');
  } catch(error) {
    $('error').hidden=false;$('error').textContent=`レポートを表示できませんでした：${error.message}。ページを再読込するか、CSVを確認してください。`;
  }
}
init();
