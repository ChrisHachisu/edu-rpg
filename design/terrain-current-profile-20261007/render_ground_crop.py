#!/usr/bin/env python3
"""Portable bounded ground-only crop runner for the new current terrain profile.

Loads the preserved R4 renderer bytes and exact R4 config/atlases from this bundle,
relocates only the R4 manifest's project-relative semantic authority under
portable-root, and blocks asset reads outside this bundle and the Python runtime.
This does not render forest/cliff objects or claim whole-world reproduction.
"""
from __future__ import annotations
import argparse
import builtins
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import sysconfig

import numpy as np
from PIL import Image

BUNDLE=Path(__file__).resolve().parent
PORTABLE_ROOT=BUNDLE/'portable-root'
R4_MANIFEST=PORTABLE_ROOT/'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v4/act1-painted-overworld-r4/runtime/manifest.json'
R26_MANIFEST=PORTABLE_ROOT/'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/runtime/manifest.json'
R4_SOURCE=BUNDLE/'r4-source/scripts/render_material_map_r4.py'
R4_CONFIG=BUNDLE/'r4-source/paint-source-r4-v5.json'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def under(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False)); return True
    except ValueError:
        return False


def install_asset_access_guard():
    """Deny non-bundle file opens, except Python's installed runtime modules."""
    runtime_roots={Path(sys.prefix).resolve(),Path(sys.base_prefix).resolve()}
    for key in ('stdlib','platstdlib','purelib','platlib'):
        value=sysconfig.get_paths().get(key)
        if value: runtime_roots.add(Path(value).resolve())
    reads=[]
    original_open=builtins.open
    original_io_open=io.open
    def check(file,mode='r'):
        if isinstance(file,(str,bytes,os.PathLike)):
            path=Path(os.fsdecode(file)).resolve(strict=False)
            writing=any(ch in str(mode) for ch in ('w','a','x','+'))
            if under(path,BUNDLE):
                if not writing: reads.append(str(path))
                return
            if not writing and any(under(path,r) for r in runtime_roots):
                return
            raise PermissionError(f'asset access outside relocated bundle denied: {path}')
        # Integer file descriptors are not path-based asset reads.
    def guarded_open(file,*args,**kwargs):
        mode=args[0] if args else kwargs.get('mode','r'); check(file,mode)
        return original_open(file,*args,**kwargs)
    def guarded_io_open(file,*args,**kwargs):
        mode=args[0] if args else kwargs.get('mode','r'); check(file,mode)
        return original_io_open(file,*args,**kwargs)
    builtins.open=guarded_open
    io.open=guarded_io_open
    original_image_open=Image.open
    def guarded_image_open(fp,*args,**kwargs):
        check(fp,'r')
        return original_image_open(fp,*args,**kwargs)
    Image.open=guarded_image_open
    return reads


def load_renderer():
    # The unchanged source locates a checkout by looking for scripts/runtime_baseline.py.
    # Supply a temporary marker only for import-time discovery, then remove it and explicitly
    # set every asset root to this portable bundle. The original renderer bytes are untouched.
    scripts=R4_SOURCE.parent
    marker=scripts/'runtime_baseline.py'
    if marker.exists(): raise RuntimeError('unexpected renderer-root marker already exists')
    marker.write_text('# Temporary import locator for the portable terrain bundle; not a validator.\n')
    try:
        spec=importlib.util.spec_from_file_location('bundle_r4_renderer',R4_SOURCE)
        if spec is None or spec.loader is None: raise RuntimeError('cannot load bundled R4 renderer')
        module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    finally:
        marker.unlink(missing_ok=True)
    module.ROOT=str(PORTABLE_ROOT)
    module.ACT1_R26_MANIFEST=str(R26_MANIFEST)
    return module


def render(out: Path, window=(1568,208,320,256), ppc=32):
    for path in (R4_MANIFEST,R26_MANIFEST,R4_CONFIG,R4_SOURCE):
        if not path.is_file(): raise FileNotFoundError(f'missing bundled input: {path.relative_to(BUNDLE)}')
    # Every named relocated source stays within the portable root; bytes are validated by bundle verifier.
    renderer_mod=load_renderer()
    reads=install_asset_access_guard()
    # Negative control: the guard must reject an outside path before the OS sees it.
    probe=BUNDLE.parent/'outside-asset-probe-must-not-be-opened'
    try:
        with open(probe,'rb'): pass
    except PermissionError:
        outside_probe_denied=True
    except Exception as exc:
        raise RuntimeError(f'access fence did not deny outside probe: {exc}')
    else:
        raise RuntimeError('access fence allowed an outside asset probe')
    renderer=renderer_mod.Act1PaintRenderer(manifest_path=str(R4_MANIFEST),config_path=str(R4_CONFIG),old_root=str(BUNDLE/'empty-runtime'))
    # Canonical checkpoint mode: meadow-only substrate, no route tint or object art.
    renderer.trees=[]; renderer.rock_motifs=[]
    weights=renderer._weights
    renderer._weights=lambda xc,yc,w,h,res:{key:(np.ones_like(value) if key=='meadow' else np.zeros_like(value)) for key,value in weights(xc,yc,w,h,res).items()}
    renderer._route_weight=lambda x,y,res:np.zeros_like(x,dtype=np.float32)
    image,_=renderer.render_window(*window,ppc=ppc)
    result=Image.fromarray(image)
    out=out.resolve(strict=False)
    if not under(out,BUNDLE): raise ValueError('output must remain inside relocated bundle')
    out.parent.mkdir(parents=True,exist_ok=True)
    result.save(out,format='PNG')
    return {'status':'PASS','size':list(result.size),'pixelSha256':hashlib.sha256(result.tobytes()).hexdigest(),'fileSha256':digest(out),'output':str(out.relative_to(BUNDLE)),
            'assetAccessGuard':'ENABLED','outsideProbeDenied':outside_probe_denied,'bundleAssetReads':sorted(set(reads)),
            'sourceRendererSha256':digest(R4_SOURCE),'r4RuntimeManifestSha256':digest(R4_MANIFEST),
            'windowWorld16':[window[0],window[1],window[2],window[3]],'pixelsPerCell':ppc,
            'scope':'ground-only bounded crop; no objects, landmark paint, routes, collision, or full-world claim'}


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--out',default='renders/ground-material-only.png')
    ap.add_argument('--window',default='1568,208,320,256'); ap.add_argument('--ppc',type=int,default=32)
    ap.add_argument('--expected-sha256'); args=ap.parse_args()
    try: window=tuple(int(x) for x in args.window.split(','))
    except Exception: ap.error('--window must be x,y,w,h')
    if len(window)!=4: ap.error('--window must be x,y,w,h')
    result=render(BUNDLE/args.out,window,args.ppc)
    if args.expected_sha256 and result['pixelSha256']!=args.expected_sha256:
        raise SystemExit(f"PIXEL HASH MISMATCH: {result['pixelSha256']} != {args.expected_sha256}")
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__': main()
