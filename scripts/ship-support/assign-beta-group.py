#!/usr/bin/env python3
"""Assign a TestFlight beta group to a build on App Store Connect — the STANDARD
step after an authorized `fastlane beta` push. Requires the exact uploaded build
number and defaults only the group name to "Beta Testers". Reuses check-build.py's ASC key.

Usage: assign-beta-group.py <version> [group-name]
  version     exact build number/version from the authorized upload (required)
  group-name  beta group (default: "Beta Testers"; case-insensitive)

External group -> also submits the build for Apple Beta App Review. Internal group -> instantly testable.
Needs PyJWT + cryptography (already installed).
"""
import os
import jwt, time, json, urllib.request, urllib.error, sys

if any(arg in ("-h", "--help") for arg in sys.argv[1:]):
    print(__doc__.strip())
    sys.exit(0)

KEY_ID = "52937L4S9H"
ISSUER = "006a572e-afa8-464e-8f46-ce19bd161a9f"
P8 = os.path.expanduser("~/Documents/claudecode/chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8")
# APP_ID WAS HARDCODED TO CHALKMAP, so running this for any other app silently assigned the group
# on the WRONG APP -- or, more usually, was never run at all because it looked chalkmap-specific.
# That is what happened to edu-rpg: its builds went unassigned, and the owner (who receives builds
# through the external group, not the unaccepted internal invite) could not download build 56.
# Same "the first instance became the default" trap as three other scripts found on 2026-08-22.
APPS = {"edu-rpg": "6785524760", "chalkmap-v2": "6767085401"}
APP_ID = APPS["chalkmap-v2"]
_args = [a for a in sys.argv[1:]]
if "--app" in _args:
    i = _args.index("--app")
    APP_ID = APPS.get(_args[i + 1], _args[i + 1])
    del _args[i:i + 2]
sys.argv = [sys.argv[0]] + _args
ARG_VERSION = (sys.argv[1] if len(sys.argv) > 1 and
               sys.argv[1] not in ("-", "latest") and
               not sys.argv[1].startswith("-") else None)
TARGET_GROUP = sys.argv[2] if len(sys.argv) > 2 else "Beta Testers"
if not ARG_VERSION:
    print("ERROR: exact build number is required; implicit latest is unsafe")
    sys.exit(2)

tok = jwt.encode({"iss": ISSUER, "iat": int(time.time()), "exp": int(time.time()) + 600, "aud": "appstoreconnect-v1"},
                 open(P8).read(), algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})
BASE = "https://api.appstoreconnect.apple.com"

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(r); raw = resp.read().decode()
        return (json.loads(raw) if raw.strip() else {}), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:400]}"

# 1) find the target group
groups, err = req("GET", f"/v1/betaGroups?filter[app]={APP_ID}&limit=200&fields[betaGroups]=name,isInternalGroup")
if err: print("ERR groups:", err); sys.exit(1)
grp = next((g for g in groups["data"] if g["attributes"]["name"].strip().lower() == TARGET_GROUP.strip().lower()), None)
if not grp:
    print("AVAILABLE GROUPS:", [g["attributes"]["name"] for g in groups["data"]])
    print(f"ERROR: group '{TARGET_GROUP}' not found"); sys.exit(2)
gid = grp["id"]; internal = grp["attributes"]["isInternalGroup"]

# 2) find the exact authorized build
q = f"/v1/builds?filter[app]={APP_ID}&filter[version]={ARG_VERSION}&limit=1&fields[builds]=version,processingState"
builds, err = req("GET", q)
if err: print("ERR builds:", err); sys.exit(3)
if not builds["data"]: print("ERROR: build not found on ASC yet"); sys.exit(4)
bld = builds["data"][0]; bid = bld["id"]; ver = bld["attributes"]["version"]; pstate = bld["attributes"]["processingState"]
if ver != ARG_VERSION:
    print(f"ERROR: ASC returned build {ver}, expected exact build {ARG_VERSION}")
    sys.exit(6)
print(f"GROUP '{TARGET_GROUP}' id={gid} internal={internal}")
print(f"BUILD {ver} id={bid} processingState={pstate}")
if pstate != "VALID":
    print(f"ERROR: build {ver} is {pstate}, not VALID; wait and retry")
    sys.exit(7)

# 3) add the build to the group (409 = already in group -> success)
res, err = req("POST", f"/v1/betaGroups/{gid}/relationships/builds", {"data": [{"type": "builds", "id": bid}]})
if err and "409" not in err: print("ERR add-to-group:", err); sys.exit(5)
print(f"ADDED build {ver} to '{TARGET_GROUP}'" + (" (already present)" if err and "409" in err else ""))

# 4) external group -> needs Apple Beta App Review before external testers can install
if not internal:
    res, err = req("POST", "/v1/betaAppReviewSubmissions",
                   {"data": {"type": "betaAppReviewSubmissions", "relationships": {"build": {"data": {"type": "builds", "id": bid}}}}})
    print("SUBMITTED for Beta App Review" if not err else f"NOTE beta-review submission: {err}")
    print(f"RESULT: '{TARGET_GROUP}' EXTERNAL — testable after Apple beta-review approval")
else:
    print(f"RESULT: '{TARGET_GROUP}' INTERNAL — build {ver} available to testers NOW")
