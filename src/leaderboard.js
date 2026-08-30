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
  };
  const board = loadBoard().concat([entry]).sort(rank).slice(0, MAX_ENTRIES);
  saveBoard(board);
  return { board, index: board.indexOf(entry) };
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// renders into the #leaderboard-rows container; highlight marks the run just entered
export function renderBoard(el, board, highlight = -1) {
  el.textContent = '';
  board.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (i === highlight ? ' lb-me' : '');
    const cells = [
      String(i + 1).padStart(2, '0'),
      e.name,
      e.score.toLocaleString(),
      fmtTime(e.time),
      `${e.rings}/3`,
    ];
    for (const c of cells) {
      const d = document.createElement('span');
      d.textContent = c;             // textContent, never innerHTML: names are user input
      row.appendChild(d);
    }
    el.appendChild(row);
  });
}
