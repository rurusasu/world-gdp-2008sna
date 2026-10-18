import json
from pathlib import Path
import tempfile
import unittest
import io
from unittest.mock import patch

from gdp_report.build import export_report
from gdp_report.analyze import analyze_rows
from test_analyze import row


class ReportBuildTests(unittest.TestCase):
    def test_cli_completion_message_works_in_windows_cp932_console(self):
        from gdp_report.__main__ import main
        result = {'summary': {'real_countries': 148, 'real_first': 1946, 'real_last': 2024}, 'panels': []}
        buffer = io.BytesIO()
        console = io.TextIOWrapper(buffer, encoding='cp932', write_through=True)
        with patch('sys.argv', ['gdp_report', 'build', '--no-static']), patch('sys.stdout', console), patch('gdp_report.__main__.build_report', return_value=result):
            main()
        self.assertIn('1946-2024', buffer.getvalue().decode('cp932'))

    def test_csv_json_exports_preserve_gaps_and_rebuild_deterministically(self):
        model = analyze_rows([], [row(2020, 100), row(2021, 110), row(2023, 121)])
        model.update({'panels': [], 'exclusions': [], 'reference': None,
                      'source_manifest': {'retrieved_at': '2026-10-14T00:00:00+00:00', 'files': []},
                      'snapshot': 'fixture', 'default_panel': None})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'site').mkdir()
            entry = root / 'site/index.html'
            entry.write_text('<html>Frontend-owned entry</html>', encoding='utf-8')
            export_report(root, model, static=False)
            payload = (root / 'site/report.json').read_bytes()
            saved = json.loads(payload)
            self.assertIsNone(saved['series'][0]['points'][2]['value'])
            self.assertEqual(saved['series'][0]['points'][3]['index'], 121)
            self.assertNotIn(b'NaN', payload)
            csv = (root / 'site/downloads/real-gdp.csv').read_text(encoding='utf-8-sig')
            self.assertIn('2023,121.0,121.0,', csv)
            self.assertEqual(entry.read_text(encoding='utf-8'), '<html>Frontend-owned entry</html>')
            self.assertTrue((root / 'site/plotly.min.js').stat().st_size > 100000)
            export_report(root, model, static=False)
            self.assertEqual((root / 'site/report.json').read_bytes(), payload)


if __name__ == '__main__':
    unittest.main()
