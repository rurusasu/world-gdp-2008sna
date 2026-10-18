"""Generate portable reports from a verified, committed source snapshot."""

import csv
import json
from pathlib import Path
import shutil

from .acquire import load_snapshot, read_exchange_rates, read_world_reference
from .analyze import analyze_rows, choose_panels

def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def static_figure(item: dict, target: Path, title: str) -> None:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    years = [p['year'] for p in item['points']]
    indices = [p['index'] if p['index'] is not None else float('nan') for p in item['points']]
    growth = [p['growth'] if p['growth'] is not None else float('nan') for p in item['points']]
    fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=True, layout='constrained')
    fig.suptitle(title, fontsize=12)
    axes[0].plot(years, indices, color='#126e69', linewidth=2)
    axes[0].set_ylabel(f"Index ({item['index_base']} = 100)")
    axes[1].bar(years, growth, color=['#126e69' if not v < 0 else '#b75b47' for v in growth])
    axes[1].set_ylabel('Year-on-year (%)')
    axes[1].set_xlabel('Year')
    for ax in axes:
        ax.grid(axis='y', alpha=.2)
        ax.spines[['top', 'right']].set_visible(False)
    fig.text(.99, .005, 'Source: UNSD | See online report for coverage and metadata', ha='right', fontsize=8)
    fig.savefig(target.with_suffix('.png'), dpi=150)
    fig.savefig(target.with_suffix('.svg'), metadata={'Date': None})
    plt.close(fig)


def country_growth_exports(series: list[dict]) -> tuple[list[dict], list[dict]]:
    """Create annual growth and decade-mean rows for one preferred series per country."""
    by_country = {}
    for item in series:
        current = by_country.get(item['country_code'])
        rank = (not item['preferred'], -item['last'], item['id'])
        if current is None or rank < (not current['preferred'], -current['last'], current['id']):
            by_country[item['country_code']] = item

    annual_rows, grouped = [], {}
    for code, item in sorted(by_country.items(), key=lambda pair: pair[1]['country'].casefold()):
        for point in item['points']:
            annual_rows.append({
                'country_code': code, 'country': item['country'], 'series_id': item['id'],
                'table': item['table'], 'series_number': item['series_number'],
                'currency': item['currency'], 'base_year': item['base_year'],
                'fiscal_year_type': item['fiscal_year_type'], 'year': point['year'],
                'annual_growth_pct': point['growth'],
            })
            if point['growth'] is not None:
                decade = point['year'] // 10 * 10
                grouped.setdefault((code, decade), []).append(point)

    decade_rows = []
    for (code, decade), points in sorted(
        grouped.items(), key=lambda pair: (pair[0][1], by_country[pair[0][0]]['country'].casefold())
    ):
        item = by_country[code]
        years = [point['year'] for point in points]
        decade_rows.append({
            'country_code': code, 'country': item['country'], 'decade': f'{decade}s',
            'period_start': decade, 'period_end': decade + 9, 'annual_rate_count': len(points),
            'first_rate_year': min(years), 'last_rate_year': max(years),
            'average_annual_growth_pct': sum(point['growth'] for point in points) / len(points),
            'series_id': item['id'], 'table': item['table'], 'series_number': item['series_number'],
            'currency': item['currency'], 'base_year': item['base_year'],
            'fiscal_year_type': item['fiscal_year_type'],
        })
    return annual_rows, decade_rows


def export_report(root: Path, model: dict, static: bool = True) -> None:
    from plotly.offline import get_plotlyjs
    import plotly
    site = root / 'site'
    downloads = site / 'downloads'
    processed = root / 'data' / 'processed'
    for directory in (site, downloads, processed):
        directory.mkdir(parents=True, exist_ok=True)
    (site / '.nojekyll').write_text('', encoding='utf-8')
    (site / 'plotly.min.js').write_text(get_plotlyjs(), encoding='utf-8')
    model = {**model, 'plotly_python_version': plotly.__version__}
    columns = ['id', 'country_code', 'country', 'table', 'series_number', 'currency',
               'base_year', 'fiscal_year_type', 'price_basis_verified', 'year', 'value', 'index', 'growth', 'notes']
    for kind, key in [('real', 'series'), ('nominal', 'nominal_series')]:
        rows = [{**s, **point} for s in model[key] for point in s['points']]
        write_csv(downloads / f'{kind}-gdp.csv', columns, rows)
    annual_growth, decade_growth = country_growth_exports(model['series'])
    write_csv(downloads / 'country-annual-growth.csv', [
        'country_code', 'country', 'series_id', 'table', 'series_number', 'currency', 'base_year',
        'fiscal_year_type', 'year', 'annual_growth_pct',
    ], annual_growth)
    write_csv(downloads / 'decade-average-growth.csv', [
        'country_code', 'country', 'decade', 'period_start', 'period_end', 'annual_rate_count',
        'first_rate_year', 'last_rate_year', 'average_annual_growth_pct', 'series_id', 'table',
        'series_number', 'currency', 'base_year', 'fiscal_year_type',
    ], decade_growth)
    audit = [{**s, 'missing_years': ';'.join(map(str, s['missing_years'])),
              'longest_run_first': s['longest_run']['first'], 'longest_run_last': s['longest_run']['last']}
             for s in model['series'] + model['nominal_series']]
    write_csv(downloads / 'series-audit.csv', ['kind', 'id', 'country_code', 'country', 'table', 'series_number',
              'currency', 'base_year', 'fiscal_year_type', 'price_basis_verified', 'first', 'last', 'observations',
              'invalid_values', 'missing_years', 'longest_run_first', 'longest_run_last', 'preferred'], audit)
    write_csv(downloads / 'aggregate.csv', ['panel_id', 'country_count', 'year', 'value', 'index', 'growth'],
              [{'panel_id': p['id'], 'country_count': p['country_count'], **point}
               for p in model['panels'] for point in p['points']])
    write_csv(downloads / 'panel-members.csv', ['panel_id', 'country_code', 'country', 'series_id',
              'nominal_series_id', 'weight_usd', 'weight_share', 'fx_currency', 'fx_rate', 'fx_note'],
              [{'panel_id': p['id'], **member, 'fx_currency': member['fx']['currency'],
                'fx_rate': member['fx']['rate'], 'fx_note': member['fx']['source_note']}
               for p in model['panels'] for member in p['members']])
    write_csv(downloads / 'exclusions.csv', ['country', 'series_id', 'reason'], model['exclusions'])
    write_csv(downloads / 'reference-world.csv', ['year', 'value', 'index', 'growth', 'notes'],
              model['reference']['points'] if model['reference'] else [])
    (downloads / 'provenance.json').write_text(json.dumps(model['source_manifest'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    public = {**model, 'nominal_series': [{k: v for k, v in s.items() if k != 'points'} for s in model['nominal_series']]}
    payload = json.dumps(public, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'
    (site / 'report.json').write_text(payload, encoding='utf-8')
    (processed / 'report.json').write_text(payload, encoding='utf-8')
    for path in downloads.iterdir():
        if path.suffix in ('.csv', '.json'):
            shutil.copyfile(path, processed / path.name)
    if static:
        figures = site / 'figures'
        figures.mkdir(exist_ok=True)
        selected = next((p for p in model['panels'] if p['id'] == model['default_panel']), None)
        if selected:
            static_figure(selected, figures / 'official-panel', f"Official 2008 SNA | {selected['country_count']} fixed countries/areas | {selected['first']}-{selected['last']}")
        if model['reference']:
            static_figure(model['reference'], figures / 'world-reference', 'UN world GDP reference (includes estimates/backcasting; NOT direct 2008-only)')
        countries = sorted({s['country_code'] for s in model['series']})
        for code in countries:
            choices = [s for s in model['series'] if s['country_code'] == code]
            choices.sort(key=lambda s: (not s['preferred'], -s['last'], s['id']))
            item = choices[0]
            static_figure(item, figures / f'country-{code}', f"{item['country']} | Table {item['table']} | Series {item['series_number']} | price reference {item['base_year']}")
        print(f'Static exports: {len(countries)} country representatives + panel/reference', flush=True)


def build_report(root: Path, snapshot: Path | None = None, static: bool = True) -> dict:
    manifest, nominal, real = load_snapshot(root, snapshot)
    if snapshot is None:
        snapshot = root / 'data/raw' / (root / 'data/raw/LATEST').read_text(encoding='utf-8').strip()
    rates = read_exchange_rates((snapshot / 'exchange-rates.xlsx').read_bytes())
    model = analyze_rows(nominal, real)
    panels, exclusions = choose_panels(model, rates)
    model.update({'panels': panels, 'exclusions': exclusions,
                  'reference': read_world_reference((snapshot / 'world-reference.xlsx').read_bytes()),
                  'source_manifest': manifest, 'snapshot': snapshot.name,
                  'strict_world_available': False,
                  'world_status': '2008SNA公式値だけでは、全世界・全期間をそろえた集計は成立しません。'})
    default = next((p for p in panels if p['first'] == 2000 and p['last'] == model['summary']['real_last']), None)
    model['default_panel'] = default['id'] if default else (panels[-1]['id'] if panels else None)
    export_report(root, model, static)
    return model
