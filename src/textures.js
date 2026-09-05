// textures.js — procedural canvas textures (no external assets)
import * as THREE from 'three';
import { rand, fbm, clamp, TAU } from './util.js';

function canvasTex(w, h, fn, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const TEX = {};

export function buildTextures() {
  // ---- asphalt ----
  TEX.asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6d7073'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // weathered grey asphalt, not fresh black tar
      const n = fbm(x * 0.14, y * 0.14, 4), n2 = fbm(x * 0.03 + 40, y * 0.03, 3);
      const v = 88 + n * 16 + n2 * 6 + rand(-5,5);
      const i = (y * w + x) * 4;
      d[i] = v; d[i + 1] = v + 1; d[i + 2] = v + 2;
    }
    g.putImageData(img, 0, 0);
    // patches
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${58 + Math.random() * 26 | 0},${58 + Math.random() * 26 | 0},${60 + Math.random() * 26 | 0},0.07)`;
      g.beginPath();
      g.ellipse(rand(0, w), rand(0, h), rand(24, 90), rand(18, 60), rand(0, 6.3), 0, 6.3);
      g.fill();
    }
    // cracks
    g.strokeStyle = 'rgba(38,39,40,0.32)'; g.lineWidth = 0.7;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      let x = rand(0, w), y = rand(0, h);
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); }
      g.stroke();
    }
  });

  // ---- facade (3m x 3m tile: wall + window) ----
  TEX.facade = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.09, y * 0.09, 3);
      const i = (y * w + x) * 4, v = n * 16 - 8;
      d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.8;
    }
    g.putImageData(img, 0, 0);
    // window: dark reflective glass w/ sky gradient + frame + sill
    const wx = 106, wy = 96, ww = 300, wh = 260;
    const grad = g.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
    grad.addColorStop(0, '#3d4b52'); grad.addColorStop(0.45, '#74909c');
    grad.addColorStop(0.5, '#546772'); grad.addColorStop(1, '#2b343a');
    g.fillStyle = grad; g.fillRect(wx, wy, ww, wh);
    // mullion
    g.fillStyle = '#6f695e'; g.fillRect(wx + ww / 2 - 4, wy, 8, wh);
    g.fillRect(wx, wy + wh / 2 - 4, ww, 8);
    // frame
    g.strokeStyle = '#8d867a'; g.lineWidth = 12; g.strokeRect(wx, wy, ww, wh);
    // sill
    g.fillStyle = '#a09a8d'; g.fillRect(wx - 18, wy + wh + 6, ww + 36, 16);
  });

  // ---- house siding (3m x 3m tile: lap siding + window + trim) ----
  TEX.siding = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    // horizontal lap boards with a shadow line under each
    for (let y = 0; y < h; y += 34) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.02})`;
      g.fillRect(0, y + 28, w, 6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, y, w, 3);
    }
    // grain noise
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.11, y * 0.11, 3), i = (y * w + x) * 4, v = n * 14 - 7;
      d[i] += v; d[i + 1] += v; d[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
    // window: white casing, muntin bars, curtain-lit glass
    const wx = 138, wy = 120, ww = 236, wh = 250;
    g.fillStyle = '#efeee9'; g.fillRect(wx - 16, wy - 16, ww + 32, wh + 32);
    const gl = g.createLinearGradient(wx, wy, wx + ww * 0.5, wy + wh);
    gl.addColorStop(0, '#5b6b74'); gl.addColorStop(0.5, '#8ea5ad'); gl.addColorStop(1, '#39454c');
    g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#efeee9';
    g.fillRect(wx + ww / 2 - 5, wy, 10, wh);
    g.fillRect(wx, wy + wh / 2 - 5, ww, 10);
    g.strokeStyle = '#d8d5cc'; g.lineWidth = 10; g.strokeRect(wx, wy, ww, wh);
    // sill
    g.fillStyle = '#e6e2d8'; g.fillRect(wx - 26, wy + wh + 16, ww + 52, 18);
  });

  // ---- asphalt shingles (roofs) ----
  TEX.shingle = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const rowH = 42, tabW = 64;
    for (let r = 0, y = 0; y < h + rowH; y += rowH, r++) {
      const off = (r % 2) * (tabW / 2);
      for (let x = -tabW; x < w + tabW; x += tabW) {
        const v = 0.82 + Math.random() * 0.18;
        g.fillStyle = `rgba(${(255 * v) | 0},${(252 * v) | 0},${(248 * v) | 0},1)`;
        g.fillRect(x + off, y, tabW - 3, rowH - 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, y + rowH - 5, w, 5);
    }
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.4, y * 0.4, 2), i = (y * w + x) * 4, v = n * 30 - 18;
      d[i] += v; d[i + 1] += v; d[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
  });

  // ---- ground-floor storefront band (glass + mullions + door) ----
  TEX.storefront = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#2c3238'; g.fillRect(0, 0, w, h);
    for (let x = 8; x < w; x += 86) {
      const gl = g.createLinearGradient(x, 12, x + 60, h - 12);
      gl.addColorStop(0, '#8fa9b6'); gl.addColorStop(0.45, '#43555f');
      gl.addColorStop(0.5, '#6d8794'); gl.addColorStop(1, '#28323a');
      g.fillStyle = gl; g.fillRect(x, 14, 74, h - 40);
      g.fillStyle = 'rgba(255,236,190,0.20)'; g.fillRect(x + 6, h - 84, 62, 46);
    }
    g.fillStyle = '#1d2228'; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#3b444c'; g.fillRect(0, 0, w, 14);
  });

  // ---- terrain detail (grass/grain) ----
  TEX.groundDetail = canvasTex(512, 512, (g, w, h) => {
    // start opaque: a blank canvas has alpha 0, and putImageData would premultiply
    // the whole tile to black — which turned every patch of ground into a void
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.25, y * 0.25, 4) * 0.5 + fbm(x * 0.05, y * 0.05, 3) * 0.5;
      const i = (y * w + x) * 4, v = 190 + n * 65;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });

  // ---- wood planks (piers, ramp) ----
  TEX.wood = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7a6248'; g.fillRect(0, 0, w, h);
    for (let p = 0; p < 8; p++) {
      const y0 = p * 64;
      g.fillStyle = `rgb(${105 + rand(-14, 14) | 0},${82 + rand(-12, 12) | 0},${58 + rand(-10, 10) | 0})`;
      g.fillRect(0, y0 + 2, w, 60);
      g.strokeStyle = 'rgba(40,28,16,0.55)'; g.lineWidth = 3;
      g.strokeRect(0, y0 + 2, w, 60);
      // grain
      g.strokeStyle = 'rgba(60,44,26,0.25)'; g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = y0 + rand(8, 56);
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x < w; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
        g.stroke();
      }
    }
  });

  // ---- concrete ----
  TEX.concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9b9b95'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.12, y * 0.12, 3);
      const i = (y * w + x) * 4, v = n * 22 - 11;
      d[i] += v; d[i + 1] += v; d[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
  });

  // ---- water normals (generated heightfield -> normal map, linear) ----
  TEX.waterNormals = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    const H = (x, y) => fbm(x * 0.045, y * 0.045, 4) * 0.7 + fbm(x * 0.13 + 7, y * 0.13, 3) * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = 2.2;
      const hL = H((x - 1 + w) % w, y), hR = H((x + 1) % w, y);
      const hD = H(x, (y - 1 + h) % h), hU = H(x, (y + 1) % h);
      let nx = (hL - hR) * s, ny = (hD - hU) * s, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = nz * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });

  // ---- sky gradient (zenith -> horizon), used on a background dome ----
  TEX.skyGradient = canvasTex(64, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, '#2d6ba8');
    grad.addColorStop(0.35, '#5f97c6');
    grad.addColorStop(0.68, '#a8c6d8');
    grad.addColorStop(0.88, '#d6e2e8');
    grad.addColorStop(1.00, '#e6eef2');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, { repeat: false });

  // ---- cloud sheet (soft PNW overcast, alpha over the sky dome) ----
  TEX.clouds = canvasTex(1024, 1024, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // two octave bands: broad sheet plus torn edges
        const broad = fbm(x * 0.006, y * 0.006, 4);
        const detail = fbm(x * 0.02 + 21, y * 0.02 + 9, 4);
        // sparse broken cloud, not an overcast lid: most of the dome stays clear
        let a = clamp((broad * 0.95 + detail * 0.5 - 0.86) * 3.4, 0, 1);
        a *= 0.9;
        const bright = 214 + detail * 34;
        const i = (y * w + x) * 4;
        d[i] = bright; d[i + 1] = bright; d[i + 2] = bright + 4;
        d[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  });

  // ---- particle sprites ----
  TEX.dot = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false });

  TEX.fireDot = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,250,210,1)');
    gr.addColorStop(0.3, 'rgba(255,170,40,0.9)');
    gr.addColorStop(0.7, 'rgba(230,60,10,0.45)');
    gr.addColorStop(1, 'rgba(120,10,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false });

  // ---- signs ----
  // Circle K mark: red ring + bold K inside, drawn at (cx,cy) with radius r
  const ckMark = (g, cx, cy, r, red = '#da291c') => {
    g.save();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    g.strokeStyle = red; g.lineWidth = r * 0.26;
    g.beginPath(); g.arc(cx, cy, r * 0.86, 0, 6.2832); g.stroke();
    g.fillStyle = red;
    g.font = `900 ${Math.round(r * 1.15)}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('K', cx, cy + r * 0.06);
    g.restore();
  };
  TEX.ckMark = ckMark; // exported through TEX so props can stamp it

  // Petro-Canada: the fuel brand on the pumps and canopy at the same forecourt
  const leaf = (g, cx, cy, r, color = '#e2231a') => {
    g.save(); g.translate(cx, cy); g.scale(r / 100, r / 100);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -100); g.lineTo(18, -58); g.lineTo(52, -68); g.lineTo(40, -26);
    g.lineTo(92, 6); g.lineTo(52, 20); g.lineTo(60, 54); g.lineTo(16, 44);
    g.lineTo(8, 96); g.lineTo(-8, 96); g.lineTo(-16, 44); g.lineTo(-60, 54);
    g.lineTo(-52, 20); g.lineTo(-92, 6); g.lineTo(-40, -26); g.lineTo(-52, -68);
    g.lineTo(-18, -58);
    g.closePath(); g.fill();
    g.restore();
  };
  TEX.petroCanada = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e2231a'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    leaf(g, 256, 190, 120);
    g.fillStyle = '#e2231a';
    g.font = '900 62px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PETRO-CANADA', 256, 350);
    g.fillStyle = '#1a1a1a'; g.font = '700 30px Arial';
    g.fillText('4286 DEPARTURE BAY RD', 256, 420);
  }, { repeat: false });

  TEX.petroBand = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2231a'; g.fillRect(0, h - 30, w, 30);
    leaf(g, 132, 118, 82);
    g.fillStyle = '#e2231a';
    g.font = '900 104px Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('PETRO-CANADA', 236, 116);
  }, { repeat: false });

  // square pole-sign face
  TEX.circleK = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#da291c'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
    ckMark(g, 256, 190, 132);
    g.fillStyle = '#da291c';
    g.font = '900 84px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Circle K', 256, 372);
    g.fillStyle = '#1a1a1a'; g.font = '700 32px Arial, sans-serif';
    g.fillText('DEPARTURE BAY RD', 256, 448);
  }, { repeat: false });

  // wide fascia band for the canopy / storefront
  TEX.circleKBand = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#da291c'; g.fillRect(0, h - 34, w, 34);
    g.fillStyle = '#f5821f'; g.fillRect(0, h - 44, w, 10);
    ckMark(g, 150, 112, 84);
    g.fillStyle = '#da291c';
    g.font = '900 110px "Arial Black", Arial, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('Circle K', 264, 108);
  }, { repeat: false });

  // fuel-price panel under the pole sign
  TEX.circleKPrice = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#12161b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#da291c'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f5821f'; g.font = '800 34px Arial, sans-serif';
    g.fillText('REGULAR', 128, 46);
    g.fillStyle = '#ffcf3f'; g.font = '900 92px "Arial Black", Arial';
    g.fillText('167', 128, 122);
    g.fillStyle = '#9fb0bd'; g.font = '700 30px Arial';
    g.fillText('9 ¢/L', 128, 196);
  }, { repeat: false });

  // 7-Eleven: orange field, red 7, green ELEVEN band
  const sevenMark = (g, cx, cy, scale) => {
    g.save();
    g.translate(cx, cy); g.scale(scale, scale);
    g.fillStyle = '#f5821f';
    g.beginPath();
    g.moveTo(-150, -140); g.lineTo(150, -140); g.lineTo(120, 150); g.lineTo(-120, 150);
    g.closePath(); g.fill();
    g.fillStyle = '#ec1c24';
    g.font = '900 250px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('7', 0, -14);
    g.fillStyle = '#00703c';
    g.fillRect(-116, 46, 232, 66);
    g.fillStyle = '#ffffff';
    g.font = '900 52px Arial, sans-serif';
    g.fillText('ELEVEN', 0, 82);
    g.restore();
  };
  TEX.sevenMark = sevenMark;

  TEX.sevenEleven = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    sevenMark(g, 256, 240, 1.35);
    g.fillStyle = '#00703c'; g.fillRect(0, h - 54, w, 54);
    g.fillStyle = '#ffffff';
    g.font = '800 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('OPEN 24 HOURS', 256, h - 27);
  }, { repeat: false });

  // wide fascia band for the storefront parapet
  TEX.sevenBand = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5821f'; g.fillRect(0, 0, w, 26);
    g.fillStyle = '#00703c'; g.fillRect(0, h - 26, w, 26);
    sevenMark(g, 140, 128, 0.62);
    g.fillStyle = '#ec1c24';
    g.font = '900 96px "Arial Black", Arial, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('7-ELEVEN', 268, 126);
  }, { repeat: false });

  TEX.countryClub = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0d3b2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d7af37'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.font = '900 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('COUNTRY CLUB', 256, 92);
    g.fillText('CENTRE', 256, 168);
  }, { repeat: false });

  TEX.bcFerries = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#00549f'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#ffd200'; g.fillRect(0, 160, w, 24);
    g.font = '900 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText('BC FERRIES', 256, 50);
    g.fillStyle = '#00549f'; g.font = '700 44px Arial';
    g.fillText('DEPARTURE BAY', 256, 128);
    g.fillStyle = '#111'; g.font = '600 30px Arial';
    g.fillText('HORSESHOE BAY  •  VANCOUVER', 256, 210);
  }, { repeat: false });

  TEX.chevron = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d43b1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (let i = -1; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0); g.lineTo(i * 64 + 64, 0); g.lineTo(i * 64 + 128, 256); g.lineTo(i * 64 + 64, 256);
      g.closePath(); g.fill();
    }
  });

  // the finish banner wears the logotype cropped straight off the key art
  const texLoader = new THREE.TextureLoader();
  TEX.banner = texLoader.load('./titlecrop.png');
  TEX.banner.colorSpace = THREE.SRGBColorSpace;
  TEX.banner.anisotropy = 8;
  TEX.bannerFallback = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#101418'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffb400'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.font = 'italic 900 96px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ffd23f'); grad.addColorStop(0.5, '#ff8a00'); grad.addColorStop(1, '#ffd23f');
    g.fillStyle = grad;
    g.fillText('DEPARTURE BAY SPEEDWAY', 512, 128);
    g.fillStyle = '#ffb400'; g.font = '700 30px Arial';
    g.fillText('★ FINAL JUMP ★ SEND IT THROUGH THE RINGS', 512, 210);
  }, { repeat: false });

  TEX.fireRing = canvasTex(256, 64, (g, w, h) => {
    // torus fire texture wraps around tube
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const v = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      const grad = g.createLinearGradient(0, 0, 0, h);
      const hot = clamp(0.55 + v * 0.45, 0, 1);
      grad.addColorStop(0, `rgba(255,${160 + hot * 60 | 0},40,1)`);
      grad.addColorStop(hot * 0.7, `rgba(255,${90 + hot * 80 | 0},10,1)`);
      grad.addColorStop(1, 'rgba(120,15,0,1)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 1, h);
    }
  });

  // ---- Wellington Secondary School sign: header + cougar face + kindness motto ----
  TEX.wellington = canvasTex(1024, 512, (g, w, h) => {
    const navy = '#0e2a5c', gold = '#e8b537';
    g.fillStyle = navy; g.fillRect(0, 0, w, h);
    g.strokeStyle = gold; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = 'rgba(232,181,55,0.45)'; g.lineWidth = 3; g.strokeRect(26, 26, w - 52, h - 52);
    // header
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = gold; g.font = '900 92px Georgia, serif';
    g.fillText('WELLINGTON', 512, 92);
    g.fillStyle = '#ffffff'; g.font = '700 54px Georgia, serif';
    g.fillText('S E C O N D A R Y   S C H O O L', 512, 166);
    g.strokeStyle = gold; g.lineWidth = 4;
    g.beginPath(); g.moveTo(120, 212); g.lineTo(904, 212); g.stroke();
    // cougar face (left)
    const cx = 250, cy = 360, R = 118;
    g.save();
    // ears
    g.fillStyle = '#b98d1e';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * R * 0.52, cy - R * 0.62);
      g.lineTo(cx + s * R * 0.98, cy - R * 1.18);
      g.lineTo(cx + s * R * 1.02, cy - R * 0.28);
      g.closePath(); g.fill();
      g.fillStyle = '#7c5c10';
      g.beginPath();
      g.moveTo(cx + s * R * 0.58, cy - R * 0.62);
      g.lineTo(cx + s * R * 0.88, cy - R * 1.0);
      g.lineTo(cx + s * R * 0.9, cy - R * 0.38);
      g.closePath(); g.fill();
      g.fillStyle = '#b98d1e';
    }
    // head
    g.beginPath(); g.ellipse(cx, cy, R * 0.92, R, 0, 0, TAU); g.fill();
    // cheek fur
    g.fillStyle = '#a3791a';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(cx + s * R * 0.72, cy + R * 0.18, R * 0.34, R * 0.5, s * 0.5, 0, TAU); g.fill();
    }
    // muzzle
    g.fillStyle = '#efe3c8';
    g.beginPath(); g.ellipse(cx, cy + R * 0.42, R * 0.5, R * 0.4, 0, 0, TAU); g.fill();
    // eyes (fierce slant)
    g.fillStyle = '#101204';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * R * 0.42, cy - R * 0.18, R * 0.17, R * 0.11, s * -0.45, 0, TAU); g.fill();
      g.fillStyle = '#f4d34a';
      g.beginPath(); g.ellipse(cx + s * R * 0.45, cy - R * 0.2, R * 0.055, R * 0.045, 0, 0, TAU); g.fill();
      g.fillStyle = '#101204';
    }
    // nose + mouth
    g.fillStyle = '#1c1610';
    g.beginPath();
    g.moveTo(cx, cy + R * 0.22); g.lineTo(cx - R * 0.14, cy + R * 0.1); g.lineTo(cx + R * 0.14, cy + R * 0.1);
    g.closePath(); g.fill();
    g.strokeStyle = '#1c1610'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy + R * 0.26); g.lineTo(cx, cy + R * 0.42); g.stroke();
    g.beginPath(); g.moveTo(cx, cy + R * 0.42); g.quadraticCurveTo(cx - R * 0.24, cy + R * 0.56, cx - R * 0.34, cy + R * 0.38); g.stroke();
    g.beginPath(); g.moveTo(cx, cy + R * 0.42); g.quadraticCurveTo(cx + R * 0.24, cy + R * 0.56, cx + R * 0.34, cy + R * 0.38); g.stroke();
    g.restore();
    // motto beside the cougar
    g.fillStyle = '#ffffff'; g.font = 'italic 700 46px Georgia, serif';
    g.fillText('“Kindness is the way', 672, 328);
    g.fillText('of the Wildcats!”', 672, 396);
    g.fillStyle = gold; g.font = '700 26px Arial';
    g.fillText('★ HOME OF THE WILDCATS ★', 672, 452);
  }, { repeat: false });

  // ---- Rock City Elementary reader board ----
  TEX.rockCity = canvasTex(1024, 512, (g, w, h) => {
    const green = '#1d5b3a', cream = '#f4efdf';
    g.fillStyle = cream; g.fillRect(0, 0, w, h);
    g.fillStyle = green; g.fillRect(0, 0, w, 168);
    g.strokeStyle = green; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = cream; g.font = '900 96px Georgia, serif';
    g.fillText('ROCK CITY', 512, 62);
    g.font = '700 52px Georgia, serif';
    g.fillText('E L E M E N T A R Y', 512, 128);
    g.fillStyle = '#8a2f22'; g.font = '900 62px "Arial Black", Arial';
    g.fillText('SCHOOL ZONE', 512, 250);
    g.fillStyle = '#1b1b1b'; g.font = 'italic 700 44px Georgia, serif';
    g.fillText('Slow down — our kids', 512, 330);
    g.fillText('are crossing!', 512, 386);
    g.fillStyle = green; g.font = '800 34px Arial';
    g.fillText('★ HOME OF THE RAVENS ★', 512, 452);
  }, { repeat: false });

  // ---- Departure Bay Elementary reader board ----
  TEX.departureBay = canvasTex(1024, 512, (g, w, h) => {
    const blue = '#1d4e6b', cream = '#f4efdf';
    g.fillStyle = cream; g.fillRect(0, 0, w, h);
    g.fillStyle = blue; g.fillRect(0, 0, w, 168);
    g.strokeStyle = blue; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = cream; g.font = '900 82px Georgia, serif';
    g.fillText('DEPARTURE BAY', 512, 58);
    g.font = '700 50px Georgia, serif';
    g.fillText('E L E M E N T A R Y', 512, 130);
    g.fillStyle = '#8a2f22'; g.font = '900 62px "Arial Black", Arial';
    g.fillText('SCHOOL ZONE', 512, 248);
    g.fillStyle = '#1b1b1b'; g.font = 'italic 700 44px Georgia, serif';
    g.fillText('SLOW — children', 512, 328);
    g.fillText('crossing!', 512, 384);
    g.fillStyle = blue; g.font = '800 34px Arial';
    g.fillText('★ 30 km/h WHEN CHILDREN PRESENT ★', 512, 452);
  }, { repeat: false });

  // ---- school-zone diamond: two kids crossing ----
  // The panel is a square plane rolled 45° into a diamond, so the artwork is drawn
  // back-rotated here and only the border follows the canvas edge.
  TEX.slowChildren = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9e83c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#141414'; g.lineWidth = 26; g.strokeRect(22, 22, w - 44, h - 44);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);       // cancels the +45° roll the panel is mounted at
    g.fillStyle = '#141414';
    // a tall child leading a small one across, the BC school-crossing pictogram
    const kid = (x, s, stride) => {
      g.save();
      g.translate(x, 0);
      g.scale(s, s);
      g.beginPath(); g.arc(0, -92, 25, 0, TAU); g.fill();          // head
      g.beginPath();                                               // body
      g.moveTo(-26, -58); g.lineTo(26, -58); g.lineTo(20, 10); g.lineTo(-20, 10);
      g.closePath(); g.fill();
      g.lineCap = 'round'; g.lineWidth = 18; g.strokeStyle = '#141414';
      g.beginPath(); g.moveTo(-8, 6); g.lineTo(-8 - stride, 82); g.stroke();   // legs
      g.beginPath(); g.moveTo(10, 6); g.lineTo(10 + stride, 82); g.stroke();
      g.lineWidth = 15;
      g.beginPath(); g.moveTo(-22, -48); g.lineTo(-44, 4); g.stroke();          // arms
      g.beginPath(); g.moveTo(22, -48); g.lineTo(46, -6); g.stroke();
      g.restore();
    };
    // The panel is a square rolled 45°, so the usable upright area is the inscribed
    // square — about 70% of the canvas. Draw big or the kids come out as specks.
    kid(-84, 1.55, 26);
    kid(94, 1.05, 18);
    g.restore();
  }, { repeat: false });

  // ---- the SLOW tab that hangs under the diamond ----
  TEX.slowTab = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#d9e83c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#141414'; g.lineWidth = 20; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#141414';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 148px "Arial Black", Arial';
    g.fillText('SLOW', w / 2, h / 2 + 8);
  }, { repeat: false });

  // ---- St. Andrew's Presbyterian: Pastor Jeremy's reader board ----
  TEX.stAndrews = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f6f2e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b1f2e'; g.fillRect(0, 0, w, 150);
    g.strokeStyle = '#5b1f2e'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f6f2e6'; g.font = '900 74px Georgia, serif';
    g.fillText("ST. ANDREW'S", 512, 56);
    g.font = '700 40px Georgia, serif';
    g.fillText('PRESBYTERIAN CHURCH', 512, 116);
    // the reader board itself, in stick-on letters
    g.fillStyle = '#111'; g.font = '800 58px "Courier New", monospace';
    g.fillText('JOIN US WITH', 512, 226);
    g.fillText('PASTOR JEREMY', 512, 292);
    g.fillStyle = '#8a1f2b'; g.font = '800 44px "Courier New", monospace';
    g.fillText('HE PUTS THE **STUD**', 512, 366);
    g.fillText('BACK IN BIBLE STUDY', 512, 424);
    g.fillStyle = '#5b1f2e'; g.font = '700 28px Arial';
    g.fillText('SUNDAYS 10 AM  ·  ALL WELCOME', 512, 476);
  }, { repeat: false });

  // ---- Departure Bay Baptist: the lawn party is on ----
  TEX.baptist = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f1ede2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f4a63'; g.fillRect(0, 0, w, 150);
    g.strokeStyle = '#2f4a63'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f1ede2'; g.font = '900 66px Georgia, serif';
    g.fillText('DEPARTURE BAY', 512, 54);
    g.font = '700 40px Georgia, serif';
    g.fillText('BAPTIST CHURCH', 512, 116);
    g.fillStyle = '#111'; g.font = '800 60px "Courier New", monospace';
    g.fillText('LAWN PARTY TODAY', 512, 232);
    g.fillStyle = '#a2262c'; g.font = '800 50px "Courier New", monospace';
    g.fillText('BOUNCY CASTLES', 512, 306);
    g.fillText('WEAR WHITE', 512, 368);
    g.fillStyle = '#2f4a63'; g.font = '700 30px Arial';
    g.fillText('EVERYONE WELCOME  ·  HE IS HERE', 512, 452);
  }, { repeat: false });

  // ---- the sign beside the Baptist church, in both of its states ----
  // One drawing, two messages: the frame, the cross and the layout are identical so
  // the swap reads as the letters being changed on the board rather than the whole
  // sign being replaced. Alive it is the church's own navy-on-cream; dead it is the
  // same board scorched, the cross upended and the letters run through with red.
  const jesusSign = (dead) => canvasTex(1024, 512, (g, w, h) => {
    const ground = dead ? '#241417' : '#f4f0e4';
    const ink = dead ? '#f0d6cf' : '#22384c';
    const frame = dead ? '#7d1418' : '#2f4a63';
    const accent = dead ? '#e8442c' : '#a2262c';
    g.fillStyle = ground; g.fillRect(0, 0, w, h);
    g.strokeStyle = frame; g.lineWidth = 16; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = frame; g.fillRect(0, 0, w, 116);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = dead ? '#f7e6e0' : '#f4f0e4';
    g.font = '700 44px Georgia, serif';
    g.fillText('DEPARTURE BAY BAPTIST', 512, 58);

    // the cross: upright while he is, upended once he is not
    g.save();
    g.translate(148, 300);
    if (dead) g.rotate(Math.PI);
    g.fillStyle = accent;
    g.fillRect(-11, -96, 22, 192);
    g.fillRect(-52, -50, 104, 22);
    g.restore();

    g.fillStyle = ink;
    if (dead) {
      g.font = '900 118px Georgia, serif';
      g.fillText('JESUS', 590, 232);
      g.fillText('IS DEAD', 590, 348);
      // a line drawn straight through both words
      g.strokeStyle = accent; g.lineWidth = 11;
      g.beginPath(); g.moveTo(300, 236); g.lineTo(880, 344); g.stroke();
      g.fillStyle = accent; g.font = '700 34px Arial';
      g.fillText('SERVICES CANCELLED  \u00b7  RUN', 590, 442);
    } else {
      g.font = '900 112px Georgia, serif';
      g.fillText('JESUS IS', 590, 232);
      g.fillText('WITH US', 590, 348);
      g.fillStyle = frame; g.font = '700 34px Arial';
      g.fillText('HE IS ON THE LAWN  \u00b7  COME SAY HI', 590, 442);
    }
  }, { repeat: false });
  TEX.jesusWith = jesusSign(false);
  TEX.jesusDead = jesusSign(true);

  // ---- nanaimo bar splat decal (windshield view) ----
  TEX.splat = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const blob = (x, y, r, col) => {
      g.fillStyle = col;
      g.beginPath();
      for (let a = 0; a < 14; a++) {
        const ang = (a / 14) * TAU;
        const rr = r * (0.68 + Math.sin(a * 3.1 + x) * 0.22 + Math.cos(a * 1.7 + y) * 0.14);
        const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
        a ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    };
    blob(128, 132, 74, 'rgba(64,36,18,0.94)');           // chocolate base
    blob(112, 118, 44, 'rgba(244,214,104,0.95)');        // custard burst
    blob(150, 152, 26, 'rgba(244,214,104,0.9)');
    blob(132, 128, 18, 'rgba(246,240,224,0.95)');        // coconut cream centre
    // droplets + flakes
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), r = rand(70, 112);
      blob(128 + Math.cos(a) * r, 132 + Math.sin(a) * r, rand(3, 9), i % 3 ? 'rgba(64,36,18,0.85)' : 'rgba(244,214,104,0.85)');
    }
  }, { repeat: false, srgb: true });
}

export function streetBlade(name) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#0f5c2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = '800 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    let n = name.toUpperCase();
    if (n.length > 22) { g.font = '800 40px Arial'; }
    g.fillText(n, 256, 64);
  }, { repeat: false });
}
