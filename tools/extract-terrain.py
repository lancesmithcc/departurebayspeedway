# Requires numpy, rasterio and pyproj. Downloads only the corridor window.
import os,json,math,time,urllib.request
from pathlib import Path
import numpy as np,rasterio
from rasterio.windows import from_bounds
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_origin
from pyproj import Transformer,CRS
root=Path(__file__).resolve().parents[1]
item=json.load(urllib.request.urlopen('https://datacube.services.geo.ca/stac/api/collections/hrdem-mosaic-1m/items/1_3-mosaic-1m',timeout=30));url=item['assets']['dtm']['href']
# Grid vertices use the game's exact affine lon/lat mapping (x east, z south).
lat0,lon0=json.loads((root/'data/map.json').read_text())['origin'];mx=111319.5*math.cos(math.radians(lat0));mz=110946.
x0,x1,z0,z1=-3600,-350,-1950,-450;spacing=2
nx,nz=int((x1-x0)/spacing)+1,int((z1-z0)/spacing)+1
# Raster row zero is north edge. Pixel centres correspond exactly to these game vertices.
lonmin=lon0+(x0-spacing/2)/mx;latmax=lat0-(z0-spacing/2)/mz
transform=from_origin(lonmin,latmax,spacing/mx,spacing/mz)
warp=Transformer.from_crs(4326,3979,always_xy=True)
ll=[warp.transform(lon0+x/mx,lat0-z/mz) for x in [x0,x1] for z in [z0,z1]]
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='45',GDAL_CACHEMAX=128):
 with rasterio.open(url) as src:
  w=from_bounds(min(p[0] for p in ll)-4,min(p[1] for p in ll)-4,max(p[0] for p in ll)+4,max(p[1] for p in ll)+4,src.transform).round_offsets().round_lengths()
  print('window',w,flush=True)
  a=src.read(1,window=w);out=np.full((nz,nx),-32767,dtype=np.float32)
  reproject(a,out,src_transform=src.window_transform(w),src_crs=src.crs,src_nodata=src.nodata,dst_transform=transform,dst_crs=4326,dst_nodata=-32767,resampling=Resampling.bilinear)
valid=out!=-32767
print('valid',valid.mean(),'range',out[valid].min(),out[valid].max(),flush=True)
assert valid.mean()>.98
out.astype('<f4').tofile(root/'data/terrain-dtm.f32')
meta={'source':'Natural Resources Canada, CanElevation HRDEM Mosaic 1 m DTM','source_url':url,'stac_url':f'https://datacube.services.geo.ca/stac/api/collections/hrdem-mosaic-1m/items/{item["id"]}','source_crs':'EPSG:3979','vertical_datum':'CGVD2013 (HRDEM Mosaic specification)','grid_spacing_m':spacing,'x0':x0,'z0':z0,'nx':nx,'nz':nz,'no_data':-32767,'encoding':'little-endian float32 metres; row-major southwards','origin_lat_lon':[lat0,lon0],'resampling':'bilinear from 1m source','valid_fraction':round(float(valid.mean()),6)}
(root/'data/terrain-dtm.json').write_text(json.dumps(meta,indent=2)+'\n')
print('saved bytes',out.nbytes,flush=True)
