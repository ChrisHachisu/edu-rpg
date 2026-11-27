# Mac runbook: release candidate (no upload anywhere in this list)

Written on Linux. Nothing below was run on a Mac: every pass line is the expected output, so a different result is a finding. Never run `npm run build`, `npx vite`, `npm run dev`, `npm run repin`. Upload (`beta_unsealed`) only on the owner's explicit go; build 100 is not allowed before Tue 2026-12-01.

`<DIGEST>` = the whole-tree digest the lead recorded from the final cloud run of `sh scripts/build-release.sh --testflight --no-swap` (last line `RELEASE PAYLOAD OK <DIGEST>`). `<COMMIT>` = the lead-integrated head the digest was computed on. Any later commit changes the digest by design.

## 1. Preflight
```
cd ~/.codex/workspaces/edu-rpg-forward-20261007   # or a fresh clone; UNVERIFIED that it still exists
git fetch && git switch -c rel/b100 <COMMIT> && git status --short
node -v; python3 -V; xcodebuild -version; pod --version; fastlane --version; which rsync shasum
ls ~/Documents/claudecode/chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8
ls ios/App/App/PrivacyInfo.xcprivacy scripts/build-release.sh scripts/tree-digest.sh
```
Pass: status prints nothing, every tool prints a version, key file and the three new files exist, Xcode meets Apple's current upload minimum.
`ls node_modules/@capacitor/ios` must exist; if not, `npm ci` (never a build script).

## 2. Reproduce the old stop (diagnosis only)
```
python3 scripts/runtime_baseline.py verify-act1 --input ios/App/App/public --allow-capacitor-glue
```
Pass (meaning the diagnosis is confirmed): exit 1 with `approved Act 1 paint manifest identity changed`. A different message is a new finding; report it, carry on (verify-act1 is no longer in the release path).

## 3. Build the payload with the cloud digest
```
sh scripts/build-release.sh --testflight --ios --expect-digest <DIGEST>
sh scripts/build-release.sh --testflight --ios --expect-digest <DIGEST>     # second run, same result
```
First make sure `ios/App/App/public` exists (`npx --no-install cap copy ios`; it regenerates `capacitor.config.json` and `config.xml`, both git-ignored, never commit them).
Pass: the last line of both runs is `RELEASE PAYLOAD OK <DIGEST>`, exit 0, and `RELEASE BUILD FAILED` never appears. If the digest differs, stop: the script names the mismatch; compare `sh scripts/tree-digest.sh dist` file lists with the cloud's and take it to the lead. Do not pass a Mac-measured digest as `--expect-digest` without the lead's approval.
Note `--testflight` is the mode for the build that still has the testers menu (flag true). The store build is `--store` (needs the flag false and jump-points.json removed first; see the lead's M1 decision).
Also once: `diff -rq <build-99 ios/App/App/public copy> dist` to see what changed since build 99 (UNVERIFIED whether the hand-assembled payload equals this one; expect only files changed since 783b57f).

## 4. Negative check on the Mac (30 s)
```
sh scripts/build-release.sh --testflight --no-swap --inject-test-stray; echo "exit $?"
sh scripts/build-release.sh --store --no-swap; echo "exit $?"
```
Pass: both print one `RELEASE BUILD FAILED:` line (closure `unlisted acts-hifi/stray-test-file.txt`; and `--store needs window.__QOK_TESTERS__ = false`), exit 1, and `dist/` is unchanged (`sh scripts/tree-digest.sh dist` still `<DIGEST>`).

## 5. Add the privacy manifest to the App target
Xcode: open `ios/App/App.xcworkspace`, in the navigator right-click the `App` group (the one holding `Info.plist`, `AppDelegate.swift`), Add Files to "App"..., choose `ios/App/App/PrivacyInfo.xcprivacy`, tick target `App` only, "Copy items if needed" off, Add. Check target App > Build Phases > Copy Bundle Resources lists `PrivacyInfo.xcprivacy`. Save, then commit the changed `ios/App/App.xcodeproj/project.pbxproj` and the manifest on rel/b100 (the Mac session commits, nothing is pushed).
Pass: `git diff --stat` shows `project.pbxproj` plus the new file, nothing else.
Later (item 8): Product > Archive > Organizer > Generate Privacy Report. Pass: no required-reason API listed without a reason, no tracking domains. If it lists an API (for example UserDefaults from Capacitor) as missing a reason, add that category to `NSPrivacyAccessedAPITypes` with the reason Apple names; the file ships an empty list because it could not be checked here (UNVERIFIED which Capacitor 7.6.7 pod bundles already declare).

## 6. Simulator pass of the exact Release app, iPhone and iPad
```
BN=100
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ".ios-build/rc-$BN" \
  MARKETING_VERSION=1.0 CURRENT_PROJECT_VERSION="$BN" clean build
APP=".ios-build/rc-$BN/Build/Products/Release-iphonesimulator/App.app"
for U in 1D7EAC42-3F69-4DAD-918C-518C4C98EAA0 0B99C2F1-2C99-42DE-9301-651C7C642BE0; do
  xcrun simctl boot $U 2>/dev/null; xcrun simctl install $U "$APP"; xcrun simctl launch $U app.chalkmap.questofknowledge
done
```
Pass: `** BUILD SUCCEEDED **`; both devices launch the title screen. Then play: new game, one town, one fight, quit and relaunch (Continue resumes), settings sound toggle, rotate iPad, check safe areas, no black bars; watch `xcrun simctl spawn <UDID> log stream --predicate 'process == "App"'` for no JS error. Take the store screenshots from this same app. Compare simulator payload: `sh scripts/tree-digest.sh "$APP/public"` differs only by the Capacitor glue files (cordova.js, cordova_plugins.js, config.xml, capacitor.config.json).

## 7. Build the release candidate IPA (does not upload)
```
cd ios/App && fastlane release_candidate && cd ../..
cat ios/build/rc.sha256
```
Pass: `Release candidate built (build N), NOT uploaded`, and `ios/build/rc.sha256` holds `<sha256>  questofknowledge.ipa`; the sha also equals `shasum -a 256 ios/build/questofknowledge.ipa`. No `upload_to_testflight` line may appear in the output.

## 8. The four IPA checks
```
IPA=ios/build/questofknowledge.ipa
unzip -p $IPA 'Payload/App.app/public/ui-overhaul.js' | grep -c '__QOK_TESTERS__ = false'
unzip -l $IPA | grep -c jump-points
unzip -l $IPA | grep -c PrivacyInfo
rm -rf /tmp/rc-ipa && mkdir /tmp/rc-ipa && unzip -q $IPA -d /tmp/rc-ipa && codesign -dv --verbose=2 /tmp/rc-ipa/Payload/App.app 2>&1 | grep TeamIdentifier
```
Pass: 1; 0; at least 1; `TeamIdentifier=M969PWP3PU`.
Note: if this candidate was built with `--testflight` the first check prints 0 and the second prints 1, by design: that is a TestFlight payload, not a store payload. A store candidate is rebuilt with `--store` (step 3) and must give 1 and 0.
Extra: `unzip -p $IPA 'Payload/App.app/public/assets/index-BhoGQRaA.js' | shasum -a 256` equals `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`.

## 9. Record
Commit on rel/b100: privacy manifest, project.pbxproj, the digest in the message. Hand the lead the digest, `rc.sha256`, the four check outputs and the simulator notes. STOP: no `fastlane beta_unsealed`, no App Store Connect action, no push without the owner's go.

## Added 2026-11-27 14:20 JST: art source files for the cloud (do this FIRST, it is light)
The cloud needs about 18 source images that exist only on this Mac, to re-export the Acts 2 to 5 world maps with repaired cliff edges, shores and borders (plan: day4/art/OVERWORLD-PLAN.md, "Needed from the Mac").
From ~/Documents/claudecode/acts2-5-codex-gen/:
1. out/kit-act{2,3,4,5}-cliffs/ : the try1 sheet of each (1254x1254, magenta background; may sit in work-try1/).
2. out/kit-act3-palms/ try1 and out/kit-act5-deadtrees/ try1.
3. entrances/out/<job>/<job>-try<N>.png for the 12 picks listed in ENTRANCE-PICKS.json (copy on the mount: edu-rpg/acts-integration/trackA/ENTRANCE-PICKS.json; if the mount is not reachable from the Mac, the lead passes the list in the session instructions).
Put them on a new branch `art-sources-2026-11-27` of the repo under design/acts2-5-codex-src/ (same relative paths), commit and push that branch only (never main, never autoloop-wip from the Mac). The cloud pulls them from there. A direct folder request from the cloud was refused on 2026-11-27, so this branch is the route.

## Added 2026-11-27: first art batches (after the build and simulator steps)
Queue: day4/art/ART-QUEUE.md. Tonight: A1 (three cut enemy sprites), A2 (nine town map icons), A3 (Demon King field sprite), each as its own fresh worker task per docs/AGENT-WORKFLOW.md section 4, launched with nohup + caffeinate. Outputs stay in ~/Documents/claudecode/acts2-5-codex-gen/day4/<family>/ and are pushed on the same art branch for review in the cloud. Nothing is installed into the game on the Mac.
