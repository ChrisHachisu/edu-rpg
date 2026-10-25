#!/usr/bin/env python3
"""Verify the integrity and path safety of this current-source terrain input bundle.

This checks byte inventory only. It does not execute a renderer, generate a world,
validate collision, or recover historical R8/R9 source authority.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / 'input-manifest.json'
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')

class VerificationError(Exception):
    pass

def checked_path(root: Path, rel: str) -> Path:
    if not isinstance(rel, str) or not rel:
        raise VerificationError('path must be a nonempty string')
    p = PurePosixPath(rel)
    if p.is_absolute() or any(part in ('', '.', '..') for part in p.parts):
        raise VerificationError(f'unsafe relative path: {rel!r}')
    candidate = root.joinpath(*p.parts)
    # Reject symlinks anywhere in the path, even if they resolve inside the bundle.
    cursor = root
    for part in p.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise VerificationError(f'symlink path is not allowed: {rel!r}')
    try:
        candidate.resolve(strict=True).relative_to(root.resolve(strict=True))
    except FileNotFoundError:
        raise VerificationError(f'missing file: {rel}')
    except ValueError:
        raise VerificationError(f'path escapes bundle root: {rel!r}')
    if not candidate.is_file():
        raise VerificationError(f'not a regular file: {rel}')
    return candidate

def verify(root: Path, manifest_path: Path, check_tool: bool = True) -> dict:
    try:
        manifest = json.loads(manifest_path.read_text())
    except Exception as exc:
        raise VerificationError(f'cannot read manifest: {exc}')
    if manifest.get('schema') != 'edu-rpg-act1-current-terrain-profile-inputs-v1':
        raise VerificationError('unexpected manifest schema')
    rows = manifest.get('files')
    if not isinstance(rows, list) or not rows:
        raise VerificationError('manifest files must be a nonempty list')
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            raise VerificationError('file entry must be an object')
        rel = row.get('path')
        if rel in seen:
            raise VerificationError(f'duplicate path: {rel!r}')
        seen.add(rel)
        expected_hash = row.get('sha256')
        if not isinstance(expected_hash, str) or not SHA256_RE.fullmatch(expected_hash):
            raise VerificationError(f'invalid sha256 for {rel!r}')
        expected_bytes = row.get('bytes')
        if not isinstance(expected_bytes, int) or expected_bytes < 0:
            raise VerificationError(f'invalid byte count for {rel!r}')
        path = checked_path(root, rel)
        raw = path.read_bytes()
        actual_hash = hashlib.sha256(raw).hexdigest()
        if len(raw) != expected_bytes:
            raise VerificationError(f'byte count mismatch: {rel}')
        if actual_hash != expected_hash:
            raise VerificationError(f'sha256 mismatch: {rel}')
    tool = manifest.get('verifier')
    if check_tool and tool:
        tool_path = checked_path(root, tool.get('path'))
        if hashlib.sha256(tool_path.read_bytes()).hexdigest() != tool.get('sha256'):
            raise VerificationError('verifier sha256 mismatch')
    adapter = manifest.get('portableGroundCrop',{}).get('adapter')
    if adapter:
        adapter_hash = manifest.get('portableGroundCrop',{}).get('adapterSha256')
        adapter_path = checked_path(root, adapter)
        if hashlib.sha256(adapter_path.read_bytes()).hexdigest() != adapter_hash:
            raise VerificationError('portable adapter sha256 mismatch')
    return {'integrity':'PASS','filesVerified':len(rows),'bytesVerified':sum(r['bytes'] for r in rows),
            'profileId':manifest.get('profileId'),
            'wholeWorldGenerationRecipe':manifest.get('scope',{}).get('fullWorldGenerationRecipe'),
            'historicalRecoveryClaim':False,
            'routeGuardBinding':json.loads((root/'input-manifest.json').read_text()).get('routeGuardBinding',{}).get('status','not-recorded'),
            'fullWorldGeneration':'NOT_ESTABLISHED'}

def self_test() -> dict:
    outcomes = {}
    with tempfile.TemporaryDirectory(prefix='terrain-profile-verifier-', dir=str(HERE)) as td:
        root = Path(td)
        payload = root / 'a.txt'
        payload.write_text('approved input\n')
        entry = {'path':'a.txt','bytes':payload.stat().st_size,'sha256':hashlib.sha256(payload.read_bytes()).hexdigest()}
        mf = root / 'input-manifest.json'
        def put(row):
            mf.write_text(json.dumps({'schema':'edu-rpg-act1-current-terrain-profile-inputs-v1','profileId':'self-test','files':[row]}))
        put(entry); verify(root,mf,check_tool=False); outcomes['valid_passes']=True
        payload.unlink()
        try: verify(root,mf,check_tool=False)
        except VerificationError as e: outcomes['missing_fails']='missing file' in str(e)
        if not outcomes['missing_fails']: raise VerificationError('self-test missing-file case did not fail correctly')
        payload.write_text('approved input\n'); put(entry)
        payload.write_text('corrupted input\n')
        try: verify(root,mf,check_tool=False)
        except VerificationError as e: outcomes['corruption_fails']='mismatch' in str(e)
        if not outcomes['corruption_fails']: raise VerificationError('self-test corruption case did not fail correctly')
        unsafe=dict(entry,path='../outside.txt'); put(unsafe)
        try: verify(root,mf,check_tool=False)
        except VerificationError as e: outcomes['unsafe_path_fails']='unsafe relative path' in str(e)
        if not outcomes['unsafe_path_fails']: raise VerificationError('self-test unsafe-path case did not fail correctly')
    return {'selfTest':'PASS',**outcomes}

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--self-test',action='store_true',help='exercise valid, missing, corrupt, and unsafe-path cases in a temporary directory inside the owned W output tree')
    args=parser.parse_args()
    try:
        if args.self_test:
            print(json.dumps(self_test(),sort_keys=True)); return 0
        result=verify(HERE,MANIFEST)
        print(json.dumps(result,sort_keys=True)); return 0
    except VerificationError as exc:
        print(f'FAIL: {exc}',file=sys.stderr); return 1

if __name__=='__main__':
    raise SystemExit(main())
