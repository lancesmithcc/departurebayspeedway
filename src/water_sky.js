// water_sky.js — ocean (reflective Water), sky, sun, fog, environment lighting
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { TEX } from './textures.js';
import { CFG } from './util.js';

export function buildSkyWater(scene, renderer) {
  // ----- sun direction -----
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - CFG.sun.elevation),
    THREE.MathUtils.degToRad(CFG.sun.azimuth),
  );

  // ----- sky -----
  // The Sky shader's radiance blows out to flat white under ACES tone mapping, so it
  // is kept for environment lighting only and the visible dome is an explicit gradient
  // with a sun disc, which holds its colour through the tonemap.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 20),
    new THREE.MeshBasicMaterial({ map: TEX.skyGradient, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  // sun disc + glow, placed on the dome
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(300, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6df, fog: false, depthWrite: false, transparent: true, opacity: 0.95 }),
  );
  sunSprite.position.copy(sunDir).multiplyScalar(5200);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  // ----- environment (PBR reflections from sky) -----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(48000);
  const su2 = sky2.material.uniforms;
  su2.turbidity.value = 3.4; su2.rayleigh.value = 2.1;
  su2.mieCoefficient.value = 0.0045; su2.mieDirectionalG.value = 0.86;
  su2.sunPosition.value.copy(sunDir);
  skyScene.add(sky2);
  const envRT = pmrem.fromScene(skyScene);
  scene.environment = envRT.texture;
  // The Sky's radiance is enormous; at full strength it floods every material with
  // ambient and washes greens out to pale mint. Keep it as a subtle fill.
  scene.environmentIntensity = 0.45;

  // ----- lights -----
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.6);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120;
  sc.near = 50; sc.far = 1400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.2;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xa8c4dc, 0x3b4034, 0.7);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0xc4d3dc, 1200, 7200);

  // ----- cloud dome: the Sky shader alone renders a bare gradient -----
  TEX.clouds.wrapS = TEX.clouds.wrapT = THREE.RepeatWrapping;
  TEX.clouds.repeat.set(6, 3);
  const cloudMat = new THREE.MeshBasicMaterial({
    map: TEX.clouds, transparent: true, opacity: 0.85, depthWrite: false,
    side: THREE.BackSide, fog: false,
  });
  // shallow cap: clouds ride above the horizon, never behind the hills
  const cloudGeo = new THREE.SphereGeometry(5600, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.position.y = -900;
  clouds.renderOrder = 1;
  scene.add(clouds);

  // ----- ocean -----
  TEX.waterNormals.wrapS = TEX.waterNormals.wrapT = THREE.RepeatWrapping;
  const waterGeo = new THREE.PlaneGeometry(16000, 16000);
  const water = new Water(waterGeo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: TEX.waterNormals,
    sunDirection: sunDir.clone(),
    sunColor: 0xffe9c4,
    waterColor: 0x0b3642,
    distortionScale: 2.4,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  water.material.uniforms.size.value = 3.4;
  scene.add(water);

  function updateShadow(target) {
    sun.position.copy(sunDir).multiplyScalar(600).add(target);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  // The domes ride with the camera: anchored at the origin they run past the 9 km far
  // plane and get clipped into a black hole in the sky.
  function update(dt, camPos) {
    water.material.uniforms.time.value += dt * 0.7;
    cloudMat.map.offset.x += dt * 0.0016;      // weather drifts, slowly
    if (camPos) {
      sky.position.set(camPos.x, 0, camPos.z);
      clouds.position.set(camPos.x, -900, camPos.z);
      sunSprite.position.copy(sunDir).multiplyScalar(5200).add(camPos);
      sunSprite.lookAt(camPos);
    }
  }

  return { water, sky, sun, sunDir, update, updateShadow, fogColor: 0xcfd8dd };
}
