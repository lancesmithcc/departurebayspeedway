# Departure Bay Speedway

A dirtbike run down the real Departure Bay Road, Nanaimo BC — from the Petro-Canada /
Circle K forecourt at Country Club Centre to a kicker on Departure Bay Beach.

## Run it

```bash
npm start
```

Then open <http://localhost:8043>. Opening `index.html` from disk will not work: the
game is ES modules plus `fetch()` of the map data, both of which browsers block on
`file://`.

`?demo` runs the autopilot. `?debug` shows the input probe and an FPS readout in the
tab title.

## Controls

| Key | |
|---|---|
| W / ↑ | throttle |
| S / ↓ | brake |
| A D / ← → | lean & steer |
| W W | double-tap to pop a wheelie (hold it for style) |
| SPACE | jump — tap again in the air for a no-hander |
| air A/D | whip |
| air S | backflip · a fresh W stab frontflips |
| C | camera |
| R | respawn at the last checkpoint |
| F | throw a Nanaimo bar at traffic |
| M | mute |

Land square to bank the STYLE score; land badly and you bin it.

## Powerups

Pickups sit down the middle of the road, each one a timed modifier — only one at a
time, so grabbing a second replaces the first. The HUD carries the name and a
countdown bar.

| Pickup | What it does |
|---|---|
| Case of Lucky | Much faster, much worse: the bars answer late and the bike weaves |
| Double-double | Faster *and* sharper — the clean one |
| Bar crate | Hold F for rapid-fire Nanaimo bars |
| Blessing | You cannot bin it for the duration |

## People

Pedestrians walk the sidewalks, kids shuttle over both school crossings, and the
congregation runs around the church lawn — the same authored characters as the street
crowd, recoloured into Sunday whites.

Nobody gets back up — with one exception, down at the church. A body lies where it
landed for the rest of the run, chocolate and all, so ride back up the road and
everyone you put down is still there. They only clear
on a fresh start. A Nanaimo bar puts one of them face
down in the chocolate — flat out, wearing the bar, with a pool of it on the pavement.
Riding into one is momentum, not a wall: they go over the bars in the direction the
bike was travelling and the bike loses speed in proportion. Both are worth STYLE.

## Departure Bay Baptist

Half way down the hill the church is throwing a lawn party: bunting, three bouncy
castles, the congregation in white, and Jesus out on the grass. He is built out of the
same authored character kit as everybody else — same body, same walk frames — with the
robe whites, long hair, beard, stole, girdle and halo on top, and he moves: rocking on
his heels and turning to follow whatever just went past.

He is also killable, and he is the one person on the road who does not stay down. A
Nanaimo bar or the front wheel puts him in the grass like anyone else, and going down
turns him: red hide, black hair, yellow eyes, scorched robes, horns through the scalp,
and the halo comes off him and stays where it fell while the light over the lawn goes
from gold to furnace. Worth a thousand STYLE.

Three seconds later he gets back up — bigger, burning, and not who went down — for
another two thousand. The congregation goes with him: the Sunday whites turn red, on
the ones still running and on the ones already lying in the grass. Nothing puts him
down a second time. The guardrail is deliberately open across the church driveway —
the castles are trampolines, so a run at one launches the bike instead of stopping it.

## The board

Finish the run and the Hall of Fame comes up, ranked by STYLE and tie-broken by time.
Make the top ten and you sign it: eight letters, ENTER to save, ESC to skip. It lives
in `localStorage`, so it survives a reload and never leaves the browser.

## The road is the real road

`data/map.json` is baked from an Overpass extract of Nanaimo. The racing line is the
actual Departure Bay Road centreline, walked through the OSM way graph by shared node
ids — not stitched by nearest endpoint — so it follows every real bend in order, uses
each of the 29 named ways exactly once, and never jumps between carriageways. The
race section runs 2.88 km from the Norwell Drive junction to Departure Bay Beach; the
full 5.06 km centreline is kept as `roadLine`.

Everything placed by hand comes from the same data: the 7-Eleven is the real Departure
Bay branch footprint, the forecourt is a Petro-Canada fuel island with a Circle K
store (two separate OSM objects on one lot), junction signs carry the real street
names, and traffic signals, stop signs and crosswalks sit where OSM maps them.

Landmarks along the way are built where they really are: the Petro-Canada/Circle K
forecourt and St. Andrew's Presbyterian at the top, Wellington Secondary off Mexicana
Road, Rock City Elementary with its school zone and crossing, Departure Bay Baptist on
the water side, Departure Bay Elementary lower down with a school zone of its own, and
the 7-Eleven at the beach. Both schools get a painted crossing, a reader board and
SLOW / children-crossing diamonds on either approach. The church is anchored on its
own OSM footprint, so it stands on the side of the road it actually stands on. The road falls the whole way from the forecourt to the bay, the way it does in
life.

Riding is confined to a corridor along that centreline — curb, sidewalk and guardrail
— so the run stays on Departure Bay Road instead of wandering into side streets.

## Rebuilding the map

The two raw Overpass extracts are not in the repo — they are 12 MB of input, and these
two requests fetch them again. `data/map.json`, the baked output the game actually
loads, is committed, so you only need this if you want to change what gets baked.

```bash
curl -s -X POST -d @tools/query.overpassql https://overpass-api.de/api/interpreter -o data/osm_raw.json
curl -s -X POST -d @tools/query-extra.overpassql https://overpass-api.de/api/interpreter -o data/osm_extra.json
npm run bake
```

## Assets

Traffic, pedestrians, roadside trees and the suburban houses come from CC0 kits in
`assets/` (see `assets/CREDITS.md`): Quaternius cars and animated people, Kenney trees
and suburban houses. They are loaded at boot, flattened to one geometry each with their
part colours baked into vertex colours, and instanced.

The people arrive rigged and animated. Instancing cannot skin, so each character is
baked at six points of its own walk clip and each walker steps through those frames as
its stride phase advances — an animated crowd for the cost of static meshes. The kit's
own part names are what the recolours key off, which is how the congregation goes from
whites to reds mid-run without touching skin, hair or eyes.

Everyone stands on the surface that is actually drawn rather than the one the maths
says is there: the terrain is sampled onto a ~15 m grid and interpolates between the
samples, so near the road — where the ground is deliberately carved below the deck —
the drawn hillside sits up to a metre above the analytic height. People also stand on
the flat decks laid over sloping ground, like the church lawn, and walk round the
buildings and the bouncy castles instead of through them.

The rider and the western redcedar are authored GLB models in `Main-Character/` and
`cedar-tree/`. Both are loaded at boot: the rider is levelled off its own principal
axes (it is authored mid-stunt), sized by wheelbase and stood on the ground; the cedar
is decimated from 21k triangles so a few hundred can line the route, with the cheap
procedural firs still filling the distant forest.

Voice lines are generated locally with Kokoro (`npm run voices`, see
`tools/make_voices.py`) into `audio/voices/`. They play dry to the master with a tap
into a convolution plate — a decaying-noise impulse, pre-delayed so the consonants
land first — which is what gives the announcer the room he was written for.

## Credits

Map data © OpenStreetMap contributors (ODbL). Soundtrack: `departurbayspeedway.mp3`.
Display type is Road Rage via Google Fonts. Not affiliated with Rockstar Games,
7-Eleven, Circle K, Petro-Canada or BC Ferries.
