// leaderboard.js — the arcade board. Finish the run and you get to sign it.
//
// Ranking is by STYLE score, tie-broken by the faster time, the way a coin-op board
// works: the board is what you beat, not the clock alone. Ten entries, eight letters,
// kept in localStorage so it survives a reload.
const KEY = 'dbs.leaderboard.v1';
const MAX_ENTRIES = 10;
export const NAME_MAX = 8;

const SEED = [
  { name: 'BIGSHINY', score: 9400, time: 128.4, rings: 3 },
  { name: 'NANAIMO', score: 7250, time: 141.2, rings: 2 },
  { name: 'DEPBAY', score: 5600, time: 152.8, rings: 2 },
  { name: 'FERRYGUY', score: 4100, time: 163.5, rings: 1 },
  { name: 'ROCKCITY', score: 2800, time: 178.9, rings: 1 },
];

// Anything typed into a name field ends up rendered back into the page, so it is
// filtered down to an arcade alphabet here rather than trusted anywhere later.
export function sanitiseName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-]/g, '')
    .slice(0, NAME_MAX)
    .trim();
}

export function loadBoard() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SEED.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED.slice();
    return parsed
      .filter(e => e && typeof e.score === 'number' && typeof e.time === 'number')
      .map(e => ({
        name: sanitiseName(e.name) || 'RIDER',
        score: Math.max(0, Math.round(e.score)),
        time: Math.max(0, e.time),
        rings: Math.max(0, Math.min(3, Math.round(e.rings || 0))),
        // whether the run was still under a red sky when it crossed the line
        satan: !!e.satan,
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return SEED.slice();      // private mode, quota, corrupt JSON — the board is cosmetic
  }
}

function saveBoard(board) {
  try {
    localStorage.setItem(KEY, JSON.stringify(board));
  } catch { /* storage unavailable: the board just does not persist this session */ }
}

const rank = (a, b) => (b.score - a.score) || (a.time - b.time);

// where a run would land, or -1 if it does not make the board
export function placeFor(run, board = loadBoard()) {
  const merged = board.concat([run]).sort(rank).slice(0, MAX_ENTRIES);
  const at = merged.indexOf(run);
  return at;
}

export function qualifies(run, board = loadBoard()) {
  return placeFor(run, board) >= 0;
}

export function submit(run) {
  const entry = {
    name: sanitiseName(run.name) || 'RIDER',
    score: Math.max(0, Math.round(run.score)),
    time: Math.max(0, run.time),
    rings: run.rings || 0,
    satan: !!run.satan,
  };
  const board = loadBoard().concat([entry]).sort(rank).slice(0, MAX_ENTRIES);
  saveBoard(board);
  return { board, index: board.indexOf(entry) };
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ---- the mark on a name ----
// Finish while the sky is still red and the name carries an inverted pentagram. Drawn
// as SVG rather than set as a character: U+26E7 is missing from most system fonts and
// comes out as a tofu box on exactly the machines that would enjoy it least.
const SVG_NS = 'http://www.w3.org/2000/svg';
function pentagram() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lb-sigil');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const R = 8.4, cx = 10, cy = 10;
  // point down: the first vertex sits at the bottom rather than the top
  const pt = (k) => {
    const a = (Math.PI / 2) + (k * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  };
  // the star is the {0,2,4,1,3} walk of those five points — one unbroken stroke
  const d = [0, 2, 4, 1, 3].map((k, n) => {
    const [x, y] = pt(k);
    return `${n ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ') + ' Z';
  const star = document.createElementNS(SVG_NS, 'path');
  star.setAttribute('d', d);
  svg.appendChild(star);
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', R + 1.1);
  svg.appendChild(ring);
  return svg;
}

// renders into the #leaderboard-rows container; highlight marks the run just entered
export function renderBoard(el, board, highlight = -1) {
  el.textContent = '';
  board.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (i === highlight ? ' lb-me' : '') + (e.satan ? ' lb-damned' : '');
    const cells = [
      String(i + 1).padStart(2, '0'),
      e.name,
      e.score.toLocaleString(),
      fmtTime(e.time),
      `${e.rings}/3`,
    ];
    cells.forEach((c, n) => {
      const d = document.createElement('span');
      d.textContent = c;             // textContent, never innerHTML: names are user input
      // the sigil goes in the name cell, beside the text rather than inside it
      if (n === 1 && e.satan) d.appendChild(pentagram());
      row.appendChild(d);
    });
    el.appendChild(row);
  });
}
