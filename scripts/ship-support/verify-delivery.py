#!/usr/bin/env python3
"""Can a tester ACTUALLY install this build? Neither `processingState` nor a tester email answers it.

WHY THIS EXISTS, AND WHY IT IS ON ITS SECOND DESIGN.

2026-08-22, first failure: an edu-rpg build was reported to the owner as shipped and installable on
the strength of `processingState: VALID`. VALID describes the BINARY, not delivery. Three builds
were reported that way. Owner: *"56 is not downloadable. this is a pattern now so please fix your
process."*

2026-08-22, second failure -- mine, in the fix. The first version of this script blamed the owner's
internal tester record reading `state: INVITED`. **That was wrong**, and the owner said so: *"i have
been able to test as the internal tester up to 55."* Diffing 55 against 56 showed one differing
field in the entire build object:

    build 55  externalBuildState = IN_BETA_TESTING          <- installable
    build 56  externalBuildState = READY_FOR_BETA_SUBMISSION <- never submitted to the group

The owner receives edu-rpg builds through the EXTERNAL "Beta Testers" group, whose members read
`INSTALLED`. The API returns `null` for external testers' emails, so matching delivery to a named
address cannot work and made the first version confidently wrong in a new way.

THE INVARIANT THIS VERSION CHECKS, which is the one that survives both failures:

    a build is deliverable when SOME CHANNEL is live AND that channel has a tester who can install

  * a channel is live when its buildBetaDetail state is IN_BETA_TESTING (internal, or external)
  * a tester can install when their state is INSTALLED or ACCEPTED -- never INVITED
  * the two must line up: internal testers ride the internal channel, external the external one

That is deliberately not "is the owner listed": it is "can anyone on a live channel get it", which
is observable through the API for both group types and is exactly what differed between 55 and 56.

It also PRINTS the previous build's channel states, because the cheapest way to see a regression is
that the new build reaches a state the last good one did not.
"""
from __future__ import annotations
import os
import argparse, json, sys, time, urllib.error, urllib.request

import jwt

KEY_ID = "52937L4S9H"
ISSUER = "006a572e-afa8-464e-8f46-ce19bd161a9f"
P8 = os.path.expanduser("~/Documents/claudecode/chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8")
APPS = {"edu-rpg": "6785524760", "chalkmap-v2": "6767085401"}
CAN_INSTALL = {"INSTALLED", "ACCEPTED"}
LIVE = "IN_BETA_TESTING"


def adjudicate(processing, expired, compliance, internal_state, external_state, groups):
    """The whole verdict, as a pure function so it can be tested on states ASC is not showing today.

    `groups` is [(name, is_internal, [tester_state, ...]), ...]. Returns (ok, reasons, channels).
    """
    reasons, channels = [], []
    if processing != "VALID":
        reasons.append(f"processingState is {processing}, not VALID")
    if expired:
        reasons.append("the build is EXPIRED")
    if compliance is None:
        reasons.append("export compliance is unanswered -- ASC holds the build until it is")
    for name, internal, states in groups:
        live = (internal_state if internal else external_state) == LIVE
        installers = [s for s in states if s in CAN_INSTALL]
        channels.append((name, internal, live, len(installers), len(states)))
        if live and installers:
            return (not reasons), reasons, channels
    # nothing delivered -- say WHICH half is missing, because the remedies are opposite
    any_live = any(c[2] for c in channels)
    any_inst = any(c[3] for c in channels)
    if not any_live:
        reasons.append(
            f"no channel is live (internal={internal_state}, external={external_state}). "
            f"READY_FOR_BETA_SUBMISSION means the build was never assigned to the external group -- "
            f"run assign-beta-group.py --app <app> <build> 'Beta Testers'")
    elif not any_inst:
        reasons.append("a channel is live but no tester on it is INSTALLED/ACCEPTED "
                       "(an INVITED tester must accept the invitation; there is no API for that)")
    else:
        live_names = [c[0] for c in channels if c[2]]
        inst_names = [c[0] for c in channels if c[3]]
        reasons.append(
            f"the live channel and the installable testers are on DIFFERENT groups: "
            f"{live_names} is live but nobody on it can install, while {inst_names} has installable "
            f"testers on a channel that is not live. THIS IS THE edu-rpg BUILD 56 CASE -- the fix is "
            f"assign-beta-group.py --app <app> <build> '{inst_names[0] if inst_names else 'Beta Testers'}'")
    return False, reasons, channels


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--build")
    a = ap.parse_args()
    app_id = APPS.get(a.app, a.app)
    tok = jwt.encode({"iss": ISSUER, "iat": int(time.time()), "exp": int(time.time()) + 600,
                      "aud": "appstoreconnect-v1"}, open(P8).read(), algorithm="ES256",
                     headers={"kid": KEY_ID, "typ": "JWT"})

    def api(path):
        req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path,
                                     headers={"Authorization": f"Bearer {tok}"})
        try:
            return json.load(urllib.request.urlopen(req)), None
        except urllib.error.HTTPError as e:
            return None, f"HTTP {e.code}: {e.read().decode()[:250]}"

    d, err = api(f"/v1/builds?filter[app]={app_id}&sort=-uploadedDate&limit=10"
                 "&fields[builds]=version,uploadedDate,processingState,expired,usesNonExemptEncryption")
    if err:
        print(f"VERIFY DELIVERY: cannot reach ASC -- {err}")
        return 2
    all_builds = d.get("data", [])
    picked = [b for b in all_builds if b["attributes"].get("version") == str(a.build)] if a.build \
        else all_builds[:1]
    if not picked:
        print(f"VERIFY DELIVERY FAIL: build {a.build} is not in ASC yet -- processing lags upload "
              f"by a few minutes; re-run.")
        return 1
    b = picked[0]
    at = b["attributes"]

    def states_for(build):
        bd, e = api(f"/v1/builds/{build['id']}/buildBetaDetail"
                    "?fields[buildBetaDetails]=internalBuildState,externalBuildState")
        x = (bd or {}).get("data", {}).get("attributes", {}) if not e else {}
        return x.get("internalBuildState"), x.get("externalBuildState")

    ibs, ebs = states_for(b)
    g, _ = api(f"/v1/betaGroups?filter[app]={app_id}"
               "&fields[betaGroups]=name,isInternalGroup&limit=20")
    groups = []
    for grp in (g or {}).get("data", []):
        t, terr = api(f"/v1/betaGroups/{grp['id']}/betaTesters?fields[betaTesters]=email,state&limit=50")
        states = [r["attributes"].get("state") for r in (t or {}).get("data", [])] if not terr else []
        groups.append((grp["attributes"]["name"], grp["attributes"].get("isInternalGroup"), states))

    ok, reasons, channels = adjudicate(at.get("processingState"), at.get("expired"),
                                       at.get("usesNonExemptEncryption"), ibs, ebs, groups)

    print(f"=== {a.app} build {at.get('version')}  (uploaded {at.get('uploadedDate')})")
    print(f"  processing {at.get('processingState')}  expired={at.get('expired')}  "
          f"compliance={'answered' if at.get('usesNonExemptEncryption') is not None else 'MISSING'}")
    print(f"  internalBuildState {ibs}    externalBuildState {ebs}")
    for name, internal, live, inst, total in channels:
        print(f"    {'OK ' if live and inst else 'NO '} {name:18s} "
              f"{'internal' if internal else 'external'}  channel={'LIVE' if live else 'not live'}  "
              f"testers able to install {inst}/{total}")
    prev = [x for x in all_builds if x["id"] != b["id"]][:1]
    if prev:
        pi, pe = states_for(prev[0])
        print(f"  previous build {prev[0]['attributes']['version']}: internal={pi} external={pe}"
              + ("   <- this build does NOT match it" if (pi, pe) != (ibs, ebs) else "   (same)"))
    print()
    if not ok:
        print(f"VERIFY DELIVERY FAIL: build {at.get('version')} is NOT installable")
        for r in reasons:
            print(f"  - {r}")
        return 1
    print(f"VERIFY DELIVERY PASS: build {at.get('version')} is installable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
