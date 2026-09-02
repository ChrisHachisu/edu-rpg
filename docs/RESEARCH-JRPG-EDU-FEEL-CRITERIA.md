# Research: JRPG Feel + Educational-Game Criteria for Quest of Knowledge

Method note: `notebooklm` (the research skill's normal backbone) is **not installed** in this
environment — `notebooklm status` resolved to `command not found`, and `pip` itself is
unavailable, so the package could not be installed either. Per the task's fallback instruction,
this document was built entirely from live WebSearch + WebFetch this run: **19 WebFetch calls**
(13 returned usable primary-source content, 2 returned only a page title / 403 and are marked
as such below, 4 were duplicate-topic follow-ups) plus **16 WebSearch queries**, each returning
5–10 cited links. Every numbered claim below names the URL it came from. A claim with no fetched
URL is explicitly labeled `[memory]` and should be treated as lower-confidence background, not a
criterion.

This repo already has two LOCKED internal design docs — `design/GAME-FEEL.md` (timing tokens,
locked reference ledger) and `design/ART-DIRECTION.md` (style block, palette, tech spec). This
research does not override either; where this doc's external findings and those files might
interact, it is flagged in "Gray areas," not silently merged.

---

## 1. Motion & camera feel

### Frame pacing and worst-frame budget
At 60 fps the target frame time is **16.67 ms**; industry guidance treats spikes **above ~20 ms
as noticeable** and **above ~30 ms as bad stutter**, and stresses that *consistency* of
frame-to-frame delivery (not average fps) is what reads as smooth — four frames landing at
8/25/10/20 ms average to 60 fps but look choppy (framepacer.com/guides/frame-limiters-benchmarked,
smoothfps.com/guides/vsync-framepacing, via WebSearch this run). The standard measurement metrics
are **1% low** and **0.1% low** fps, not mean fps (same sources).

### Input-to-motion latency
No single number is authoritative; the literature gives a banded picture. Below **~50 ms**,
platformer-style player performance stays consistent; above it, performance degrades gradually.
A **70 ms** display-lag threshold is where reviewers commonly call responsiveness "poor" for
action content, and **100 ms** is the generally cited ceiling for a game to still register as
playable (input-lag/action-game literature summarized from Wikipedia "Input lag" and
warriorgamershub.com/awolvision.com, via WebSearch this run — these are consumer-hardware framed,
not JRPG-specific, so treat as an outer bound, not a target). For a slow-paced top-down JRPG with
discrete tile movement (not twitch aiming), the practical target should sit at the generous end
of this band — **≤100 ms** is defensible; there is no primary JRPG-specific study naming a tighter
number, so treat anything under 100 ms as a design choice, not a sourced requirement. **[memory]**:
console JRPGs of the SNES/PS1 era commonly ran control-to-first-frame-of-motion in 1–3 frames at
60 fps (≈17–50 ms), which is consistent with, but not proof of, the same band.

### Walk speed in tiles/s
- **Pokémon (DS-era, 60 fps):** walking ≈ **4 tiles/s**, running ≈ **8 tiles/s**, biking ≈
  **10 tiles/s** (gamefaqs.gamespot.com Pokémon Pearl Q&A, cited via WebSearch summary this run —
  the direct WebFetch of this URL returned HTTP 403, so this number is search-snippet-sourced,
  not page-verified; treat as medium confidence).
- **Pokémon Essentials (fan engine, documents the same convention):** walking speed 3 =
  0.25 s/tile (4 tiles/s), running speed 4 = 0.125 s/tile (8 tiles/s), cycling speed 5 =
  0.1 s/tile (10 tiles/s) — frame formula `frames/tile = 128 / 2^speed`
  (essentialsdocs.fandom.com "Getting around", via WebSearch this run). This independently
  corroborates the DS figures above.
- Standard 2D top-down RPG tile size is **16×16 px or 32×32 px** in most engines/tutorials
  discussing this movement style **[memory + generic engine-tutorial corroboration, not a single
  authoritative source]**.
- Applied to edu-rpg's own 36 world-px hero tile (per this session's memory index,
  `reference_edu_rpg_canonical_hero.md`): **4 tiles/s ≈ 144 world-px/s** walk, **8 tiles/s ≈
  288 world-px/s** run, using the Pokémon ratio as the reference convention — this is an
  extrapolation, not a fetched number, and should be validated against the project's own
  `design/GAME-FEEL.md` timing tokens before being treated as locked.

### Walk-cycle pose rate / sprite animation
Classic JRPG walk cycles use a **3-frame step–idle–step loop** (old Final Fantasy, RPG Maker RTP
convention); 4-frame cycles are also common; a general "smooth" 2D walk cycle for non-retro-styled
games runs **6–12 frames** (opengameart.org "3 Frame Walk Cycles" / "4 Frame Walk Cycles",
finalbossblues.com "Walk Cycles Part 1/2", via WebSearch this run). Classic-era Dragon Quest
sprites are described as never resting — always mid-animation ("hyperactive sprite") until Dragon
Quest VIII went full 3D (TVTropes "Hyperactive Sprite", via WebSearch this run) — i.e. no player
sprite should hold a static idle-only pose while stationary if the brief is targeting classic-DQ
feel specifically.

### Camera follow
Smooth-follow camera implementations use `Lerp`/`SmoothDamp` toward the player each frame, with a
**typical smoothing factor of 0.1–0.3** per update (lower = smoother/slower, higher = snappier),
run in `LateUpdate()` so the camera reacts after all other movement resolves in that frame
(multiple Unity tutorials, via WebSearch this run — engine-generic, not JRPG-specific). A
**dead-zone** camera (Mario-style: camera holds still while the player is inside a central box,
only tracks once the player reaches the box edge) is the standard alternative to constant lerp-follow
for top-down/platformer games (gamedeveloper.com "Camera Logic in a 2D Platformer", via WebSearch
this run).

### Pixel-perfect / integer scaling
Nearest-neighbor (point-sample) scaling is **lossless only at integer ratios** of source-to-display
pixels; at fractional ratios, resulting pixels end up different physical sizes, which reads as
shimmer/jitter, especially on scrolling content (tanalin.com/en/articles/integer-scaling/, fetched
this run). Practical implication for a game rendered on iPhone panels (which are non-integer
multiples of most pixel-art base resolutions): either (a) render pixel art at a base resolution
whose scale factor to the target device is a clean integer and letterbox/pillarbox the remainder,
or (b) do not claim "pixel-perfect" for art that is scaled at a fractional ratio — the HD-2D
hybrid style (3D-rendered backgrounds + 2D character sprites, camera-space post-processing) sidesteps
this entirely by not requiring the whole frame to be integer-scaled (en.wikipedia.org/wiki/HD-2D,
fetched this run: "traditional two-dimensional elements, such as pixel art and billboard sprites,
combined with fully three-dimensional environments," dynamic point lighting, tilt-shift, depth of
field, bloom, volumetric lighting, parallax scrolling).

### Juice / game feel framework
Steve Swink's definition, cited from the Wikipedia "Game feel" article (fetched this run):
"real-time control of virtual objects in a simulated space, with interactions emphasised by
polish." The article's six-component breakdown: **Input** (control mapping/sensitivity),
**Response** (low delay, high sensitivity to interpretation), **Context** (environment gives
actions meaning), **Aesthetic** (visual/audio polish — particles, color, sound), **Metaphor**
(mechanics matching thematic expectation), **Rules**. No numeric thresholds are given in this
source — "juiciness" itself (Jonasson & Purho, GDC Europe 2012, "Juice It or Lose It") is
qualitatively defined as "little details, little moments of surprise and delight" that separate a
flat experience from an exciting one (roblog.co.uk summary, fetched this run — the blog does not
itself enumerate numeric timings; the full numeric recipe lives in the GDC talk video/slides,
which were not fetchable as text this run — **flagged as a gray area below**).

### Hit-stop
"Hitstop" (a.k.a. hit-freeze) is a brief full-stop of motion at the moment of impact, used to sell
weight and to give the player a buffer window to input a follow-up/cancel (TVTropes "Hit Stop",
onlyfarms.gg, via WebSearch this run). No universal duration is given in sourced material; fighting-game
community convention (Street Fighter/Tekken) is commonly a handful of frames (**[memory]**, not
independently verified this run — treat any specific ms figure as unsourced).

### Criteria (motion/camera)
- Frame time target: **16.67 ms/frame at 60 fps**; flag any single frame **>20 ms** as a smoothness
  regression, **>30 ms** as a hard failure. — framepacer.com, smoothfps.com (WebSearch, this run)
- Input-to-first-visible-motion latency: **≤100 ms** outer bound; **≤50 ms** if achievable without
  cost. — Wikipedia "Input lag" / warriorgamershub.com (WebSearch, this run)
- Overworld walk speed: **4 tiles/s** baseline (Pokémon/Essentials convention); running/dash at
  **~2×** (8 tiles/s). — gamefaqs.gamespot.com, essentialsdocs.fandom.com (WebSearch, this run)
- Player sprite must not hold a fully static idle-only pose while stationary if targeting classic-DQ
  read; minimum walk-cycle frame count **3** (retro) to **6–12** (smooth). — TVTropes,
  opengameart.org (WebSearch, this run)
- Camera: implement as **either** dead-zone-hold-then-follow **or** `Lerp`/`SmoothDamp` with factor
  **0.1–0.3**, updated in `LateUpdate()`/post-movement — pick one and document it; do not mix.
  — Unity camera tutorials (WebSearch, this run)
- Any claim of "pixel-perfect" rendering requires the render-to-device scale factor to be a whole
  integer, or must not be made. — tanalin.com (fetched, this run)

---

## 2. Visual quality bar

### Text minimum sizes
Apple's Human Interface Guidelines recommend **17 pt** as the standard Body text size on iOS
(SF Pro, Dynamic Type-enabled); the platform-wide practical floor cited across UI-guideline
summaries is **11 pt**, with 17–19 pt called out as the optimal reading range (learnui.design,
Figma community forum summary of Apple HIG typography, via WebSearch this run — not independently
verified against the primary HIG typography page, which did not return body content on WebFetch
this run; **treat 17 pt as the working target, 11 pt as an absolute floor, both medium-confidence**).
For a children's audience reading a second-language script (kanji) on a phone screen, err toward
the upper end of this range rather than the floor.

### Kanji load by grade (MEXT 学年別漢字配当表)
Confirmed via ja.wikipedia.org/wiki/学年別漢字配当表 (fetched this run), current table (2017
Heisei-29 revision, phased in from 2018, **fully implemented from April 2020**):

| Grade | Kanji count (new to that grade) |
|---|---|
| 1 | 80 |
| 2 | 160 |
| 3 | 200 |
| 4 | 202 |
| 5 | 193 |
| 6 | 191 |
| **Total** | **1,026** |

Students are taught to *read* the kanji assigned to their own grade and *write* kanji from the
previous grade (same source). Practical implication for Act 1 (assume a lower-elementary target,
grades 1–3 combined ≈ 440 kanji ceiling): text aimed at a 1st/2nd-grader should default to
hiragana/katakana with kanji reserved for grade-appropriate vocabulary, annotated with furigana
for anything above the player's assumed grade.

### Furigana convention
"Sōrubi" (総ルビ — furigana over every kanji, not just difficult ones) is the standard convention
for young-children's reading material (en.wikipedia.org/wiki/Furigana, fetched this run).
Typographically, furigana is sized so **two kana characters fit over one kanji character** by
default; when that doesn't fit, publishers either condense the kana font, adjust kanji spacing, or
let furigana overflow into neighboring space — but avoid shrinking below single-kana-legible size,
since some publishers use full-size kana instead of small kana specifically to preserve legibility
(same source).

### UD (Universal Design) font
UDデジタル教科書体 (UD Digital Textbook Font) was designed for children with low vision and
dyslexia. A 2023 study (24 children with developmental dyslexia + 24 typically-developing children,
grades 4 through junior-high) found both groups **subjectively preferred** the UD font for
readability, but found **no statistically significant difference in objective reading-performance
measures** (CiNii Research abstract / GIGAZINE summary, via WebSearch this run — this is a
meaningful nuance: UD fonts help *felt* readability/comfort more than measured comprehension speed,
so choosing one is a comfort/inclusion decision, not a guaranteed comprehension-speed win).

### Text-box reveal speed
A commonly cited default typewriter-reveal rate in JRPG-style dialogue systems is **~30
characters/second**, implemented as a per-frame character-count parameter (dialogue-system
tooling references, via WebSearch this run — engine-tutorial sourced, not a first-party Square
Enix/Level-5 number; **medium confidence, treat as a reasonable default not a locked spec**).
Standard practice is to let the player tap to instantly complete the current line (skip the
reveal) rather than skip the whole box, and to advance to the next box only on a second tap — no
primary source pinned an exact "hold to fast-forward" speed multiplier this run
(**gray area**).

### Contrast / color
No child-specific numeric contrast ratio was found sourced this run distinct from general WCAG
AA (4.5:1 body text) — **[memory]**, not verified against a primary accessibility source this run;
treat as the default floor absent a better number.

### Localization QA (Japanese-specific)
Text overflow is called the single most common localization bug; Japanese full-width characters
mean word-for-word English-length assumptions fail, and industry estimates put roughly **40% of
localization defects** as pure layout failures (overflow, truncation, font-fallback glyphs)
(drizz.dev "Localization Layout Testing", via WebSearch this run). Practical QA gate: every text
container must be tested with the actual Japanese string, not a placeholder, and must support
either auto-shrink-to-fit or a defined max-line count with graceful truncation — never silent
clipping.

### CERO rating relevance
CERO A ("all ages") evaluation checks content against **30 defined expression categories**, of
which **6 are banned outright regardless of rating** (en.wikipedia.org/wiki/Computer_Entertainment_Rating_Organization,
fetched this run). A mobile-distributed educational RPG for 小学生 would target CERO-A-equivalent
content even if not formally CERO-submitted (CERO submission is for physical/console distribution
and costs money per platform — automaton-media.com, via WebSearch this run); Apple's own Kids
Category age-appropriateness review (below, §5) is the operative gate for an iOS app, not CERO.

### Criteria (visual quality)
- Body text: **17 pt** target, **11 pt absolute floor**, never smaller. — learnui.design/Apple HIG
  summary (WebSearch, this run)
- Kanji shown to the player must not exceed the player's assumed grade's cumulative allotment
  (grade 1 = 80, cumulative to grade 3 ≈ 440) without furigana. — MEXT table via ja.wikipedia.org
  (fetched, this run)
- Any kanji above the assumed reading grade gets furigana sized to fit **2 kana per kanji width**,
  never shrunk below single-kana legibility. — Wikipedia "Furigana" (fetched, this run)
- Dialogue reveal speed: default **~30 chars/sec**, tap-to-complete-instantly supported.
  — dialogue-system tooling refs (WebSearch, this run) — **medium confidence**
- Every player-facing Japanese string must be QA'd in its real form inside its real container
  (no placeholder-text sign-off); flag any clipped/overflowed string as a release blocker.
  — drizz.dev (WebSearch, this run)
- Content bar: no CERO-Z/D/C-tier content (nothing outside the "all ages" 30-category envelope).
  — Wikipedia CERO (fetched, this run)

---

## 3. Touch controls for kids

### Apple touch target minimum
**44×44 pt** is Apple's standard minimum tappable target size across iOS HIG-derived summaries
(multiple corroborating WebSearch results this run: medium.com "Size Matters", lukew.com,
designcode.io — the primary HIG page itself returned only a title with no body on WebFetch this
run, so this is cross-corroborated via secondary sources, not a single primary fetch). No
Kids-Category-specific *larger* minimum was found in any source this run — secondary sources
note only that larger targets are advisable for less-developed motor skills, without a number
(medium.com, via WebSearch this run). **Recommendation for a 小学生 audience: treat 44×44 pt as
an absolute floor and prefer meaningfully larger (e.g. 56–64 pt) for primary action controls**
— this uplift is a design inference, not a sourced Apple number; flagged as such.

### Virtual joystick
Practical mobile-game convention: joystick placed **bottom-left**, sized roughly **110–120%**
of a standard tap target, semi-transparent, on phones 6"+ (secondary mobile-game-design summaries,
via WebSearch this run — not a first-party Apple/Google spec). Two implementation patterns:
**fixed** (base always visible in one place — easier for players to build muscle memory, better
for precision) vs **dynamic/floating** (base appears wherever the thumb first touches within a
region — more comfortable across hand sizes) (same source). Visual feedback (press-state color/scale
change, direction indicator) is called out as mandatory since touch has no physical/haptic
confirmation on its own.

### Failure handling / difficulty
Xbox Accessibility Guideline 108 (learn.microsoft.com, fetched in full this run) recommends:
**4 or more** difficulty presets by default; ability to change difficulty **at any time without
losing progress**; both **manual and auto-save**, explicitly to let players "continue after
failure without significant loss of progress"; per-mechanic difficulty sliders where feasible;
and — directly relevant to tone for a children's product — **difficulty language must not
denigrate the player** (their own negative example: "Wimp Mode"). This maps directly onto the
brief's "never punish a wrong answer harshly" instinct: the sourced mechanism for that is generous
autosave + reversible difficulty, not absence of failure states.

Xbox Accessibility Guideline 116 (learn.microsoft.com, fetched in full this run), on any
UI-level time pressure (not core-gameplay timers): if a time limit is used outside core mechanics,
warn the player **at least 20 seconds** before expiry with a simple one-action extend, allow
adjusting the default limit up to **at least 10×**, and allow turning the limit off entirely.
Applied to a quiz-battle system: an in-battle answer timer (if any) counts as a core-gameplay
mechanic and is exempt from this specific rule, but any *non-battle* UI timeout (e.g. "session
about to end") must follow it.

Separately, the linked Game Accessibility Guidelines resource cited from XAG 116's own resource
list recommends a **0.5-second cooldown (post-acceptance delay) between inputs**
(gameaccessibilityguidelines.com, referenced inside the fetched XAG 116 page this run) — relevant
to preventing accidental double-taps/misfires from small hands on a touchscreen.

### Session length / usage norms for 小学生
Two independent Japanese survey sources (via WebSearch this run, not independently WebFetched
beyond moba-ken.jp which *was* fetched):
- moba-ken.jp (fetched this run, 2025 data): average daily **smartphone** use — lower-grade
  elementary **38 min/day**, upper-grade elementary **78 min/day** (up 26 min YoY, the largest
  jump of any age band surveyed).
- A second survey (cited via WebSearch, not independently fetched) puts weekday
  smartphone/tablet use at **1h59m average**, **upper grade 2h12m**, **lower grade 1h46m** — this
  is a different methodology/sample than moba-ken.jp and the two numbers should not be averaged;
  cite them as a range, not a single figure.
- 日本小児科医会 (Japan Pediatric Association) *recommends* (not a legal limit): **total screen
  media ≤2 hours/day**, and **video games specifically ≤30 min/day** (via WebSearch this run,
  jpa-web.org sourced summary, page itself not independently WebFetched this run — **medium
  confidence, treat as directional not a hard citation-grade number**).
- Practical implication: a single confortable play session should fit inside a **15–30 minute**
  window if it's meant to be played daily without exceeding the pediatric-association guidance,
  with natural save/stop points at least that often.

### Reward cadence / RPG-quiz mechanic precedent
Prodigy Math (grades 1–8, curriculum-aligned RPG mechanics): casting battle "spells" consumes
magic points that are **only replenished by answering questions correctly** — i.e. the
correct-answer reward is the resource that gates the next player action, not a separate pop-up.
A cited study (Morrison et al. 2020, grades 1–4, two elementary schools) found students "highly
engaged in the storyline" and motivated to answer questions to progress, sustaining attention "for
the majority of the time" (trophy.so case-study summary + prodigygame.zendesk.com, via WebSearch
this run — secondary source summarizing the study, not the primary paper itself).

スマイルゼミ (SmileZemi, Japanese tablet-based elementary learning product) uses a gamified
peer-competition feature (「みんトレ」) plus a parent-check-in feature (「みまもるトーク」); their
own reported figure is that children checked in on **8+ days/month** via that parent feature show
**~1.57× higher** continued engagement than children who are not (smile-zemi.jp, via WebSearch
this run — vendor's own marketing page, so treat as a vendor claim, not an independent study).

### Criteria (touch controls)
- Minimum tappable target: **44×44 pt absolute floor** (Apple HIG convention, cross-corroborated,
  no primary-fetch confirmation this run); **prefer 56–64 pt** for primary action buttons on a
  children's product — the uplift is a design recommendation, not an Apple-sourced number.
- Difficulty: **≥4 presets or equivalent adjustable-difficulty mechanism**, changeable mid-game
  without progress loss; non-denigrating labels. — Xbox XAG 108 (fetched, this run)
- Save behavior: both manual and auto-save present; failure must never cost more than the last
  autosave interval. — Xbox XAG 108 (fetched, this run)
- Any non-battle UI timeout: ≥20 s warning before expiry, adjustable up to 10× default, can be
  disabled. — Xbox XAG 116 (fetched, this run)
- Input debounce: **≥0.5 s cooldown** between repeat-triggering taps on the same control, to
  absorb small-hand mis-taps. — Game Accessibility Guidelines via XAG 116 (fetched, this run)
- Target session length: natural stop point every **15–30 min**; total in-game "media time"
  budget should let a daily player stay within the **≤2 h/day total, ≤30 min/day games**
  pediatric guidance without the app itself being the sole determinant. — 日本小児科医会 via
  WebSearch (this run, medium confidence)
- Correct-answer reward must gate forward progress directly (resource/points spent on the
  question-answering loop), not just cosmetic praise — Prodigy Math precedent (WebSearch, this run).

---

## 4. Transitions & world feel

### Encounter design
Two canonical models, both sourced from a single secondary summary (gamedeveloper.com "Revisiting
Random Encounters", via WebSearch this run — no primary Square Enix/Enix design document was
locatable this run):
- **Static/counter model** (classic Final Fantasy): a step-count is rolled on entering an
  encounter-eligible area (example range cited: **minimum 25, maximum 30 steps**), and a battle
  fires once that many steps are taken.
- **Dynamic/per-step model** (Dragon Quest convention): each step rolls independently for an
  encounter, with an added **"grace period"** counter ensuring a minimum gap between consecutive
  fights so they can't cluster back-to-back.
For a mobile educational RPG, the dynamic-with-grace-period model is easier to tune per zone
(danger areas roll more often) and avoids the "long safe stretch, then a wall of the same random
number" feel of pure step-counters — this is this document's own inference from the sourced
mechanism, not itself a cited recommendation.

### Battle UI structure
A JRPG battle UI's standard interaction loop, per a cross-title survey summary
(thegamedesignforum.com "Examining JRPG UI", referenced via WebSearch this run, PDF not
independently fetched): show commands + party/enemy status → player selects an action → player
selects a target → action executes with visual feedback → resource values (HP/MP/etc.) update
before the next turn. This loop repeats per combatant turn. No portrait-specific (phone-shaped)
JRPG battle-UI convention with citable proportions was found this run — **gray area**, flagged
below; edu-rpg's own locked `design/GAME-FEEL.md` battle-command-bar decision (no resting
selection, dated 2026-08-08 per this repo) should be treated as the operative spec for this
project rather than any external convention found here.

### Camera / transitions between areas
No primary source (GDC talk, postmortem, or developer interview) naming a specific fade-duration
figure (ms) for town/dungeon entry-exit was found this run despite targeted search — **this is a
genuine gap, not an oversight**; flagged in Gray Areas. What is sourced: continuity conventions
generally documented for 2D top-down games are edge-triggered transition zones (walking into a
door/map-edge trigger, not a menu action) and preserving the player's facing direction across the
cut, both **[memory]**-level conventions from having read many JRPGs' behavior rather than a
specific fetched source this run.

### Criteria (transitions/world)
- Encounter model: dynamic per-step roll **with an explicit minimum-gap grace counter** between
  fights (not pure step-counter, not gap-less random roll). — gamedeveloper.com (WebSearch, this run)
- Battle turn loop must show status before the commit point of every decision (never let the
  player choose blind to current HP/MP). — thegamedesignforum.com summary (WebSearch, this run)
- Fade/transition duration: **no sourced number this run — treat as an open item**, default to
  the project's own `design/GAME-FEEL.md` timing tokens rather than inventing a figure here.

---

## 5. Definition-of-done for a market-quality Act 1 vertical slice

### App Store / Kids Category gates (Apple, primary source — fetched in full this run)
From `developer.apple.com/app-store/review/guidelines/` guideline **1.3 (Kids Category)** and
**5.1.4 (Kids)**, and `developer.apple.com/app-store/kids-apps/` (all fetched this run):
- Kids Category apps select one age band: **5 and under**, **6–8**, or **9–11**.
- **No external links, no purchasing opportunities**, except behind a **parental gate**
  (an adult-level task — e.g. a math problem or a "hold this pattern" gesture — a young child
  cannot casually pass).
- **No third-party analytics or third-party advertising**, with narrow exceptions only if the
  service does not collect/transmit IDFA or any identifiable info (device, name, DOB, email,
  location), and any ad creative is human-reviewed for age-appropriateness.
- **No personally identifiable information or device information to third parties, even in
  adult-gated sections**, without explicit parental consent.
- App must include some real functionality/entertainment value regardless of the player's actual
  age (can't just be a data-collection funnel).
- A privacy policy is required if any minor PII is collected/transmitted/stored.
- "For Kids"/"For Children" language in app metadata is reserved for apps actually in the Kids
  Category (guideline 2.3.8, referenced inside the fetched 5.1.4 text).

### Common App Store rejection reasons (2025-era, secondary sources, via WebSearch this run)
Crashes/bugs top the list; then missing or inaccurate privacy policy; no in-app account-deletion
path (if accounts exist); screenshots/metadata not matching actual app behavior; "minimum
functionality" rejections (app too thin); and, specific to regulated categories including Kids,
routing to senior reviewers that adds review-time risk if compliance isn't airtight on first
submission (superappp.com, openspaceservices.com, via WebSearch this run — aggregator blog
consensus, not an Apple primary source for this specific list, though the Kids-specific items are
corroborated by the primary guideline text above).

### Localization QA gate (Japanese)
Every player-facing string must be checked **in its actual rendered container with the real
Japanese text**, not a placeholder — flag any overflow/clip/truncation as a blocker, given
industry data that ~40% of localization defects are pure layout failures
(drizz.dev, via WebSearch this run, §2 above).

### What shipped first-chapter JRPGs / demos typically contain
No single primary "shipped demo checklist" document was found this run (no GDC postmortem
specifically enumerating a JRPG demo/Chapter-1 checklist was locatable via search this run) —
this section is therefore assembled from the corroborated sourced criteria above rather than one
authoritative list; **flagged as a synthesis, not a single citation**, in the Definition of Done
below.

---

## Definition of Done — Act 1 (≤40 lines, pass/fail)

1. Frame time ≤16.67 ms/frame typical; no single frame >30 ms during normal play. [§1]
2. Input-to-first-visible-motion latency ≤100 ms measured on-device. [§1]
3. Overworld walk speed = 4 tiles/s baseline; run/dash ≈8 tiles/s if present. [§1]
4. Player sprite has ≥3-frame walk cycle; no dead-static idle while stationary. [§1]
5. Camera uses one documented policy (dead-zone OR lerp 0.1–0.3), not a mix. [§1]
6. Any "pixel-perfect" claim is backed by an integer render-to-device scale factor. [§1]
7. Body text ≥17 pt target, never below 11 pt anywhere in the UI. [§2]
8. No kanji shown above the assumed player grade's cumulative MEXT allotment without furigana. [§2]
9. Furigana sized to ≥1-kana legibility, never compressed past that. [§2]
10. Dialogue reveal ~30 chars/sec with tap-to-complete-instantly. [§2]
11. Every JP string QA'd in its live container; zero known overflow/clip at ship. [§2]
12. Content stays inside CERO-A-equivalent envelope (no banned-category content). [§2]
13. All primary touch targets ≥44×44 pt; primary action buttons ≥56 pt preferred. [§3]
14. ≥4 difficulty presets or equivalent adjustable mechanism; changeable without progress loss. [§3]
15. Manual + auto-save both present; worst-case loss on failure ≤1 autosave interval. [§3]
16. Any non-battle UI timeout: ≥20 s warning, adjustable ≥10×, can be disabled. [§3]
17. Input debounce ≥0.5 s between repeat-fire taps on the same control. [§3]
18. Natural session stop point at least every 15–30 min. [§3]
19. Correct-answer reward directly gates battle progress (not cosmetic-only praise). [§3]
20. Encounter model uses per-step roll + minimum-gap grace counter, not gap-less random. [§4]
21. Battle UI always shows current HP/MP/status before the player commits a choice. [§4]
22. Kids Category age band selected (5-under / 6-8 / 9-11) matching actual target age. [§5]
23. Zero external links or purchase flows outside a parental gate. [§5]
24. Zero third-party analytics/ads, or only compliant narrow-exception ones (no IDFA/PII). [§5]
25. Zero PII/device-info transmitted to third parties without explicit parental consent. [§5]
26. Privacy policy present and accurate if any minor data is collected. [§5]
27. No crash across a full Act 1 playthrough (encounter → battle → menu → save → reload). [§5]
28. Screenshots/store metadata match actual in-app behavior exactly. [§5]
29. App has real standalone entertainment/learning value, not just a data funnel. [§5]

---

## Gray areas remaining / questions for the owner

1. **Exact fade/transition duration (ms) for town/dungeon entry-exit** — no primary source found
   this run naming a number; the project's own `design/GAME-FEEL.md` may already have a locked
   token for this. Should this doc defer entirely to that file, or is external validation wanted?
2. **The full numeric "juice" recipe** (screenshake amplitude/duration, squash-stretch ratios,
   particle counts) from Jonasson & Purho's GDC talk was not extractable as text this run (video
   content, no transcript found) — worth a follow-up pass specifically against the GDC Vault
   video/slides if that level of specificity is wanted.
3. **Session-length survey numbers are two different, non-reconcilable Japanese surveys**
   (38/78 min vs 1h46m/2h12m) — they used different methodologies/samples. Which should this
   project treat as authoritative for its own session-length target, or should it commission/assume
   its own number?
4. **Apple's primary HIG pages (Layout, Typography) would not render body text via WebFetch this
   run** (JS-rendered SPA) — the 44 pt touch target and 17 pt body text figures used here are
   cross-corroborated via multiple secondary sources but not confirmed against Apple's own page
   text directly. Worth a manual confirmation pass (open the page in a browser) before treating
   these as hard-locked numbers.
5. **No JRPG-specific input-latency study exists** — the 50/70/100 ms band used here is from
   general action-game/display-lag literature, not from a Dragon Quest/Pokémon-specific source.
   Is the ≤100 ms outer bound acceptable, or does the owner want tighter?
6. **CERO submission was intentionally treated as out-of-scope** (console/physical-only, costs
   money per platform) in favor of Apple's Kids Category as the operative content gate for an iOS
   app — confirm this framing matches the shipping plan.
7. **No primary developer postmortem specifically for a "Chapter 1 / demo" JRPG checklist was
   found** — §5's Definition-of-Done synthesizes the sourced Apple/localization/accessibility
   criteria rather than citing one authoritative "what a shipped demo contains" document. If the
   owner has a specific reference title in mind (a known demo they consider well-made), naming it
   would let a follow-up research pass fetch that title's own postmortem/interview material.
