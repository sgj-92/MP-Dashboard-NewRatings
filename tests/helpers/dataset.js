// Shared fixtures for the historical replay tests: parses the authoritative
// match export, and reads BASE_TIERS straight out of app.js so the seeding
// used here can never silently drift from the seeding the app uses.

const fs = require('node:fs');
const path = require('node:path');
const E = require('../../assets/js/ratingEngine.js');

const ROOT = path.join(__dirname, '..', '..');

function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// Team A is the winning side for every decided match in this export, and the
// score is always recorded from Team A's perspective. For a draw the side
// assignment is whatever the export recorded -- arbitrary, but fixed and
// carried through deterministically.
function toMatch(row, index) {
  const isDraw = row['Draw'].trim() === 'Yes';
  return {
    id: 'csv_' + index,
    sourceIndex: index,
    date: row['Date'],
    teamA: row['Team A'].split('&').map((s) => s.trim()),
    teamB: row['Team B'].split('&').map((s) => s.trim()),
    sets: row['Score'].split(',').map((s) => s.trim().split('-').map(Number)),
    outcome: isDraw ? E.OUTCOME.DRAW : E.OUTCOME.A_WINS,
    type: row['Type'],
    drawSideAssignmentArbitrary: isDraw,
  };
}

function loadAllMatches() {
  const csv = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'money_padel_matches_2026-09-16.csv'), 'utf8');
  return parseCsv(csv).map(toMatch);
}

// BASE_TIERS is read out of app.js rather than copied, so there is exactly one
// source of truth for current tiers.
function loadBaseTiers() {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
  const m = src.match(/const BASE_TIERS\s*=\s*(\{[\s\S]*?\});/);
  if (!m) throw new Error('BASE_TIERS not found in app.js');
  return JSON.parse(m[1]);
}

// Experiments 11 and 12 ran against the export as it stood on 2026-09-11,
// plus one 2026-09-13 match (MK & Rocky def Max & Harry) that was added by
// hand from a screenshot. That is 143 + 1 = the 144 matches the spec cites.
const EXPERIMENT_CUTOFF = '2026-09-11';

function experimentDataset() {
  const all = loadAllMatches();
  const manual = all.find((m) => m.date === '2026-09-13' && m.teamA.join(' & ') === 'MK & Rocky');
  if (!manual) throw new Error('The manually added 2026-09-13 MK & Rocky match is missing.');
  return all.filter((m) => m.date <= EXPERIMENT_CUTOFF).concat([manual]);
}

// Fatch is seeded at Tier C in BOTH stages: the legacy BASE_STARTING_TIER
// carried {"Fatch":"C"}, so Experiments 11/12 already used it. Only Shaun and
// Tom were seeded from their current tier in Stage 1, which is why §7.3 lists
// a final-rating shift for those two and not for Fatch.
const HISTORICAL_SEED = {
  Shaun: { tier: 'C', classificationStatus: E.CLASSIFICATION.PROVISIONAL },
  Tom: { tier: 'C' },
  Fatch: { tier: 'C' },
};

const HISTORICAL_EVENTS = [
  { playerId: 'Shaun', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION, effectiveDate: '2026-07-01', newTier: 'B', reasonCode: 'UNKNOWN_NEW_PLAYER' },
  { playerId: 'Tom', eventType: E.EVENT.PROMOTION, effectiveDate: '2026-07-01', newTier: 'B' },
  { playerId: 'Fatch', eventType: E.EVENT.PROMOTION, effectiveDate: '2026-08-01', newTier: 'B' },
];

function buildInitialisations(matches, { historical }) {
  const tiers = loadBaseTiers();
  const names = new Set();
  matches.forEach((m) => { m.teamA.forEach((n) => names.add(n)); m.teamB.forEach((n) => names.add(n)); });
  return [...names].map((playerId) => {
    if (historical && HISTORICAL_SEED[playerId]) return { playerId, ...HISTORICAL_SEED[playerId] };
    if (playerId === 'Fatch') return { playerId, tier: 'C' };
    return { playerId, tier: tiers[playerId] || 'B' };
  });
}

// Stage 1 (§7.1): the experiments' own assumptions -- proves engine equivalence.
// Stage 2 (§7.3): the authoritative §5.3 historical classifications.
function replayStage(stage, matches) {
  const ms = matches || experimentDataset();
  const historical = stage === 2;
  return E.replay({
    matches: ms,
    initialisations: buildInitialisations(ms, { historical }),
    events: historical ? HISTORICAL_EVENTS : [],
  });
}

function monthlyPct(journey, playerId, month) {
  const row = E.calculateMonthlyPerformance(journey).find((x) => x.playerId === playerId && x.month === month);
  return row ? row.monthlyPerformance * 100 : null;
}

module.exports = {
  parseCsv, loadAllMatches, loadBaseTiers, experimentDataset, replayStage, monthlyPct,
  EXPERIMENT_CUTOFF, HISTORICAL_EVENTS, HISTORICAL_SEED,
};
