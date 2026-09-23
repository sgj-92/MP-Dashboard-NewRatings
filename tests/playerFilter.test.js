// ===================== FOUR-PLAYER SEARCH =====================
// "Who played Shaun, Rishi, Len and Tom?" is a question about a SET of four
// people. The same four meet in three different pairings, either side can be
// stored as Team A, and the order the names went in is an accident of whoever
// typed the result. So the answer must not depend on any of that.
//
// The record obliges: Eli, Erf, Len and Max have played all three possible
// pairings of themselves, which is what the real-record test below searches.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers/uiHarness.js');
const PlayerFilter = require('../assets/js/playerFilter.js');

const skip = H.available() ? false : 'Playwright unavailable';
const maybe = H.available() ? test : test.skip;

const id = (n) => n;
const game = (w, l) => ({ winners: w, losers: l });

// --- the module ----------------------------------------------------------

test('every arrangement of the same four players is the same search', () => {
  const four = ['Shaun', 'Rishi', 'Len', 'Tom'];
  const arrangements = [
    game(['Shaun', 'Rishi'], ['Len', 'Tom']),   // as entered
    game(['Len', 'Tom'], ['Shaun', 'Rishi']),   // sides swapped
    game(['Shaun', 'Len'], ['Rishi', 'Tom']),   // a different partnership
    game(['Tom', 'Shaun'], ['Rishi', 'Len']),   // another, names reordered
  ];
  arrangements.forEach((m, i) => {
    assert.strictEqual(PlayerFilter.matchesAll(m, four, id), true, `arrangement ${i} should match`);
  });
  // And the order the SEARCH is typed in cannot matter either.
  assert.strictEqual(PlayerFilter.filter(arrangements, four, id).length, 4);
  assert.strictEqual(PlayerFilter.filter(arrangements, four.slice().reverse(), id).length, 4);
});

test('a game missing one of the four is not a match', () => {
  const games = [
    game(['Shaun', 'Rishi'], ['Len', 'Tom']),
    game(['Shaun', 'Rishi'], ['Len', 'Max']),   // Max, not Tom
    game(['Shaun', 'Max'], ['Len', 'Tom']),
  ];
  assert.strictEqual(PlayerFilter.filter(games, ['Shaun', 'Rishi', 'Len', 'Tom'], id).length, 1);
});

test('fewer than four narrows rather than failing', () => {
  const games = [
    game(['Shaun', 'Rishi'], ['Len', 'Tom']),
    game(['Shaun', 'Max'], ['Len', 'Erf']),
    game(['Rishi', 'Erf'], ['Max', 'Tom']),
  ];
  assert.strictEqual(PlayerFilter.filter(games, [], id).length, 3, 'nothing selected shows everything');
  assert.strictEqual(PlayerFilter.filter(games, ['Shaun'], id).length, 2);
  // Both of them, partners or opponents -- the second game has them on
  // opposite sides and must still count.
  assert.strictEqual(PlayerFilter.filter(games, ['Shaun', 'Len'], id).length, 2);
  assert.strictEqual(PlayerFilter.filter(games, ['Shaun', 'Len', 'Tom'], id).length, 1);
});

test('a player cannot be picked twice, and nothing is dropped silently', () => {
  assert.deepStrictEqual(PlayerFilter.normalise(['Shaun', 'Shaun']), ['Shaun']);
  assert.deepStrictEqual(PlayerFilter.normalise(['Shaun', 'shaun', 'Len']), ['Shaun', 'Len']);
  assert.deepStrictEqual(PlayerFilter.normalise(['', '  ', null, undefined, 'Len']), ['Len']);
  // Never more than a match can hold.
  assert.strictEqual(PlayerFilter.normalise(['A', 'B', 'C', 'D', 'E']).length, 4);
});

test('the search runs on canonical ids, so a rename cannot break it', () => {
  // The record stores the id; the screen shows the label. Rishi has been
  // renamed to "Rish" — the stored match still says "Rishi".
  const toId = (name) => ({ Rish: 'Rishi' }[name] || name);
  const stored = game(['Shaun', 'Rish'], ['Len', 'Tom']);   // as the app shows it
  // Searching by the NEW label finds the old match...
  assert.strictEqual(PlayerFilter.matchesAll(stored, ['Shaun', 'Rishi', 'Len', 'Tom'].map(toId), toId), true);
  // ...and matching on raw labels, which is what this replaces, would not.
  const labelsOnly = (n) => n;
  assert.strictEqual(PlayerFilter.matchesAll(stored, ['Shaun', 'Rishi', 'Len', 'Tom'], labelsOnly), false,
    'this is the failure mode the id layer exists to prevent');
});

test('the summary reads as a group, not a fixture', () => {
  assert.strictEqual(PlayerFilter.summary(['Shaun', 'Rishi', 'Len', 'Tom']), 'Shaun + Rishi + Len + Tom');
  assert.strictEqual(PlayerFilter.summary([]), null);
});

// --- against the real record and the real screen -------------------------

maybe('searching four real players finds every pairing they played', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      gamesMonth = 'all'; gamesType = 'all';

      // A four-player group the record holds in more than one pairing.
      const groups = {};
      getDisplayMatches().filter((m) => m._status === 'approved' && m.winners.length === 2).forEach((m) => {
        const key = [...m.winners, ...m.losers].slice().sort().join('|');
        (groups[key] = groups[key] || []).push(m);
      });
      const pairingsOf = (list) => new Set(list.map((m) =>
        [m.winners.slice().sort().join('&'), m.losers.slice().sort().join('&')].sort().join(' v ')));
      const chosen = Object.entries(groups)
        .map(([k, list]) => ({ four: k.split('|'), list, pairings: pairingsOf(list) }))
        .sort((a, b) => b.pairings.size - a.pairings.size)[0];

      const count = () => document.querySelectorAll('#gamesView .game-card-clickable').length;
      setGamesPlayerFilter(chosen.four); renderGamesTab();
      const asGiven = count();
      setGamesPlayerFilter(chosen.four.slice().reverse()); renderGamesTab();
      const reversed = count();

      return {
        four: chosen.four,
        expected: chosen.list.length,
        pairings: [...chosen.pairings],
        asGiven, reversed,
        ids: gamesPlayerIds.slice(),
      };
    });
    assert.ok(r.pairings.length >= 2,
      `the record must hold this group in more than one pairing for the test to mean anything (${r.pairings})`);
    assert.strictEqual(r.asGiven, r.expected,
      `all ${r.expected} games between ${r.four.join(', ')} must be found, across ${r.pairings.length} pairings`);
    assert.strictEqual(r.reversed, r.expected, 'and the order they were typed in cannot matter');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('one, two, three and four players each narrow the list', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      gamesMonth = 'all'; gamesType = 'all';
      const count = () => document.querySelectorAll('#gamesView .game-card-clickable').length;
      const approved = getDisplayMatches().filter((m) => m._status === 'approved');
      const busiest = approved.filter((m) => m.winners.length === 2)
        .reduce((best, m) => {
          const key = [...m.winners, ...m.losers].slice().sort().join('|');
          best[key] = (best[key] || 0) + 1;
          return best;
        }, {});
      const four = Object.entries(busiest).sort((a, b) => b[1] - a[1])[0][0].split('|');

      const at = [];
      for (let n = 0; n <= 4; n++) { setGamesPlayerFilter(four.slice(0, n)); renderGamesTab(); at.push(count()); }
      return { four, at, total: approved.length };
    });
    assert.strictEqual(r.at[0], r.total, 'no players selected shows every game');
    for (let n = 1; n <= 4; n++) {
      assert.ok(r.at[n] <= r.at[n - 1],
        `adding a player must never widen the result (${r.at.join(' → ')})`);
      assert.ok(r.at[n] >= 1, 'and this group really did play, so none of these is empty');
    }
    assert.ok(r.at[4] < r.at[1], `four players must be narrower than one (${r.at.join(' → ')})`);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('the player filter combines with Month and Game type', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      gamesMonth = 'all'; gamesType = 'all';
      const count = () => document.querySelectorAll('#gamesView .game-card-clickable').length;
      const approved = getDisplayMatches().filter((m) => m._status === 'approved');
      const busiest = {};
      approved.filter((m) => m.winners.length === 2).forEach((m) => {
        const key = [...m.winners, ...m.losers].slice().sort().join('|');
        (busiest[key] = busiest[key] || []).push(m);
      });
      const [key, list] = Object.entries(busiest).sort((a, b) => b[1].length - a[1].length)[0];
      const four = key.split('|');
      const month = list[0].date.slice(0, 7);

      setGamesPlayerFilter(four); renderGamesTab();
      const allTime = count();
      gamesMonth = month; renderGamesTab();
      const inMonth = count();
      const expectedInMonth = list.filter((m) => m.date.slice(0, 7) === month).length;
      const summary = document.getElementById('gamesFiltersToggle').textContent.replace(/\s+/g, ' ');
      gamesMonth = 'all'; renderGamesTab();
      return { allTime, inMonth, expectedInMonth, month, four, summary };
    });
    assert.strictEqual(r.inMonth, r.expectedInMonth,
      'the month and the player set must both apply, not one or the other');
    assert.ok(r.inMonth <= r.allTime);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('the shut filter heading names the group', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      gamesMonth = 'all'; gamesType = 'all'; gamesFiltersOpen = false;
      const four = PLAYERS.slice(0, 4).map((p) => p.name);
      setGamesPlayerFilter(four); renderGamesTab();
      const withPlayers = document.getElementById('gamesFiltersToggle').textContent.replace(/\s+/g, ' ').trim();
      setGamesPlayerFilter([]); renderGamesTab();
      const without = document.getElementById('gamesFiltersToggle').textContent.replace(/\s+/g, ' ').trim();
      return { four, withPlayers, without };
    });
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(r.withPlayers, new RegExp(r.four.map(esc).join(' \\+ ')),
      `the shut heading must carry the selection: ${r.withPlayers}`);
    assert.match(r.withPlayers, /All time/);
    assert.match(r.without, /All players/);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('the same player cannot be entered twice, and an unknown name is refused', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      gamesMonth = 'all'; gamesType = 'all'; gamesFiltersOpen = true; renderGamesTab();
      const name = PLAYERS[0].name;
      const fill = (values) => {
        [0, 1, 2, 3].forEach((i) => { document.getElementById(`gamesPlayer${i}`).value = values[i] || ''; });
        document.getElementById('gamesPlayer0').dispatchEvent(new Event('change', { bubbles: true }));
      };
      fill([name, name]);
      const repeated = {
        ids: gamesPlayerIds.slice(),
        note: document.getElementById('gamesPlayersMessage').textContent,
      };
      fill(['Not A Real Person']);
      const unknown = {
        ids: gamesPlayerIds.slice(),
        note: document.getElementById('gamesPlayersMessage').textContent,
        games: document.querySelectorAll('#gamesView .game-card-clickable').length,
      };
      fill([]);
      return { name, repeated, unknown, cleared: gamesPlayerIds.slice() };
    });
    assert.strictEqual(r.repeated.ids.length, 1, 'a repeat must not become two entries');
    assert.match(r.repeated.note, /only be picked once/,
      'and the reader must be told, not left with a filter that quietly does something else');
    assert.deepStrictEqual(r.unknown.ids, [], 'a name that is not a player filters nothing');
    assert.match(r.unknown.note, /Not a player/);
    assert.deepStrictEqual(r.cleared, []);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('the filter is stored as canonical ids, not as what is on screen', async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      document.querySelector('#tabrow .tab-btn[data-tab="games"]').click();
      const name = PLAYERS[0].name;
      setGamesPlayerFilter([name]);
      return { name, stored: gamesPlayerIds.slice(), canonical: playerIdFor(name) };
    });
    assert.deepStrictEqual(r.stored, [r.canonical],
      'the id, so renaming the player later cannot break a saved or repeated search');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});
