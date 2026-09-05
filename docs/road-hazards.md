# Roadside clearance, RCMP encounters and deer

Local implementation after production dd57e26; not deployed.

Checkpoint supports now follow the road normal instead of global east/west. Utility poles, promenade lamps and school warning posts are moved outside every nearby road deck, including intersecting wider roads. The former nearest-road-only iteration could oscillate across junctions; the new search selects the nearest clear verge. Roadside test checks 137 placements, minimum streetlight clearance 1.15m. Browser scene scan checked 72 individual tall pole meshes and found no asphalt obstructions after moving the last Rock City warning post.

St. Andrew's reader board now says exactly: “Join us with Pasteur Jeremy, he puts the STUD in Bible Study.” User spelling retained. Three lines fit the existing sign panel.

Hitting an active RCMP SUV with the bike or a Nanaimo bar triggers flashing red/blue lights, a short siren and an officer encounter. Direct bike impacts slow/stagger the rider instead of immediately ending pursuit in a generic traffic crash. Officer wears the grey short-sleeve shirt, black POLICE vest/duty belt, navy baseball cap and yellow-striped navy trousers in the user's group reference: https://pbs.twimg.com/media/CGtafy9UkAAIK4O.jpg. Geometry is a fictional stylized character, not a portrait or photogrammetric model.

Officer exits, approaches, aims visibly for1.35s, then fires with muzzle flash, tracer and sound. Aim locks before the shot; movement, range and building/terrain cover can evade hits. Shots are spaced2.1s; three landed shots wipe out the rider, while blessing prevents damage. At most2 encounters run; after25s or160m separation the car is released. Respawning/restarting clears encounters, resources and hits; pooled vehicle generation changes invalidate old encounters.

Five deer crossing sites use actual LiDAR canopy support and building clearance around stations1045,1640,1850,2080,2505m. Articulated does/bucks approach, pause, cross and depart. Collision sweeps prevent tunneling. Below42.3m/s (90% of base maximum, about152km/h), a hit causes a rider wipeout and the deer flees. At/above threshold the deer falls without gore, rider stays upright and loses250 points; score may go negative. Each animal can trigger once per race, and fallen bodies persist until restart. Deer are not reset on ordinary respawn, preventing repeated point deductions at the same animal.

Review: /tools/police-preview.html and /tools/deer-preview.html.
Validation: npm run check:hazards, check:traffic, check:voices, check:scene and check:characters passed. Browser actual RCMP bar-hit trigger produced one stopped vehicle,3 hits and police crash; reset removed officer/lights and released car. Actual deer callbacks at20m/s crashed rider with unchanged score;47m/s left rider riding and reduced500 to250. No browser errors. Automated route reached8/8 gates and finished after a manual traffic-pileup clear near checkpoint3; this was not an uninterrupted autopilot success.
