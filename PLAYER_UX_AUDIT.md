# Money Padel — Player Experience Reset: Phase 1 UX Audit

**Status: evidence only.** Nothing in the app, its data, calculations,
methodology or navigation was changed to produce this. No defect found here
has been fixed; the serious ones are listed for a decision
(see *Defects found, not fixed*). CCode, 26 Sep 2026.

**The question audited:** *is the app obvious, fast and pleasant to use,
without Shaun explaining it, for an ordinary player who wants to play padel,
see how they're doing and take part in the club?*

**Method.**
- **Build.** The current build (`main` at `42c66cc`), driven in a real
  browser at phone width (390px, plus a 375px pass). It ran against a
  read-only copy of the live beta taken 26 Sep 2026: 34 players, 169 matches,
  728 rating events, and the club's requests/tags documents.
- **Player.** The selected player is **PDM** (Tier B, 42 games, active in
  September, with a game in Upcoming). "Another player" is **Rishi**.
- **Navigation.** Every screen was reached by tapping what a player would
  tap. The capture recorded **0 attempted writes and 0 page errors**.
- **Evidence.** 77 screenshots and an index are in
  [`docs/ux-audit/`](docs/ux-audit/INDEX.md), with the journey tap-log in
  [`docs/ux-audit/journeys.json`](docs/ux-audit/journeys.json). They are
  reproducible with `scripts/ux-audit-capture.js`.
- **In the text,** `[10]` means `docs/ux-audit/screenshots/10-*.png`.

**Not covered:** real iOS/Android devices and the installed-PWA shell; any
flow that writes, such as what a player sees after submitting (writes were
blocked by design); and admin flows beyond their entry screens.

---

## Headlines

1. **The fixture flow is broken at both ends.**
   - A player's own game request cannot be confirmed: the "I'm in!" button
     renders hidden in the current profile.
   - Any player can delete any Upcoming game with one tap, with no admin
     check and no confirmation.
   - Upcoming still lists games played three days ago.
   - Home never shows your next game, although the data for it is computed.
2. **"Who's best?" has six answers.** In September, six different players
   are presented as some kind of best across Home, Power, W/L and League:
   Kaz, Erf, PDM, Rishi, Len and Osh. These are nine-plus concepts behind
   three levels of navigation, named in the app's internal vocabulary.
3. **Admin leaks into the player's app in four places.**
   - A password box on the Games tab.
   - Admin / Manage in More.
   - Upcoming's "Remove".
   - Find a Game, which the admin "Visible to everyone" setting marks
     **Admin only** by default, is every player's Play landing screen. It
     shows win-percentage predictions, which the Ledger restricts to admins.
4. **Home is personal but incomplete.** The rating and tier position are
   excellent (zero taps). But about 30% of the first screen is a decorative
   greeting, and the next game and anything waiting on me are missing.
5. **The engine's language is on the surface.** "Reliability 81%",
   "Stable", "vs expectation", "tier-anchored", "Results only", "Clutch",
   "idle vs inactive", "par", "80% the share of games… 20% the result". The
   explanations are excellent and honest, but they are the default view, not
   on demand.
6. **Mobile basics.**
   - System Back leaves the app from anywhere.
   - Typical touch targets are 12–30px tall.
   - Games is ~23 screens long by default.
   - Columns clip at 375px.

---

## 1. Inventory

### 1.1 Navigation map

| Bottom nav | Sub-tabs (segmented, always visible) | Default | Notes |
|---|---|---|---|
| **Home** | — | — | The only screen with the header player switcher ("PDM ▾") |
| **Rankings** | Power · W/L · League | Power | League has a second level: a **View** select (League Table / Merit Table / Monthly Race / Information) |
| **Play** | Find Game · Games · Upcoming · Requests | Find Game | A "Money Padel / Play / Find the right game…" hero repeats on every sub-tab |
| **Players** | Directory · Compare | Directory | |
| **More** | a bottom sheet, not a screen | — | Power Rating Guide · North vs South · Insights / Call-Outs · About Power Rankings · Doughnuts · Data & Rankings · My Player · Admin / Manage |

Under the hood, every destination is still a button on a hidden 11-button
legacy tab row (`#tabrow`). The shell maps onto it, and Home is the legacy
"Summary" tab.

### 1.2 Screens, sections, folds, forms, filters and modals

**Home** [10–16]
- **Hero:** the date, "Good afternoon, PDM.", "Ready for the next game? Same
  game. Higher standards." Decorative.
- **Your Game card:** tier badge, "#1 in Tier B · #9 Overall", rating 1462,
  the last-10 form dots "6W–4L", and "You're just 170 points off Tier A".
  Its link is *View profile ›*.
- **Club Pulse:** three cards, each opening that player's profile.
  *#1 Ranked* (Kaz 1735), *In Form* (Erf +15.6%) and *Promotion Watch*
  (PDM · 170 pts). The *All insights ›* link goes to Insights / Call-Outs.
- **Match ideas:** a fold ("Show suggestions ›") holding a *Match to make*
  card with a **50% – 50%** prediction, *View Matchup ›* and
  *Find more matches ›* [13].
- **Last Time Out:** the last match, with score, a one-liner ("Tough one.
  Time to run it back."), the rating change and *View match ›*. The
  *View all results ›* link opens the profile.
- **"September 2026 at Money Padel":** Games played, Most active, Highest
  win rate and Player of the Month. *View full review ›* opens the League
  Table with a "‹ Back to Home" link [15].

**Rankings**
- **Power** [30–33]
  - Hero: "Money Padel · Results only / Power Rankings / A tier-anchored
    rating…".
  - Controls: a Month select and a Tier select. An unlabelled sliders icon
    opens a **Filters sheet** [33]: *Search a player*, *Min games played*
    (All/3+/5+/10+/20+) and "More ways to sort" (Month Rating / Avg opp. /
    A–Z).
  - Sort segments: Rating / Form / Clutch / Upsets. Chips: *Include idle
    players*, *Include inactive players*.
  - Kings of Tiers, a podium, the ranking list, and "September 2026 ranking
    methodology ⓘ".
  - A **Monthly Summary** fold [31]: Key takeaways · Monthly Performance ·
    Rating Movement · Ranking Movement · Moved without playing ·
    Crossovers. Then "How this works ›".
- **W/L** [34]: the same filters. Sort by Most Wins / Win % / Games Played /
  A–Z.
- **League** [35–40]: Month + View select.
  - **League Table:** "How this table works" fold; *By tier / All together /
    Last 10*; a fold per tier (S/A/B/C).
  - **Merit Table:** "How points work"; *By tier / All together*; Hard and
    Fav drill-downs.
  - **Monthly Race:** "How the race works"; tier folds; provisional players;
    score drill-down.
  - **Information:** the stats review (most games, most wins & points, most
    losses, lowest/highest win %, doughnuts, hardest games, Player of the
    Month) and *Copy as WhatsApp text*.

**Play**
- **Find Game** [50–53]
  - **Match brief:** Player select (any player), Scope (Within my tier / Any
    tier), Difficulty (**Easy** preselected / Balanced / Hard), and a
    *Build a Match* fold (Play with / Play against).
  - **Best match card:** a **win % split**, the four players, a narrative,
    *Request Game ›* and *View Full Breakdown*. Then more recommendations.
- **Games** [54–58]
  - A *Filters* fold: Month, four "Players in match" fields, Game type.
  - An *Add a game* fold: "Adding as PDM · change", quick-paste of WhatsApp
    shorthand, date, doubles/singles, finished/not finished, players, sets.
  - **Admin actions / Admin area** with a password field and *Unlock*.
  - *All games (169)*, grouped by day. Tapping a card opens its breakdown:
    ratings going in, expected share, change per player, *See full
    calculation*.
- **Upcoming** [59–60]: an *Upcoming (8)* fold. Each card has teams,
  date · time · venue, "requested by", "4/4 confirmed" with the four names
  ticked, and *Add result* and *Remove*.
- **Requests** [61–63]
  - *Challenges (0)*: a fold with a *+ Create Challenge* form (Challenger,
    Challenging, Who picks first, first and second pick restrictions, *Send
    Challenge*).
  - *Request a game*: a fold ("Requesting as PDM · change"; Player 1–4;
    preferred date; *Request this game*).
  - *Pending (0)*, then "How this works ›".

**Players**
- **Directory** [70–71]: a *Filters* fold (Tier; Status All/Active/Inactive);
  "34 players"; *A–Z / Power Rating* sort; letter-grouped cards (initials,
  tier · rating, INACTIVE badge). There is no search.
- **Compare** [73–74]: Player A, Player B, Month; *As opponents* and *As
  teammates*; the list of meetings.

**Profile sheet** [20–25, 72]
- **Opened from:** Home ×6 routes; Directory; any underlined name in League,
  Upcoming or Requests; Power rows in All time.
- **Header:** "Your profile" / "Player profile"; name; "Tier B · Stable";
  rating; "#1 Tier · #9 Overall · 19-21 · 47.5% Win Rate".
- **Facts row:** Tier, **Reliability 81% · High Reliability**, Games,
  Joined.
- **Last 10:** W/L circles and "+6.7% vs expectation".
- **Player Analysis:** Position, Schedule, Performance, a summary sentence
  and *Full analysis ›*.
- **Partnerships & Rivals:** Best partner, Ranking rivals.
- **Rating Journey:** chart, milestones, *Every event (43) ›*, *How your
  rating moves ›*.
- **On someone else's profile:** a **You vs Rishi** block (head to head,
  rating gap, together).
- **Recent Results:** a month select. Each row expands to "Why PDM's rating
  moved", the change per player and *See full calculation*.
- **Close.**

**More sheet** [80–88]
- **Power Rating Guide:** a sheet with "In short", "The five things that
  sound alike", the maths and an FAQ.
- **North vs South:** an event page for the Box Office Cup.
- **Insights / Call-Outs:** a page. Chemistry partnerships, within-tier rank
  clarifiers, boundary tests, "players worth calling out".
- **About Power Rankings:** a sheet of prose.
- **Doughnuts:** a leaderboard sheet (Total / Most Given / Most Received).
- **Data & Rankings:** a setting (*Verified data* vs *Full history*) that
  "applies everywhere".
- **My Player:** the "Who are you?" chooser.
- **Admin / Manage:** the locked password screen [88].

**Global states**
- **First launch:** the "Who are you?" chooser, shown **over Power
  Rankings**, not Home [00].
- **Loading:** a "Loading the club record…" pill, plus "Loading…" in the
  table [01].
- **Offline / read failure:** a red banner, "Power Ratings unavailable. v3
  player state could not be loaded… The legacy rating has deliberately not
  been substituted", with **"No players match that filter"** beneath it
  [02].
- **Empty:** "No open challenges right now.", "No open requests right now.",
  and for Compare "X and Y have never played against each other."
- **"How this works ›":** a generic per-tab explainer at the foot of most
  tabs, including Compare and the Admin lock screen.

### 1.3 Routes into Admin that a normal player meets

| Where | What the player sees |
|---|---|
| Play → Games [54] | "🔒 Admin actions — Approving, editing, or deleting a game needs the admin password", then a password field and a big gold **Unlock** button, **above** the game list |
| More → Admin / Manage [88] | The Admin area password screen |
| Play → Upcoming [59] | **Remove** on every card. It works without admin (see D1) |
| Play → Find Game [50], Home → Match ideas [13] | Matchmaking and win-% predictions. Find a Game is marked **Admin only** by default in the admin's own visibility settings (D4) |
| Play → Games → Add a game [56] | "…lands below as pending until an admin approves it" |

### 1.4 Admin-only functionality (can leave the player's mental model)

- **Admin / Manage** [90–91], ten folded sections:
  - Predict a matchup (with *Add to Upcoming*).
  - Player tags (active/inactive, add player, tier, starting tier, rename).
  - Visible to everyone (9 toggles).
  - Admin monthly review.
  - Historical club adjustment.
  - Beta diagnostics.
  - Admin lock.
  - Your password.
  - Board password.
  - Export data (CSV).
  - Plus the build stamp.
- **Games, when unlocked** [93]: a *··· Manage* chip on every card (edit,
  delete, fix); approve or reject pending submissions; *Lock admin area*.
- **Upcoming, when unlocked** [92]: *Prediction available ›* on each card.
- **Requests, when unlocked:** an *Admin add* fold that puts a game
  straight into Upcoming.

### 1.5 Present but hard to discover

- **Behind League → View:** Monthly Race (Best Month), Merit and
  Information. That is three of the club's monthly competitions behind a
  second-level select.
- **Searching for a player:** only inside Power's Filters sheet, behind an
  unlabelled sliders icon [33]. The Directory has no search.
- **The Monthly Summary fold** (Monthly Performance and four other monthly
  stories): the last thing on a 2,816px Power page [31, 32].
- **Monthly Rating breakdown:** only by tapping a Power row, podium or Kings
  card **while a month is selected**. In All time, the same tap opens the
  profile.
- **Head-to-head with a specific player:** most usefully inside their
  profile ("You vs Rishi") [72]. Compare opens on an arbitrary pair.
- **Your own game-request confirmations:** not visible anywhere (D2).
- **Last 10 league:** League → Last 10.
- **Rating Journey "Every event",** "How your rating moves" and "See full
  calculation": inside the profile.
- **The Data range setting,** which changes every statistic in the app: More
  → Data & Rankings.

---

## 2. Information architecture

| Feature | Lives in | Reached by (taps from Home) | Likely reason to use |
|---|---|---|---|
| My rating & tier/overall position | Home › Your Game; Profile | 0 | "Where do I stand?" |
| My form (last 10) | Home; Profile | 0 | "Am I playing well?" |
| My last match + why my rating moved | Home › Last Time Out → Profile | scroll + 1 | "What did that game do?" |
| All my results | Profile › Recent Results | 1 + ~3 screens of scroll | Look back |
| My month (competition) | Rankings › League (League / Merit / Race) | 2–3 + scroll | "How's my month going?" |
| My next game | Play › Upcoming (all club fixtures) | 2 + scan | "When am I playing?" |
| Arrange a game | Play › Requests; Play › Find Game; Home › Match ideas | 3+ | "Get a game on" |
| Submit a result | Play › Games › Add a game; Upcoming › Add result | 3 | Record a match |
| Club rankings (strength) | Rankings › Power | 1 | "Who's best?" |
| Win/loss leaders | Rankings › W/L | 2 | Bragging rights |
| League, Merit, Race, stats review | Rankings › League › View | 2–4 | Monthly competition |
| Another player | Players › Directory → Profile | 2 + scroll (no search) | Scouting a partner or opponent |
| Head-to-head | Players › Compare; or another's profile | 3–4 | "How do I do against X?" |
| How ratings work | More › Power Rating Guide; More › About; "How this works" on tabs; profile links | 2 | Understanding |
| Club event (North vs South) | More | 2 | Event info |
| Insights / Call-Outs | More; Home › All insights | 1–2 | Curiosity |
| Doughnuts | More | 2 | Banter |
| Data range setting | More › Data & Rankings | 2 | Rarely |
| Who am I | Home header "PDM ▾"; More › My Player | 1–2 | First run, shared phone |

**Flags**

- **Duplicate routes**
  - The **profile** has six entry points on Home alone: View profile, View
    all results, View match, and the three Pulse cards.
  - **Head-to-head** is in two places: Compare, and the "You vs" block.
  - **Arranging a game** has three flows: Request, Challenge, and Find Game's
    *Request Game*. Home's Match ideas is a fourth doorway.
  - **The monthly review** appears three times: Home's monthly card, League →
    Information, and Power's Monthly Summary, all "month at the club".
  - **Explanations** are in five places: Rating Guide, About Power Rankings,
    per-tab "How this works", in-table "How this table works", and profile
    "How your rating moves".
- **Unintuitive homes**
  - **Games** (match history and result submission) lives in **Play**.
  - **Insights / Call-Outs** is a full page opened from a **sheet**.
  - **League** (the competition) is a sub-tab of **Rankings**, while Home's
    "View full review" also lands there.
  - The **Data range** is a global setting inside a "More" sheet of content.
- **Too many taps / too much scroll**
  - Finding a player: Directory A–Z to "R" is about 2.5 screens [70].
  - Your Monthly Race row is below the fold [39].
  - All your results sit about 3 screens into the profile.
- **Same question, different screens**
  - "Who's best this month?" (§5).
  - "How did I do in that match?": the Home Last Time Out card, the Games
    card breakdown [58] and the profile match row [24]. These are three
    renderings of one match.
- **Development terminology**
  - Results only, tier-anchored, Reliability, High Reliability, Stable,
    vs expectation, Clutch, Upsets, idle vs inactive.
  - Moved without playing, Crossovers, Kings of Tiers, Merit, Monthly
    Performance, Monthly Race, par, "blended performance".
  - Verified data vs Full history; "v3 player state"; "legacy rating";
    Wishlist (internal, surfaces in the admin toggles).
- **Statistics overload**
  - The Power page (2,816px) holds 9 controls, Kings of Tiers, a podium, the
    list and 6 monthly stories.
  - The profile has 8 sections.
  - Insights holds 4 lists.
- **Controls out of proportion**
  - Power spends its first screen [30] on hero, Month, Tier, sliders,
    4-way sort and 2 chips before any ranking.
  - Every Play tab spends ~110px on the same hero.
  - The Games Admin area is larger than any game card [54].
- **Important actions buried**
  - My next game is not on Home.
  - Request confirmation is hidden entirely.
  - The Games list sits below the Add-a-game and Admin blocks.
- **Admin leakage:** see §1.3.

---

## 3. Seven core journeys

Walked from a fresh Home with PDM already selected, by real taps (see
`journeys.json`). "Scroll" means the answer was not on the first screen.
Selecting a player first costs **+1 tap** on a new phone, from a chooser that
appears over Power Rankings, not Home [00].

| # | Journey | Taps and route | Evidence | Dead ends, ambiguities, prior knowledge needed |
|---|---|---|---|---|
| J1 | My Power Rating and tier/overall position | **0**: Home › Your Game "#1 in Tier B · #9 Overall", 1462 | [J1] | Works well. The profile says "#1 Tier · #9 Overall" in different words. On another player's profile, the header rank and the Player Analysis rank **disagree** (Rishi: "#8 Tier" vs "#9 of 9 in Tier A") [72] |
| J2 | How I'm doing this month | **3 + scroll**: Rankings › League › View = Monthly Race, then scroll to PDM | [J2] | No personal "my month". The player must know that three competitions (League, Merit, Race) hide under a select, and which one "counts". Home's monthly card is **club** stats; its "Player of the Month" is yet another measure. Monthly Performance is at the bottom of the Power page |
| J3 | My next game | **2 + scan**: Play › Upcoming | [J3] | **Answers wrongly.** PDM's card at the top is the 23 Sep game **already played and recorded** (a loss with Denis). PDM has no genuine next game, and nothing says so. The list is every club fixture, ordered by when requested, not by date. Home shows nothing, though the data is computed |
| J4 | Arrange/request a game with a particular player | **3 to open, then ~6 inputs**: Play › Requests › Request a game, then type four names, pick a date, submit | [J4] | Three competing flows (Request / Challenge / Find Game → Request Game). "Name four players" assumes you already have a four. After submitting, the other three must "confirm from their own profile", **which is impossible in the current build** (D2) |
| J5 | My most recent match | **0 + scroll**: Home › Last Time Out, ~0.4 screens down | [J5] | Works. The card shows the result, score and rating change |
| J6 | Why my rating changed | **1**: Home › Last Time Out › *View match* opens the profile at that match's "Why PDM's rating moved" | [J6] | Good and fast. The explanation is precise but engine-worded ("80% the share of games you won and 20% the result itself"). *See full calculation* is one more tap and is maths [25] |
| J7 | Find another player and how good/in-form they are | **2 + ~2.5 screens scroll**: Players › scroll A–Z to "Rishi" › profile | [J7] | No search in Directory. Rating, tier, rank and last-10 are on the profile's first screen. "In form" needs the reader to interpret "+3.9% vs expectation" |

---

## 4. Home audit — "ten seconds with the app"

| | What | Evidence |
|---|---|---|
| **Immediately useful** | Your rating, tier position, overall position, last-10 form and the gap to the next tier: all in the first screen, personal, zero taps | [10] |
| **Also useful, lower down** | Last Time Out with one-tap "why my rating moved" (~0.4 screens down); the club's monthly card (~1.3 screens down) | [11, 12, 14] |
| **Missing** | **My next game.** **Anything waiting on me** (a request to confirm, a challenge). My place in this month's competition. Club news (e.g. North vs South is only in More) | code: `buildPlayerSnapshot` computes `upcomingGames` and `pendingRequests` for the viewer; nothing renders them |
| **Duplicated elsewhere** | Club Pulse #1 Ranked (= Power #1); Promotion Watch (the same "170 pts" message as Your Game, for PDM); the monthly card (= League → Information) | [10, 11, 40] |
| **Too detailed / off-mission** | Match ideas shows a **50% – 50% prediction** to a player (see D4). "In Form +15.6%" is a number without a unit a player can read | [13] |
| **Too low** | Last Time Out and the month card sit below a decorative hero that takes ~30% of the first screen | [10, 14] |
| **Personal vs generic** | Personal: Your Game, Last Time Out, the Promotion Watch message. Generic club: Club Pulse (except when it names you), the monthly card. There are no "club happenings" (new results, fixtures today) | |

**Verdict.** In ten seconds, Home tells PDM *where he stands*, which is the
most likely question, and does it well. It doesn't tell him *when he plays
next* or *what the club needs from him*. Most of the lower half repeats
Rankings.

---

## 5. Rankings audit

### What exists, and how it's exposed

| Concept | What it measures | Where / how reached | September answer |
|---|---|---|---|
| **Power Rating** | Overall level (the rating) | Rankings › Power (default) · Home Your Game · Club Pulse "#1 Ranked" · profile | Kaz 1735 |
| **Kings of Tiers** | Highest rating in each tier (for the chosen month) | Power, above the podium | Kaz (A), **PDM (B)** |
| **Podium** | Top 3 by rating | Power | Kaz, Erf, Osh |
| **Form / "In Form"** | Last-10 performance vs expectation | Power sort "Form"; Home Pulse | **Erf +15.6%** |
| Clutch / Upsets | Scorelines vs prediction; underdog wins | Power sort pills | — |
| **Monthly Performance** | Beat own pre-match expectation this month | Power › Monthly Summary fold › Key takeaways | Erf +7.3% |
| Rating / Ranking Movement, Moved without playing, Crossovers | Month-boundary stories | Power › Monthly Summary folds | — |
| **W/L** | Most wins / win % | Rankings › W/L | **Rishi** (most wins) |
| **League Table** | 3 per win, 1 per draw, by tier | Rankings › League (View = League Table) | **Len** (A), **Rishi** (B) |
| Last 10 table | League points over each player's last 10 | League › Last 10 | Erf |
| **Merit Table** | League points adjusted by tier gap | League › View = Merit | **Osh** (A), Rishi (B) |
| **Monthly Race (Best Month trial)** | Results vs an ordinary tier player, same fixtures | League › View = Monthly Race | **Osh** (A), Rishi (B) |
| **Player of the Month** | Most league points, **all tiers together** | Home monthly card; League › Information | **Rishi** |
| Promotion Watch | Closest to the next tier | Home Pulse | PDM |

**Four questions a player might ask, and whether the app lets them answer:**

| Question | Where the app answers it | Could a normal player tell? |
|---|---|---|
| Who's strongest? | Power (default tab), Home "#1 Ranked" | **Yes, mostly.** Though Kings of Tiers in a month view is still rating, not the month |
| Who's having the best month? | League Table, Merit, **Monthly Race**, Player of the Month, and Kings of Tiers "September 2026" | **No.** Five candidates, three names for A (Len, Osh, Kaz), and the "Best Month" one is the third item in a second-level select |
| Who's exceeding expectations? | Monthly Performance (bottom-of-page fold); Home "In Form" (a different window) | **Unlikely.** It's hidden, and two measures use similar wording |
| Who's leading the competition? | League Table, if the player knows "League" is the competition; Home says "Player of the Month" is Rishi, from a different table | **Partly** |

---

## 6. Play audit — one journey, not four features

**The intended lifecycle, as the screens describe it**

```
 Find Game / Home Match ideas ──► Request Game ─┐
 Requests › Request a game (4 names) ───────────┼─► Pending ──(all 4 "I'm in!" on profile)──► Upcoming ──► Add result ──► Games (pending) ──► admin approves ──► rated, in Games + profiles
 Requests › Create Challenge ───────────────────┘                                   ▲
 Admin: Predict a Matchup / Admin add ───────────────────────────────────────────────┘ (straight to Upcoming)
```

**What actually happens (evidence)**

- **Pending → Upcoming is impossible for players.** The only confirm button
  ("I'm in!", in "Game requests involving you") renders **hidden** in the
  current profile. I verified this with a probe request, from the requested
  player's own profile and from another player's (D2). All 8 live Upcoming
  games were created by Shaun.
- **Upcoming → Games doesn't close the loop.**
  - Two of the 8 Upcoming games (23 Sep: Erf & Rishi v Denis & PDM; Antz &
    Fatch v Jams & Tom) **were played and are recorded**, yet still sit in
    Upcoming with *Add result* (D3).
  - A third (24 Sep: Rishi/Tom/Eli/Stormz) is past its date with no result.
  - 5 of 8 say "Date TBC · Venue TBC".
- **One match appears in up to five concepts,** each rendered differently:
  a Find Game recommendation → a Pending request → an Upcoming card → a
  pending Games entry → a Games card and a profile result row.
- **Vocabulary for the same thing:** match idea, matchup, request,
  challenge, wishlist (the admin toggle label), upcoming, fixture, game,
  result, match.
- **Games is history, not play.** It holds 169 matches back to June by
  default (19,181px, ~23 screens) [57], with the admin password block
  between "Add a game" and the list [54]. "Submitted by unknown" appears on
  the recent cards.
- **Find Game is the Play landing tab, and it is admin-only by setting.**
  - It **preselects "Easy"**. The app's first suggestion is to find an easier
    game: the incentive the Best Month work was designed to remove.
  - It shows a win-% split for each suggestion [50]. The Ledger restricts
    predictions to admins because players could use them to avoid agreed
    games.
- **Challenges** add a pick-order mechanic (who picks first, pick
  restrictions) that no other part of the app explains [63].

---

## 7. "Me" audit

There is no Me destination. What PDM might want about himself is spread
across four sections and a sheet:

| About me | Where it is now | From Home |
|---|---|---|
| Rating, tier and overall rank, form | Home Your Game; Profile | 0 |
| Gap to next tier | Home Your Game message; Club Pulse Promotion Watch (twice on Home) | 0 |
| Last match and why my rating moved | Home Last Time Out → Profile | scroll + 1 |
| All my results, my rating journey | Profile (sections 7–8 of 8) | 1 + scroll |
| Partners and rivals | Profile | 1 + scroll |
| My month in the competition | Rankings › League (find my row in three tables) | 2–3 + scroll |
| My next game | Play › Upcoming (unfiltered; currently stale) | 2 + scan |
| Games waiting for me to confirm | **Nowhere visible** (D2) | — |
| My challenges | Play › Requests › Challenges | 2 |
| Submit my result | Play › Games › Add a game, or Upcoming › Add result | 3 |
| Me vs a specific player | Their profile "You vs X"; Players › Compare | 2–4 |
| Who I am (switch player) | Home header "PDM ▾"; More › My Player | 1–2 |
| Settings (data range) | More › Data & Rankings | 2 |

**What the evidence says.**
- The **profile** is doing three jobs: "me", "anyone" and "explain the
  engine". It is the same sheet for yourself and others, with "Your
  profile" vs "Player profile" as the only difference.
- Every **actionable** item about me (next game, confirmations, challenges,
  submitting results) is in Play, and one is invisible.
- Every **status** item about me is split between Home and the profile.
- The data for a personal "what's next" already exists, computed and unused
  (`upcomingGames`, `pendingRequests`).

---

## 8. Visual and interaction consistency

Measured from the rendered DOM unless noted.

- **Typography**
  - Distinct font sizes on one screen: Home **15**, Power **17**, Games
    **10**, including a fractional **11.475px** on Games.
  - Three typefaces carry headings: a serif (Power Rankings, Play, player
    names, More), sans uppercase gold labels (YOUR GAME, CLUB PULSE,
    KINGS OF TIERS) and sans title case.
- **Headings.** At least five styles:
  - Emoji-led section headings (📅 Upcoming, 🎯 Challenges, 🏆 League
    Table, 🏁 Monthly Race, 🥇 Merit, 📊 Stats Review, 🔒 Admin area).
  - Small-caps gold labels (MATCH BRIEF, BEST MATCH).
  - Serif hero titles.
  - Tier fold headings.
  - Profile section labels.
- **Chevrons and folds.**
  - "›" means *collapsed* on folds but *navigate* on links, cards and
    More rows. "⌄" means *open*.
  - Admin sections use "▾". Match ideas switches "Show suggestions ›" to
    "Hide ⌄".
  - Selects use a native chevron.
- **Segmented controls: seven styles.**
  - Rankings sub-tabs with icons; Play and Players sub-tabs without icons.
  - Power's four-way pill group; League's By tier / All together / Last 10.
  - Find Game's Scope pair and Difficulty triple.
  - Directory's tiny A–Z / Power Rating pills; Doughnuts' three tabs.
- **Selected states:** gold outline with gold text (sub-tabs), gold fill
  (By tier), **green** outline (Difficulty "Easy"), radio (Data & Rankings).
- **Buttons.**
  - Gold filled (Request Game, Unlock, Request this game, Send Challenge).
  - Dark outline (View Full Breakdown, Remove); green outline (Add result).
  - Gold text links (View profile ›, Build a Match ›).
  - Underlined names that are buttons (League, Upcoming) vs cards that are
    buttons (Directory).
- **Touch targets** (typical guidance is 44px):
  - League name links **12px** tall; Directory sort pills **22px**;
    idle/inactive chips **24px**; Power sort pills **30px**.
  - Controls under 32px: League **33 of 39**; Upcoming **81 of 86** (every
    underlined name).
- **Page length.** Games 19,181px; Insights 2,933px; Power 2,816px;
  Directory 2,720px; Home 1,335px.
- **375px.**
  - The League "Form (10g)" column is clipped [W03].
  - The Power month select truncates to "Septembe…" [W02].
  - The Monthly Race "Ant Slicer" wraps [W04].
- **Header.**
  - The section label shows on some screens (PLAY, PLAYERS, RANKINGS on
    W/L and League) and is hidden on Power.
  - The player switcher exists only on Home.
- **Feedback after actions:** not observable read-only. In code, results are
  inline one-liners ("Requested! Each player can confirm from their own
  profile."), with no toast pattern. Remove has no confirmation (D1).
- **Loading, empty and error states.**
  - Loading is clear [01].
  - The error banner speaks engine ("v3 player state", "legacy rating") and
    sits above a **wrong** empty message ("No players match that filter")
    [02].
  - Empty messages are consistent in tone.
- **Navigation / back.**
  - There is no in-app history: browser or Android Back from any sheet
    **leaves the app** (measured: Back from an open profile goes to the
    previous page, not the app).
  - Sheets close by *Close* or by tapping outside.
  - "‹ Back to Home" appears only after View Full Review.
  - The same tap on a Power row opens different things depending on the
    month filter.

---

## 9. Issue register

| # | Screen / journey | What exists now | Observed friction | Severity | Evidence |
|---|---|---|---|---|---|
| 1 | Play › Upcoming | *Remove* on every card for every viewer | One tap deletes a club fixture for everyone; no admin check, confirm or undo | **High** | [59]; app.js 7208, 7224–7229 |
| 2 | Requests → Profile | "Once all four confirm from their own profile, it moves to Upcoming" | The confirm button renders hidden; player-made requests can never reach Upcoming | **High** | [62]; app.js 8217–8229, 4219; probe |
| 3 | Play › Upcoming (J3) | 8 "Upcoming" games, ordered by request time | 2 already played and recorded, 1 past its date; "my next game" answers wrongly | **High** | [59, 60, J3]; data cross-check |
| 4 | Home (J3) | No next game, no "waiting on you" | The most time-sensitive personal info needs 2 taps and a scan, and is wrong | **High** | [10–14]; shell.js 1503–1530 |
| 5 | Play › Find Game; Home › Match ideas | Matchmaking with win-% predictions, Play's landing tab | Predictions are admin-only per the Ledger; the admin toggle says "Admin only" but the shell ignores it | **High** | [50, 13]; app.js 134–161, 1786 |
| 6 | Rankings / Home ("who's best?") | 9+ concepts across tabs, a select and folds | Six different September "bests"; the Best Month trial sits third in a second-level select | **High** | [10–12, 30–40] |
| 7 | Global (back) | No navigation history | System Back exits the app from a profile or sheet | **High** | measured |
| 8 | Play › Games | 169 matches all-time, grouped by day, 19,181px | ~23 screens; the recent week is buried under "Add a game" and Admin | Medium | [54, 57] |
| 9 | Play › Games | Admin password block for everyone | An admin concept above the content, larger than a game card | Medium | [54] |
| 10 | Play › Find Game | Difficulty preselected **Easy** | Nudges players toward easy games | Medium | [50] |
| 11 | Arrange a game (J4) | Request, Challenge and Find Game → Request Game (+ Home Match ideas) | Three flows and vocabularies for one intent | Medium | [50, 53, 61–63, 13] |
| 12 | Profile (J1, J7) | Header rank vs Player Analysis rank | Rishi "#8 Tier" vs "#9 of 9 in Tier A" on the same screen | Medium | [72] |
| 13 | Players › Directory (J7) | A–Z list, filters, no search | ~2.5 screens to reach "R"; search exists only in Power's hidden Filters sheet | Medium | [70, 33] |
| 14 | Players › Compare | Opens on "Ant Slicer vs Antz" | An arbitrary default pair, not you | Low | [73] |
| 15 | Rankings › Power | Hero, 9 controls, Kings, podium, list, Monthly Summary | The first screen holds no ranking row; 2,816px; the monthly stories are last | Medium | [30–32] |
| 16 | Rankings › Power | Row tap | Opens the monthly breakdown in a month view, the profile in All time | Medium | app.js 2276; shell.js 1066, 1188 |
| 17 | Home | Decorative hero ~30% of the first screen | Pushes Last Time Out and the month card down | Medium | [10, 14] |
| 18 | Home | Six routes to the same profile sheet | "View all results" opens the profile, not a results list | Low | probe |
| 19 | Terminology (global) | Engine and development words on player screens | Players must learn the model to read the app | Medium | [20, 24, 30, 31, 34, 86, 02] |
| 20 | Error state | "v3 player state… legacy rating" + "No players match that filter" | Jargon plus a misleading empty state | Medium | [02] |
| 21 | First launch | Chooser over Power Rankings | A new player's first screen is analytics, not Home | Medium | [00] |
| 22 | More sheet | Guides, content, an event, settings, identity, admin | A mixed drawer; settings and identity next to banter | Medium | [80] |
| 23 | Touch targets | 12–30px links and chips | Hard to hit on a phone | Medium | §8 |
| 24 | 375px | Clipped League column, truncated month | Density breaks on small phones | Medium | [W02–W04] |
| 25 | Play (all tabs) | The same ~110px hero on every sub-tab | Content starts a quarter of the way down | Low | [50, 54, 59, 61] |
| 26 | Games cards | "Submitted by unknown" | Noise on every recent card | Low | [54] |
| 27 | Upcoming cards | Names shown twice (title + confirmations), all underlined | Visual noise; 81 tiny targets | Low | [59] |
| 28 | Explanations | "How this works ›" on nearly every tab + in-page folds + Guide + About | Five layers of help, some generic | Low | [30, 50, 61, 73, 88] |
| 29 | More › North vs South | Event dated Thu 10 Sep; all zeros; South "TBC" | Stale event content, reached from More only | Low | [82] |
| 30 | More › Insights | Chemistry "top" list, all 2-game "(small sample)" pairs | Low-signal content given a top-level slot | Low | [83] |
| 31 | Visual system | Five heading styles, seven segmented-control styles, mixed chevrons and selected colours, 15–17 font sizes per screen | Applied inconsistently | Low | §8 |
| 32 | W/L | Default sort "Most Wins" ranks Rishi 57% above Len 77% | The sort's meaning isn't obvious | Low | [34] |

---

## 10. Defects found, not fixed

Per the brief, nothing was fixed. These are defects rather than design
opinions and need a decision on whether, and when, they are fixed. Items
D1, D2 and D4 touch data integrity or an explicit Shaun decision, so under
CLAUDE.md they go to Shaun rather than being fixed opportunistically.

- **D1. Anyone can delete any Upcoming (or Pending) game.** There is no
  admin gate, no confirmation and no undo. It writes the shared fixture list
  (app.js 7208, 7224–7229; Pending: 7090, 7181–7187).
- **D2. Request confirmation is invisible.** "Game requests involving you"
  and its *I'm in!* button are built into the legacy profile block that the
  current profile hides. The section is also keyed to the **profile being
  viewed**, not the viewer, so if it were shown, anyone could confirm on
  another player's behalf (app.js 4219, 4338–4349, 8217–8229).
- **D3. Stale Upcoming.** A result added outside the Upcoming card (as
  happened on 23 Sep) leaves the fixture in Upcoming.
- **D4. Visibility settings are not honoured by the current navigation.**
  `canSee()` hides only the legacy tab row, so Find a Game (default *Admin
  only*) and anything else toggled off stays visible via the shell sub-tabs.
  It exposes predictions to players, against the 21 Sep decision (app.js
  134–161, 1786).
- **D5. The profile shows two different tier ranks** (header vs Player
  Analysis) for the same player [72].

---

## 11. Unfiltered findings (CCode's view)

Opinions, labelled as such. None of this is a requirement.

- **The app has grown by accretion, and it shows.** A hidden 11-tab legacy
  app still runs underneath a five-section shell. Features are gated by a
  visibility system the new navigation bypasses. Home is literally the old
  "Summary" tab. Most of the defects above live at the seams between the
  two.
- **Rankings is three products in one:** a rating analyser (Power, Form,
  Clutch, Upsets, monthly stories), a competition (League, Merit, Race,
  Player of the Month) and stats trivia (W/L, Information, Doughnuts,
  Insights). A player can't tell which one they're in, and "best" means
  something different in each.
- **Play is four different jobs:** discover (Find Game), negotiate
  (Requests/Challenges), schedule (Upcoming) and record history (Games).
  Only the middle two are really "play". Games is the club's match history
  and feels misfiled.
- **The engine's transparency is a real strength, served first instead of
  on request.** "Why my rating moved" is excellent. Reliability percentages,
  "Stable", "vs expectation", "Clutch", "par" and "blended performance" on
  first screens make the app feel like a spreadsheet of the model. Most
  players want *where am I, when do I play, did I do well*.
- **Celebration surfaces compete.** Kings of Tiers, the podium, Club Pulse,
  Player of the Month, Promotion Watch, the League leader and the Race leader
  each crown someone. Seven crowns dilute every one of them.
- **The profile is the de facto "Me" page and is overloaded.** It is also the
  only way to see anyone else. A personal page and a scouting page want
  different things.
- **The More sheet is a junk drawer.** Two explanations, three content
  features, an event, a global data setting, identity and Admin, with no
  grouping.
- **Admin appears on three player screens and in the default Play tab.**
  Removing admin from the player's mental model looks like one of the
  highest-value, lowest-risk changes available.
- **Too many "How this works".** Five layers of explanation suggest the
  screens themselves aren't self-explanatory. The explanations are good;
  their number is the signal.
- **Defaults nudge the wrong way.** "Easy" preselected, predictions shown,
  all-time Games, Power opening on filters: each default is defensible
  alone, and together they point the app at analysis rather than playing.
- **The fixture flow has no owner.** Request, confirm, schedule, play,
  record and approve are split across four tabs, a hidden profile section
  and Admin. The three worst defects found (D1–D3) are all in this flow. It
  may deserve to be designed once, end to end, before anything else moves.
