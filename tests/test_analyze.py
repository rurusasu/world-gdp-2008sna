import unittest

from gdp_report.analyze import analyze_rows, aggregate_panel, choose_panels


def row(year, value, country='Japan', code='392', base='2020', series='1000',
        sna='2008', currency='Yen', period='Western calendar year', group='102', notes=''):
    return {'Group Code': group, 'Country or Area Code': code, 'Country or Area': country,
            'SNA93 Table Code': '1.2', 'Fiscal Year': str(year), 'Series': series,
            'SNA System': sna, 'Currency': currency, 'Base Year': base,
            'Fiscal Year Type': period, 'Value': str(value), 'Footnote text': notes}


class AnalysisTests(unittest.TestCase):
    def test_gaps_do_not_create_growth_and_index_keeps_original_base(self):
        result = analyze_rows([], [row(2020, 100), row(2021, 110), row(2023, 121)])
        points = result['series'][0]['points']
        self.assertAlmostEqual(points[1]['growth'], 10)
        self.assertIsNone(points[2]['value'])
        self.assertIsNone(points[3]['growth'])
        self.assertEqual(points[3]['index'], 121)
        self.assertEqual(result['series'][0]['missing_years'], [2022])

    def test_sna1993_is_excluded_and_metadata_changes_never_join(self):
        result = analyze_rows([], [row(2019, 90, sna='1993'), row(2020, 100),
                                   row(2021, 120, base='2015')])
        self.assertEqual(len(result['series']), 2)
        self.assertTrue(all(s['points'][0]['growth'] is None for s in result['series']))
        self.assertEqual(result['summary']['real_first'], 2020)

    def test_conflicting_duplicate_observations_fail(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            analyze_rows([], [row(2020, 100), row(2020, 101)])

    def test_non_positive_base_cannot_produce_index_or_growth(self):
        result = analyze_rows([], [row(2020, 0), row(2021, 100)])
        self.assertIsNone(result['series'][0]['points'][1]['growth'])
        self.assertIsNone(result['series'][0]['points'][1]['index'])

    def test_invalid_number_is_a_missing_observation_not_zero(self):
        result = analyze_rows([], [row(2020, 100), row(2021, 'NaN'), row(2022, 120)])
        self.assertIsNone(result['series'][0]['points'][1]['value'])
        self.assertIsNone(result['series'][0]['points'][2]['growth'])
        self.assertEqual(result['summary']['invalid_values'], 1)

    def test_preferred_series_is_longest_contiguous_segment_not_highest_number(self):
        result = analyze_rows([], [row(2020, 100), row(2021, 110),
                                   row(2021, 110, series='9999')])
        preferred = [s for s in result['series'] if s['preferred']]
        self.assertEqual([s['series_number'] for s in preferred], ['1000'])

    def test_fixed_weights_are_applied_and_start_index_is_100(self):
        result = analyze_rows([], [row(2020, 100), row(2021, 110),
                                   row(2020, 200, code='840', country='United States'),
                                   row(2021, 240, code='840', country='United States')])
        panel = aggregate_panel(result['series'], {'392': 1000, '840': 2000}, 2020, 2021, 2020)
        self.assertEqual(panel['points'][0]['value'], 3000)
        self.assertEqual(panel['points'][0]['index'], 100)
        self.assertEqual(panel['points'][1]['value'], 3500)
        self.assertAlmostEqual(panel['points'][1]['growth'], 100 / 6)
        self.assertEqual(panel['country_count'], 2)

    def test_panel_rejects_missing_years_and_unmatched_weights(self):
        series = analyze_rows([], [row(2020, 100), row(2022, 120)])['series']
        with self.assertRaisesRegex(ValueError, 'complete'):
            aggregate_panel(series, {'392': 1000}, 2020, 2022, 2020)
        with self.assertRaisesRegex(ValueError, 'weight'):
            aggregate_panel(series, {}, 2020, 2020, 2020)

    def test_panel_rejects_duplicate_country_and_noncalendar_years(self):
        series = analyze_rows([], [row(2020, 100), row(2020, 90, base='2015')])['series']
        with self.assertRaisesRegex(ValueError, 'country'):
            aggregate_panel(series, {'392': 1000}, 2020, 2020, 2020)
        fiscal = analyze_rows([], [row(2020, 100, period='Fiscal year beginning 1 April')])['series']
        with self.assertRaisesRegex(ValueError, 'calendar'):
            aggregate_panel(fiscal, {'392': 1000}, 2020, 2020, 2020)

    def test_currency_mismatch_excludes_country_from_panel(self):
        real = [row(2020, 100), row(2021, 110)]
        nominal = [row(2020, 1000, base='', group='101')]
        result = analyze_rows(nominal, real)
        rates = {'392': {'rate': 10, 'currency': 'Euro', 'year': 2020, 'source_note': 'IMF Principal Rate'}}
        panels, exclusions = choose_panels(result, rates, starts=[2020], ends=[2021])
        self.assertEqual(panels, [])
        self.assertTrue(any('currency' in e['reason'] for e in exclusions))

    def test_france_and_included_territory_cannot_be_double_counted(self):
        real = [row(2020, 100, code='250', country='France'),
                row(2020, 10, code='312', country='Guadeloupe')]
        with self.assertRaisesRegex(ValueError, 'overlap'):
            aggregate_panel(analyze_rows([], real)['series'], {'250': 100, '312': 10}, 2020, 2020, 2020)


if __name__ == '__main__':
    unittest.main()
