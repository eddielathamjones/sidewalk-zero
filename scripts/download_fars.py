"""
Download NHTSA FARS National CSV zips for the specified year range.

Usage:
    python scripts/download_fars.py --years 2001-2023 --data-dir data/raw
"""

import argparse
import time
from pathlib import Path
import urllib.request

BASE = "https://static.nhtsa.gov/nhtsa/downloads/FARS/{year}/National/FARS{year}NationalCSV.zip"


def parse_years(spec: str) -> list[int]:
    if '-' in spec:
        start, end = spec.split('-')
        return list(range(int(start), int(end) + 1))
    return [int(spec)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', default='2001-2023')
    parser.add_argument('--data-dir', default='data/raw')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    years = parse_years(args.years)

    for year in years:
        dest = data_dir / str(year) / f'FARS{year}NationalCSV.zip'
        if dest.exists():
            print(f'[{year}] already exists, skipping')
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = BASE.format(year=year)
        print(f'[{year}] downloading...', end=' ', flush=True)
        try:
            urllib.request.urlretrieve(url, dest)
            size_mb = dest.stat().st_size / 1_000_000
            print(f'{size_mb:.1f} MB')
        except Exception as e:
            print(f'FAILED: {e}')
            dest.unlink(missing_ok=True)
        time.sleep(0.5)


if __name__ == '__main__':
    main()
