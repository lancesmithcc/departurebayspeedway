import {Multiplayer} from './multiplayer.js';
import {multiplayerUI} from './multiplayer-ui.js';
import {buildSculptedVehicleKit} from './sculpted-vehicles.js';
import {buildBeachPortal} from './beach-portal.js';
import { createCharacterCast } from './character-cast.js';
import {Police} from './police.js';
import {Deer} from './deer.js';
import {buildReferenceUpperStreet} from './reference-upper-street.js';
import {buildReferenceSchoolBoard} from './reference-schools.js';
import {buildReferenceResidential} from './reference-residential.js';
import {buildReferenceLowerStreet} from './reference-lower-street.js';
import { ElevationGrid } from './elevation-grid.js';
// main.js — bootstrap: load map data, build world, run loop
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildTextures, TEX } from './textures.js';
import { Terrain } from './terrain.js';
import { applyStreetProfile } from './street-profile.js';
import { buildStreetscape } from './streetscape.js';
import { buildRoads } from './roads.js';
import { buildBuildings, buildingCollide } from './buildings.js';
import { buildTrees, buildStreetlights, buildPiers, buildFerry, buildGasStation, pylonSign, buildBeachClutter, buildSevenEleven, buildRoadEdges, buildJunctionSigns, buildTrafficFurniture, buildRockCitySchool, buildDepartureBaySchool, buildBaptistChurch } from './props.js';
import { Corridor } from './corridor.js';
import { Peds } from './peds.js';
import { loadGLB, fitModel, flatten, decimate, levelModel, loadKit, triangleCount } from './models.js';
import { buildSkyWater } from './water_sky.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Effects } from './effects.js';
import { Powerups } from './powerups.js';
import { AudioSys } from './audio.js';
import { Game } from './game.js';
import { Apocalypse } from './apocalypse.js';
import { initTouchControls, isTouchDevice } from './touch.js';

async function boot() {
  // ---- renderer ----
  // A phone GPU will happily accept everything the desktop path asks for and then run
  // it at twelve frames a second. The scene is identical either way; what gives is the
  // resolution it is drawn at, the size of the shadow map and the multisampling.
  const touch = isTouchDevice();
  // The class gates the touch-only CSS (the pad, the tap prompts, the compact title),
  // and the title card is on screen long before the controls get built, so it goes on
  // as soon as the answer is known rather than at the end of the boot.
  if (touch) document.body.classList.add('touch');
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // A 3x phone display is 9x the pixels of a 1x one for a screen you hold at arm's
  // length; 1.5 is the point where more stops being visible and only costs.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 9000);
  camera.position.set(-3000, 60, -1200);

  // ---- data ----
  buildTextures();
  const [map, routeSurvey, dtmMeta, dtmBytes, cityBuildings, canopyData] = await Promise.all([
    fetch('./data/map.json').then(r => r.json()),
    fetch('./data/route-elevation.json').then(r => r.json()),
    fetch('./data/terrain-dtm.json').then(r => {if(!r.ok)throw new Error('Terrain metadata unavailable');return r.json();}),
    fetch('./data/terrain-dtm.f32').then(r => {if(!r.ok)throw new Error('Terrain grid unavailable');return r.arrayBuffer();}),
    fetch('./data/city-buildings.json').then(r => r.json()),
    fetch('./data/canopy.json').then(r => r.json()),
  ]);
  map.canopyTrees=canopyData.trees;
  const replacedBuildings = new Set(cityBuildings.replaces);
  map.buildings = map.buildings.filter((_,i)=>!replacedBuildings.has(i)).concat(cityBuildings.buildings);
  console.log('CITY_BUILDINGS',cityBuildings.counts);
  map.elevationGrid = new ElevationGrid(dtmMeta,new Float32Array(dtmBytes));
  applyStreetProfile(map);
  map.routeElevation = routeSurvey.elevations;
  map.routeElevationOffsets = routeSurvey.lateral_offsets_m;
  map.routeElevationCross = routeSurvey.cross_sections;
  // authored assets: rider-on-bike and a western redcedar
  const [riderGLB, cedarGLB, pedKit, carKit, treeKit] = await Promise.all([
    loadGLB('./Main-Character/gla6ndzKeKQ4tFJdAE4lu_model.glb'),
    loadGLB('./cedar-tree/IoBSQ_9MPEiqnMinwAEP8_model.glb'),
    // CC0 kits (Kenney) — see assets/CREDITS.md
    // proper humanoids, frozen mid-walk off their own animation clips
    loadKit([
      './assets/peds/person-1.glb', './assets/peds/person-2.glb',
      './assets/peds/person-3.glb', './assets/peds/person-4.glb',
      './assets/peds/person-5.glb', './assets/peds/person-6.glb',
      './assets/peds/person-7.glb', './assets/peds/person-8.glb',
    ], 1.74, 'y', { poseClip: { match: /walk/i, frames: 6 } }),   // 6 frames of the walk cycle
    Promise.resolve(buildSculptedVehicleKit()),
    loadKit([
      './assets/trees/tree_pineDefaultA.glb', './assets/trees/tree_default.glb',
      './assets/trees/tree_pineTallA.glb', './assets/trees/tree_detailed.glb',
    ], 9.5),
  ]);
  // thousands of trees get instanced, so trim them down before they hit the scene
  for (const t of treeKit) {
    const before = triangleCount(t.geometry);
    t.geometry = decimate(t.geometry, 0.16);
    t.tris = triangleCount(t.geometry);
    t.trisBefore = before;
  }
  console.log(`kits: ${pedKit.length} people, ${carKit.length} cars, ${treeKit.length} trees `
    + `(${treeKit.map(t => `${t.trisBefore | 0}->${t.tris | 0}`).join(', ')})`);
  const terrain = new Terrain(map);

  // ---- sky / water / lights ----
  const skyWater = buildSkyWater(scene, renderer, { shadowMapSize: touch ? 1024 : 2048 });

  // ---- effects (ramp + rings) ----
  const effects = new Effects(scene, terrain, map);

  // The corridor is the road plus a beach chute that funnels the last few metres
  // onto the ramp, so the finish can't be overshot into the seafront apartments.
  const chute = (() => {
    // straight run-in from the road end onto the ramp deck
    const end = map.route[map.route.length - 1];
    const base = effects.ramp.base;
    const dx = base.x - end[0], dz = base.y - end[1];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.round(len / 6));
    const pts = [];
    for (let i = 1; i <= steps; i++) pts.push([end[0] + dx * i / steps, end[1] + dz * i / steps]);
    return pts;
  })();
  const corridor = new Corridor([...map.route, ...chute], terrain, { openTailLength: 6 });
  // Departure Bay Baptist sits at its real address — OSM way 531377692, on the water
  // side of the road. The anchor used to be a bare centreline point, which has no side
  // to it: Math.sign(0) fell through to +1 and put the whole church, lawn and party on
  // the inland side, mirrored across the carriageway from where it stands.
  const BAPTIST = [-1902.29, -1574.62];
  const bapPr = corridor.projectExact(BAPTIST[0], BAPTIST[1]);
  const bapI = bapPr.i;
  const bapSide = Math.sign(bapPr.lat) || 1;
  // The lawn is worked out up front so neither a house nor a fir ends up in the middle
  // of the bouncy castles. buildBaptistChurch() re-derives the same geometry from the
  // same anchor.
  const [bapNx, bapNz] = corridor.normalAt(bapI);
  const bapOut = corridor.hw[bapI] + 58;
  const bapAnchor = corridor.pts[bapI];
  const bapLawn = {
    x: bapAnchor[0] + bapNx * bapSide * bapOut,
    z: bapAnchor[1] + bapNz * bapSide * bapOut,
    r: 54,
  };
  // The lawn is a flat disc laid over what is, in the real world, a hillside falling
  // 6 m across it. Drawn straight onto the natural slope it floats clear of the ground
  // on the seaward side and buries itself on the inland side, and the congregation
  // standing on it does the same. Grade the terrain first — a church levels its lawn
  // before it puts bouncy castles on it — and everything that stands there agrees.
  // buildBaptistChurch() puts the lawn at (along 6, out hw+62); the pad has to sit on
  // that, not on the slightly different keep-clear circle above, or the graded edge
  // cuts across the disc.
  const bapTan = corridor.tan[bapI];
  const bapPad = {
    x: bapAnchor[0] + bapTan[0] * 6 + bapNx * bapSide * (corridor.hw[bapI] + 62),
    z: bapAnchor[1] + bapTan[1] * 6 + bapNz * bapSide * (corridor.hw[bapI] + 62),
    r: 34, feather: 22,
  };
  bapPad.y = terrain.groundHeight(bapPad.x, bapPad.z);
  terrain.addPad(bapPad);

  // ---- world ----
  // Built here rather than up with the sky: buildMesh() bakes the grading above into
  // the triangles, and meshHeight() reads that cache back for everything that walks.
  scene.add(terrain.buildMesh());
  scene.add(buildRoads(map, terrain));

  // Departure Bay Elementary, down where the road flattens toward the bay
  const DB_SCHOOL = [-966.58, -1270.75];

  const buildings = buildBuildings(map, terrain,
    [map.circleK, map.fuelStation && map.fuelStation.p, map.sevenEleven && map.sevenEleven.p,
      [-2360, -1410], DB_SCHOOL, [bapLawn.x, bapLawn.z]].filter(Boolean), corridor);
  console.log(`mapped building footprints: ${buildings.count}`);
  scene.add(buildings.group);
  // The cedar is 21k triangles as authored — far too heavy to instance by the
  // thousand, so it is decimated for the roadside planting and the cheap procedural
  // firs keep filling the distant forest.
  let cedar = null;
  if (cedarGLB) {
    fitModel(cedarGLB, 17);                    // a real roadside redcedar
    const flat = flatten(cedarGLB);
    if (flat) {
      const lod = decimate(flat.geometry, 0.22);
      console.log(`cedar: ${triangleCount(flat.geometry) | 0} tris -> ${triangleCount(lod) | 0}`);
      cedar = { geometry: lod, material: flat.material };
    }
  }
  const keepClear = [
    {x:-3045,z:-1184,r:38}, // observed apartment wall, hedge and ornamental tree row
    bapLawn,
    { x: -2957, z: -1318, r: 29 }, // Subway parking forecourt


    { x: -2963, z: -1145, r: 34 },     // St. Andrew's
    { x: map.circleK[0], z: map.circleK[1], r: 40 },
    { x: map.sevenEleven ? map.sevenEleven.p[0] : 0, z: map.sevenEleven ? map.sevenEleven.p[1] : 0, r: 34 },
  ];
  const trees = buildTrees(map, terrain, buildings.buildingGrid, corridor, cedar, keepClear, treeKit);
  scene.add(trees.inst);
  scene.add(trees.leaf);
  scene.add(trees.canopy);
  if (trees.cedar) scene.add(trees.cedar);
  scene.add(buildStreetlights(corridor, terrain));
  scene.add(buildStreetscape(map, corridor, terrain, keepClear));
  scene.add(buildPiers(map, terrain));
  // Wellington Secondary School at its real coordinates (Wildcats sign faces the road)
  scene.add(buildReferenceSchoolBoard(corridor,terrain,'wellington',TEX.wellington));

  // Rock City Elementary: landmark block, reader board and a marked school crossing
  const rockCity = buildRockCitySchool(map, corridor, terrain);
  scene.add(rockCity.group);

  // Departure Bay Elementary, same treatment: reader board, painted crossing and
  // SLOW / children-crossing diamonds on both approaches
  const dbSchool = buildDepartureBaySchool(map, corridor, terrain, DB_SCHOOL);
  scene.add(dbSchool.group);

  scene.add(buildReferenceUpperStreet(map,corridor,terrain));
  scene.add(buildReferenceResidential(map,corridor,terrain,keepClear));
  scene.add(buildReferenceLowerStreet(map,corridor,terrain));
  const beachPortal=buildBeachPortal(terrain,buildings.buildingGrid);
  scene.add(beachPortal);

  // Departure Bay Baptist — lawn party in full swing on the water side, roughly half
  // way down the hill where the road opens out toward the bay
  const baptist = buildBaptistChurch(corridor, terrain, BAPTIST, { pedKit });
  scene.add(baptist.group);
  // the rail lets go over the church lawn — hitting a bouncy castle is the point
  corridor.addOpenZone(baptist.entry.x, baptist.entry.z, baptist.entry.r);

  scene.add(buildRoadEdges(corridor, terrain));
  scene.add(buildBeachClutter(terrain, [effects.ramp.base.x, effects.ramp.base.y], 120));
  scene.add(buildJunctionSigns(map, corridor, terrain));
  scene.add(buildTrafficFurniture(map, corridor, terrain));

  // 7-Eleven — real Departure Bay branch, on the water side at the finish
  if (map.sevenEleven) {
    const pr = corridor.projectExact(map.sevenEleven.p[0], map.sevenEleven.p[1]);
    const tan = corridor.tan[pr.i];
    scene.add(buildSevenEleven(map.sevenEleven, terrain, Math.atan2(tan[0], tan[1]) + Math.PI / 2));
  }

  // Circle K station (start)
  const ckHeading = Math.PI * 0.75;
  scene.add(buildGasStation((map.fuelStation && map.fuelStation.p) || map.circleK, ckHeading, terrain));
  // Country Club Centre pylon
  const mall = map.buildings.find(b => b.t === 'mall');
  if (mall) {
    let cx = 0, cz = 0;
    for (const p of mall.p) { cx += p[0]; cz += p[1]; }
    cx /= mall.p.length; cz /= mall.p.length;
    scene.add(pylonSign([cx + 60, cz - 20], TEX.countryClub, terrain, 9, 4.5, 12, Math.PI * 0.5));
  }
  // BC Ferries sign + ships
  const berth = map.berth ? map.berth[0] : [350, 310];
  scene.add(pylonSign([berth[0] - 90, berth[1] - 60], TEX.bcFerries, terrain, 7, 3.5, 9, -Math.PI * 0.4));
  const ferry = buildFerry();
  ferry.position.set(berth[0] + 30, 0, berth[1] - 40);
  ferry.rotation.y = 1.25;
  scene.add(ferry);
  const ferry2 = buildFerry();
  ferry2.position.set(2300, 0, 400);
  ferry2.rotation.y = -0.6;
  scene.add(ferry2);


  // ---- player ----
  const startPos = [map.route[0][0], map.route[0][1]];
  const player = new Player(scene, terrain, {
    effects,
    corridor,
    buildingGrid: buildings.buildingGrid,
    treeGrid: trees.treeGrid,
    buildingCollide,
    startPos,
    startHeading: Math.PI, // placeholder; game sets exact
    callbacks: {},
  });

  if (riderGLB) {
    // the asset is authored mid-stunt, so level it off its own principal axes first,
    // then size it by wheelbase and stand it on the ground
    const levelled = levelModel(riderGLB) || riderGLB;
    fitModel(levelled, 2.15, 'z');
    // levelModel puts the wheelbase on z; the asset's nose is the +z end, so spin it
    // to face the game's forward (-z). ?ry= stays as a tuning escape hatch.
    const tune = new URLSearchParams(location.search);
    levelled.rotation.y += Math.PI + Number(tune.get('ry') || 0);
    levelled.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    player.useModel(levelled);
    if (tune.get('rider') === 'articulated') player.setVisualStyle('articulated');
  }

  // ---- traffic ----
  const traffic = new Traffic(scene, map, terrain, carKit);

  // ---- audio + game ----
  const audio = new AudioSys();

  // ---- people on the sidewalks and the school crossing ----
  const peds = new Peds(scene, corridor, terrain, {
    audio, effects,
    models: [...createCharacterCast(), ...pedKit],
    partyModels: pedKit,
    crossings: [rockCity.crossing, dbSchool.crossing],
    partySpot: baptist.party,
    splatTexture: TEX.splat,
    // walls are walls for people too, not just for the bike
    buildingGrid: buildings.buildingGrid,
    buildingCollide,
    blockers: baptist.blockers || [],
    // the church lawn is a flat disc laid over sloping ground: stand the party on it
    platforms: baptist.lawn ? [baptist.lawn] : [],
  });
  player.ctx.peds = peds;
  player.ctx.castles = baptist.castles;

  // Jesus joins the pedestrian system as a named character: a bar or the front wheel
  // puts him down like anybody else, and going down is what turns him.
  // He does not stay down. Three seconds face down in the grass and he is back up — as
  // the other one — and the world goes with him: every person in it turns red, the sky
  // turns with them, and fire starts falling out of it. Put the risen one back down
  // and all of it runs in reverse.
  const apocalypse = new Apocalypse(scene, terrain, skyWater, effects);
  if (baptist.jesusSpot) {
    peds.addSpecial(baptist.jesus, baptist.jesusSpot.x, baptist.jesusSpot.z, {
      name: 'jesus',
      heading: baptist.jesusSpot.heading,
      hitRadius: 1.4,
      fallLength: 0.95,
      riseDelay: 3.0,
      // One record, two deaths. The first is the one that starts it; the second is
      // the one that ends it, and the pedestrian system will not stand him up twice.
      onDeath: (sp) => {
        if (sp.risen) {
          baptist.satanSlain();
          apocalypse.end();
          peds.redeemEveryone();
          audio.setHellMusic(false);
          game.onSatanSlain();
        } else {
          baptist.becomeSatan();
          peds.jesusDead = true;
        }
      },
      onRise: () => {
        baptist.riseAsSatan();
        apocalypse.begin();
        peds.damnEveryone();
        audio.setHellMusic(true);
        game.onSatanRisen();
        audio.dialogue('rise', { persona: 'satan', voiceGender: 'male', voiceId: 'jesus' }, 4);
      },
      onRevive: () => {
        baptist.reviveJesus();
        peds.jesusDead = false;
        apocalypse.end();
        audio.setHellMusic(false);
      },
    });
  }

  // ---- roadside powerups ----
  const powerups = new Powerups(scene, corridor, terrain, { effects, audio });
  const police = new Police(scene, terrain, { audio, effects,
    isBlocked: (x,z) => !!buildingCollide(buildings.buildingGrid,x,z),
    onShot: () => game.onPoliceShot(),
  });
  const deer = new Deer(scene, map, terrain, corridor, { onHit: hit => game.onDeerHit(hit) });
  const game = new Game(map, terrain, player, traffic, effects, skyWater, audio, camera, {
    scene, buildCollide: buildingCollide, corridor, peds, powerups, baptist, apocalypse, police, deer,
    // zones that announce themselves as the rider arrives
    zones: [
      { x: rockCity.crossing[0], z: rockCity.crossing[1], r: 70, voice: 'school1', caption: 'SCHOOL ZONE — ROCK CITY ELEMENTARY' },
      { x: dbSchool.crossing[0], z: dbSchool.crossing[1], r: 70, voice: 'school1', caption: 'SCHOOL ZONE — DEPARTURE BAY ELEMENTARY' },
      { x: baptist.party.x, z: baptist.party.z, r: 95, voice: 'church1', caption: 'DEPARTURE BAY BAPTIST — LAWN PARTY IN FULL SWING' },
    ],
  });
  const roomUI=multiplayerUI(game);
  const multiplayer=new Multiplayer(scene,player,{
    onNameRequired:()=>roomUI.enterName(),onAdmission:()=>roomUI.admitted(),onWaiting:info=>roomUI.waiting(info),onDisconnect:()=>roomUI.disconnected(),
    getState:()=>({score:player.trickScore,checkpoint:game.nextGate,state:game.state})
  });
  game.multiplayer=multiplayer;
  player.ctx.callbacks = {
    onCrash: (r) => game.onCrash(r),
    onWater: () => game.onWater(),
    onTrick: (name, pts, total) => game.onTrick(name, pts, total),
    onJump: () => game.onJump(),
    onRail: (x, y, z, f) => game.onRail(x, y, z, f),
    onBounce: (x, y, z) => game.onBounce(x, y, z),
  };

  // ---- post processing ----
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    // MSAA on a tile-based mobile GPU costs more than it is worth at this pixel ratio
    type: THREE.HalfFloatType, samples: touch ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.26, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('title').classList.remove('hidden');

  // demo autopilot: start riding automatically (no input needed)
  if (game.demo) setTimeout(() => game.startRide(), 1500);

  // ?school=1: park by the Wellington sign and orbit it (sign check view)
  if (new URLSearchParams(location.search).has('school')) {
    player.reset([-2922, -1372], Math.PI);
    player.cameraMode = 3;
    player._orbitR = 34;
    player._orbitH = 9;
  }

  // expose for debugging
  // the on-screen pad writes the same key codes the keyboard listener does
  if (touch) initTouchControls(game);

  window.DBG = { game, player, terrain, effects, traffic, scene, camera, map, corridor, peds, powerups, baptist, apocalypse, skyWater, audio, touch, police, deer, multiplayer };

  // Read-only visual QA views used during deployment checks. They stay dormant in a
  // normal game and make landmark/ground-contact regressions reproducible.
  const qa = new URLSearchParams(location.search);
  const inspect = qa.get('inspect');
  let qaCameraTarget = null;
  if (inspect === 'portal') {
    const p=beachPortal.position;
    player.root.visible=false;game.el.title.classList.add('hidden');game.el.hud.classList.add('hidden');
    qaCameraTarget={x:p.x,z:p.z,y:p.y+2.3,dx:11,dz:7,h:2.7};
  } else if (inspect === 'jesus' || inspect === 'satan') {
    const p = baptist.jesus.position;
    player.reset([p.x + 30, p.z + 30], 0);
    player.root.visible = false;
    game.el.title.classList.add('hidden'); game.el.hud.classList.add('hidden');
    const angle = baptist.jesus.rotation.y;
    qaCameraTarget = {x:p.x,z:p.z,y:p.y+1.1,dx:Math.sin(angle)*4.2+1.4,dz:Math.cos(angle)*4.2,h:0.6};
    if (inspect === 'satan') { baptist.becomeSatan(); baptist.riseAsSatan(); }
  } else if (inspect === 'route') {
    const station = Math.max(0, Math.min(corridor.total - 100, Number(qa.get('station')) || 0));
    const i = corridor.cum.findIndex(s => s >= station);
    const p = corridor.pts[i], [tx, tz] = corridor.tan[i];
    player.reset(p, Math.atan2(-tx, -tz)); player.cameraMode = 0;
    game.el.title.classList.add('hidden'); game.el.hud.classList.remove('hidden');
    qaCameraTarget = {x:p[0]+tx*16,z:p[1]+tz*16,y:player.pos.y+1.8,dx:-tx*23,dz:-tz*23,h:1.7};
    if(qa.has('clean')){game.el.hud.classList.add('hidden');player.root.visible=false;qaCameraTarget.y=player.pos.y+1.7;qaCameraTarget.h=0;}
  } else if (inspect === 'seven' && map.sevenEleven) {
    player.reset(map.sevenEleven.p, 0); player.cameraMode = 3; player._orbitR = 42; player._orbitH = 14;
    game.el.title.classList.add('hidden'); game.el.hud.classList.remove('hidden');
    qaCameraTarget = { x: map.sevenEleven.p[0], z: map.sevenEleven.p[1], y: terrain.routeLevelNear(...map.sevenEleven.p) + 2, dx: 34, dz: 32, h: 14 };
  } else if (inspect === 'baptist') {
    player.reset([baptist.party.x, baptist.party.z], 0); player.cameraMode = 3; player._orbitR = 58; player._orbitH = 18;
    game.el.title.classList.add('hidden'); game.el.hud.classList.remove('hidden');
    qaCameraTarget = { x: baptist.party.x, z: baptist.party.z, y: baptist.lawn.y + 2, dx: 46, dz: 44, h: 19 };
  }
  if (inspect) console.log(`QA_INSPECT ${inspect} x=${player.pos.x.toFixed(1)} z=${player.pos.z.toFixed(1)} y=${player.pos.y.toFixed(2)}`);
  if (qa.has('audit')) setInterval(() => {
    const upright = [...peds.people, ...peds.kids, ...peds.party, ...peds.specials]
      .filter(p => p.active && !(p.splat > 0) && Number.isFinite(p.y));
    const pedGaps = upright.map(p => p.y - peds.stand(p.x, p.z));
    const cars = traffic.cars.filter(c => c.active && Number.isFinite(c.y));
    const carGaps = cars.map(c => {
      const deck = terrain.roadDeck(c.x, c.z);
      const ground = deck && deck.d < deck.hw + 0.8 ? deck.y - 0.05 : terrain.surfaceHeight(c.x, c.z);
      return c.y - ground;
    });
    console.log('QA_AUDIT ' + JSON.stringify({
      peds: { n: pedGaps.length, below: pedGaps.filter(v => v < -0.02).length, min: Math.min(0, ...pedGaps) },
      cars: { n: carGaps.length, flying: carGaps.filter(v => v > 0.3).length, below: carGaps.filter(v => v < -0.1).length, max: Math.max(0, ...carGaps) },
      seven: { ground: terrain.groundHeight(...map.sevenEleven.p), road: terrain.routeLevelNear(...map.sevenEleven.p) },
      baptist: { ground: terrain.groundHeight(...BAPTIST), road: terrain.routeLevelNear(...BAPTIST), lawn: baptist.lawn.y },
    }));
  }, 3000);

  // ---- loop (setTimeout: rAF is suspended in some embedded browser guests) ----
  const clock = new THREE.Clock();
  let loopErr = null;
  let frames = 0;
  if (game.debug) {
    setInterval(() => { document.title = 'DBS ' + frames + 'f' + (loopErr ? ' ERR' : ''); frames = 0; }, 1000);
  }
  const tick = () => {
    frames++;
    try {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      game.update(dt, t);
      multiplayer.update(dt);
      roomUI.update(multiplayer);
      if(game.state==='finished' && multiplayer.status==='active')multiplayer.leave();
      if (qaCameraTarget) {
        camera.position.set(qaCameraTarget.x + qaCameraTarget.dx, qaCameraTarget.y + qaCameraTarget.h, qaCameraTarget.z + qaCameraTarget.dz);
        camera.lookAt(qaCameraTarget.x, qaCameraTarget.y, qaCameraTarget.z);
      }
      skyWater.update(dt, camera.position);
      // the sky's own colour, and whatever is falling out of it
      apocalypse.update(dt, camera.position);
      // departing ferry drifts
      if (baptist.animate) baptist.animate(t, dt);
      ferry2.position.x += 3.4 * dt;
      ferry2.position.z -= 2.2 * dt;
      if (ferry2.position.x > 3600) { ferry2.position.set(1600, 0, 1400); }
      composer.render();
    } catch (e) {
      if (loopErr !== e.message) {
        loopErr = e.message;
        console.error(e);
        let d = document.getElementById('errdump');
        if (!d) {
          d = document.createElement('div');
          d.id = 'errdump';
          d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:rgba(120,0,0,0.85);color:#fbb;font:12px monospace;padding:6px 10px;white-space:pre-wrap;pointer-events:none;';
          document.body.appendChild(d);
        }
        d.textContent = (e.message || e) + ' @ ' + (e.stack || '').split('\n')[1];
      }
    }
    setTimeout(tick, 1000 / 60);
  };
  tick();
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.innerHTML = `<div style="color:#f66;font:16px monospace;padding:40px">Failed to load: ${err.message}<br>${err.stack?.split('\n').slice(0,3).join('<br>')}</div>`;
});
