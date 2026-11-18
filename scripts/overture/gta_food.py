"""Round 89: food places in the Greater Toronto Area from Overture Maps -> overture-gta-food.csv
(the columns public.overture_places and scripts/overture/load.mjs expect).

    pip install pyarrow requests
    python3 scripts/overture/gta_food.py                 # newest release
    python3 scripts/overture/gta_food.py 2026-10-21.0    # a given release

No DuckDB or AWS account needed: it reads Overture's public files over HTTPS and only downloads
the parts that cover the GTA (about 50 MB of ~12 GB). Overture data is CDLA Permissive 2.0.

What's kept: places in Overture's food_and_drink taxonomy, confidence >= 0.6, not marked
permanently closed, in Canada, inside the box Hamilton/Burlington - Oshawa, Lake Ontario - Newmarket.
"""
import csv
import io
import re
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import requests

BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
X0, X1, Y0, Y1 = -80.10, -78.80, 43.30, 44.20
SKIP = {'internet_cafe', 'airport_lounge'}
# listing and delivery sites aren't the restaurant's own website
NOT_THEIR_SITE = re.compile(r'(yelp|tripadvisor|doordash|ubereats|skipthedishes|grubhub|zomato|foursquare|'
                            r'facebook|instagram|google|opentable|menupages|allmenus|linktr\.ee)\.', re.I)
COLUMNS = ['id', 'name', 'name_local', 'category', 'latitude', 'longitude', 'address', 'city',
           'postcode', 'phone', 'website', 'brand', 'confidence', 'release']
session = requests.Session()


class Remote(io.RawIOBase):
    """A file on S3 read with HTTP range requests, so pyarrow only fetches what it needs."""

    def __init__(self, url):
        self.url = url
        self.size = int(session.head(url, timeout=30).headers['Content-Length'])
        self.pos = 0
        self.bytes = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        end = self.size if n is None or n < 0 else min(self.size, self.pos + n)
        if end <= self.pos:
            return b''
        for attempt in range(4):
            try:
                r = session.get(self.url, headers={'Range': f'bytes={self.pos}-{end - 1}'}, timeout=120)
                r.raise_for_status()
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
        self.bytes += len(r.content)
        self.pos = end
        return r.content

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def latest_release():
    return session.get('https://stac.overturemaps.org/catalog.json', timeout=30).json()['latest']


def place_files(release):
    prefix = f'release/{release}/theme=places/type=place/'
    keys, token = [], None
    while True:
        url = f'{BUCKET}?list-type=2&prefix={prefix}' + (f'&continuation-token={token}' if token else '')
        text = session.get(url, timeout=30).text
        keys += re.findall(r'<Key>(.*?)</Key>', text)
        more = re.search(r'<NextContinuationToken>(.*?)</NextContinuationToken>', text)
        if not more:
            return [k for k in keys if k.endswith('.parquet')]
        token = requests.utils.quote(more.group(1), safe='')


def gta_rows(key):
    src = Remote(BUCKET + key)
    f = pq.ParquetFile(src)
    md = f.metadata
    paths = [md.schema.column(i).path for i in range(md.num_columns)]
    at = {n: paths.index(f'bbox.{n}') for n in ('xmin', 'xmax', 'ymin', 'ymax')}
    groups = []
    for g in range(md.num_row_groups):
        s = {n: md.row_group(g).column(i).statistics for n, i in at.items()}
        if s['xmin'].min > X1 or s['xmax'].max < X0 or s['ymin'].min > Y1 or s['ymax'].max < Y0:
            continue
        groups.append(g)
    cols = ['id', 'confidence', 'websites', 'phones', 'brand', 'addresses', 'names',
            'operating_status', 'taxonomy', 'bbox']
    out = []
    for g in groups:
        t = f.read_row_group(g, columns=cols)
        b = t.column('bbox').combine_chunks()
        x, y = pc.struct_field(b, 'xmin'), pc.struct_field(b, 'ymin')
        inside = pc.and_(pc.and_(pc.greater_equal(x, X0), pc.less_equal(x, X1)),
                         pc.and_(pc.greater_equal(y, Y0), pc.less_equal(y, Y1)))
        t = t.filter(inside)
        if t.num_rows:
            out.append(t)
    print(f'{key.rsplit("/", 1)[-1][:10]}: {len(groups)} of {md.num_row_groups} parts, '
          f'{src.bytes / 1e6:.0f} MB', file=sys.stderr)
    return pa.concat_tables(out).to_pylist() if out else []


def first(items):
    return items[0] if items else None


def to_csv_row(r, release):
    tax = r.get('taxonomy') or {}
    hierarchy = tax.get('hierarchy') or []
    if not hierarchy or hierarchy[0] != 'food_and_drink' or tax.get('primary') in SKIP:
        return None
    if (r.get('confidence') or 0) < 0.6 or r.get('operating_status') == 'permanently_closed':
        return None
    name = ((r.get('names') or {}).get('primary') or '').strip()
    if not name:
        return None
    address = first(r.get('addresses')) or {}
    if address.get('country') not in (None, 'CA'):
        return None
    website = first(r.get('websites'))
    if website and (not re.match(r'^https?://', website) or NOT_THEIR_SITE.search(website)):
        website = None
    b = r['bbox']
    return {
        'id': r['id'],
        'name': name[:160],
        'name_local': None,
        'category': tax.get('primary'),
        'latitude': round((b['ymin'] + b['ymax']) / 2, 6),
        'longitude': round((b['xmin'] + b['xmax']) / 2, 6),
        'address': address.get('freeform'),
        'city': address.get('locality'),
        'postcode': address.get('postcode'),
        'phone': first(r.get('phones')),
        'website': website,
        'brand': ((r.get('brand') or {}).get('names') or {}).get('primary'),
        'confidence': round(r['confidence'], 3),
        'release': release,
    }


def main():
    release = sys.argv[1] if len(sys.argv) > 1 else latest_release()
    print(f'Overture release {release}', file=sys.stderr)
    rows = []
    for key in place_files(release):
        rows += [x for x in (to_csv_row(r, release) for r in gta_rows(key)) if x]
    with open('overture-gta-food.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f'{len(rows)} places -> overture-gta-food.csv', file=sys.stderr)


if __name__ == '__main__':
    main()
