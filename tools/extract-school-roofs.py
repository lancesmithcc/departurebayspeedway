"""Sample public HRDEM roof elevations over three City school footprints.

Requires numpy, rasterio, pyproj, shapely. Does not change game files. Example:
  python tools/extract-school-roofs.py --output /tmp/school-roof-parts.json
Use the resulting JSON for SCHOOL_ROOF_PARTS in src/reference-schools.js after
reviewing the sampled roof map. Roof subregion cuts below are manual estimates,
clipped to the real footprint; elevations themselves are sampled medians.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
DSM_URL = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/1_3-mosaic-1m-dsm.tif'
SCHOOL_IDS = (6905, 7064, 7100)


def regions(building):
    p = building['p'][:-1]
    footprint = Polygon(p).buffer(0)
    # These cuts follow visible wing necks/DSM level changes, not surveyed roof
    # breaklines. All masks are intersected with the source polygon first.
    if building['cityId'] == 7100:
        masks = [Polygon(p[16:29]), Polygon(p[28:36]), Polygon(p[7:16])]
    elif building['cityId'] == 6905:
        masks = [box(-2400, -1500, -2300, -1430), box(-2400, -1375, -2300, -1300)]
    else:
        masks = [Polygon(p[10:32])]
    remaining, result = footprint, []
    for mask in masks:
        region = remaining.intersection(mask.buffer(0))
        if not region.is_empty and region.area > 10:
            result.append(region)
            remaining = remaining.difference(region)
    result.append(remaining)
    pieces = []
    for region in result:
        pieces.extend(region.geoms if region.geom_type == 'MultiPolygon' else [region])
    return footprint, [region for region in pieces if region.area >= 1]


def extract():
    city = json.loads((ROOT / 'data/city-buildings.json').read_text())
    origin = json.loads((ROOT / 'data/map.json').read_text())['origin']
    meta = json.loads((ROOT / 'data/terrain-dtm.json').read_text())
    dtm = np.fromfile(ROOT / 'data/terrain-dtm.f32', dtype='<f4').reshape(meta['nz'], meta['nx'])
    lat0, lon0 = origin
    mx, mz = 111319.5 * math.cos(math.radians(lat0)), 110946.0
    project = Transformer.from_crs(4326, 3979, always_xy=True)
    result = {}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
                       CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
                       GDAL_HTTP_TIMEOUT='40', GDAL_CACHEMAX=128):
        with rasterio.open(DSM_URL) as src:
            if src.crs.to_epsg() != 3979:
                raise ValueError('Expected HRDEM EPSG:3979; review source before extracting')
            for building in city['buildings']:
                if building['cityId'] not in SCHOOL_IDS:
                    continue
                footprint, pieces = regions(building)
                x0, z0, x1, z1 = footprint.bounds
                coords = [project.transform(lon0 + x / mx, lat0 - z / mz)
                          for x in (x0, x1) for z in (z0, z1)]
                window = from_bounds(min(p[0] for p in coords) - 3,
                                     min(p[1] for p in coords) - 3,
                                     max(p[0] for p in coords) + 3,
                                     max(p[1] for p in coords) + 3,
                                     src.transform).round_offsets().round_lengths()
                pixels = src.read(1, window=window)
                inverse = ~src.window_transform(window)
                inset = footprint.buffer(-1)
                samples = []
                for z in np.arange(z0 + 1, z1, 2):
                    for x in np.arange(x0 + 1, x1, 2):
                        point = Point(x, z)
                        if not inset.contains(point):
                            continue
                        xx, yy = project.transform(lon0 + x / mx, lat0 - z / mz)
                        col, row = inverse * (xx, yy)
                        if not (0 <= int(row) < pixels.shape[0] and 0 <= int(col) < pixels.shape[1]):
                            continue
                        value = float(pixels[int(row), int(col)])
                        if not math.isfinite(value) or value == src.nodata or value <= -1000:
                            continue
                        samples.append((point, value))
                points = building['p'][:-1]
                cx, cz = np.mean(points, axis=0)
                ix = round((cx - meta['x0']) / meta['grid_spacing_m'])
                iz = round((cz - meta['z0']) / meta['grid_spacing_m'])
                floor = float(dtm[iz, ix])
                if not math.isfinite(floor) or floor == meta['no_data']:
                    raise ValueError('Invalid DTM slab datum')
                roofs = []
                for piece in pieces:
                    # Avoid roof-step pixels too; median (50th percentile) rejects
                    # sparse roof equipment/trees, but cannot remove dense canopy.
                    inner = piece.buffer(-.8)
                    values = [value for point, value in samples if inner.contains(point)]
                    if len(values) < 12:
                        raise ValueError(f'Insufficient roof samples: {building["cityId"]}')
                    elevation = float(np.quantile(values, .5))
                    roofs.append({'p': [[x, z] for x, z in piece.exterior.coords],
                                  'roofElevation': round(elevation, 2),
                                  'h': round(elevation - floor, 2), 'samples': len(values)})
                polygons = [Polygon(r['p']) for r in roofs]
                if not all(p.is_valid for p in polygons):
                    raise ValueError('Invalid roof ring; do not quantize clipping intersections')
                union = unary_union(polygons)
                area = sum(p.area for p in polygons)
                if union.symmetric_difference(footprint).area >= .1 or area - union.area >= .1:
                    raise ValueError('Roof subdivision changes footprint or overlaps')
                result[building['cityId']] = roofs
    if set(result) != set(SCHOOL_IDS):
        raise ValueError('One or more school records missing')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Write JSON here; otherwise print JSON')
    args = parser.parse_args()
    text = json.dumps(extract(), separators=(',', ':')) + '\n'
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end='')
