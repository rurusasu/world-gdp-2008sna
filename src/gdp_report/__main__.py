import argparse
from pathlib import Path
from .acquire import fetch_snapshot
from .build import build_report


def main():
    parser = argparse.ArgumentParser(description='Reproducible official 2008 SNA GDP report')
    parser.add_argument('command', choices=['fetch', 'build', 'refresh'])
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--no-static', action='store_true', help='Skip PNG/SVG rendering')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command in ('fetch', 'refresh'):
        fetch_snapshot(root)
    if args.command in ('build', 'refresh'):
        result = build_report(root, static=not args.no_static)
        print(f"Report: {result['summary']['real_countries']} countries/areas, "
              f"{result['summary']['real_first']}-{result['summary']['real_last']}, "
              f"{len(result['panels'])} fixed panels")


if __name__ == '__main__':
    main()
