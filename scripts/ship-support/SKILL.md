---
name: push-to-testflight
description: >-
  Build + push an iOS app to TestFlight via the LOCAL free path ($0/build, no EAS, no Expo cloud): fastlane + App Store Connect API key. Primary target chalkmap-v2/ios; generalizes to any local Expo/RN iOS app. Triggers: TestFlight, TF, TF build, push to TestFlight, ship iOS build, fastlane beta, new build, App Store Connect upload, ipa upload, codesign/provisioning failures during upload, errSecInternalComponent.
---

# Push to TestFlight (local, no EAS, $0/build)

## Overview
Build, sign, and upload an iOS app to TestFlight entirely on this Mac — **$0, no EAS cloud minutes, no Expo**. Replaces `eas build --auto-submit`. Uses native `xcodebuild`/fastlane + the App Store Connect API key already on disk. Proven on chalkmap-v2 (shipped TF #33). Each run auto-increments the build number, so it's just one command every time.

## The command
Uploading to TestFlight and assigning a beta group are external mutations.
Before running the lane, confirm that the current request authorizes the exact
app, source HEAD/worktree, artifact, and beta audience. A request to build or
diagnose signing does not by itself authorize upload.

## Resolve the exact ship tree

Do not assume the main checkout or a legacy `.claude/worktrees` location. Inspect
`git worktree list --porcelain`, identify the tree containing the authorized
source HEAD plus `scripts/ship-ios.sh`, `scripts/ship-gate.sh`, and the iOS
Fastfile, then print and verify its path, branch, HEAD, and clean status. If more
than one tree qualifies or the approved fixes are not on that HEAD, stop and ask
which tree to ship. Set its absolute path as `SHIP_TREE`.

Before shipping, require the localized-toolkit signature in that exact tree:

- `scripts/ship_ios.py` resolves `~/.agents/skills/push-to-testflight`;
- `scripts/ship-ios.sh` derives and passes its owning checkout as `--app-dir`;
- `ios/fastlane/Fastfile` derives `ROOT`/`OUTPUT_DIR` from `__dir__`;
- a checkout mismatch aborts, and no-Slack mode prints a truthful Codex report.

If any signature is absent, do not ship from that tree. Localize and test its
toolkit first or select a verified tree containing the same authorized HEAD.

From the authorized app's `ios/` directory:
```bash
cd "$SHIP_TREE/ios"
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # REQUIRED — see references/local-ship-shared.md
fastlane beta
```
The `beta` lane: dedicated signing keychain → distribution cert + fresh App Store profile (via the API key) → manual signing on the app target → next build number → archive → export → upload. Wall-clock ~7–20 min (Mac is tied up — batch fixes per build). Apple then processes ~5–15 min before the build goes VALID/installable.

> Shared local-ship rationale (LANG/LC_ALL, prod-vs-dev DB guard, "$0/build no EAS"): `references/local-ship-shared.md`.

## ⚠️ One heavy native build at a time (added 2026-07-02)

Do NOT run `fastlane beta` (iOS archive) while an Android `./gradlew` release build (or another `xcodebuild`) is running on the same Mac. Build 102's first archive FAILED with `build_app` exit 62 / `xcodebuild -showBuildSettings timed out after 4 retries` purely from CPU starvation by a concurrent gradle build — no code fault. Serialize native builds; if you must, raise the tolerance with `export FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT=60` before the lane. (Cross-platform extension of the ArchiveIntermediates contention rule.)

## 🔒 Hermes flavor guard (MANDATORY — added 2026-07-02 after build 100 crashed on launch)

RN's hermes-engine pod ships a **Debug** Hermes VM into `ios/Pods/hermes-engine/destroot` on EVERY
`pod install`; a build-time script phase swaps in the Release VM keyed on the marker file
`ios/Pods/.last_build_configuration` — and that marker **survives pod install**. So after any
`pod install`, if the marker already says `Release`, the Release archive SKIPS the swap and ships
the **Debug Hermes inside the Release app → SIGSEGV at launch on device** (build 100, 2026-07-01:
`EXC_BAD_ACCESS` in `HermesRuntimeImpl`/`ReactInstance::initializeRuntime`, app unusable for all testers).

**Before EVERY `fastlane beta`, run this check from `ios/`:**
```bash
H=Pods/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes
ls -l $H   # RN 0.81.5: Release ≈ 4.7MB; Debug ≈ 6.7MB
# If size looks Debug (>6MB) OR you ran pod install since the last Release build:
rm -f Pods/.last_build_configuration
# ⚠️ replace_hermes_version.js extracts to a RELATIVE 'hermes-engine' dir, so it MUST run with
# CWD = the Pods dir. Run it from ios/ (as an earlier version of this line did) and it silently
# no-ops destroot (leaves Debug ~6.7MB) + strays a .last_build_configuration at CWD — it PRINTS
# "Done replacing" but the device slice stays Debug. (Bit build 115, 2026-07-09.) Note: a fresh
# pod install with the marker ABSENT is safe regardless — the build's own script phase swaps
# correctly; this manual swap only exists to pass a pre-build preflight (ship_ios.py) check.
( cd Pods && node <app>/node_modules/react-native/sdks/hermes-engine/utils/replace_hermes_version.js -c Release -r <rn-version> -p "$(pwd)" )
ls -l $H   # must now be the ~4.7MB Release flavor (device slice ios-arm64)
```
**After the archive, before trusting the upload:** `dwarfdump --uuid` the archive's
`Products/Applications/*.app/Frameworks/hermes.framework/hermes` and confirm it is the release
flavor (size ~4.7MB). A debug-flavor hermes in the archive = STOP, do not distribute; fix + rebuild.
Root-cause forensics: `claude_brain/01-Sessions/2026/07/2026-07-02.md` §Session 1.

## 🔑🔴 Env completeness + integrity (added 2026-07-02; HARDENED after builds 101+102 shipped a CORRUPTED URL)

`eas env:pull production --path .env.local` writes ONLY the vars in the EAS prod env, and — critically —
**its last line has NO trailing newline.** As of 2026-07-02 that env **lacks `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`**,
so it gets appended. **Builds 101 + 102 shipped broken because `printf 'EXPO_PUBLIC_REVENUECAT…\n' >> .env.local`
FUSED onto the newline-less last line** (`EXPO_PUBLIC_SUPABASE_URL=`), producing
`EXPO_PUBLIC_SUPABASE_URL=https://…​.supabase.coEXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_…` → the app's Supabase
base URL was garbage → **every backend call failed DNS → ~30s "load" every open, stuck recap, all backend screens
dead.** Root cause + proof: `docs/2026-07-02-fix-verification-proof.md`.

**Best fix: owner adds the key to the EAS prod env** (then no append at all):
`eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value appl_gHaaRmOcgBkCqUIYcOSwkvMzZSi --visibility plaintext`

**Until then, append SAFELY (leading newline) + verify with ANCHORED greps that ABORT the build:**
```bash
eas env:pull production --path .env.local
[ -n "$(tail -c1 .env.local)" ] && printf '\n' >> .env.local        # guarantee trailing newline FIRST
printf 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_gHaaRmOcgBkCqUIYcOSwkvMzZSi\n' >> .env.local
# HARD gates — each line must be EXACT + on its OWN line (anchored ^…$). Abort the build if either fails:
grep -qE '^EXPO_PUBLIC_SUPABASE_URL=https://qwqijqfbfddwdxfiaxpz\.supabase\.co$' .env.local || { echo "URL CORRUPT — ABORT"; exit 1; }
grep -qE '^EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_gHaaRmOcgBkCqUIYcOSwkvMzZSi$'   .env.local || { echo "RC KEY BAD — ABORT"; exit 1; }
```
⚠️ **NEVER use `grep -c appl_` or `grep -c qwqijqfbfddwdxfiaxpz` as the check** — both MATCH the corrupted
concatenated string (the RC key + prod ref are IN the mangled URL), which is exactly what fooled the 101/102
verification AND the prod-DB guard. Only an **anchored `^…supabase.co$`** grep catches a trailing-junk URL.
Post-build, confirm the SHIPPED bundle URL is clean (no concatenation):
```bash
strings <archive>/Products/Applications/*.app/main.jsbundle | grep -oE 'supabase\.co[A-Za-z_]{0,30}' | sort -u
# must show ONLY unrelated symbols (e.g. supabase.collectionOf) — NEVER 'supabase.coEXPO_PUBLIC…'
```

## 🔒 Prod-database guard (MANDATORY — owner-mandated 2026-06-20)

`ios/fastlane/Fastfile` → `beta` runs `scripts/assert-prod-build.sh` on the built IPA
**before** `upload_to_testflight` — rationale + canonical DB refs: `references/local-ship-shared.md`.
Ensure the build uses prod env — `eas env:pull production --path .env.local` writes prod
into `.env.local` before the build (restore to dev after). **Never remove the guard.**
Manual pre-check: `bash scripts/assert-prod-build.sh ios/build/chalkmapv2.ipa`

## How to run it (orchestration)

> [!tip] PREFERRED PATH: `$SHIP_TREE/scripts/ship-ios.sh`
> One resumable command does this whole skill's manual sequence: hardened env-swap →
> preflight → `fastlane beta` (with `scripts/ship-gate.sh` running inside the lane:
> env-integrity + Hermes-flavor + DNS + prod-sim smoke-launch on the actual artifact) →
> poll VALID → assign Beta Testers → **re-query confirm** → restore dev env → notify
> install-ready ping. `--resume` after any crash; `--dry-run` to test. The manual steps
> below remain the reference for debugging and for what ship-ios does under the hood.
> If Slack is not explicitly requested or unavailable, run with
> `SHIP_IOS_NO_SLACK=1` and report completion in the Codex task.
> ASC quirk (learned 2026-07-02): build group membership must be queried via
> `filter[betaGroups]` on `/v1/builds` — a direct GET on `/v1/builds/{id}/betaGroups`
> returns 403. First real ship-ios push = its live e2e test (dry-run verified only);
> watch the build-number regex against the Fastfile's `-> building N` log line.

- Manual fallback: run in the background, log to a file, and monitor: `fastlane beta > /tmp/fastlane-beta.log 2>&1 &`. Watch for `Successfully uploaded` / `❌` / `errSecInternalComponent` / `bundle version must be higher`.
- **fastlane hides the real xcodebuild error** in its summary. On any build failure, read the gym log: `~/Library/Logs/gym/chalkmapv2-chalkmapv2.log` (grep `error:` / signing / provisioning).
- **No keychain popup should appear.** If the user reports one asking for a keychain password, tell them to DENY it (they can't know the password) — it means codesign hit a duplicate cert; the lane already forces the dedicated keychain first, so just re-run. Never ask the user for their login-keychain / macOS password.

## Verify — confirm it actually landed (don't trust "uploaded" prose)
`Successfully uploaded` means Apple accepted the binary, but the ASC builds API lags a few minutes. Confirm with the bundled script:
```bash
python3 ~/.agents/skills/push-to-testflight/check-build.py
```
The new build should appear and move `PROCESSING` → `VALID`. (Needs `PyJWT` + `cryptography`, already installed.)

## 🔴 `VALID` IS NOT `INSTALLABLE` — verify DELIVERY, and do it on every push (added 2026-08-22)

**`processingState: VALID` says Apple finished processing the binary. It says nothing about whether
any human can install it.** Reading it as delivery produced three straight false "shipped, go
install it" reports on edu-rpg. Every ASC signal looked right — VALID, not expired, compliance
answered, `internalBuildState: IN_BETA_TESTING`, an internal group with `hasAccessToAllBuilds` — and
the build was undeliverable, because one relationship further out the owner's own tester record read
`state: INVITED`. An invited-but-never-accepted tester sees nothing. Owner: *"this is a pattern now
so please fix your process."*

So `check-build.py` is a PROCESSING check and must never be used as the completion criterion. Run:

```
python3 ~/.agents/skills/push-to-testflight/verify-delivery.py --app <edu-rpg|chalkmap-v2|APP_ID> [--build N]
```

It asserts all five things delivery actually needs and exits non-zero with the remedy:
1. build VALID and not expired
2. export compliance ANSWERED (`usesNonExemptEncryption` non-null)
3. `internalBuildState == IN_BETA_TESTING` (external groups additionally need beta review; a state of
   `READY_FOR_BETA_SUBMISSION` means NOT submitted)
4. at least one beta group has access
5. **a named tester is in a state that can install — `INSTALLED` or `ACCEPTED`. `INVITED` cannot.**

**The push is not done until this exits 0.** Do not write the handoff, notify, or tell the owner to
install before it does. If it fails on tester state, say so plainly and name the human step: only the
tester can accept a TestFlight invitation — there is no API for it.

**The invariant is per-CHANNEL, not per-person:** a build is deliverable when some channel is live
(`buildBetaDetail` state `IN_BETA_TESTING`) AND that same channel has a tester in
`INSTALLED`/`ACCEPTED`. Internal testers ride the internal channel, external the external one.

Do NOT try to identify the owner by email — **the API returns `null` for external testers' emails.**
A first version of this check keyed on his address, concluded his internal record reading `INVITED`
was the cause, and was wrong: *"i have been able to test as the internal tester up to 55."* The real
cause was that build 56 was never assigned to the external group, so its `externalBuildState` sat at
`READY_FOR_BETA_SUBMISSION` while 54 and 55 read `IN_BETA_TESTING`.

**Per-app delivery channels, measured:**
- **edu-rpg** — EXTERNAL "Beta Testers". Assign on EVERY push; `ship_ios.py` now does it itself.
- **chalkmap-v2** — INTERNAL; the owner's record there reads `INSTALLED`, so no assignment needed.

Validated: the verdict is a pure function, unit-tested on eight states including edu-rpg 56 as it
was (FAIL) and 55 as the owner installed it (PASS); live-checked PASS on edu-rpg 56 and chalkmap 174.

## Assign the beta test group (STANDARD — do this on EVERY push)
For a currently authorized TestFlight push, assigning the named beta group is
part of that same operation and does not need a second confirmation. Do not infer
push authority from this standing workflow. Once the exact build is `VALID`:
Capture the exact build number produced by this upload, confirm the same number
reaches `VALID`, then pass it explicitly:

```bash
python3 ~/.agents/skills/push-to-testflight/assign-beta-group.py "$BUILD_NUMBER" "Beta Testers"
```

Never use an implicit "latest" build: concurrent uploads can change which build
is latest. The script aborts unless an exact valid build number is supplied. An
external group assignment also submits that exact build for Apple Beta App
Review.
- Do NOT add other groups (e.g. "Internal Testers") unless the user names them — the harness classifier (correctly) blocks an unrequested group change on a live external system.
- This does NOT relax `feedback_no_auto_testflight_ship`: the *push* still needs the user's go-ahead; once authorized, the group-assignment is bundled in (no separate ask).

### ⚠️ NON-DEFERRABLE — the push is NOT done until the build is in the group (hardened 2026-07-02 after a miss)
Waiting for the build to reach `VALID` (~5–15 min) is **part of the push, not a follow-up.** Do NOT send a completion notification, write the handoff, or declare the push complete until: the build is `VALID` → `assign-beta-group.py` has run → you have **re-queried ASC to CONFIRM** the build appears in "Beta Testers."
- If the build is still `PROCESSING` when you'd otherwise wrap up: POLL ASC (`asc_status.py` or a targeted query) until `VALID`, then assign, then verify. NEVER punt it to "the morning" / a follow-up list.
- If you delegate the assignment to a subagent, VERIFY it actually ran (re-query group membership) before reporting done — do NOT trust a "poller set up, will assign once VALID" claim. (2026-07-02: two agents each set up a poller and returned without ever running the script → the build sat un-assigned.)
- NEVER skip because "the owner is an internal tester so they get it automatically" — the owner installs via the EXTERNAL "Beta Testers" group; the assignment is required.
- Origin: 2026-07-02 — build 100 shipped to TF overnight but the group was never assigned; the owner couldn't install it and had to add it manually. Memory `feedback_tf_assign_beta_group_standard`.

## Troubleshooting — the macOS-26 gotchas (each one cost a build iteration)
| Symptom | Root cause → Fix |
|---|---|
| fastlane dies `invalid byte sequence in US-ASCII`, real error hidden | locale not UTF-8 → `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` before fastlane |
| "team has no devices" / wants an iOS App **Development** profile | Expo baked `CODE_SIGN_IDENTITY[sdk=iphoneos*]="iPhone Developer"` → set it to `Apple Distribution` in `ios/chalkmapv2.xcodeproj/project.pbxproj`; use manual *distribution* signing |
| "conflicting provisioning settings… automatically signed but identity manually specified" | can't set `CODE_SIGN_IDENTITY` under `CODE_SIGN_STYLE=Automatic` → use `Manual` |
| `MapboxMaps does not support provisioning profiles` | a GLOBAL xcargs profile leaked onto framework Pods → never pass identity/profile as global xcargs; scope to the app target via `update_code_signing_settings(targets:["chalkmapv2"], build_configurations:["Release"])` |
| codesign `errSecInternalComponent` (after signing a few frameworks) | the key isn't authorized for codesign → dedicated `cmbuild.keychain` (known pw) + `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k <pw> <keychain>`; search that keychain FIRST (a duplicate cert in login keychain otherwise prompts) |
| upload rejected: "bundle version must be higher than N" | `CFBundleVersion` hardcoded in `ios/chalkmapv2/Info.plist` → set it to `$(CURRENT_PROJECT_VERSION)` so the build-number xcarg applies |

## Caveats
- ⚠️ **`expo prebuild` overwrites** `ios/chalkmapv2/Info.plist` (CFBundleVersion) and `project.pbxproj` (signing). After ANY prebuild, re-apply both — or move them into an Expo config plugin. If `ios/fastlane/` is wiped too, restore the Fastfile below.
- The dedicated keychain `cmbuild.keychain` password (`cmbuild-local-throwaway`) protects only a local build keychain — not a real secret.
- App ID `app.chalkmap.v2` already has Push + Associated Domains + IAP enabled — no Apple-account capability changes are needed.
- EAS is downgraded to free (cloud fallback only). Cloud equivalent, if ever needed away from the Mac: `eas build --platform ios --profile production --auto-submit --non-interactive` (costs a build slot; will fail on first-time capability/profile sync that `--non-interactive` won't do).

## Generalizing to another local iOS app
Copy `ios/fastlane/Fastfile`, swap `WORKSPACE`/`SCHEME`/`APP_ID`/`TEAM_ID`/`ASC_*`/paths and the `initial_build_number` floor, ensure `Info.plist` `CFBundleVersion = $(CURRENT_PROJECT_VERSION)`, and confirm the App ID has the capabilities its entitlements declare.

## Pointers
- Canonical Fastfile: `chalkmap-v2/ios/fastlane/Fastfile` (+ `Appfile`).
- Full debugging journey: `claude_brain/04-Learnings/learning-20260605-local-testflight-without-eas.md`.
- Memory: `feedback_eas_local_builds_only.md`.

## Recreating the Fastfile (if `ios/fastlane/Fastfile` is lost, e.g. after `expo prebuild`)
Full Ruby Fastfile + Appfile + Info.plist/pbxproj requirements: `references/Fastfile-recovery.md`.
