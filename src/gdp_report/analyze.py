"""Keep official metadata boundaries explicit; never splice or fill GDP series."""

from collections import defaultdict
import math

CALENDAR = 'Western calendar year'


def currency_key(value: str) -> str:
    return ' '.join(value.casefold().split())


def number(value) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _longest_run(values: dict) -> tuple[int, int, int]:
    runs, start, previous = [], None, None
    for year in sorted(values):
        if values[year] is None or values[year] <= 0:
            if start is not None:
                runs.append((previous - start + 1, previous, start))
            start, previous = None, None
            continue
        if start is None or year != previous + 1:
            if start is not None:
                runs.append((previous - start + 1, previous, start))
            start = year
        previous = year
    if start is not None:
        runs.append((previous - start + 1, previous, start))
    return max(runs, default=(0, 0, 0))


def _make_series(rows: list[dict], kind: str) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        if row['SNA System'] != '2008':
            continue
        key = (row['Country or Area Code'], row['Group Code'], row['Series'],
               currency_key(row['Currency']), row.get('Base Year', ''), row['Fiscal Year Type'])
        groups[key].append(row)
    output = []
    for key, records in sorted(groups.items()):
        example = records[0]
        values, notes = {}, {}
        for row in records:
            year = int(row['Fiscal Year'])
            if year in values:
                raise ValueError('duplicate observation in series: ' + repr(key))
            values[year] = number(row['Value'])
            notes[year] = row.get('Footnote text', '')
        first, last = min(values), max(values)
        baseline = values[first]
        price_verified = kind == 'nominal' or (key[4].isdigit() and 1800 <= int(key[4]) <= 2200)
        points = []
        for year in range(first, last + 1):
            value, prior = values.get(year), values.get(year - 1)
            growth = 100 * (value / prior - 1) if price_verified and value is not None and value > 0 and prior is not None and prior > 0 else None
            index = 100 * value / baseline if price_verified and value is not None and value > 0 and baseline is not None and baseline > 0 else None
            points.append({'year': year, 'value': value, 'growth': growth, 'index': index,
                           'notes': notes.get(year, '')})
        run = _longest_run(values)
        output.append({'id': '|'.join((kind,) + key), 'kind': kind,
                       'country_code': key[0], 'country': example['Country or Area'],
                       'group': key[1], 'table': example.get('SNA93 Table Code', ''),
                       'series_number': key[2], 'currency': example['Currency'],
                       'base_year': key[4], 'fiscal_year_type': key[5], 'sna': '2008',
                       'price_basis_verified': price_verified,
                       'first': first, 'last': last, 'index_base': first,
                       'observations': len(records), 'invalid_values': sum(v is None for v in values.values()),
                       'missing_years': [y for y in range(first, last + 1) if y not in values or values[y] is None],
                       'longest_run': {'length': run[0], 'last': run[1], 'first': run[2]},
                       'preferred': False, 'points': points})
    by_country = defaultdict(list)
    for series in output:
        by_country[series['country_code']].append(series)
    for candidates in by_country.values():
        best = max((s['price_basis_verified'], s['longest_run']['length'], s['longest_run']['last']) for s in candidates)
        for series in candidates:
            series['preferred'] = (series['price_basis_verified'], series['longest_run']['length'], series['longest_run']['last']) == best
    return output


def analyze_rows(nominal: list[dict], real: list[dict]) -> dict:
    real_series = _make_series(real, 'real')
    nominal_series = _make_series(nominal, 'nominal')
    summary = {'source_nominal_rows': len(nominal), 'source_real_rows': len(real),
               'official_nominal_rows': sum(s['observations'] for s in nominal_series),
               'official_real_rows': sum(s['observations'] for s in real_series),
               'nominal_countries': len({s['country_code'] for s in nominal_series}),
               'real_countries': len({s['country_code'] for s in real_series}),
               'real_first': min((s['first'] for s in real_series), default=None),
               'real_last': max((s['last'] for s in real_series), default=None),
               'nominal_first': min((s['first'] for s in nominal_series), default=None),
               'nominal_last': max((s['last'] for s in nominal_series), default=None),
               'real_series': len(real_series), 'nominal_series': len(nominal_series),
               'invalid_values': sum(s['invalid_values'] for s in real_series + nominal_series)}
    return {'summary': summary, 'series': real_series, 'nominal_series': nominal_series}


def aggregate_panel(series: list[dict], weights: dict, start: int, end: int, base: int) -> dict:
    if not series or not start <= base <= end:
        raise ValueError('No complete panel or benchmark outside interval')
    seen, by_country = set(), {}
    for item in series:
        code = item['country_code']
        if code in seen:
            raise ValueError('duplicate country in panel')
        seen.add(code)
        if item['fiscal_year_type'] != CALENDAR:
            raise ValueError('Non-calendar series cannot enter this panel')
        if not item.get('price_basis_verified', False):
            raise ValueError('Unverified price reference cannot enter this panel')
        weight = weights.get(code)
        if weight is None or not math.isfinite(weight) or weight <= 0:
            raise ValueError('Missing or invalid weight')
        points = {p['year']: p['value'] for p in item['points']}
        if any(points.get(y) is None or points[y] <= 0 for y in range(start, end + 1)):
            raise ValueError('Panel series must be complete and positive')
        by_country[code] = points
    if '250' in seen and seen.intersection({'175', '254', '312', '474', '638'}):
        raise ValueError('Economic territory overlap with France')
    totals = {year: math.fsum(weights[code] * values[year] / values[base]
                              for code, values in by_country.items()) for year in range(start, end + 1)}
    points = [{'year': y, 'value': totals[y], 'index': 100 * totals[y] / totals[start],
               'growth': 100 * (totals[y] / totals[y - 1] - 1) if y > start else None,
               'notes': ''} for y in range(start, end + 1)]
    total_weight = math.fsum(weights.values())
    return {'id': f'panel-{start}-{end}', 'kind': 'panel', 'first': start, 'last': end,
            'index_base': start, 'benchmark_year': base, 'country_count': len(series),
            'label': f'{start}–{end} / {len(series)}か国・地域（固定対象）',
            'currency': f'{base}年換算米ドル', 'base_year': str(base),
            'points': points, 'members': [
                {'country_code': s['country_code'], 'country': s['country'], 'series_id': s['id'],
                 'weight_usd': weights[s['country_code']], 'weight_share': weights[s['country_code']] / total_weight}
                for s in sorted(series, key=lambda s: -weights[s['country_code']])],
            'cumulative_growth': 100 * (totals[end] / totals[start] - 1),
            'cagr': 100 * ((totals[end] / totals[start]) ** (1 / (end - start)) - 1) if end > start else None}


def choose_panels(result: dict, rates: dict, starts: list | None = None, ends: list | None = None) -> tuple[list, list]:
    """Choose complete series per fixed window; never add/drop countries within a plot."""
    base = 2020
    latest = result['summary']['real_last']
    if latest is None:
        return [], []
    starts = sorted(set(starts if starts is not None else [result['summary']['real_first'], 1950, 1970, 1990, 2000, 2010, 2020]))
    ends = ends if ends is not None else [latest, latest - 1]
    nominal = defaultdict(list)
    for item in result['nominal_series']:
        nominal[item['country_code']].append(item)
    eligible, exclusions = defaultdict(list), []
    for item in result['series']:
        code = item['country_code']
        rate = rates.get(code)
        reason = None
        if not item['price_basis_verified']:
            reason = 'unverified fixed-price reference year'
        elif item['fiscal_year_type'] != CALENDAR:
            reason = 'non-calendar fiscal year'
        elif any('factor cost' in p['notes'].lower() for p in item['points']):
            reason = 'factor-cost valuation'
        elif not rate or rate.get('year') != base or not str(rate.get('source_note', '')).startswith('IMF'):
            reason = 'missing verified IMF 2020 exchange rate'
        elif currency_key(rate['currency']) != currency_key(item['currency']):
            reason = 'currency mismatch with exchange rate'
        if reason:
            exclusions.append({'series_id': item['id'], 'country': item['country'], 'reason': reason})
            continue
        matches = []
        for candidate in nominal[code]:
            if candidate['series_number'] != item['series_number'] or candidate['fiscal_year_type'] != CALENDAR or currency_key(candidate['currency']) != currency_key(item['currency']):
                continue
            point = next((p for p in candidate['points'] if p['year'] == base), None)
            if point and point['value'] is not None and point['value'] > 0 and 'factor cost' not in point['notes'].lower():
                matches.append((candidate, point['value']))
        if not matches:
            exclusions.append({'series_id': item['id'], 'country': item['country'], 'reason': 'no matching official nominal 2020 GDP'})
            continue
        matches.sort(key=lambda pair: (int(pair[0]['group']) != 101, -pair[0]['last'], pair[0]['id']))
        candidate, value = matches[0]
        eligible[code].append((item, value / rate['rate'], candidate['id'], rate))
    panels = []
    for end in ends:
        for start in starts:
            if not start <= base < end:
                continue
            selected, weights, details = [], {}, {}
            for code, choices in sorted(eligible.items()):
                valid = [c for c in choices if all(p['value'] is not None and p['value'] > 0
                         for p in c[0]['points'] if start <= p['year'] <= end)
                         and c[0]['first'] <= start and c[0]['last'] >= end]
                if not valid:
                    continue
                # Prefer current endpoints and longer coverage; table 1.2 breaks equivalent ties.
                valid.sort(key=lambda c: (-c[0]['last'], c[0]['first'], int(c[0]['group']) != 102, c[0]['id']))
                item, weight, nominal_id, rate = valid[0]
                selected.append(item)
                weights[code] = weight
                details[code] = {'nominal_series_id': nominal_id, 'fx': rate}
            if len(selected) < 2:
                continue
            panel = aggregate_panel(selected, weights, start, end, base)
            for member in panel['members']:
                member.update(details[member['country_code']])
            panel['excluded_countries'] = sorted({s['country'] for s in result['series']} - {s['country'] for s in selected})
            panels.append(panel)
    return panels, exclusions
