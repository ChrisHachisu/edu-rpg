# Native release candidate identity

This gate links simulator QA and a later App Store device IPA to one frozen candidate. The Simulator `.app` and device IPA are different platform products; the IPA is never installed on a simulator. The link is the source/native input inventory, selected terrain profile, build number, public runtime payload digest, and the exact Simulator `.app` digest named by two QA receipts.

The identity gate is a provenance gate. It does not prove a physical-device run, TestFlight processing, or owner approval. Missing profile outputs, missing QA, or missing evidence fail closed.

## Candidate preparation and simulator evidence

The forward profile has an explicit, nonshippable QA-preparation stage. It checks the frozen static descriptor and payload closure, then reports six named dynamic checks as pending. Historical remains the default. For the approved forward QA candidate, assemble with the dedicated command:

```sh
sh scripts/build-qa-preparation.sh
```

This prints `QA_PREPARATION_PASS releaseEligible=false` only after the exact reviewed descriptor, static closure, and source/dist/iOS payload checks pass. It is not a shipping gate. Do not create a descriptor or pin merely to make preparation pass.

Obtain the intended TestFlight build number through the existing authorized release process, then build one Release Simulator product with that version/build identity and the already-assembled public payload:

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ".ios-build/release-$BUILD_NUMBER" \
  MARKETING_VERSION=1.0 CURRENT_PROJECT_VERSION="$BUILD_NUMBER" clean build
```

Create a pending core manifest. It is not eligible for upload while `qaReceipts` is empty:

```sh
python3 scripts/verify_edu_rpg_release_identity.py prepare \
  --root "$PWD" --terrain-profile act1-forward-20261007-v1 --qa-preparation \
  --build-number "$BUILD_NUMBER" \
  --simulator-app ".ios-build/release-$BUILD_NUMBER/Build/Products/Release-iphonesimulator/App.app" \
  --output ios/build/release/identity.json
```

Install/test that exact `.app` on the preserved canonical phone and tablet simulators. The helper verifies the app bytes, bundle ID, build number, profile, native inputs, and current runtime payload before installing it; `--preserve-save` avoids reseeding:

```sh
./scripts/run-ios.sh --terrain-profile act1-forward-20261007-v1 --qa-preparation \
  --udid 1D7EAC42-3F69-4DAD-918C-518C4C98EAA0 \
  --candidate-app ".ios-build/release-$BUILD_NUMBER/Build/Products/Release-iphonesimulator/App.app" \
  --release-identity ios/build/release/identity.json \
  --identity-sha256 "$PENDING_IDENTITY_SHA256" --preserve-save
```

The QA-preparation install path checks that identity and the exact Simulator app without resyncing or changing the frozen candidate payload. It cannot consume release evidence or enter a ship/upload lane. After phone and tablet testing, save the completed evidence envelope outside the inventoried source tree and validate its shape with `design/terrain-current-profile-20261007/forward-release-evidence.schema.json`; pin its SHA separately. The envelope binds the unchanged preparation descriptor, inventories, candidate core, build, simulator app, both sealed receipts, evidence hashes, and named independent review record.

After each complete simulator pass, record a separate JSON receipt conforming to `scripts/edu-rpg-simulator-qa-receipt.schema.json`. The phone receipt must name UDID `1D7EAC42-3F69-4DAD-918C-518C4C98EAA0`, model `iPhone 16`, runtime `18.6`; the tablet must name UDID `0B99C2F1-2C99-42DE-9301-651C7C642BE0`, model `iPad mini (A17 Pro)`, runtime `26.5`. Each receipt binds the pending `candidateId`, Simulator app SHA, build number, reviewer, timestamp, six required regression groups, and hashed screenshot/video evidence. Receipt and evidence paths must be relative to the checkout and may not traverse outside it or through symlinks.

Use the pending core values when drafting each receipt:

```sh
python3 - <<'PY'
import json
v=json.load(open('ios/build/release/identity.json'))
print('candidateId=' + v['candidateId'])
print('simulatorAppSha256=' + v['core']['simulatorAppSha256'])
PY
```

The `checks` object has these exact keys, each `true` only after that area was exercised: `terrainContactBothHeroes`, `cliffGrassRoutes`, `caveDoorBridgeRoutes`, `chunkStreamingAndResume`, `savePreservationAndInterruption`, and `battleFleeBossReturn`. Evidence entries use `{ "path": "ios/build/release/evidence/phone.png", "sha256": "<actual-file-sha256>", "checksCovered": ["..."] }`; collectively, their `checksCovered` values must name every required group. Do not copy placeholder values into a passing receipt.

Seal only after both complete receipts and their evidence exist:

```sh
python3 scripts/verify_edu_rpg_release_identity.py seal \
  --root "$PWD" --identity ios/build/release/identity.json \
  --phone-receipt ios/build/release/phone.json \
  --tablet-receipt ios/build/release/tablet.json
shasum -a 256 ios/build/release/identity.json
```

The SHA printed by `shasum` is the external identity pin. Preserve that value with the review record; do not recompute and silently accept a changed manifest.

## Device IPA and existing release lane

Run the existing local lane only after release evidence is complete. Forward shipping requires the explicit profile, sealed identity, and externally SHA-pinned release evidence:

```sh
./scripts/ship-ios.sh --terrain-profile act1-forward-20261007-v1 \
  --release-identity ios/build/release/identity.json \
  --identity-sha256 "$REVIEWED_IDENTITY_SHA256" \
  --terrain-evidence "$REVIEWED_TERRAIN_EVIDENCE" \
  --terrain-evidence-sha256 "$REVIEWED_TERRAIN_EVIDENCE_SHA256"
```

The lane checks the identity before signing and again against the TestFlight next build number, exports the device IPA, then checks its `iPhoneOS` platform, bundle/build/version, current native source inputs, and embedded public runtime payload. It also safely extracts the single app bundle to a temporary directory and requires macOS `codesign`, `security`, and `otool`: deep strict code-signature verification; the signed bundle identifier, Team ID, and leaf certificate SHA-1 from the Fastlane-selected identity; the embedded, unexpired App Store profile name, team, app identifier, and certificate; and an iOS-device Mach-O platform in the app executable. Missing tools, profile, signature, or platform evidence fail closed. `project.pbxproj` remains part of the identity: the verifier allows only explicit signing-key assignment changes made by Fastlane, and rejects other project changes. The lane rechecks the IPA and its SHA before and after the existing upload action.

These checks prove the exported app is signed by the selected distribution identity and that it retains the pinned source/native-input and public-payload provenance checks. A valid signature alone does not prove the compiled native executable came from those source inputs. This gate does not prove physical-device behavior of the IPA.

The default remains `historical`. Unknown profile names fail in the wrappers and existing profile gates. The verifier and focused tests are read-only apart from `prepare`/`seal` writing the requested identity file; they do not build, sign, install, upload, or alter app gameplay code.

## Receipt limitations

The verifier checks receipt structure, exact simulator IDs, candidate binding, required regression fields, evidence existence, and evidence hashes. It cannot independently observe the human interaction or certify that the named reviewer performed it. Receipts must be completed by the independent reviewer after actually testing the identified Simulator `.app`; a JSON `pass` without the matching evidence and review does not satisfy the delivery gate. Simulator evidence does not establish physical-device behavior.
