# REDAN: Golf Course Architect
Project document — v0.4 · rebuilt 2026-08-13

Provenance note. This document was reconstructed from the project's conversation history after the original file was lost. The sim contract, calibrated coefficients, star thresholds, milestones and gates are recovered verbatim. Three things could not be recovered in full and are marked [thin] below: the regional content sets, the shape parameter table, and the per-hole validation table (the headline results survived; the full eight-row table did not). Reconstruct those before M0 closes.

---

## 1. What it is

A puzzle game about designing golf holes. You're given a parcel of land, a fixed tee, a small tray of shapes, and a required par. You place a green and two or three hazards. A field of simulated golfers then plays your hole several hundred times, and you're graded on whether you built good architecture — not whether you built something hard.

The name is the point. A redan is a military earthwork angled so attackers approach it obliquely; the golf hole borrowed the name for the same reason. Subtitle carries the load for anyone who doesn't know the term: *Redan — design the hole.*

---

## 2. Design thesis

The land should do the work, and you should spend as little as possible. Difficulty is authored by taking pieces away, not by adding them. That's what makes the third star meaningful and what gives every parcel a second pass: solve it, then solve it with less.

Never start from a blank canvas. Each parcel opens with a pre-built, deliberately flawed hole. The first move is "fix the obvious problem," not "invent golf." Enthusiasts hit CLEAR immediately; casuals never have to.

Nine parcels per world ≈ a 20-minute session.

---

## 3. Teaching order

Difficulty comes from the tray, so the tray teaches:

- **Parcel 1** — one bunker, flat land. Learn that a single bunker creates a decision.
- **Parcel 4** — water and a hill. Learn to use the hill.
- **Parcel 9** — one piece. Dare.

Document which concept each parcel teaches, in order, before authoring in bulk. Otherwise you produce sixty parcels that all teach the same thing.

---

## 4. The simulator

This is the product. Everything else is replaceable.

### 4.1 Contract

Pure functions, zero dependencies, seeded PRNG throughout.

```ts
grade(parcel, pieces, wind, seed) → {
  archetypes: { [name]: { mean, sd, route } },
  metrics:    { field, spread, sd, routes, used, cap, parOK },
  traces:     ShotPath[],
  simVersion: string
}
```

Runs identically in browser, Node, and edge worker. `simVersion` is stamped on every result — the moment a coefficient is tuned, every stored score becomes incomparable, and partitioning or re-running requires the stamp.

**Coordinate convention (decided, M0).** The sim's internal frame is green at +x — layup logic, corridor scanning (`bestY`), and route targeting all assume it. Parcels are authored and rendered portrait, playing bottom to top. Rotation happens at the render/schema boundary, never inside the sim. Discovering this midway means touching every function.

**Portability rules (decided, M0).** No DOM, no `window`, no `performance.now()` — enforce with a lint rule. RNG is injected: `sim(parcel, design, rng)` where `rng` is a seeded function passed in. Client sim is a preview; server sim is authoritative, because `Math.sin` is not bit-identical across engines and iOS runs JavaScriptCore or Hermes rather than V8. `schemaVersion` on parcels and designs alongside `simVersion`.

### 4.2 Archetypes

Four builds, equal total budget (2.40), differing allocation. These are also the player's own stat sheet in Play mode.

|            | Power | Accuracy | Recovery | Touch |
|------------|-------|----------|----------|-------|
| BOMBER     | 0.95  | 0.40     | 0.50     | 0.55  |
| STRAIGHT   | 0.50  | 0.95     | 0.45     | 0.50  |
| SCRAMBLER  | 0.58  | 0.55     | 0.92     | 0.35  |
| TOUCH      | 0.55  | 0.50     | 0.40     | 0.95  |

Each archetype independently searches a route space and plays its own best line. Route choice and archetype are the same axis — a bomber taking the aggressive line *is* the aggressive line. This replaced the earlier aggressive/safe split: one dimension instead of two, and more meaningful.

The grading question becomes *does this hole reward more than one kind of player*, which is both a better definition of good architecture and directly measurable.

**2026-08-15 amendment — archetypes replaced by trait-composed golfers.** The four fixed builds above are retired. §4.4's re-validation found STRAIGHT winning or tying all 16 real holes in the current set — not because any one hole was mis-designed, but because STRAIGHT's accuracy-driven dispersion coefficient was a structurally dominant free stat (see §4.4), and every hole in that set was also a straight corridor (§6.1's amendment) with no geometry able to reward anything else. Fixing one without the other wouldn't have worked.

The field is now built from traits (`packages/sim/src/traits.ts`): every golfer shares one flat stat sheet, and all differentiation comes from exactly two traits per golfer, each a small multiplier on the §4.3 formulas below (never edited directly), scoped to *which kind of shot* it applies to (a tee shot, a full approach, a green attack/layup, or a recovery from trouble). The rule that replaces the old stat-budget table: a trait's benefit and its cost must land on different shot kinds, so no trait — and no golfer — is simply better everywhere. Balance is measured against a small varied parcel set (`packages/sim/scripts/roster-balance.mjs`'s win-share report — target no golfer above ~35%), not asserted from a stat sheet the way the 2.40-point budget above was. This section's archetype table and stat budget are kept above for history; the player's Play-mode (M4) stat sheet should be read as "pick two traits," not "allocate four numbers under a cap."

### 4.3 Shot model (current calibrated values)

```
full carry   = (185 + power·105) · skill · lieDistanceFactor
lateral σ    = dist · (0.105 − accuracy·0.062) · lieDispersionFactor
distance σ   = dist · (0.055 − accuracy·0.020)

effort       = dist / full
if effort > 0.72:  k = 1 + 2.4·(effort − 0.72)^1.15;  σ ×= k

if dist < 110:  lateral σ ×= 0.70
if dist < 145:  lateral σ ×= (1 − 0.30·touch)

recovery:    lieDist += recovery·(1 − lieDist)·0.50
             lieDisp -= recovery·(lieDisp − 1)·0.45

putting:     P(1) = clamp(0.88 − 0.070·d + touch·0.30)
             P(3) = clamp((d − 7)·0.032 − touch·0.10)

layup:       target = remaining − full·0.42
```

| Lie                  | Distance factor | Dispersion factor |
|----------------------|-----------------|-------------------|
| Fairway / Green      | 1.00            | 1.00              |
| Light rough          | 0.80            | 1.52              |
| Bunker               | 0.64            | 1.90              |
| Deep / native        | 0.52            | 2.60              |

The effort penalty is the single most important term. Without it the model concluded accuracy always wins, because a short straight hitter who just reaches beats a bomber on dispersion. In reality, swinging at your maximum destroys control. It took four iterations to find: the first version was so harsh that the route optimizer had the bomber voluntarily throttling down to 239 yards on Erin Hills 18 — hitting the identical drive to the straight hitter, then losing on dispersion. Softening it to `2.4·(effort−0.72)^1.15`, and making the layup leave a distance scaled to your own bag rather than a fixed 100 yards, flipped Cypress Point 16 and both par 5s to the correct answer.

Water = one penalty stroke, drop short of the hazard. OB = stroke and distance (may need softening to a one-stroke drop for game feel on tight parcels — untested).

### 4.4 Calibration status

**Original run (lost, pre-2026 prototypes).** Validation set of eight real holes, geometry extracted from traced course polygons (`golfMapsR`, 19 courses, hand-traced from Google Earth/OSM). Six of eight matched expert consensus on archetype bias. Augusta 13 → BOMBER by 0.55. Pebble 8 → STRAIGHT. Cypress Point 16 → BOMBER. Oakland Hills → STRAIGHT. The two short par 3s put STRAIGHT and TOUCH within 0.01 of each other, which is the right answer for holes where power is worthless. Erin Hills 18 remained stubborn — at 644 yards nobody gets home in two, so distance genuinely stops compounding; this may have been the model being right and the expectation being wrong. The full eight-row table with per-hole means did not survive the doc reconstruction, and neither did the geometry or the Python harness (`terrain.py`/`sim.py`/`run.py`) that produced this result — it cannot be re-run or independently checked, only cited.

The point of the validation set, in one example: a hand-tuned scoring function would have shipped with "accuracy always wins" baked in, and every hole players designed would have converged on the same narrow shape.

**2026-08-15 re-validation (current).** `packages/content`'s validation harness (`pnpm --filter @redan/content run validate`) re-ran this idea from scratch against 16 real holes, hand-encoded in the shipping portrait Parcel/Design format from published yardages and architecture commentary (not re-traced geometry — the original method is unrecoverable), each with a pre-registered expected archetype bias and citations (`packages/content/validation/*.hole.json`). Result: **6 of 16 agree**, short of the M0 gate (15+ holes, 12 agree). Every disagreement carries a written explanation in its hole file's `disagreement` field.

This is not 16 independent misses. STRAIGHT wins or ties all 16 holes — including holes commentary attributes to BOMBER, TOUCH, or SCRAMBLER — because the archetype table's accuracy spread gives STRAIGHT a base lateral-dispersion coefficient (`0.105 − accuracy·0.062` = 0.046) roughly 1.5-1.75× smaller than every other archetype's (BOMBER 0.080, SCRAMBLER 0.071, TOUCH 0.074) *before* the effort penalty is applied, and the effort penalty's current magnitude at real hole lengths (106-663 yards) isn't large enough to close that gap. This is, hole for hole, the exact "accuracy always wins" failure mode this section's shot model narrative (doc 4.3) describes the effort penalty being built over four iterations to prevent — except here, with the penalty coded exactly as documented, it doesn't prevent that failure mode against an independently-sourced real-hole set. Two explanations, deliberately not pursued in this pass (**calibration debt**, doc 10 — a coefficient change requires its own `simVersion` bump and a full re-validation run, not a fix folded into the validation harness's own commit): the effort-penalty coefficient may have drifted from the original lost calibration, or today's archetype accuracy spread may be wider than whatever the original 8-hole run was calibrated against. See individual hole files for per-hole nuance — several near-misses (Augusta 12, Shinnecock 7) are close to the original run's own "STRAIGHT ≈ TOUCH on short par 3s" pattern, and Erin Hills 18's STRAIGHT-leaning result is arguably corroborated by the real 2017 U.S. Open (Koepka's win was an accuracy record, not a power one).

**2026-08-15 — gate suspended, harness parked.** Several of the "disagreements" above carry margins of 0.003–0.05 strokes and are flagged seed-unstable — Augusta 12 (0.004), Royal Troon 8 (0.003) — meaning the 6-of-16 headline overstates how decisively the model gets these wrong; the ordering it's graded on is frequently closer to a coin flip than a confident miss. Rather than chase 12/15 on that ordering, this pass (see §4.2's amendment and §6.1's amendment) replaces the fixed archetype table with trait-composed golfers and the flat corridor with a bending one — the two structural causes identified above — and **retires the archetype-bias gate below and in §9 rather than re-running it against a vocabulary (`BOMBER`/`STRAIGHT`/`SCRAMBLER`/`TOUCH`) that no longer exists.** The 16 hole files are kept as a diagnostic corpus (`packages/content/validation/`, harness code moved to `validation/_parked/`), not deleted, in case they're useful again once the new roster has enough of a track record to re-register expectations against. §10's "no sim change ships without re-running the validation set" rule is on hold for the same reason — there is currently no validation set the new roster's vocabulary can be checked against. In its place: `packages/sim/scripts/roster-balance.mjs`'s win-share report (no golfer above ~35% across a varied parcel set) is the interim day-to-day check.

---

## 5. Scoring and stars

Star thresholds, as implemented in the prototypes:

- **★** — the hole works. `parOK && spread < 0.85`. There's a decision; the field isn't scoring randomly.
- **★★** — it's good. Plus `routes > 1` and `0.62 < σ < 1.75`. Both routes viable, real spread, skill rewarded.
- **★★★** — it's elegant. Plus material left over (`used < cap`; in Freeform, ≥10% of budget unspent).

Making restraint the gate on the third star is the whole thesis of the game.

Feedback is sentences, not bars. A simulation score is opaque — a player who gets two stars needs to know why, or they'll shuffle pieces at random. Each metric translates to a sentence about their hole:

- "Plays as a par 4 — field average 4.05."
- "BOMBER beat the worst archetype by 0.91. One kind of player is being handed the hole."
- "Every archetype played the identical line. There is no decision here."
- "Scores barely varied (σ 0.55). Nothing is at stake."
- "Scores were everywhere (σ 1.82). It's a lottery, not a test."
- "2 pieces unspent — the land did the work."

Same math, but now it's coaching. That's the difference between a game people finish and one they bounce off.

Leaderboards. With a fixed budget and a roughly correct answer, high score is uninteresting. Two better homes: a weekly open parcel with a fat budget where it genuinely is a sandbox, and a per-parcel "solved with the least material" table.

---

## 6. Parcel spec

### 6.1 Parcel geometry — portrait

Parcels are vertical rectangles, played bottom to top: tee at the bottom edge, green zone near the top. Phones are portrait; a landscape parcel renders as a thin band with the tray crammed beneath it.

This is a design change, not just a layout one. A portrait parcel — say 200 yds wide × 440 long — is a materially tighter corridor than the landscape prototypes. OB sits closer on both sides, dispersion costs more strokes, and the whole set skews toward accuracy. That is precisely the failure mode the effort penalty exists to counteract, so the full validation set must be re-run against portrait geometry.

The upside: aspect ratio becomes a per-parcel difficulty dial the player can feel. A wide portrait parcel reads as a driver hole; a narrow one reads as a corridor. The shape tells you what kind of problem you're looking at before you place anything.

**2026-08-15 amendment — parcels are no longer straight rectangles.** "Vertical rectangles" above described the *boundary*, but the fairway/OB envelope inside it was also flat — a single half-width scalar, unbounded in x. That meant doglegs, and the accuracy-over-power tradeoff a real dogleg's corner creates, weren't expressible at all (see §4.2's amendment: this was the other half of why the trait rework was needed, not just a coefficient fix). The corridor is now a sequence of stations along the hole — each with its own centerline drift and fairway/OB half-width (`@redan/sim`'s `CorridorStation`, `@redan/schema`'s portrait-frame mirror) — so a fairway can bend, narrow, or widen along its length. The parcel's outer boundary is still authored as a rectangle; what bends is the playable envelope inside it. Parcels can also now carry `fixedRegions`: terrain (trees, native area) the player places nothing over and cannot remove, fixed by the parcel author — without something fixed in a dogleg's inside corner, cutting it is free, not a decision.

### 6.2 Parcel = terrain + tray

A parcel is terrain, a fixed tee, a required par, a wind, and a tray of allowed pieces with counts. **[thin]** The shape parameter table — pot vs. coffin bunker dimensions and the rest — was never finalised and is an M0 deliverable. (Since the 2026-08-15 amendment above, "terrain" also includes the corridor's own shape and any fixed regions — not just the placed pieces.)

### 6.3 Design serialization

A design serializes to `{ parcelId, pieces: [{ shapeId, x, y, rot, scale }] }` and nothing else. Web daily and iOS campaign become two editors over one format; the server can score either; cross-platform "view someone else's hole" falls out for free.

Capture input as intents — `place(shapeId, cell, rot)` — rather than pointer events. Touch vs. mouse becomes a thin translation layer, and undo, replay, and share-a-layout all fall out of it.

### 6.4 Auto-generated terrain

Fairway generator plus rough bands as one deterministic terrain-derivation module. Levels are data — JSON in the repo, versioned. The authoring tool and Freeform mode are the same thing, which means dogfooding the content pipeline.

Build into the sim from day one: `simVersion`, and elevation. A Redan is unbuildable on a flat plane, and elevation touches the shot model, terrain representation, rendering, and scoring simultaneously. Retrofitting it means rewriting everything.

Rendering: portrait canvas, 8-yard cells at 15 screen px. Deterministic per-cell dither (every 5th cell shaded, chosen from coordinates) gives turf texture without per-frame noise. Piece placement snaps to the grid.

**Live dispersion ovals.** Each archetype's landing zone shows as a translucent ellipse — a bomber's tee shot is roughly a 280-yard oval 25 yards wide, a straight hitter's 240 by 11. Hazard placement becomes a spatial puzzle you can see rather than one you find by trial and error. The ovals shift live as you drag a piece, because a piece changes the route, which moves where they land.

---

## 7. Modes

| Mode        | What it is |
|-------------|-----------|
| Daily       | One parcel a day, shared by everyone, streak + share grid |
| Campaign    | Worlds of nine parcels, taught in order, three stars each |
| Freeform    | Free-draw with sq-ft budgets, saved shape library with reuse discount |
| Real Land   | Famous parcels with the golf stripped out — "beat the architect" |
| Play        | Play your own hole: aiming cone, power meter, wind, four-stat golfer |

**[thin]** The regional content sets (the starter set plus what follows) were specified in the original and need re-listing.

---

## 8. Technical architecture

### 8.1 Platform split

The product is not "one game on two platforms." It is two editors over one simulator.

| Surface | Modes              | Platform                                   | Priority    |
|---------|--------------------|--------------------------------------------|-------------|
| Web     | Daily, Freeform, Real Land | Browser, portrait-first, works on desktop | Ships first |
| iOS     | Campaign, Play     | Native app                                 | Later, gated on M2 |

Freeform and Real Land are drawing tools with leaderboards and want a large screen — they stay on web permanently. Campaign and Play are tray placement on a portrait parcel, which is the thing that wants to be an app. iOS therefore never needs the freehand drawing stack, which removes the hardest part of the port before it starts.

Two practical notes: defer accounts entirely in v1, but design the anonymous streak so it can be claimed by an account later — and if social login ever arrives, Sign in with Apple becomes mandatory on iOS. Apple rejects thin webview wrappers, so Capacitor is not a shortcut here.

### 8.2 Renderer surface

The parcel renderer is written against a tiny interface — `fillCell`, `strokePath`, `drawText` — not against `CanvasRenderingContext2D`. At 8-yard cells with chunky pixel rendering that's five or six Canvas 2D calls behind an abstraction. It costs an afternoon now and is the difference between a one-file port to `react-native-skia` and a rewrite.

### 8.3 Repo shape

```
packages/sim       — zero-dependency TS, the only irreplaceable artifact
packages/schema    — parcel + design types, versioned
packages/content   — parcels as JSON
apps/web           — the editor
```

### 8.4 Identity and progress

v1 has a server. That's a real change from a static site and the only justified one. The API surface stays at exactly four endpoints: mint/read the session cookie, serve today's parcel, store and return progress, re-run the sim authoritatively on submit. No accounts UI, no leaderboards, no sharing infrastructure — the share grid is a clipboard string and needs no backend at all.

A server-side session is a cookie: the cookie carries an opaque session ID, the state lives in the DB. The real axis is where progress lives.

- **Server is truth; localStorage is a mirror.** Write to both, reconcile on load by taking the union of completed parcels and the max streak. Wordle keeps stats only in localStorage, which is why clearing a cache destroys a streak and why its domain migration reset streaks for a lot of players. Two copies that heal each other cost almost nothing. We already have a server round trip on every test, so the session rides on a request that exists anyway.
- **The streak is computed server-side from completion timestamps, never stored as a client-owned number.** Every "recover your Wordle streak" tool in existence is a localStorage editor. If the client owns the number, the number is fiction — which matters directly, since week-one return is M2's gate.
- **Set the cookie from a server `Set-Cookie` header, not `document.cookie`.** Safari's ITP caps JS-written cookies at seven days; get this wrong and streaks quietly reset weekly on iPhone, presenting as a retention problem rather than a cookie bug.
- **Daily reset is local midnight, not UTC.** The client asks for a date; the server doesn't decide what "today" is. Friendlier for players three time zones west — but it makes "today's parcel" a client-supplied parameter that needs a sanity bound so the archive can't be walked forward.
- **Transfer code** is both the cookie-clearing recovery path and the mechanism that moves a web streak onto iOS later. One flow doing two jobs. Surface it only once a streak exists.

---

## 9. Milestones

Each milestone has a gate. The gate is the point — a plan without kill criteria is a wish list.

### M0 · Trustworthy sim

Extract sim as a standalone package with a documented contract. Add `simVersion`. Add elevation. Add par-5 reach-in-two branch. Add fairway generator + rough bands as one deterministic terrain-derivation module. Define the shape parameter table. CLI validation harness with a one-page report. Portability contract written into the sim contract (no host APIs, injected RNG, versioned schema). Renderer surface interface defined. Design serialization format frozen.

**Gate:** 15+ real holes; model agrees with consensus on archetype bias for 12; every disagreement has a written explanation. Not "the numbers look fine."

**2026-08-15 — suspended**, not met and not being chased in its current form. See §4.4's amendment: the archetype-bias vocabulary this gate is written against was retired along with the fixed four-archetype table it was measuring. Interim substitute: `packages/sim/scripts/roster-balance.mjs`'s win-share report.

**Risk:** this phase expands. Elevation alone re-opens every coefficient. Timebox it; accept 12/15 over chasing 15/15.

### M1 · Playable slice

Nine parcels, tray placement, auto-fairway, stars, plain-language feedback, local progress, PWA install, sub-500ms sim. Ambient props. Session cookie, progress endpoint, transfer code.

**Mobile layout.** Portrait parcel fills most of the screen; tray is a horizontal strip pinned to the bottom, under the thumb; the verdict slides up as a sheet over the parcel rather than pushing it off-screen. The current prototype scrolls the hole out of view when you test, which breaks the adjust-and-retest loop.

**Gate:** five people who don't know you play all nine unprompted; two go back for a third star; median parcel under three minutes.

**Explicitly out:** accounts UI, leaderboards, sharing infrastructure, play mode, drawing.

### M2 · Public alpha

Public URL, anonymous telemetry (completions, time-to-first-star, tests-per-parcel, drop-off point), feedback route.

**Gate:** 40% of players who start parcel 1 finish parcel 9; 20% return within a week.

These numbers decide whether this is a project or a hobby. Better to learn it here than after building Freeform. If it fails, the diagnosis is almost certainly parcel 1 — the first ninety seconds — not the concept.

### M3 · Accounts and leaderboards

Auth, server-authoritative re-simulation, per-parcel "fewest pieces" tables, simVersion partitioning.

**Gate:** a client-submitted fake score is rejected; leaderboards survive a deliberate sim version bump without manual cleanup.

### M4 · Play mode

Aiming cone, power meter, wind visualisation, four-stat golfer with hard cap and free respec.

**Gate:** the same parcel plays meaningfully differently as a bomber vs a straight hitter, and players can articulate why. If both builds feel the same, that's a sim problem, not a UI one.

### M5 · Freeform and authoring

Free-draw with sq-ft budgets, saved shape library with reuse discount, parcel authoring tool (same tool that emits campaign JSON), community publishing with moderation. First full regional set beyond the starter.

**Gate:** you author three campaign parcels entirely in Freeform, faster than by hand. If the tool isn't good enough for you, it isn't good enough to ship.

### M6 · Real land

Pipeline from traced polygons → parcel with golf stripped. Famous parcels. "Beat the architect" comparison.

**Gate:** Shinnecock 7 as a parcel, and Flynn's real green grades well. Simultaneously the feature and the final calibration check.

---

## 10. Cross-cutting risks

**Calibration debt.** Every change touching the shot model — elevation, wind variance, green slope, rough bands — re-opens M0. Rule: no sim change ships without re-running the validation set. **On hold as of 2026-08-15** (see §4.4's amendment) — there is currently no real-hole validation set the trait-composed roster can be checked against; `packages/sim/scripts/roster-balance.mjs`'s win-share report is the interim substitute. Reinstate this rule once a validation set exists again for the new roster.

**Content volume.** Nine parcels is a demo; sixty is a game. Track parcels-authored-per-hour as a real metric from M1. It determines whether M5 arrives in time to matter.

**Difficulty curve.** Separate from parcel count. Document which concept each parcel teaches, in order, before authoring in bulk.

**The M2-before-M3 bet.** Shipping with no accounts, leaderboards, or sharing and asking people to play anyway is uncomfortable. It's also the only way to get an unconfounded read on whether the core loop holds.

**Business model.** This is a passion-project shape, not a business plan. Natural model if it works: free campaign, paid Freeform tier. Don't design around it yet.

---

## 11. Open questions

1. **OB severity.** Now urgent: portrait parcels are tighter by default, so stroke-and-distance may swamp everything and make accuracy trivially correct again — the exact failure mode the effort penalty fixed. May need a one-stroke drop for game feel. Untested.
2. **Portrait re-validation.** Do the archetype biases hold when the validation holes are framed in a narrower corridor, or does the geometry itself bias the set toward STRAIGHT?
3. **Green resolution.** 8-yard cells make green shape blocky, which matters most on short par 3s where shape is the whole hole. Option: simulate at 4 yards, render at 8 — but that undercuts "what you see is what's simulated."
4. **Erin Hills 18.** Does the reach-in-two branch fix it, or is the model right and the expectation being wrong?
5. **Pot vs coffin parameters.** Needs a concrete table before M0 closes.
6. **Client-supplied date bound.** Local-midnight reset means the client names the day. How far forward may it ask, and what stops the archive being walked ahead of schedule?
7. **Cookie durability in practice.** ITP behaviour on server-set cookies is favourable today but has changed repeatedly. Needs measuring against real returning-user data before M2's 20% gate is trusted — a cookie-loss rate is indistinguishable from a churn rate in that metric.
8. **Sim performance under JavaScriptCore/Hermes.** 130 simulated shots is milliseconds in V8. Unmeasured on a mid-range iPhone. Check before committing to the Expo path, not after.
9. **Name availability.** Domain, App Store, Steam, existing golf software. Ten minutes of checking.

---

## 12. Prototypes to date

| File              | What it proved |
|-------------------|---------------|
| `redan-plate.html`  | Composite overlay visual system; real Shinnecock 7 geometry extracted and measured |
| `redan-lab.html`    | Field simulation + architectural scoring + shared leaderboard |
| `parcel.html`       | Tee/green placement, archetype dispersion ovals, OB edges, wind, stars |
| `parcel-draw.html`  | Brush painting with square-footage budgets — became the Freeform mode spec |
| `parcel-tray.html`  | Shape tray, pre-built flawed start, chunky pixel rendering — the Campaign spec |

Python calibration harness (`terrain.py`, `sim.py`, `run.py`) extracts real hole geometry from KML and runs the validation set. This is M0's starting point — and it is currently the only copy of the calibration work, so it belongs in the repo on day one.
