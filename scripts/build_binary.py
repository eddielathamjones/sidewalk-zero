"""
Build binary: FARS National CSV zips → packed Float32 lat/lon blob.

Output: public/incidents.bin
Format: little-endian float32 pairs — lat0, lon0, lat1, lon1, ...
        8 bytes per incident.

Usage:
    python scripts/build_binary.py --data-dir data/raw --years 2001-2023
    python scripts/build_binary.py --data-dir ../pedestrian-safety-mapper/data/raw --years 2023
"""

import argparse
import csv
import io
import struct
import sys
import zipfile
from pathlib import Path

LAT_SENTINELS = {'', '77.7777', '99.9999', '88.8888', '0', '0.0'}
LON_SENTINELS = {'', '77.7777', '99.9999', '888.8888', '0', '0.0'}


def _sentinel(val: str, sentinels: set) -> bool:
    v = val.strip()
    if v in sentinels:
        return True
    try:
        return float(v) == 0.0
    except ValueError:
        return True


def _find_csv(zf: zipfile.ZipFile, name: str) -> str | None:
    for member in zf.namelist():
        if Path(member).name.lower() == name.lower():
            return member
    return None


def _read_csv(zf: zipfile.ZipFile, member: str) -> list[dict]:
    with zf.open(member) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding='latin-1')))


def _norm(row: dict) -> dict:
    return {k.lower().strip(): v.strip() for k, v in row.items()}


def process_year(year: int, data_dir: Path) -> list[tuple[float, float]]:
    zip_path = data_dir / str(year) / f'FARS{year}NationalCSV.zip'
    if not zip_path.exists():
        print(f'  [{year}] not found: {zip_path}', file=sys.stderr)
        return []

    print(f'  [{year}] reading...')
    with zipfile.ZipFile(zip_path) as zf:
        acc_member = _find_csv(zf, 'accident.csv')
        per_member = _find_csv(zf, 'person.csv')
        if not acc_member or not per_member:
            print(f'  [{year}] missing accident.csv or person.csv', file=sys.stderr)
            return []
        accidents = {_norm(r)['st_case']: _norm(r) for r in _read_csv(zf, acc_member)}
        persons = [_norm(r) for r in _read_csv(zf, per_member) if _norm(r).get('per_typ', '') == '5']

    points = []
    for per in persons:
        acc = accidents.get(per.get('st_case', ''))
        if acc is None:
            continue
        lat_s = acc.get('latitude', '').strip()
        lon_s = acc.get('longitud', '').strip()
        if _sentinel(lat_s, LAT_SENTINELS) or _sentinel(lon_s, LON_SENTINELS):
            continue
        try:
            lat, lon = float(lat_s), float(lon_s)
        except ValueError:
            continue
        if not (-180 <= lon <= -60) or not (15 <= lat <= 72):
            continue
        points.append((lat, lon))

    print(f'  [{year}] {len(points):,} incidents')
    return points


def parse_years(spec: str) -> list[int]:
    if '-' in spec:
        start, end = spec.split('-')
        return list(range(int(start), int(end) + 1))
    return [int(spec)]


def main():
    parser = argparse.ArgumentParser(description='FARS CSVs → packed Float32 binary')
    parser.add_argument('--data-dir', default='data/raw', help='Directory containing per-year FARS zips')
    parser.add_argument('--years', default='2001-2023', help='Year or range, e.g. 2023 or 2001-2023')
    parser.add_argument('--output', default='public/incidents.bin')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    all_points = []
    for year in parse_years(args.years):
        all_points.extend(process_year(year, data_dir))

    with open(output, 'wb') as f:
        for lat, lon in all_points:
            f.write(struct.pack('<ff', lat, lon))

    size_kb = output.stat().st_size / 1024
    print(f'\nWrote {len(all_points):,} incidents → {output} ({size_kb:.0f} KB)')


if __name__ == '__main__':
    main()
