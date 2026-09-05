# Requires numpy, rasterio and pyproj. Downloads only the corridor window.
import os,json,math,time,urllib.request
from pathlib import Path
import numpy as np,rasterio
from rasterio.windows import from_bounds
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_origin
from pyproj import Transformer,CRS
root=Path(__file__).resolve().parents[1]
item=json.load(urllib.request.urlopen('https://datacube.services.geo.ca/stac/api/collections/hrdem-mosaic-1m/items/1_3-mosaic-1m',timeout=30));url=item['assets']['dsm']['href']
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
# Keep only canopy peaks near the route; buildings are explicitly excluded.
from shapely.geometry import Polygon,LineString,Point
from shapely.strtree import STRtree
m=json.loads((root/'data/map.json').read_text());city=json.loads((root/'data/city-buildings.json').read_text())
removed=set(city['replaces']);buildings=[b for i,b in enumerate(m['buildings']) if i not in removed]+city['buildings']
polys=[Polygon(b['p']).buffer(3) for b in buildings];tree=STRtree(polys);route=LineString(m['route'])
dtm=np.fromfile(root/'data/terrain-dtm.f32',dtype='<f4').reshape(nz,nx);chm=out-dtm
peaks=[]
for j in range(3,nz-3):
 for i in range(3,nx-3):
  h=float(chm[j,i])
  if not 5<h<42 or h<float(chm[j-3:j+4,i-3:i+4].max()):continue
  x=x0+i*spacing;z=z0+j*spacing;p=Point(x,z)
  if route.distance(p)>120 or route.distance(p)<9:continue
  if any(polys[int(k)].covers(p) for k in tree.query(p)):continue
  peaks.append((h,x,z))
# Non-maximum suppression prevents several crowns on a single tree. These remain
# canopy-height/position estimates, not a species or individual-tree inventory.
kept=[]
for h,x,z in sorted(peaks,reverse=True):
 if any((x-a['x'])**2+(z-a['z'])**2<max(5.5,min(10,h*.28))**2 for a in kept):continue
 kept.append({'x':x,'z':z,'h':round(h,1)})
result={'source':'NRCan HRDEM 1m DSM minus DTM, resampled to2m','dsm_url':url,'dtm_url':item['assets']['dtm']['href'],'method':'7x7 local maxima, roof mask, height-dependent nonmaximum suppression','limitations':'Estimated canopy peaks; species and crown shape are artistic. Acquisition may predate present vegetation.','trees':kept}
(root/'data/canopy.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print('canopy peaks',len(kept),flush=True)
