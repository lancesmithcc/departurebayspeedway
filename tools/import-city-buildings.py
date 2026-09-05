# Requires shapely. Reads public city geometry only; keeps the original map intact.
import json,math,urllib.request,urllib.parse,hashlib
from pathlib import Path
from shapely.geometry import Polygon,LineString
from shapely.strtree import STRtree
root=Path(__file__).resolve().parents[1]
raw=(root/'data/map.json').read_bytes();m=json.loads(raw);lat0,lon0=m['origin'];mx=111319.5*math.cos(math.radians(lat0));mz=110946.
endpoint='https://nanmap.nanaimo.ca/arcgis/rest/services/NanMap/Polygons/MapServer/6/query'
features=[];offset=0
while True:
 p={'f':'geojson','where':'1=1','geometry':'-124.010,49.201,-123.964,49.216','geometryType':'esriGeometryEnvelope','inSR':4326,'outSR':4326,'outFields':'OBJECTID,BLDGTYPE,FLOORCOUNT,BLDGHEIGHT,HISTORICAL','returnGeometry':'true','orderByFields':'OBJECTID','resultOffset':offset,'resultRecordCount':2000}
 d=json.load(urllib.request.urlopen(endpoint+'?'+urllib.parse.urlencode(p),timeout=30));batch=d.get('features',[]);features+=batch
 if not d.get('exceededTransferLimit'):break
 if not batch:raise RuntimeError('City pagination stopped early')
 offset+=len(batch)
route=LineString(m['route']);polys=[Polygon(b['p']).buffer(0) for b in m['buildings']];tree=STRtree(polys)
out=[];removed=set();heights=0;floors=0;seen=set()
for f in features:
 props=f['properties'];oid=props['OBJECTID']
 if oid in seen:continue
 seen.add(oid)
 if f['geometry']['type']!='Polygon' or len(f['geometry']['coordinates'])!=1:continue
 pts=[[(lon-lon0)*mx,-(lat-lat0)*mz] for lon,lat in f['geometry']['coordinates'][0]];poly=Polygon(pts)
 if not poly.is_valid or poly.area<12 or poly.distance(route)>120 or poly.distance(route)<7:continue
 matches=[int(i) for i in tree.query(poly) if polys[int(i)].intersection(poly).area>1]
 # Keep authored/named landmarks and reject ambiguous overlaps. An overlapping
 # OSM footprint must be mostly replaced, or this city polygon is not applied.
 if any(m['buildings'][i].get('n') for i in matches):continue
 if any(polys[i].intersection(poly).area/min(poly.area,polys[i].area)<.4 for i in matches):continue
 old=m['buildings'][matches[0]] if matches else None
 typ={'RESIDENTIAL':'house','MULTIFAMILY':'residential','APARTMENT':'apartments','COMMERCIAL':'commercial','INDUSTRIAL':'industrial','GARAGE':'garage'}.get(props.get('BLDGTYPE'),old['t'] if old else 'yes')
 measured=props.get('BLDGHEIGHT');floor=props.get('FLOORCOUNT')
 if isinstance(measured,(int,float)) and 2<measured<65:h=measured;basis='city height';heights+=1
 elif isinstance(floor,(int,float)) and 1<=floor<=15:h=floor*2.7+(1.6 if typ in ['house','residential','apartments','yes'] else .6);basis='estimated from city floor count';floors+=1
 else:h=old['h'] if old else (5 if typ in ['house','yes','garage'] else 7);basis='OSM or typical fallback'
 out.append({'p':[[round(x,2),round(z,2)] for x,z in pts],'h':round(h,2),'t':typ,'n':None,'cityId':oid,'floors':floor,'heightBasis':basis})
 removed.update(matches)
result={'source':'City of Nanaimo Building Footprint layer','source_url':endpoint[:-6],'licence':'https://www.nanaimo.ca/your-government/maps-data/open-data-catalogue/open-data-catalogue-licence','attribution':'Contains information licenced under the Open Government Licence – Nanaimo.','base_map_sha256':hashlib.sha256(raw).hexdigest(),'replaces':sorted(removed),'buildings':out,'counts':{'queried':len(features),'imported':len(out),'replaced':len(removed),'measuredHeights':heights,'floorCountEstimates':floors}}
(root/'data/city-buildings.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print(result['counts'])
