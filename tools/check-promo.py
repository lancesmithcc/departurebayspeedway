from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import json,xml.etree.ElementTree as ET
class Page(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.images=[];self.ids=[];self.schemas=[];self.schema=None;self.titles=0;self.h1s=0;self.canonical=False;self.description=False
 def handle_starttag(self,t,a):
  a=dict(a)
  if 'id'in a:self.ids.append(a['id'])
  if t=='a':self.links.append(a.get('href',''))
  if t=='img':self.images.append(a);assert 'alt'in a
  if t=='h1':self.h1s+=1
  if t=='title':self.titles+=1
  if t=='link'and a.get('rel')=='canonical':self.canonical=True
  if t=='meta'and a.get('name')=='description':self.description=True
  if t=='script'and a.get('type')=='application/ld+json':self.schema=''
 def handle_data(self,d):
  if self.schema is not None:self.schema+=d
 def handle_endtag(self,t):
  if t=='script'and self.schema is not None:self.schemas.append(json.loads(self.schema));self.schema=None
pages=['index.html','nanaimo-dirtbike-game.html','departure-bay-road.html','loud-dirtbikes-nanaimo.html']
for name in pages:
 p=Page();p.feed(Path(name).read_text());assert p.titles==1 and p.h1s==1 and p.canonical and p.description,name
 assert len(set(p.ids))==len(p.ids),name
 graph=p.schemas[0]['@graph'];assert any(n['@type']=='Place'for n in graph);assert any(n['@type']=='VideoGame'for n in graph)
 for link in p.links:
  u=urlparse(link)
  if not u.netloc and u.path:assert Path(u.path.lstrip('/') or 'index.html').exists(),(name,link)
  if not u.path and u.fragment:assert u.fragment in p.ids,(name,link)
 for im in p.images:assert Path(im['src'].lstrip('/')).exists(),im['src']
 print('PASS',name,'metadata, schema, heading, links, images')
ET.parse('sitemap.xml');assert 'Disallow: /v/'not in Path('robots.txt').read_text()
assert '<div class="credit">'not in Path('index.html').read_text()
print('PASS sitemap, crawlable module graph, source-only entrance credits')
