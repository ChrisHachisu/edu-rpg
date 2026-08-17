---
date: 2026-08-17
type: spec
project: edu-rpg
status: DEFERRED by the owner — rides along with the next bundle edit
tags: [audio, music, bundle-edit, deferred, waiting-for-a-trigger]
---

# Orchestral BGM: verified, prepared, and deliberately NOT integrated

> [!warning] "READY" DOES NOT MEAN "GO" — THE OWNER HAS ALREADY ANSWERED THIS
> Asked whether to re-stamp the bundle's provenance chain for a soundtrack on its own, he chose to
> defer. Verbatim: **"Wait and bundle it with the next edit"** (2026-08-17).
>
> Step 2 below is therefore **not** an open question awaiting a decision. It is a CLOSED one, answered
> *"not on its own"*. **Do not install this because the plan looks complete.** The trigger is someone
> editing the bundle for an unrelated reason, at which point this rides along in the SAME pass so the
> pins and the provenance chain move once instead of twice.
>
> Pointers to this file sit in `scripts/runtime_baseline.py` (beside `BUNDLE_SHA256`) and
> `scripts/repin.sh` (beside `FROZEN`), because whoever needs it arrives from the **pin** side, not
> the music side.

**Status: everything is proven to work, and NOT installing it is the owner-endorsed state rather than
merely a cautious one.** I applied the whole change, verified the seam, then reverted it when the
blast radius turned out to be far larger than briefed; the owner then made that revert the standing
position. Details below so this is a decision next time rather than a discovery.

## What is ready

- **Nine approved tracks**, `~/Documents/claudecode/edu-rpg-music-candidates/` (`m4a/` ships,
  `masters/` for re-encoding). Owner heard all nine: *"i don't know much about music but all sound
  good enough!"* Named exactly for the `BgmTrack` union, so no scene-side changes.
- **The player**, `design/music/music-override.js` — deliberately parked OUTSIDE `public/` so it
  cannot enter the runtime overlay and move pins until someone chooses to install it.
  **This is the ONLY copy and is canonical.** The generating session deleted its own reference rather
  than patch the `init()` bug below, on the reasoning that a second copy is how that bug survives.
  Verified after that deletion: 189 lines, parses, both swap entry points present, and `masters/`
  still holds all nine sources. Do not fork it; edit it here.

## The seam, and why it is the right one (all verified against the real bundle)

The bundle already exposes a deliberate audio hook — `window.__QOK.setVolume` closes over `Jt`, the
minified `audioManager` (`Jt = new Tp`). So the change is **not** "replace MusicComposer": it is one
line added to that existing object literal, in the literal's own style:

```js
audio: typeof Jt !== "undefined" ? Jt : null
```

**+54 bytes, measured.** Everything else lives in the override file. Verified by reading the bundle,
not assumed:

| claim | verified |
|---|---|
| `__QOK` literal exists, `Jt` in scope | yes, single occurrence, byte 4,920,879 |
| the composer contract is only 4 members | yes: `.currentBgm`, `.play(x)`, `.stop()` (via `?.`), `.setVolume(T)` |
| mute works without routing through `masterGain` | yes: `setMuted(true)` calls `stopBgm()` → `composer.stop()` |
| SFX cannot be broken by silencing Tone | yes: `SfxLibrary` is raw Web Audio on `ctx`/`masterGain`, not Tone |
| a `public/`-only override is impossible | yes: `audioManager` is never on `window`; scenes call the singleton through closure |

**One correction to the original brief:** `setVolume` receives **−30…−6 dB**, not −30…0
(`masterVolume > 0 ? -30 + masterVolume*24 : -Infinity`). At full volume that is −6 dB, which is
exactly the `Tone.Volume(-6)` the procedural composer used — so applying the dB directly is parity,
not a new mixing decision.

**One bug fixed in the reference implementation:** it swapped the composer only by wrapping `init()`,
but `AudioManager.init()` early-returns once `initialized` is true. If init had already run before the
override loaded, the swap would silently never happen and the game would keep its chiptune — a
failure mode indistinguishable from the file not loading. `design/music/music-override.js` now swaps
on both paths (`if (am.initialized) swap(am)` as well as the wrapped `init`).

## WHY IT IS NOT INSTALLED — the blast radius

`repin.sh` documents that **`dist/assets/index-BhoGQRaA.js` was hand-edited after compilation and a
recompile silently deletes the entire DOM UI** (`docs/SOURCE-BUNDLE-DRIFT.md`), and it asserts the
bundle's md5 against a `FROZEN` constant as a tripwire. So rebuilding from `src/` is not an option —
which settles that question — and any hand edit must re-stamp the artifact's identity **everywhere**:

- `scripts/runtime_baseline.py` — `BUNDLE_SIZE`, `BUNDLE_SHA256`
- `scripts/repin.sh` — the `FROZEN` md5 tripwire
- `scripts/extract_act1_runtime_snapshot.mjs` — `BUNDLE_SHA256`
- `src/map-engine/shippedOverworldBaselineDqReplay.mjs`
- `src/map-engine/generated/act1RuntimeSnapshot.ts` (generated; never hand-edit)
- **`src/map-engine/retainedLaterGateBehavior.test.ts` — a TEST asserts the bundle sha**
- `runtime/manifests/v1.17.1-ipad-hud-walk.json` — size + sha
- `design/review/preserved-overworld-land-bridges/baseline/shipped-overworld-baseline.json` — a
  **preserved review artifact**
- `scripts/bake_act1_overworld_walk.mjs`, `capture_overworld_act_plates.cjs`,
  `build_act1_terrain_legibility_pilots.py` — provenance asserts to check

Most of those exist to guarantee the provenance of the **overworld terrain**, which has nothing to do
with audio. Moving them for a music feature means an audio change re-stamps the identity of the
terrain pipeline's evidence chain. The existing pin comments in `runtime_baseline.py` show the
convention for doing this: a dated entry naming the change and the authorisation
(*"2026-08-01, owner-authorised: …"*). That is a sign-off, and it is the owner's to give.

Also, `index.html` gains one `<script>` tag, and its pin is duplicated in
`scripts/build_static_index.mjs` as `EXPECTED_STATIC_INDEX_SHA`, whose comment requires both copies to
move together with reasoning. Routine, but it is a second signed artifact.

**And there is no urgency:** see the licence gate below. Nothing ships tonight either way.

## Remaining steps, in order

1. **OWNER: register at stability.ai/community-license.** Blocking for any public ship. The tracks
   are Stable Audio 3 under the Stability AI Community License — free commercial use under $1M
   revenue, but registration is required and it is an account creation, so no agent can do it.
   Reasoning: `claude_brain/04-Learnings/learning-20260817-ai-music-licensing-for-shipped-games.md`.
2. ~~**OWNER: authorise the bundle re-stamp**, given the list above.~~ **ANSWERED 2026-08-17: NOT ON
   ITS OWN.** *"Wait and bundle it with the next edit."* Do not re-open this as a question; the
   remaining steps execute when another change already requires a bundle edit, and not before.
3. `design/music/music-override.js` → `public/`; the nine `.m4a` → `public/audio/`.
4. Add the `<script src="/music-override.js">` tag to `index.html`.
5. `scripts/runtime_baseline.py`: add `music-override.js` to `REQUIRED_ROOT_FILES` and an
   `audio/` → `"bgm-track"` branch in `category()`. **`category()` raises on an unclassified file
   rather than dropping it**, so this fails loudly, not silently — better than the original brief
   feared, but it still must be done or `build-dist.sh` errors.
6. Patch the baseline bundle per AGENTS.md rule 5 — read once, write a NEW temp file, assert
   4.5–5.5 MB, inspect the diff, then copy. The anchor is unique; assert that and refuse a second run.
7. Re-stamp every pin in the blast-radius list, with a dated owner-authorised comment.
8. `scripts/repin.sh`, then `npm run gate`.
9. **Verify by measurement, not by reading:** music is invisible to a screenshot. Assert per scene
   that the expected track is loaded and playing, that `setMuted(true)` reads **0.0** spectral
   energy, and that the orphaned Tone composer is not playing underneath. Set the analyser's
   `smoothingTimeConstant` to 0 first — its default decay reads as residual energy and will look like
   a mute bug that is not there.
10. **Hardware listen before shipping, and budget for the dungeon track.** It is the quiet one and
    has never been heard on a phone speaker. Try the cheap fix first — a per-track trim in the player
    (the gain node is already there) costs nothing and is worth ruling in or out. But do not expect it
    to work: the masters are RMS-matched to −20 dB, so the track is quiet by *composition* (sparse and
    low), not by level, and a small speaker rolls off exactly the low frequencies it lives in. Gain
    cannot restore content the speaker will not reproduce. If the trim does not fix it, this is a
    **regeneration**, not a mix change — the generating session still holds the environment and quotes
    ~40 s per track, and `masters/` (9 files, seamless PCM16) is the source to re-encode from, never
    the `m4a/`.

## Traps already paid for

- **Do NOT use `<audio loop>` or HTMLAudioElement looping.** AAC carries ~1024 samples of encoder
  priming that replay on every wrap, so the loop clicks audibly however clean the crossfade is.
  Decode once, drop the priming, trim to exactly `loop × sampleRate`, loop the `AudioBuffer`.
- **Under SPA-style serving a missing track returns 200 with `index.html`, not 404**, so an `r.ok`
  check alone does not catch it — the failure surfaces as *"Unable to decode audio data"*. Keep both
  guards.
- **Keep the decode lazy.** Nine decoded 44.1k stereo buffers is ~40 MB of PCM, on a device whose
  whole history in this repo is memory pressure.
- **The loader retries, bounded** (6 tries, linear back-off, failures recorded and surfaced on
  `window.__QOK_MUSIC__`), and the give-up path was forced and observed rather than assumed. This is
  the same discipline as `a1aLd`/`a1aLayerFailed` in `dq-tiles.js`, and for the same reason: tonight's
  blue-map bug was a silent `onerror` in a caching loader. In audio that bug is *silence*, which is
  harder to notice than a blue screen.
