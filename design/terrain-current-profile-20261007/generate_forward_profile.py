#!/usr/bin/env python3
"""Bounded full Act 1 forward-profile renderer; never edits the candidate or public tree."""
from __future__ import annotations
import argparse, copy, hashlib, importlib.util, json, math, os, shutil, struct, subprocess, sys, sysconfig, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageDraw

PROFILE_ROOT=Path(__file__).resolve().parent
HERE=PROFILE_ROOT
BUNDLE=PROFILE_ROOT
RUNTIME=PROFILE_ROOT.parents[1]/'public/act1-hifi'
NORTH_RECIPE=PROFILE_ROOT/'north-contact-y-20261007-recipe-v1.json'
CLIFF_FEEDBACK_OVERLAY=PROFILE_ROOT/'placements/cliff-current-feedback-overlay-v1.json'
LAYOUT_RECIPE=PROFILE_ROOT/'accepted-whole-layout-v2.json'
PILOT_RECEIPT=PROFILE_ROOT/'pilot-receipt.json'
PILOT_ALPHA=PROFILE_ROOT/'pilot-final-raised-alpha.png'
R26_RUNTIME_MANIFEST=PROFILE_ROOT/'r4-source/runtime/manifest.json'
FORWARD_DESCRIPTOR=PROFILE_ROOT/'forward-profile-descriptor.json'
A1OW_REVIEW_REL='design/terrain-current-profile-20261007/review-evidence/crystal-roof-20261016/a1ow-source-equivalence-integration-v2.json'
A1OW_REVIEW=PROFILE_ROOT/'review-evidence/crystal-roof-20261016/a1ow-source-equivalence-integration-v2.json'
A1OW_MAP_PROOF=PROFILE_ROOT/'evidence/a1ow-v2-independent-review/baked-final-map.json'
A1OW_REVIEW_SHA256='d64a58fe6f5adff50d14fb457a4ce156a4be1e8aa3ce113fbbca74a78564a28b'
CRYSTAL_DQ_REVIEW_REL='design/terrain-current-profile-20261007/review-evidence/crystal-roof-20261016/a1ow-source-equivalence.json'
CRYSTAL_DQ_REVIEW=PROFILE_ROOT/'review-evidence/crystal-roof-20261016/a1ow-source-equivalence.json'
CRYSTAL_DQ_REVIEW_SHA256='28ca32f73147f9d2e9868b4cd1f847537c9d9fbf2351f10dbb26471066ac5df7'
CRYSTAL_DQ_DIAGNOSTICS_ROOT=Path('/private/tmp/edu-rpg-build84-feedback-20261013/native-cave-contact-20261016/crystal-independent')

def _is_approved_crystal_dq_diagnostic(path):
    candidate=Path(path).resolve()
    return CRYSTAL_DQ_DIAGNOSTICS_ROOT.resolve() in candidate.parents
# The accepted layout pins the original nine-piece transforms; the north recipe
# is now an additive whole-object mask policy while those transforms remain fixed.
ACCEPTED_LAYOUT_NORTH_TRANSFORM_RECIPE_SHA256='c3875927a7370045cbbdc19e2bc84464dad838135cb6ec5ca3fee15284100cad'
LOCKED_R26_FIELDS=('designLocks','semanticBounds','semanticRows','chunkSize','streaming','detailRegions','pathConstraints')
W=4736; H=5824; PPU=32; XMIN=16; YMIN=218
FM=1; PLAIN=2; OTHER=0
NORTH_SUPPORT_IDS={
    'ridge-02-broad-joining-mass-B-94',
    'fill-02-rear-mass-B-98',
    'ridge-04-broad-joining-mass-B-106',
    'fill-04-right-pocket-mass-B-110',
}
NORTH_SUPPORT_SCHEMA='north-cliff-overhang-v1'
NORTH_PREFIX_BAND_CELLS=8
NORTH_SUPPORT_CROP=(15,0,583,600)
WATER_R2_ASSET=PROFILE_ROOT/'materials/act1-water-r2.png'
WATER_R2_RECIPE=PROFILE_ROOT/'materials/act1-water-r2.json'

def verify_water_r2_recipe(recipe):
    expected_asset_path=str(WATER_R2_ASSET.relative_to(PROFILE_ROOT.parents[1]))
    with Image.open(WATER_R2_ASSET) as water_image:
        expected_dimensions=list(water_image.size)
    valid=(recipe.get('schema')=='act1-water-texture-r2-v1'
        and recipe.get('assetPath')==expected_asset_path
        and recipe.get('sha256')==digest(WATER_R2_ASSET)
        and recipe.get('dimensionsPx')==expected_dimensions
        and recipe.get('outputPixelsPerCell')==32
        and recipe.get('sourceTexelsPerCell')==96
        and recipe.get('semanticMask')=='R4 _weights("water") from manifest-referenced smoothed semantic classgrid at 32px/cell'
        and recipe.get('phase')=='global world-cell origin; texture coordinate is worldCell*96 + outputPixel*3')
    if not valid:
        raise AssertionError('approved water-r2 asset/recipe identity or density changed')
    return expected_asset_path

if str(PROFILE_ROOT) not in sys.path:
    sys.path.insert(0, str(PROFILE_ROOT))
from water_r2 import (load_texture as load_water_r2_texture,
    compose_water_layer as compose_water_r2_layer,
    promote_exact_semantic_water as promote_exact_semantic_water_coverage)

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pix_digest(im): return hashlib.sha256(im.tobytes()).hexdigest()
def save_json(p,obj): Path(p).write_text(json.dumps(obj,indent=2)+'\n')
def verify_bundle():
    p=subprocess.run([sys.executable,str(BUNDLE/'verify_bundle.py')],cwd=BUNDLE,text=True,capture_output=True)
    if p.returncode: raise RuntimeError('frozen source bundle failed verification: '+p.stderr[-1000:])

def apply_r26_locked_geometry(manifest,r26_manifest):
    """Return an R26 runtime manifest retaining its pinned geometry authority."""
    if r26_manifest.get('revision')!=12 or len(r26_manifest.get('chunks',[]))!=120:
        raise AssertionError('pinned R26 runtime geometry must be revision 12 with 120 chunks')
    if manifest.get('revision')!=12 or len(manifest.get('chunks',[]))!=120:
        raise AssertionError('forward manifest template must be revision 12 with 120 chunks')
    if not isinstance(r26_manifest.get('pathConstraints'),dict):
        raise AssertionError('pinned R26 runtime geometry is missing pathConstraints')
    for key in LOCKED_R26_FIELDS:
        # The older recovered template omitted pathConstraints. Any other
        # mismatch, or a conflicting present value, is a hard source-contract error.
        if key!='pathConstraints' and manifest.get(key)!=r26_manifest.get(key):
            raise AssertionError(f'forward manifest template differs from pinned R26 geometry: {key}')
        if key=='pathConstraints' and key in manifest and manifest[key]!=r26_manifest[key]:
            raise AssertionError('forward manifest template has conflicting pathConstraints')
    for old,new in zip(r26_manifest['chunks'],manifest['chunks']):
        if old.get('id')!=new.get('id') or any(old.get(k)!=new.get(k) for k in ('x','y','width','height')):
            raise AssertionError(f'forward manifest template differs from pinned R26 chunk geometry: {old.get("id")}')
    result=copy.deepcopy(manifest)
    for key in LOCKED_R26_FIELDS:
        result[key]=copy.deepcopy(r26_manifest[key])
    return result

def validate_metadata_rebind_manifest_delta(old_manifest,new_manifest,r26_manifest,new_generator_sha):
    """Require metadata rebinds to change only the generator pin and missing R26 constraints."""
    if not isinstance(old_manifest,dict) or not isinstance(new_manifest,dict):
        raise AssertionError('metadata rebind manifests must be objects')
    if not isinstance(old_manifest.get('forwardTerrainProfile'),dict):
        raise AssertionError('source manifest is missing its forward terrain profile')
    expected_profile=copy.deepcopy(old_manifest['forwardTerrainProfile'])
    expected_profile['generatorSha256']=new_generator_sha
    if new_manifest.get('forwardTerrainProfile')!=expected_profile:
        raise AssertionError('metadata rebind may change only forwardTerrainProfile.generatorSha256')
    if new_manifest.get('pathConstraints')!=r26_manifest.get('pathConstraints'):
        raise AssertionError('metadata rebind must retain exact pinned R26 pathConstraints')
    expected_source=copy.deepcopy(old_manifest.get('source',{}))
    expected_source['act1TerrainUnionA1OWReviewPath']=A1OW_REVIEW_REL
    expected_source['act1TerrainUnionA1OWReviewSha256']=A1OW_REVIEW_SHA256
    expected_source['act1TerrainUnionA1OWReviewSchema']='independent-a1ow-v2-integration-review-v1'
    if new_manifest.get('source')!=expected_source:
        raise AssertionError('metadata rebind may change only the pinned A1OW review provenance in source metadata')
    allowed={'forwardTerrainProfile','pathConstraints','source'}
    changed=[key for key in set(old_manifest)|set(new_manifest)
             if old_manifest.get(key)!=new_manifest.get(key)]
    unexpected=sorted(set(changed)-allowed)
    if unexpected:
        raise AssertionError(f'metadata rebind would change unexpected manifest fields: {unexpected}')
    return sorted(changed)

def verified_a1ow_v2_source_overlay(frozen_manifest):
    """Build the output-only A1OW v2 source metadata from pinned binary/header evidence."""
    root=PROFILE_ROOT.parents[1]
    descriptor=json.loads(FORWARD_DESCRIPTOR.read_text())
    contract=descriptor.get('a1owContract')
    if not isinstance(contract,dict): raise AssertionError('forward descriptor lacks the A1OW v2 contract')
    if digest(A1OW_REVIEW)!=A1OW_REVIEW_SHA256:
        raise AssertionError('independent A1OW v2 artifact-level review identity changed')
    review=json.loads(A1OW_REVIEW.read_text())
    if review.get('schema')!='independent-a1ow-v2-integration-review-v1' or review.get('status')!='PASS_A1OW_V2_IDENTITY_AND_BODY':
        raise AssertionError('independent A1OW v2 review is not an accepted artifact-level identity record')
    dq_equivalence=review.get('independentDqSourceEquivalence',{})
    dq_schema=dq_equivalence.get('schema')
    if dq_schema=='a1ow-dq-source-equivalence-v1':
        # Preserve the legacy projection predicate unchanged for prior review records.
        post_anchor_delta=dq_equivalence.get('postAnchorDelta',{})
        dq_checks=dq_equivalence.get('checks',{})
        if (dq_equivalence.get('updatedSha256')!=digest(root/'public/dq-tiles.js')
                or dq_equivalence.get('collisionRuntimeTailSha256')!='f542b7570cec71c7e347090d2cdab2a7cf8c844c5d8fd781bac12dbec5ceed44'
                or dq_equivalence.get('currentCollisionRuntimeTailSha256')!='7974f54097586584fb1d3a7fd2d3a483055ec52d4e2f2699581f46ec15256be9'
                or dq_checks.get('dqHashMatchesFinalSource') is not True
                or dq_checks.get('decodedHeaderAndSupportMatchCurrentRecomputation') is not True
                or dq_checks.get('collisionRuntimeExactAfterWaterCleanupProjection') is not True
                or dq_checks.get('collisionTailExact') is not False
                or dq_equivalence.get('identicalCollisionRuntimeTail') is not False
                or post_anchor_delta.get('normalization')!='remove only the two exact water-backing cleanup call strings plus their preceding added spaces from current tail'
                or post_anchor_delta.get('occurrences')!=2
                or post_anchor_delta.get('exactAddedBytes')!='a1aDropPlateWaterBacking(terrainState,scene); '
                or post_anchor_delta.get('normalizedTailByteIdenticalToBaseline') is not True):
            raise AssertionError('independent A1OW review lacks the full current-DQ and exact water-cleanup projection proof')
    elif dq_schema=='a1ow-dq-source-projection-v2-cave-local-delta':
        import base64
        if digest(CRYSTAL_DQ_REVIEW)!=CRYSTAL_DQ_REVIEW_SHA256:
            raise AssertionError('independent Crystal DQ source-only review identity changed')
        crystal_review=json.loads(CRYSTAL_DQ_REVIEW.read_text())
        if (set(crystal_review)!={'schema','status','scope','nativeOrRenderedPassClaimed','independentDqSourceEquivalence'}
                or crystal_review.get('schema')!='independent-crystal-dq-source-equivalence-review-v1'
                or crystal_review.get('status')!='PASS_SOURCE_STATIC'
                or crystal_review.get('scope')!='independent source/contact review record; not an artifact-level A1OW integration acceptance record'
                or crystal_review.get('nativeOrRenderedPassClaimed') is not False
                or crystal_review.get('independentDqSourceEquivalence')!=dq_equivalence):
            raise AssertionError('independent Crystal DQ source-only record is invalid or differs from the nested integration projection')
        projection=crystal_review['independentDqSourceEquivalence']
        exact_top={'schema','status','baselineSource','currentSource','sourceDelta','normalizedSourceSha256',
            'baselineTail','functionProjections','immutableInputs','staticProof','claims'}
        if set(projection)!=exact_top or projection.get('status')!='PASS':
            raise AssertionError('independent DQ cave projection record is incomplete or unreviewed')
        public=root/'public/dq-tiles.js';current=public.read_bytes()
        expected_baseline='6a605a8f0d7d2513871c9b8e5a18f30fa7a403ee2ec0e42a4f1646d2e4d5da1d'
        expected_current='a7e267a5c2d2d1061af7f66956d82853b42f00c82c1f63baf043defbeb1b2a43'
        start=b'  // Whispering Woods is a sprite prop,';end=b'  // (x,y) is the SPRITE position'
        call=b'    if(!a1mWwContactFree(scene,m,x,y)) return false;\n'
        if digest(public)!=expected_current:
            raise AssertionError('current public DQ source differs from the exact reviewed cave candidate')
        baseline=projection['baselineSource'];cur=projection['currentSource'];delta=projection['sourceDelta']
        if (set(baseline)!={'sha256','path','bytes'} or baseline!={'sha256':expected_baseline,'path':'public/dq-tiles.js','bytes':591893}
                or set(cur)!={'sha256','publicPath','distPath','bytes','twinsByteIdentical'}
                or cur!={'sha256':expected_current,'publicPath':'public/dq-tiles.js','distPath':'dist/dq-tiles.js','bytes':len(current),'twinsByteIdentical':True}
                or set(delta)!={'helper','callsite'}):
            raise AssertionError('DQ cave projection source identities or strict delta fields differ')
        helper_info=delta['helper'];call_info=delta['callsite']
        a=current.count(start);b=current.count(end);c=current.count(call)
        if a!=1 or b!=1 or c!=1:
            raise AssertionError('DQ cave helper anchors or callsite are missing or duplicated')
        i=current.index(start);j=current.index(end,i);helper=current[i:j]
        if (set(helper_info)!={'anchor','bytes','sha256','occurrences'}
                or helper_info!={'anchor':'single cave-contact helper span beginning at the reviewed Whispering Woods comment and ending immediately before `  // (x,y) is the SPRITE position`; includes the exact pinned Crystal branch','bytes':10977,'sha256':'5855a9746b66a8f73efea1066a2a37cb0f93a7df579539e735a7f15abc96f457','occurrences':1}
                or set(call_info)!={'anchor','bytes','sha256','occurrences'}
                or call_info!={'anchor':'inside function a1mFree(scene,m,x,y)','bytes':53,'sha256':'3bc0cf4dc07804c8025f4db4a4bb71b699be8b0386746bc80dfe9955cd9538e0','occurrences':1}
                or len(helper)!=10977 or hashlib.sha256(helper).hexdigest()!='5855a9746b66a8f73efea1066a2a37cb0f93a7df579539e735a7f15abc96f457'
                or hashlib.sha256(call).hexdigest()!='3bc0cf4dc07804c8025f4db4a4bb71b699be8b0386746bc80dfe9955cd9538e0'):
            raise AssertionError('DQ cave helper/callsite bytes differ from the reviewed exact additions')
        normalized=current[:i]+current[j:]
        if normalized.count(call)!=1: raise AssertionError('DQ cave callsite is not unique after helper removal')
        normalized=normalized.replace(call,b'',1)
        normalized_sha=hashlib.sha256(normalized).hexdigest()
        if normalized_sha!=expected_baseline or projection.get('normalizedSourceSha256')!=expected_baseline:
            raise AssertionError('DQ source has a change outside the exact cave helper and callsite additions')
        foot=normalized[normalized.index(b'var A1M_FOOT=12;'):]
        tail_sha=hashlib.sha256(foot).hexdigest()
        tail=projection['baselineTail'];water=tail['waterNormalization']
        legacy_rel='design/terrain-current-profile-20261007/review-evidence/cave-reentry-20261015/a1ow-source-equivalence.json'
        legacy_sha='a9e7ca02240613adf34d864016ef9f6083cd913a6b89eba54d22ade35aee2c55'
        water_rule='remove only the two exact water-backing cleanup call strings plus their preceding added spaces from current tail'
        if (set(tail)!={'sha256','legacyReviewPath','legacyReviewSha256','sourceSchema','waterNormalization','scope'}
                or tail!={'sha256':'7974f54097586584fb1d3a7fd2d3a483055ec52d4e2f2699581f46ec15256be9','legacyReviewPath':legacy_rel,'legacyReviewSha256':legacy_sha,'sourceSchema':'a1ow-dq-source-equivalence-v1','waterNormalization':{'rule':water_rule,'occurrences':2,'exactAddedBytes':'a1aDropPlateWaterBacking(terrainState,scene); '},'scope':'normalized semantic tail of baseline DQ 6a605a8 only; not a current-tail identity'}
                or tail_sha!=tail['sha256']):
            raise AssertionError('DQ cave projection prior-tail baseline or legacy water normalization differs')
        legacy=json.loads((root/legacy_rel).read_text())['independentDqSourceEquivalence']
        if (digest(root/legacy_rel)!=legacy_sha or legacy.get('schema')!='a1ow-dq-source-equivalence-v1'
                or legacy.get('currentCollisionRuntimeTailSha256')!=tail['sha256']
                or legacy.get('exactPrepatchTailByteIdentical') is not True):
            raise AssertionError('pinned legacy DQ tail evidence no longer corroborates the baseline-only tail identity')
        functions=projection['functionProjections']
        def function_bytes(name,source):
            marker=b'  function '+name.encode()+b'(';start_at=source.find(marker)
            if start_at<0 or source.count(marker)!=1: raise AssertionError('DQ source projection function anchor missing or repeated: '+name)
            brace=source.find(b'{',start_at);depth=0;state='code';escaped=False;line_comment=False;block_comment=False
            quote=0
            for pos in range(brace,len(source)):
                ch=source[pos];nxt=source[pos+1] if pos+1<len(source) else 0
                if state=='line':
                    if ch==10: state='code'
                    continue
                if state=='block':
                    if ch==42 and nxt==47: state='code'
                    continue
                if state=='string':
                    if escaped: escaped=False
                    elif ch==92: escaped=True
                    elif ch==quote: state='code'
                    continue
                if ch==47 and nxt==47: state='line';continue
                if ch==47 and nxt==42: state='block';continue
                if ch in (34,39,96): state='string';quote=ch;continue
                if ch==123: depth+=1
                elif ch==125:
                    depth-=1
                    if depth==0:return source[start_at:pos+1]
            raise AssertionError('unbalanced DQ source projection function: '+name)
        free=function_bytes('a1mFree',current);free_normal=free.replace(call,b'')
        if free.count(call)!=1: raise AssertionError('a1mFree cave call is missing or repeated')
        if (hashlib.sha256(free_normal).hexdigest()!='c1bf0f36277a2d607254477ea4c9bf8519e8bd2ca1618641aa8a9d56e146345d'
                or set(functions)!={'a1mFree','unchangedFunctions'}
                or set(functions['a1mFree'])!={'baselineSha256','currentAfterCallRemovalSha256','normalization','equal'}
                or functions['a1mFree']!={'baselineSha256':hashlib.sha256(free_normal).hexdigest(),'currentAfterCallRemovalSha256':hashlib.sha256(free_normal).hexdigest(),'normalization':'remove only exact one-line cave call bytes from extracted a1mFree function','equal':True}):
            raise AssertionError('a1mFree source projection does not prove exactly the one approved callsite delta')
        fixed_functions=['owmBakeParse','owmSupportBounds','owmSupportEt','owmSupportInputBytes','owmInvalidateSupport','owmSupportMatches','owmSupportHex','owmSupportFor','owmAssemble','a1mFootDy','a1fBuildStencil','a1fHeroFree']
        expected_function_hashes={
            'owmBakeParse':'1dc1634017dcb91be462f9be20bdcb2e828d30961ec99174d7f9e8b88df01174',
            'owmSupportBounds':'51fef291a7960999b9ad05201918906783cc08eb88c00ec9e80d8826e9647f95',
            'owmSupportEt':'05a36638d93f2d1e0809ea9c1ec753021f30e872fa888c2ab60abc98d02237c6',
            'owmSupportInputBytes':'48c909ffc5b6d1c206e7b2a538afc10fea3edb7137ffbd665d905bb2fd3ca480',
            'owmInvalidateSupport':'5d8d176996fb5350959ae7e3a6d140af927c04b3c3a3ef6c18890ab056af2552',
            'owmSupportMatches':'ee31635230ec29213e8a6abf3e2109b025daf1f5c6d0bccf65d41ab9ff20f097',
            'owmSupportHex':'f57f73ac4d11acd600fcea10cf8865bb9c34ef2647f1aec88efabe93bcf8200f',
            'owmSupportFor':'350f52c4b7acd672c2bd3cc669cb458357223816b7ad456b56e310f951ed6006',
            'owmAssemble':'acbac9d7385ee28c90a10458692338dd0555795c7df12b8f97e81617c95f1a5d',
            'a1mFootDy':'416739f80a17924abe44da0e8d5c3ec44504a10980a187b0451874a4355b8bb1',
            'a1fBuildStencil':'4d5dbdab4b20bf77a60135c30c2fbc16e7c0d0eabe76846ef6f83717edb2e79d',
            'a1fHeroFree':'ac1caf8af4baa51faea770760888f3d349216d804bacb49c5eef671de2d3ba80'}
        expected_functions={name:{'baselineSha256':value,'currentSha256':value,'byteIdentical':True} for name,value in expected_function_hashes.items()}
        if set(fixed_functions)!=set(expected_function_hashes) or any(hashlib.sha256(function_bytes(name,current)).hexdigest()!=value for name,value in expected_function_hashes.items()):
            raise AssertionError('A1OW parser/support/hero function differs from the pinned reviewed baseline')
        if functions['unchangedFunctions']!=expected_functions:
            raise AssertionError('A1OW parser/support/hero-foot/full-hero function projections differ from current source')
        def identity_path(path):
            if not isinstance(path,str): raise AssertionError('cave-projection path is not text')
            candidate=Path(path) if Path(path).is_absolute() else root/Path(path)
            if not Path(path).is_absolute() and '..' in Path(path).parts: raise AssertionError('cave-projection path escapes its project root')
            if Path(path).is_absolute():
                if not _is_approved_crystal_dq_diagnostic(candidate): raise AssertionError('absolute cave-projection evidence path is outside the approved Crystal diagnostic root')
            if not candidate.is_file(): raise AssertionError('cave-projection evidence file is missing: '+path)
            return candidate
        def verify_identity(item,expected_path):
            if set(item)!={'path','sha256','bytes'} or item.get('path')!=expected_path:
                raise AssertionError('immutable cave-projection input identity mismatch: '+str(expected_path))
            candidate=identity_path(expected_path)
            if digest(candidate)!=item.get('sha256') or candidate.stat().st_size!=item.get('bytes'):
                raise AssertionError('immutable cave-projection input hash/length mismatch: '+expected_path)
        immutable=projection['immutableInputs']
        expected_immutable={'a1ow','baker','mapProof','qok','caveArt','crystalCaveArt','landmarks','manifests','terrainFixture'}
        if set(immutable)!=expected_immutable: raise AssertionError('cave projection immutable-input fields are incomplete')
        verify_identity(immutable['a1ow'],'public/act1-overworld-walk.bin')
        verify_identity(immutable['baker'],'scripts/bake_act1_overworld_walk.mjs')
        verify_identity(immutable['mapProof'],str(A1OW_MAP_PROOF.relative_to(root)))
        verify_identity(immutable['qok'],'public/act1-hifi/forest-collision.bin')
        verify_identity(immutable['caveArt'],'public/act1-hifi/landmarks/whispering-woods.png')
        verify_identity(immutable['crystalCaveArt'],'public/act1-hifi/landmarks/crystal-cave.png')
        verify_identity(immutable['landmarks'],'public/act1-hifi/landmarks/landmarks.json')
        manifests=immutable['manifests']
        if set(manifests)!={'current','generationInput'}: raise AssertionError('cave projection manifest identities are incomplete')
        verify_identity(manifests['current'],'design/terrain-current-profile-20261007/current/act1-hifi-manifest.json')
        verify_identity(manifests['generationInput'],'design/terrain-current-profile-20261007/input-manifest.json')
        verify_identity(immutable['terrainFixture'],'scripts/test_act1_terrain_collision_integration.cjs')
        proof=projection['staticProof']
        if set(proof)!={'review','preview','maskRaster','crystalMaskRaster','contactPathCheck','crystalContactPathCheck','testRuns'}:
            raise AssertionError('cave projection static proof fields are incomplete')
        for artifact in ('review','preview'):
            item=proof[artifact]
            if set(item)!={'path','sha256'} or digest(identity_path(item['path']))!=item['sha256']:
                raise AssertionError('cave independent review/preview identity mismatch: '+artifact)
        mask=proof['maskRaster']
        if set(mask)!={'path','sha256','packedBitsetSha256','packedBytes','solidPixels','outsideAlphaPixels','alphaThreshold'}:
            raise AssertionError('cave mask raster proof fields differ')
        mask_path=identity_path(mask['path'])
        if digest(mask_path)!=mask['sha256']:
            raise AssertionError('cave mask raster evidence hash mismatch')
        mask_result=json.loads(mask_path.read_text())
        contact_item=proof['contactPathCheck']
        if set(contact_item)!={'path','sha256','resultPath','resultSha256'} or digest(identity_path(contact_item['path']))!=contact_item['sha256'] or digest(identity_path(contact_item['resultPath']))!=contact_item['resultSha256']:
            raise AssertionError('cave contact-path check result identity mismatch')
        contact_result=json.loads(identity_path(contact_item['resultPath']).read_text())
        if contact_result!={'productionGate':'a1mFree','southSamples':101,'southApproach':'clear through existing door cell','p1Roof':'blocked','bothSides':'blocked','exteriorGrass':'free','neighborGrass':'free','channel':'free'}:
            raise AssertionError('cave contact-path result does not prove bounded south-door egress')
        mask=proof['maskRaster'];mask_match=__import__('re').search(rb"var A1M_WW_MASK_B64='([A-Za-z0-9+/=]+)';",current)
        if not mask_match: raise AssertionError('embedded cave material mask is missing')
        packed=base64.b64decode(mask_match.group(1),validate=True)
        solid=sum((packed[i>>3]>>(i&7))&1 for i in range(144*144))
        if (mask.get('packedBitsetSha256')!=hashlib.sha256(packed).hexdigest()
                or mask_result.get('schema')!='independent-cave-contact-mask-raster-check-v1'
                or mask.get('packedBytes')!=2592 or mask.get('solidPixels')!=4808
                or mask.get('outsideAlphaPixels')!=0 or mask.get('alphaThreshold')!=128
                or len(packed)!=2592 or solid!=4808
                or mask_result.get('dqTilesSha256')!=expected_current or mask_result.get('pinnedArtSha256')!=digest(root/'public/act1-hifi/landmarks/whispering-woods.png')
                or mask_result.get('packedMaskBytes')!=2592 or mask_result.get('setPixels')!=4808
                or mask_result.get('outsideAlphaSetPixels')!=0 or mask_result.get('alphaThreshold')!=128
                or mask_result.get('independentRasterMatchesEmbeddedMask') is not True):
            raise AssertionError('cave mask proof differs from embedded alpha-clipped bitset')
        crystal_mask=proof['crystalMaskRaster']
        if set(crystal_mask)!={'path','sha256','packedBitsetSha256','packedBytes','solidPixels','outsideAlphaPixels','alphaThreshold'}:
            raise AssertionError('Crystal mask raster proof fields differ')
        crystal_mask_path=identity_path(crystal_mask['path'])
        crystal_mask_result=json.loads(crystal_mask_path.read_text())
        crystal_match=__import__('re').search(rb"var A1M_CRYSTAL_MASK_B64='([A-Za-z0-9+/=]+)';",current)
        if not crystal_match: raise AssertionError('embedded Crystal material mask is missing')
        crystal_packed=base64.b64decode(crystal_match.group(1),validate=True)
        crystal_solid=sum((crystal_packed[i>>3]>>(i&7))&1 for i in range(144*144))
        expected_channel=[[53,75],[52,65],[57,55],[64,49],[72,48],[78,54],[81,64],[82,73],[86,83],[91,92],[93,103],[94,114],[96,125],[96,134],[55,134],[54,125],[55,115],[56,105],[54,95],[52,85]]
        crystal_art=identity_path(immutable['crystalCaveArt']['path'])
        if (crystal_mask['packedBitsetSha256']!=hashlib.sha256(crystal_packed).hexdigest()
                or crystal_mask['packedBytes']!=2592 or crystal_mask['solidPixels']!=5802
                or crystal_mask['outsideAlphaPixels']!=0 or crystal_mask['alphaThreshold']!=128
                or len(crystal_packed)!=2592 or crystal_solid!=5802
                or crystal_mask_result.get('schema')!='crystal-contact-mask-raster-v1'
                or crystal_mask_result.get('dqTilesSha256')!=expected_current
                or crystal_mask_result.get('pinnedArtSha256')!=digest(crystal_art)
                or crystal_mask_result.get('packedMaskBytes')!=2592
                or crystal_mask_result.get('packedMaskSha256')!=hashlib.sha256(crystal_packed).hexdigest()
                or crystal_mask_result.get('solidPixels')!=5802
                or crystal_mask_result.get('outsideAlphaPixels')!=0 or crystal_mask_result.get('alphaThreshold')!=128
                or crystal_mask_result.get('channelPolygon')!=expected_channel):
            raise AssertionError('Crystal mask proof differs from exact alpha-clipped doorway bitset')
        crystal_contact=proof['crystalContactPathCheck']
        if set(crystal_contact)!={'path','sha256','resultPath','resultSha256'}:
            raise AssertionError('Crystal contact-path proof fields differ')
        crystal_contact_path=identity_path(crystal_contact['path'])
        crystal_result_path=identity_path(crystal_contact['resultPath'])
        crystal_contact_result=json.loads(crystal_result_path.read_text())
        if (digest(crystal_contact_path)!=crystal_contact['sha256']
                or digest(crystal_result_path)!=crystal_contact['resultSha256']
                or crystal_contact_result!={'productionGate':'a1mFree','roofPose':'blocked','bothSides':'blocked','exteriorGrass':'free','entryCell149x278':'free','exitCell149x279':'free','southApproach':'free','continuousSouthSweepSamples':101,'continuousSouthSweep':'clear','doorAdapter':'149,279→149,278→crystalCave','bothHeroSoleRows':'pass'}):
            raise AssertionError('Crystal contact-path evidence does not prove bounded cave entry and exit')
        if set(proof['testRuns'])!={'path','sha256','allPassed'}:
            raise AssertionError('cave static test-run receipt fields differ')
        runs_path=identity_path(proof['testRuns']['path'])
        if digest(runs_path)!=proof['testRuns']['sha256'] or proof['testRuns']['allPassed'] is not True:
            raise AssertionError('cave static test-run receipt is stale or failing')
        runs=json.loads(runs_path.read_text())
        expected_runs=[
            (['python3','scripts/generate_ww_contact_mask.py','--check'],None,'scripts/generate_ww_contact_mask.py'),
            (['python3','scripts/generate_crystal_contact_mask.py','--check'],None,'scripts/generate_crystal_contact_mask.py'),
            (['node','scripts/test_dq_tiles_landmark_contact.cjs'],'public/dq-tiles.js','scripts/test_dq_tiles_landmark_contact.cjs'),
            (['node','scripts/test_dq_tiles_landmark_contact.cjs','dist/dq-tiles.js'],'dist/dq-tiles.js','scripts/test_dq_tiles_landmark_contact.cjs'),
            (['node','scripts/test_dq_tiles_scene_reentry.cjs'],'public/dq-tiles.js','scripts/test_dq_tiles_scene_reentry.cjs'),
            (['node','scripts/test_dq_tiles_scene_reentry.cjs','dist/dq-tiles.js'],'dist/dq-tiles.js','scripts/test_dq_tiles_scene_reentry.cjs')]
        if not isinstance(runs,list) or len(runs)!=len(expected_runs): raise AssertionError('cave static test-run list differs')
        for run,(args,target,script_path) in zip(runs,expected_runs):
            if (run.get('args')!=args or run.get('target')!=target or run.get('exitCode')!=0 or run.get('result')!='PASS'
                    or run.get('stderr')!='' or set(run.get('script',{}))!={'path','sha256','bytes'}
                    or run['script']!={'path':script_path,'sha256':digest(root/script_path),'bytes':(root/script_path).stat().st_size}):
                raise AssertionError('cave static test-run evidence differs: '+script_path)
        claims=projection['claims']
        if claims!={'nativeOrRenderedPassClaimed':False,'wholeCollisionRuntimeTailIdentical':False}:
            raise AssertionError('source-projection record may not claim native or rendered acceptance')
    else:
        raise AssertionError('independent A1OW review uses an unknown DQ source-equivalence schema')
    inputs=review.get('inputs',{});header=review.get('v2Header',{});support=review.get('support',{});payload=review.get('payload',{})
    binary=root/'public/act1-overworld-walk.bin'
    baker=root/'scripts/bake_act1_overworld_walk.mjs'
    dq=root/'public/dq-tiles.js'
    if contract.get('path')!='act1-overworld-walk.bin' or inputs.get('v2Path')!='public/act1-overworld-walk.bin':
        raise AssertionError('A1OW v2 contract/review identifies an unexpected runtime path')
    if inputs.get('v2Sha256')!=contract.get('sha256') or digest(binary)!=contract.get('sha256'):
        raise AssertionError('installed A1OW v2 bytes differ from the pinned descriptor/review')
    if inputs.get('bakerPath')!=contract.get('bakerPath') or inputs.get('bakerSha256')!=contract.get('bakerSha256') or digest(baker)!=contract.get('bakerSha256'):
        raise AssertionError('A1OW v2 baker source differs from the pinned descriptor/review')
    if inputs.get('dqTilesSha256')!=digest(dq): raise AssertionError('A1OW v2 review does not bind current DQ runtime bytes')
    if inputs.get('mapProofSha256')!=digest(A1OW_MAP_PROOF): raise AssertionError('A1OW v2 map-support proof identity changed')
    frozen_source=frozen_manifest.get('source',{})
    if frozen_source.get('act1TerrainUnionA1OWSha256')!=inputs.get('frozenV1Sha256'):
        raise AssertionError('frozen semantic manifest no longer records the reviewed v1 A1OW body identity')
    # Reuse the strict production-profile decoder instead of trusting output or report metadata alone.
    validator_path=root/'scripts/terrain_current_profile.py'
    validator_spec=importlib.util.spec_from_file_location('terrain_current_profile_a1ow_overlay',validator_path)
    if validator_spec is None or validator_spec.loader is None: raise AssertionError('cannot load the strict A1OW production decoder')
    validator=importlib.util.module_from_spec(validator_spec);validator_spec.loader.exec_module(validator)
    decoded=validator.decode_a1ow(binary,contract)
    if (header.get('magic')!='A1OW' or header.get('version')!=decoded['version'] or
            header.get('headerBytes')!=decoded['headerBytes'] or header.get('pixelsPerCell')!=48 or
            header.get('mapCells')!=[decoded['mapWidth'],decoded['mapHeight']] or
            header.get('blocks')!=decoded['blocks'] or not header.get('reservedBytesZero')):
        raise AssertionError('independent A1OW v2 review header summary differs from decoded binary')
    if (support.get('schema')!=contract.get('supportSchema') or support.get('sha256')!=decoded['supportSha256'] or
            support.get('fnv32')!=decoded['supportFNV32'] or
            support.get('bounds')!={'x0':0,'x1':208,'y0':173,'y1':399} or
            support.get('classByteCount')!=47443 or
            support.get('effectiveClassBytesSha256')!='63d55c8dd75d6d946f5b56e3f58ce6a4ec287e6ccccddebed61329a70fb972d3' or
            review.get('semantics',{}).get('sha256')!=contract.get('semanticsSha256') or
            review.get('semantics',{}).get('sourceSha256')!='4ed7c44a096169e9f9354c4a568ffa3dab4ebfe9fb2fd5339ae8b31dce2bacdb' or
            payload.get('v2BodySha256')!=decoded['payloadSha256'] or
            payload.get('byteIdentical') is not True or
            payload.get('frozenV1BodySha256')!=contract.get('payloadSha256') or
            payload.get('v2BodySha256')!=payload.get('frozenV1BodySha256') or
            header.get('far')!=contract.get('far') or
            header.get('exactLength')!=binary.stat().st_size or header.get('reservedBytesZero') is not True or
            decoded['version']!=contract.get('version') or
            decoded['headerBytes']!=contract.get('headerBytes') or
            decoded['blocks']!=contract.get('blockCount') or
            decoded['supportFNV32']!=contract.get('supportFNV32') or
            decoded['supportSha256']!=contract.get('supportSha256') or
            decoded['payloadSha256']!=contract.get('payloadSha256')):
        raise AssertionError('independent A1OW v2 review support/semantics/payload differs from decoded contract')
    return {
        'act1TerrainUnionA1OWReviewPath':A1OW_REVIEW_REL,
        'act1TerrainUnionA1OWReviewSha256':A1OW_REVIEW_SHA256,
        'act1TerrainUnionA1OWReviewSchema':review['schema'],
        'act1TerrainUnionA1OWSha256':contract['sha256'],
        'act1TerrainUnionA1OWBakerPath':contract['bakerPath'],
        'act1TerrainUnionA1OWBakerSha256':contract['bakerSha256'],
        'act1TerrainUnionA1OWBlockCount':decoded['blocks'],
        'act1TerrainUnionA1OWHeaderBytes':decoded['headerBytes'],
        'act1TerrainUnionA1OWPayloadSha256':decoded['payloadSha256'],
        'act1TerrainUnionA1OWProfileId':contract['profileId'],
        'act1TerrainUnionA1OWSemanticsSha256':contract['semanticsSha256'],
        'act1TerrainUnionA1OWSupportFNV32':decoded['supportFNV32'],
        'act1TerrainUnionA1OWSupportSchema':contract['supportSchema'],
        'act1TerrainUnionA1OWSupportSha256':decoded['supportSha256'],
        'act1TerrainUnionA1OWVersion':decoded['version'],
    }

def rebind_metadata_only(source_output,source_receipt,output_a,output_b):
    """Re-emit only manifest/provenance metadata and prove all image bytes stable."""
    verify_bundle()
    source_output=Path(source_output).resolve();source_receipt=Path(source_receipt).resolve()
    r26=json.loads(R26_RUNTIME_MANIFEST.read_text())
    receipt=json.loads(source_receipt.read_text())
    source_manifest_path=source_output/'act1-hifi/manifest.json'
    old_manifest=json.loads(source_manifest_path.read_text())
    expected=receipt.get('outputInventory')
    if not isinstance(expected,dict) or not expected:
        raise AssertionError('source output receipt has no exact inventory')
    def local_rel(rel):
        if rel.startswith('public/act1-hifi/'): return rel[len('public/'):]
        return rel
    actual={p.relative_to(source_output).as_posix():p for p in source_output.rglob('*') if p.is_file()}
    normalized={local_rel(k):v for k,v in expected.items()}
    if set(actual)!=set(normalized):
        raise AssertionError(f'source output inventory path mismatch missing={sorted(set(normalized)-set(actual))[:5]} extra={sorted(set(actual)-set(normalized))[:5]}')
    for rel,path in actual.items():
        row=normalized[rel]
        if path.stat().st_size!=row.get('bytes') or digest(path)!=row.get('sha256'):
            raise AssertionError(f'source output inventory mismatch: {rel}')
    old_profile=old_manifest.get('forwardTerrainProfile',{})
    if (receipt.get('profileId')!='act1-forward-20261007-v1'
            or old_profile.get('generatorSha256')!=receipt.get('generatorSha256')
            or receipt.get('fullWorldComplete') is not True
            or receipt.get('gateReady') is not False
            or receipt.get('nativeVerified') is not False):
        raise AssertionError('source manifest/receipt identity or readiness fields disagree')
    new_generator_sha=digest(Path(__file__))
    result_manifest=apply_r26_locked_geometry(old_manifest,r26)
    result_manifest['forwardTerrainProfile']['generatorSha256']=new_generator_sha
    result_manifest['source']['act1TerrainUnionA1OWReviewPath']=A1OW_REVIEW_REL
    result_manifest['source']['act1TerrainUnionA1OWReviewSha256']=A1OW_REVIEW_SHA256
    result_manifest['source']['act1TerrainUnionA1OWReviewSchema']='independent-a1ow-v2-integration-review-v1'
    changed_keys=validate_metadata_rebind_manifest_delta(old_manifest,result_manifest,r26,new_generator_sha)
    for name,target in (('A',Path(output_a).resolve()),('B',Path(output_b).resolve())):
        if target.exists(): raise FileExistsError(f'metadata rebind output already exists: {target}')
        shutil.copytree(source_output,target)
        save_json(target/'act1-hifi/manifest.json',result_manifest)
        new_receipt=copy.deepcopy(receipt)
        new_receipt['generatorSha256']=new_generator_sha
        new_receipt['a1owReview']={'path':A1OW_REVIEW_REL,'sha256':A1OW_REVIEW_SHA256,'schema':'independent-a1ow-v2-integration-review-v1'}
        new_inventory={}
        for p in sorted(target.rglob('*')):
            if p.is_file():
                rel=p.relative_to(target).as_posix()
                key='public/'+rel if rel.startswith('act1-hifi/') else rel
                new_inventory[key]={'bytes':p.stat().st_size,'sha256':digest(p)}
        new_receipt['outputInventory']=new_inventory
        save_json(target.parent/(target.name+'-output-receipt.json'),new_receipt)
    manifest_a=Path(output_a).resolve()/'act1-hifi/manifest.json'
    manifest_b=Path(output_b).resolve()/'act1-hifi/manifest.json'
    receipt_a=Path(output_a).resolve().parent/(Path(output_a).name+'-output-receipt.json')
    receipt_b=Path(output_b).resolve().parent/(Path(output_b).name+'-output-receipt.json')
    if digest(manifest_a)!=digest(manifest_b) or digest(receipt_a)!=digest(receipt_b):
        raise AssertionError('metadata-only A/B re-emission is not deterministic')
    # Only the runtime manifest is permitted to differ from the frozen output.
    after={p.relative_to(Path(output_a).resolve()).as_posix():digest(p) for p in Path(output_a).resolve().rglob('*') if p.is_file()}
    changed=[rel for rel,path in actual.items() if digest(path)!=after[rel]]
    if changed!=['act1-hifi/manifest.json']:
        raise AssertionError(f'metadata-only rebind changed non-manifest outputs: {changed[:10]}')
    unchanged=sorted(set(actual)-set(changed))
    lines=lambda mapping: ''.join(f"{k}\t{mapping[k].stat().st_size}\t{digest(mapping[k])}\n" for k in sorted(mapping)).encode()
    source_a1ow=PROFILE_ROOT.parents[1]/'public/act1-overworld-walk.bin'
    public_manifest=PROFILE_ROOT.parents[1]/'public/act1-hifi/manifest.json'
    a1ow_sha=digest(source_a1ow) if source_a1ow.is_file() else None
    emitted_inventory={p.relative_to(Path(output_a).resolve()).as_posix():p for p in Path(output_a).resolve().rglob('*') if p.is_file()}
    return {'status':'PASS','mode':'metadata-only-rebind','sourceOutput':str(source_output),'sourceReceipt':str(source_receipt),'sourceManifestSha256':digest(source_manifest_path),'sourceReceiptSha256':digest(source_receipt),'r26AuthoritySha256':digest(R26_RUNTIME_MANIFEST),'generatorSha256':new_generator_sha,'changedManifestFields':sorted(changed_keys),'pathConstraintsSha256':hashlib.sha256(json.dumps(r26['pathConstraints'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'designLocksSha256':hashlib.sha256(json.dumps(r26['designLocks'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'outputA':str(output_a),'outputB':str(output_b),'outputAManifestSha256':digest(manifest_a),'outputBManifestSha256':digest(manifest_b),'outputAReceiptSha256':digest(receipt_a),'outputBReceiptSha256':digest(receipt_b),'outputPathCount':len(actual),'changedOutputPaths':['act1-hifi/manifest.json'],'changedManifestSourceSha256':digest(source_manifest_path),'changedManifestEmittedSha256':digest(manifest_a),'unchangedOutputCount':len(unchanged),'unchangedOutputInventorySha256':hashlib.sha256(lines({k:actual[k] for k in unchanged})).hexdigest(),'emittedOutputInventorySha256':hashlib.sha256(lines(emitted_inventory)).hexdigest(),'a1owPath':'public/act1-overworld-walk.bin','a1owSha256':a1ow_sha,'publicManifestBeforeSha256':digest(public_manifest) if public_manifest.is_file() else None,'allOtherOutputBytesUnchanged':True}

def load_r4():
    source=BUNDLE/'r4-source/scripts/render_material_map_r4.py'
    adapter=HERE/'runtime-adapter/r4-source/scripts'
    adapter.mkdir(parents=True,exist_ok=True)
    local=adapter/'render_material_map_r4.py'
    if not local.exists(): shutil.copyfile(source,local)
    if digest(source)!=digest(local): raise AssertionError('runtime adapter is not an exact renderer copy')
    marker=adapter/'runtime_baseline.py'
    if not marker.exists(): marker.write_text('# import-root marker only; no project source or runtime behavior\n')
    sp=importlib.util.spec_from_file_location('forward_r4_renderer',local)
    mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
    root=BUNDLE/'portable-root'
    mod.ROOT=str(root)
    mod.OWNER=str(root/'design/continent-terrain-class-method/owner-terrain')
    mod.MAT=str(Path(mod.OWNER)/'materials')
    mod.MASK=str(Path(mod.OWNER)/'art-tiles/act1-smoothed-semantic.png')
    mod.SOURCE_DIR=str(BUNDLE/'r4-source')
    mod.PAINT_SOURCE=str(BUNDLE/'r4-source')
    mod.PAINT_CONFIG=str(BUNDLE/'r4-source/paint-source-r4-v5.json')
    mod.ACT1_MANIFEST=str(BUNDLE/'portable-root/design/review/overworld-art-blueprint/act-by-act/act1/runtime-v4/act1-painted-overworld-r4/runtime/manifest.json')
    mod.ACT1_R26_MANIFEST=str(root/'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/runtime/manifest.json')
    return mod

def current_navigation(man):
    wm=BUNDLE/'current/act1-world-map.js'; dq=BUNDLE/'current/dq-tiles.js'
    js=r'''const fs=require('fs'),vm=require('vm'),p=process.argv[1];const c={window:{setInterval:()=>0,clearInterval:()=>0},console,setTimeout:()=>0,clearTimeout:()=>0};vm.runInNewContext(fs.readFileSync(p,'utf8'),c,{timeout:4000});const w=c.window.__ACT1_WORLD_MAP__;const out=w.landmarks.map(l=>{const e=l.exit||l.at,door=l.at||e;const a=[[0,-1],[1,0],[0,1],[-1,0]].filter(d=>w.seedWalkableAt(door.x+d[0],door.y+d[1])).map(d=>({x:door.x+d[0],y:door.y+d[1]}));return {id:l.mapId,exit:{x:e.x,y:e.y},door:{x:door.x,y:door.y},approaches:a};});const start={x:69,y:256},q=[start],seen=new Set([start.x+','+start.y]);for(let i=0;i<q.length;i++){const p=q[i];for(const d of [[0,-1],[1,0],[0,1],[-1,0]]){const x=p.x+d[0],y=p.y+d[1],k=x+','+y;if(x<16||x>178||y<218||y>399||seen.has(k)||!w.seedWalkableAt(x,y))continue;seen.add(k);q.push({x,y});}}const reached=p=>seen.has(p.x+','+p.y);const rr=out.map(l=>({id:l.id,exitReachable:reached(l.exit),approachesReachable:l.approaches.map(reached)}));const routeGraph={source:'current bundled __ACT1_WORLD_MAP__.seedWalkableAt',start,reachableCellCount:seen.size,landmarks:rr,allExitsReachable:rr.every(x=>x.exitReachable),allApproachesReachable:rr.every(x=>x.approachesReachable.every(Boolean)),caveEntrance:{x:149,y:279,walkable:w.seedWalkableAt(149,279),reachable:reached({x:149,y:279})}};console.log(JSON.stringify({revision:w.revision,bounds:w.bounds,landmarks:out,routeGraph}));'''
    run=subprocess.run(['node','-e',js,str(wm)],text=True,capture_output=True,check=True)
    nav=json.loads(run.stdout)
    if not nav['routeGraph']['allExitsReachable'] or not nav['routeGraph']['allApproachesReachable'] or not nav['routeGraph']['caveEntrance']['walkable'] or not nav['routeGraph']['caveEntrance']['reachable']:
        raise AssertionError('current world-map route graph does not reach every exit/approach and Crystal Cave entrance')
    exits={(v['id'],v['exit']['x'],v['exit']['y']) for v in nav['landmarks']}
    pinned={(v['id'],v['x'],v['y']) for v in man['liveLandmarkExits']}
    if exits!=pinned: raise AssertionError('current bundled map exits differ from current manifest')
    approaches={(v['id'],a['x'],a['y']) for v in nav['landmarks'] for a in v['approaches']}
    expected={(v['landmarkId'],v['x'],v['y']) for v in man['liveValidApproaches']}
    if approaches!=expected: raise AssertionError('current bundled walkable approaches differ from current manifest')
    dqtext=dq.read_text()
    required=['function a1aStartCell()',"p.mapId==='overworld'",'return {x:p.x,y:p.y}',"(p&&p.mapId)||'greenhollow'",'return (m&&m.startCell)||null']
    if any(token not in dqtext for token in required): raise AssertionError('current DQ prefetch function contract changed')
    g=next(v for v in nav['landmarks'] if v['id']=='greenhollow')['exit']
    if (man['startCell']['x'],man['startCell']['y'])!=(g['x'],g['y']): raise AssertionError('current startCell differs from default live Greenhollow exit')
    return {'mapRevision':nav['revision'],'worldMapSha256':digest(wm),'dqTilesSha256':digest(dq),'landmarks':nav['landmarks'],'exitCount':len(exits),'approachCount':len(approaches),'startCell':man['startCell'],'startSemantics':'DQ a1aStartCell is first-window prefetch: saved overworld position, else live exit/at for saved map/default Greenhollow, else manifest.startCell/null; actual new-game spawn and dynamic save recovery are not inferred.'}

def build_hero_offsets():
    offsets=set(); entries=[]
    for rel in ('heroes/hero-g3-walk.png','heroes/hero-male-walk.png'):
        p=BUNDLE/rel; im=Image.open(p).convert('RGBA')
        if im.size!=(768,64): raise AssertionError(f'unexpected selectable hero sheet {rel}: {im.size}')
        for i in range(12):
            fr=im.crop((i*64,0,(i+1)*64,64)).resize((62,62),Image.Resampling.NEAREST)
            y,x=np.nonzero(np.asarray(fr.getchannel('A'))>=8)
            offsets.update((int(xx)-31,int(yy)-31) for xx,yy in zip(x,y))
        entries.append({'path':'inputs/terrain-current-profile-20261007/'+rel,'sha256':digest(p)})
    return sorted(offsets,key=lambda p:(p[1],p[0])),entries

def cliff_stable_identity(record):
    """Identity for one pinned cliff placement, independent of list order."""
    group=record.get('group');asset=record.get('asset');origin=record.get('originWorldCell')
    if group not in ('main','companion') or not isinstance(asset,str) or not asset or not isinstance(origin,list) or len(origin)!=2:
        raise AssertionError('cliff placement lacks stable group/asset/origin identity')
    return f"{group}|{asset}|{int(origin[0])},{int(origin[1])}"

def apply_north_whole_object_policy(events,recipe,placement_sha,rect_xyxy):
    """Omit only fully-contained old cliffs; preserve crossing/disjoint sprites whole."""
    policy=recipe.get('wholeObjectPolicy')
    if not isinstance(policy,dict) or policy.get('sourcePlacementSha256')!=placement_sha:
        raise AssertionError('whole-object policy is not bound to the exact cliff placement inventory')
    ids=[cliff_stable_identity(e['record']) for e in events]
    if len(ids)!=len(set(ids)):
        raise AssertionError('cliff stable placement identities are not unique')
    counts=policy.get('expectedCounts',{})
    if len(events)!=int(counts.get('source',-1)):
        raise AssertionError('whole-object policy source inventory count differs from the approved recipe')
    x0,y0,x1,y1=map(int,rect_xyxy)
    if x1<=x0 or y1<=y0: raise AssertionError('north replacement XYXY rectangle is empty')
    classes={'contained':[],'crossing':[],'disjoint':[]}
    for event,stable_id in zip(events,ids):
        alpha=np.asarray(event['image'].getchannel('A'))>0
        yy,xx=np.nonzero(alpha)
        if not len(xx): raise AssertionError(f'cliff sprite has no displayed hard-alpha pixels: {stable_id}')
        gx=xx+int(event['x']);gy=yy+int(event['y'])
        inside=(gx>=x0)&(gx<x1)&(gy>=y0)&(gy<y1)
        count=int(inside.sum())
        category='contained' if count==len(xx) else ('crossing' if count else 'disjoint')
        classes[category].append(stable_id)
    expected=policy.get('expectedStableIdentities',{})
    for category in ('contained','crossing'):
        if sorted(classes[category])!=sorted(expected.get(category,[])):
            raise AssertionError(f'whole-object {category} stable identities differ from the approved recipe')
    for category in ('contained','crossing','disjoint'):
        if len(classes[category])!=int(counts.get(category,-1)):
            raise AssertionError(f'whole-object {category} alpha-class count differs from the approved recipe')
    if len(classes['disjoint'])!=int(counts.get('disjoint',-1)):
        raise AssertionError('whole-object disjoint source inventory count differs from the approved recipe')
    retained_ids=set(classes['crossing'])|set(classes['disjoint'])
    retained=[event for stable_id,event in zip(ids,events) if stable_id in retained_ids]
    if len(retained)!=int(counts.get('retained',-1)):
        raise AssertionError('whole-object retained source count differs from the approved recipe')
    return retained,{'sourcePlacementSha256':placement_sha,'sourceObjectCount':len(events),
        'classificationCounts':{k:len(v) for k,v in classes.items()},'retainedObjectCount':len(retained),
        'omittedContainedStableIdentities':sorted(classes['contained']),
        'retainedCrossingStableIdentities':sorted(classes['crossing']),
        'retainedDisjointCount':len(classes['disjoint']),'perPixelRectangleClippingApplied':False}

def validate_cliff_feedback_overlay(overlay,placement_sha,north_sha,atlas_hashes,existing_ids):
    """Validate the bounded owner-reviewed cliff correction against canonical inputs."""
    if overlay.get('schema')!='act1-cliff-feedback-overlay-v1':
        raise AssertionError('cliff feedback overlay schema changed')
    pins=overlay.get('sourcePins',{})
    if pins.get('cliffPlacementsSha256')!=placement_sha or pins.get('northRecipeSha256')!=north_sha:
        raise AssertionError('cliff feedback overlay source pins differ from canonical inputs')
    if pins.get('mainAtlasSha256')!=atlas_hashes.get('main') or pins.get('companionAtlasSha256')!=atlas_hashes.get('companion'):
        raise AssertionError('cliff feedback overlay atlas pins differ from canonical inputs')
    if int(overlay.get('sourcePlacementCount',-1))!=194:
        raise AssertionError('cliff feedback overlay is not bound to the 194-record placement inventory')
    removals=overlay.get('removeStableIdentities')
    if not isinstance(removals,list) or len(removals)!=18 or len(set(removals))!=18:
        raise AssertionError('cliff feedback overlay must name exactly 18 unique removals')
    missing=set(removals)-set(existing_ids)
    if missing:
        raise AssertionError('cliff feedback removals are missing after canonical north policy: '+', '.join(sorted(missing)))
    additions=overlay.get('addWholePlacements')
    if additions!=[{'group':'main','asset':'broad-joining-mass-A','originWorldCell':[34,242]}]:
        raise AssertionError('cliff feedback overlay addition differs from the reviewed whole-mass placement')
    added_id=cliff_stable_identity(additions[0])
    if added_id in set(existing_ids):
        raise AssertionError('cliff feedback whole-mass placement already exists')
    return set(removals),additions[0]

def make_context():
    verify_bundle()
    man=json.loads((BUNDLE/'current/act1-hifi-manifest.json').read_text())
    r26=json.loads(R26_RUNTIME_MANIFEST.read_text())
    # The current recovered template is allowed to omit the preserved runtime
    # pathConstraints field; every other locked geometry field must match the
    # pinned R26 runtime authority before rendering starts.
    apply_r26_locked_geometry(man,r26)
    owner=json.loads((BUNDLE/'current/owner-terrain.json').read_text())['acts']['1']
    bounds=owner['bounds']; rows=owner['terrainRows']
    if bounds!=[16,218,163,399] or len(man['chunks'])!=120: raise AssertionError('unexpected current owner bounds/chunk inventory')
    if len(json.loads((BUNDLE/'placements/forest-r4-whole-act1.json').read_text())['placements'])!=2061: raise AssertionError('forest source count changed')
    if len(json.loads((BUNDLE/'placements/cliff-selected-layout-whole-act1.json').read_text())['placements'])!=194: raise AssertionError('cliff source count changed')
    grid=np.zeros((len(rows),len(rows[0])),dtype=np.uint8)
    for y,row in enumerate(rows):
        for x,ch in enumerate(row): grid[y,x]={'F':1,'M':2,'.':3}.get(ch,0)
    if grid.shape!=(182,148): raise AssertionError(f'unexpected semantic class dimensions {grid.shape}')
    # One byte per output pixel, not a float full-world renderer surface.
    class_px=np.repeat(np.repeat(grid,32,axis=0),32,axis=1)
    hero_offsets,hero_pins=build_hero_offsets()
    nav=current_navigation(man)
    guard=np.zeros((H,W),dtype=np.uint8)
    guard_cells={(v['exit']['x'],v['exit']['y']) for v in nav['landmarks']}
    guard_cells.update((a['x'],a['y']) for v in nav['landmarks'] for a in v['approaches'])
    guard_cells.add((nav['startCell']['x'],nav['startCell']['y']))
    for cx,cy in sorted(guard_cells):
        ax=(cx-bounds[0])*32+16; ay=(cy-bounds[1])*32+16
        for dx,dy in hero_offsets:
            x,y=ax+dx,ay+dy
            if 0<=x<W and 0<=y<H: guard[y,x]=1
    renderer=load_r4()
    _,_,crowns,_=renderer._load_paint_art(str(BUNDLE/'r4-source/paint-source-r4-v5.json'))
    fdoc=json.loads((BUNDLE/'placements/forest-r4-whole-act1.json').read_text())
    fp=fdoc['placements']
    cdoc=json.loads((BUNDLE/'placements/cliff-selected-layout-whole-act1.json').read_text())
    cliffs=cdoc['placements']
    comp=json.loads((BUNDLE/'placements/cliff-composition-report.json').read_text())
    components={c['name']:c for c in comp['coordinateContract']['assetComponents']}
    atlases={'main':BUNDLE/'atlases/act1-cliff-kit-imagegen-v1.png','companion':BUNDLE/'atlases/companion-cliff-kit-imagegen-v2.png'}
    tree_cache={}; rock_cache={}
    def tree(rec):
        key=(int(rec['sourceIndex']),round(float(rec['side']),4),bool(rec.get('flipX')))
        if key not in tree_cache:
            raw=crowns[key[0]].convert('RGBA'); scale=key[1]/max(raw.size)
            size=(max(1,round(raw.width*scale*2)),max(1,round(raw.height*scale*2)))
            src_a=np.asarray(raw.getchannel('A').resize(size,Image.Resampling.NEAREST))
            rgb=np.asarray(raw.convert('RGB').resize(size,Image.Resampling.NEAREST))
            if key[2]: src_a=src_a[:,::-1];rgb=rgb[:,::-1]
            im=Image.fromarray(np.dstack((rgb,np.where(src_a>=128,255,0).astype(np.uint8))),'RGBA')
            a=np.asarray(im.getchannel('A'))
            yy,xx=np.nonzero(a>0);by=int(yy.max());ax=int(np.median(np.flatnonzero(a[by]>0)))
            tree_cache[key]=(im,(ax,by),int(np.count_nonzero((src_a>=16)&(src_a<128))))
        return tree_cache[key]
    def rock(rec):
        key=(rec['group'],rec['asset'])
        if key not in rock_cache:
            c=components[rec['asset']];src=Image.open(atlases[rec['group']]).convert('RGBA').crop(tuple(c['sourceCrop']))
            scale=.5 if rec['group']=='main' else .125
            im=src.resize((round(src.width*scale),round(src.height*scale)),Image.Resampling.NEAREST)
            source_a=np.asarray(im.getchannel('A'));rgba=np.asarray(im).copy();rgba[...,3]=np.where(source_a>=128,255,0).astype(np.uint8)
            im=Image.fromarray(rgba,'RGBA');a=np.asarray(im.getchannel('A'))
            yy,xx=np.nonzero(a>0);by=int(yy.max());ax=int(np.median(np.flatnonzero(a[by]>0)))
            rock_cache[key]=(im,(ax,by),int(np.count_nonzero((source_a>=16)&(source_a<128))))
        return rock_cache[key]
    events=[]; forest=[]; mountain=[]
    for i,rec in enumerate(fp):
        im,(ax,ay),fringe=tree(rec);cx,cy=rec['center']
        x=round((cx-bounds[0])*32-im.width/2);y=round((cy-bounds[1])*32-im.height/2)
        e={'id':f'tree:{rec["id"]}','kind':'tree','record':rec,'image':im,'x':x,'y':y,'contact':(x+ax,y+ay),'sourceFringeDiscarded':fringe}
        forest.append(e);events.append(e)
    for rec in cliffs:
        im,(ax,ay),fringe=rock(rec);cx,cy=rec['originWorldCell']
        x=(cx-bounds[0])*32;y=(cy-bounds[1])*32
        stable_id=cliff_stable_identity(rec)
        e={'id':f'cliff:{stable_id}','stableSourceIdentity':stable_id,'kind':'cliff','record':rec,'image':im,'x':x,'y':y,'contact':(x+ax,y+ay),'sourceFringeDiscarded':fringe}
        mountain.append(e);events.append(e)
    # Apply the owner-approved nine-object north recipe without editing source records.
    recipe=json.loads(NORTH_RECIPE.read_text())
    if recipe.get('profileId')!='act1-forward-20261007-v1' or len(recipe.get('objects',[]))!=9:
        raise AssertionError('north recipe identity/object count mismatch')
    atlas_sha=digest(atlases['main'])
    if recipe['provenance']['atlasSha256']!=atlas_sha:
        raise AssertionError('north recipe atlas pin mismatch')
    if recipe['provenance'].get('companionAtlasSha256')!=digest(atlases['companion']):
        raise AssertionError('north recipe companion-atlas pin mismatch')
    north_window=recipe['northWindow']
    local_x,local_y,local_w,local_h=map(int,north_window['replacementRectLocalXYWH'])
    raster_x,raster_y=map(int,north_window['northRasterOrigin'])
    north_rect=(raster_x+local_x,raster_y+local_y,raster_x+local_x+local_w,raster_y+local_y+local_h)
    if north_rect!=tuple(map(int,north_window['replacementRectGlobalXYXY'])) or north_rect!=(2344,0,3234,400):
        raise AssertionError('north replacement rectangle XYWH-to-XYXY conversion changed')
    cliff_placements_sha=digest(BUNDLE/'placements/cliff-selected-layout-whole-act1.json')
    mountain,whole_object_report=apply_north_whole_object_policy(mountain,recipe,cliff_placements_sha,north_rect)
    overlay=json.loads(CLIFF_FEEDBACK_OVERLAY.read_text())
    removed_ids,added_record=validate_cliff_feedback_overlay(
        overlay,cliff_placements_sha,digest(NORTH_RECIPE),
        {group:digest(path) for group,path in atlases.items()},
        [cliff_stable_identity(e['record']) for e in mountain])
    removed_overlay_events=[e for e in mountain if cliff_stable_identity(e['record']) in removed_ids]
    if len(removed_overlay_events)!=len(removed_ids):
        raise AssertionError('cliff feedback overlay removal count differs after canonical north policy')
    mountain=[e for e in mountain if cliff_stable_identity(e['record']) not in removed_ids]
    added_image,(added_anchor_x,added_anchor_y),added_fringe=rock(added_record)
    added_x=(int(added_record['originWorldCell'][0])-bounds[0])*32
    added_y=(int(added_record['originWorldCell'][1])-bounds[1])*32
    added_overlay_event={'id':'cliff:'+cliff_stable_identity(added_record),'kind':'cliff',
        'record':added_record,'image':added_image,'x':added_x,'y':added_y,
        'contact':(added_x+added_anchor_x,added_y+added_anchor_y),
        'sourceFringeDiscarded':added_fringe}
    def assert_overlay_event_owner_and_guard(event,label):
        aa=np.asarray(event['image'].getchannel('A'))>0
        yy,xx=np.nonzero(aa);gx=xx+int(event['x']);gy=yy+int(event['y'])
        inside=(gx>=0)&(gx<W)&(gy>=0)&(gy<H)
        if not inside.all(): raise AssertionError(f'{label} alpha escapes current semantic bounds')
        if np.any(class_px[gy,gx]!=2): raise AssertionError(f'{label} alpha leaves owner M')
        if np.any(guard[gy,gx]): raise AssertionError(f'{label} alpha intersects current route/hero guard')
        return int(len(gx))
    removed_overlay_alpha=0
    for event in removed_overlay_events:
        removed_overlay_alpha+=assert_overlay_event_owner_and_guard(event,'removed cliff feedback object')
    added_overlay_alpha=assert_overlay_event_owner_and_guard(added_overlay_event,'added cliff feedback object')
    mountain.append(added_overlay_event)
    retained_event_ids={id(e) for e in mountain}
    events=[e for e in events if e['kind']!='cliff' or id(e) in retained_event_ids]
    events.append(added_overlay_event)
    north_events=[];north_rgba=Image.new('RGBA',(1152,768),(0,0,0,0))
    for spec in recipe['objects']:
        group=spec.get('atlasGroup') or ('main' if spec['name'].endswith('-A') else 'companion')
        if group not in atlases: raise AssertionError(f'unsupported approved north atlas group: {group}')
        expected_group='main' if spec['name'].endswith('-A') else 'companion'
        if group!=expected_group or spec.get('atlasSha256')!=digest(atlases[group]):
            raise AssertionError(f'north object atlas identity differs from the approved preview: {spec["id"]}')
        x0,y0,x1,y1=map(int,spec['atlasCrop']);src=Image.open(atlases[group]).convert('RGBA').crop((x0,y0,x1,y1))
        im=src.resize((round(src.width*float(spec['scale'])),round(src.height*float(spec['scale']))),Image.Resampling.NEAREST)
        aa=np.asarray(im.getchannel('A'));rgba=np.asarray(im).copy();rgba[...,3]=np.where(aa>=int(recipe['drawOrder']['sourceAlphaHardCut']),255,0).astype(np.uint8);im=Image.fromarray(rgba,'RGBA')
        if (hashlib.sha256(im.tobytes()).hexdigest()!=spec.get('processedRgbaSha256') or
                hashlib.sha256(im.getchannel('A').tobytes()).hexdigest()!=spec.get('processedAlphaSha256')):
            raise AssertionError(f'north object processed RGBA/alpha identity differs from approved preview: {spec["id"]}')
        yy,xx=np.nonzero(np.asarray(im.getchannel('A'))>0)
        if not len(xx): raise AssertionError(f'empty north recipe object {spec["id"]}')
        ox,oy=map(int,spec['originWorldCell']);x=(ox-bounds[0])*32;y=(oy-bounds[1])*32
        bottom=int(yy.max());contact=(x+int(np.median(np.flatnonzero(np.asarray(im.getchannel('A'))[bottom]>0))),y+bottom)
        e={'id':'north:'+spec['id'],'kind':'north-'+spec['role'],'record':spec,'image':im,'x':x,'y':y,'contact':contact,'sourceFringeDiscarded':int(np.count_nonzero((aa>=16)&(aa<128))),'sourceOrigin':(ox,oy),'sourceName':spec['name']}
        north_events.append(e);events.append(e)
        lx=x-2304;ly=y
        north_rgba.alpha_composite(im,(lx,ly))
        want=recipe['expectedPreviewInvariant']['contactYDrawOrder']
        expected=next(v for v in want if v['id']==spec['id'])
        if contact!=(2304+int(expected['contactXLocalPx']),int(expected['contactYLocalPx'])):
            raise AssertionError(f'north contact anchor differs from approved preview for {spec["id"]}: {contact}')
    if int(np.count_nonzero(np.asarray(north_rgba.getchannel('A'))))!=int(recipe['expectedPreviewInvariant']['alphaUnionPixels']):
        raise AssertionError('nine-object north alpha union differs from approved preview invariant')
    pilot=json.loads(PILOT_RECEIPT.read_text())
    pilot_records=pilot['checks']['selectedPilotFMBoundaryCandidates']
    if len(pilot_records)!=11: raise AssertionError('approved pilot 11 crown seed inventory missing')
    pilot_seed_ids={v['id'] for v in pilot_records}
    layout_doc=json.loads(LAYOUT_RECIPE.read_text())
    layout_records=layout_doc['boundaryPlacementRecords'];layout_ids=[v['id'] for v in layout_records]
    if layout_doc.get('profileId')!='act1-forward-20261007-v1' or layout_doc.get('recipeVersion')!='accepted-whole-layout-v2' or len(layout_records)!=40 or len(set(layout_ids))!=40:
        raise AssertionError('accepted whole-layout recipe identity/count/uniqueness mismatch')
    if not pilot_seed_ids.issubset(set(layout_ids)) or 'forest-edge-r16-136.050' in layout_ids:
        raise AssertionError('accepted whole-layout recipe changed pilot seeds or retained rejected substitute')
    layout_input_pins=layout_doc['basis']
    if layout_input_pins['generationAInputBundleManifestSha256']!=digest(BUNDLE/'input-manifest.json'):
        raise AssertionError('accepted layout and current frozen terrain bundle differ')
    if layout_input_pins['pilotReceiptSha256']!=digest(PILOT_RECEIPT):
        raise AssertionError('accepted layout recipe no longer binds approved pilot receipt')
    if layout_input_pins['pilotFinalRaisedAlphaSha256']!=digest(PILOT_ALPHA):
        raise AssertionError('accepted layout recipe no longer binds approved pilot alpha input')
    if layout_input_pins['northRecipeSha256']!=ACCEPTED_LAYOUT_NORTH_TRANSFORM_RECIPE_SHA256:
        raise AssertionError('accepted layout recipe no longer binds the frozen approved nine-piece transforms')
    layout_seed_ids=layout_doc['approvedPilotSeedIds']
    if layout_seed_ids!=[v['id'] for v in pilot_records]:
        raise AssertionError('accepted layout recipe pilot seed order differs from approved receipt')
    subgrid_doc=layout_doc['fixed4pxSubgridRule']
    subgrid_records=subgrid_doc['additions'];subgrid_ids={r['id'] for r in subgrid_records}
    if len(subgrid_records)!=4 or subgrid_doc['offsetStepPixels']!=4 or not subgrid_ids.issubset(set(layout_ids)):
        raise AssertionError('accepted layout does not contain the exact reviewed fixed 4px subgrid pass')
    recipe_by_id={r['id']:r for r in layout_records}
    if any(recipe_by_id[r['id']]!=r for r in subgrid_records):
        raise AssertionError('accepted layout changed a fixed 4px subgrid transform')
    if layout_input_pins['fixed4pxSubgridEvidenceSha256']!=subgrid_doc['evidenceSha256']:
        raise AssertionError('accepted layout fixed 4px evidence pin differs from embedded exact transforms')
    # Record recipe and pilot source hashes in evidence; both remain inputs, not outputs.
    pilot_input_sha=digest(PILOT_RECEIPT)
    north_recipe_sha=digest(NORTH_RECIPE)
    fm_edges=[];f_boundary_cells=set(); edge_cells=set()
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            wx,wy=bounds[0]+x,bounds[1]+y
            for dx,dy in ((1,0),(0,1)):
                nx,ny=x+dx,y+dy
                if ny<len(rows) and nx<len(rows[ny]) and {ch,rows[ny][nx]}=={'F','M'}:
                    a=(wx,wy);b=(bounds[0]+nx,bounds[1]+ny)
                    fm_edges.append((a,b));edge_cells.add(a);edge_cells.add(b)
                    f_boundary_cells.add(a if ch=='F' else b)
    edge_points=sorted(edge_cells)
    def owner_cell(wx,wy):
        ix=int(math.floor(wx))-bounds[0];iy=int(math.floor(wy))-bounds[1]
        if iy<0 or ix<0 or iy>=len(rows) or ix>=len(rows[iy]):return '?'
        return rows[iy][ix]
    forest_plane=np.zeros((H,W),dtype=np.uint8);cliff_plane=np.zeros((H,W),dtype=np.uint8)
    outside_visible=0
    def raster_event(plane,e):
        nonlocal outside_visible
        aa=np.asarray(e['image'].getchannel('A'))>0; yy,xx=np.nonzero(aa)
        gx=xx+e['x'];gy=yy+e['y']
        inside=(gx>=0)&(gx<W)&(gy>=0)&(gy<H)
        outside_visible+=int((~inside).sum())
        if inside.any(): plane[gy[inside],gx[inside]]=255
    for e in forest:raster_event(forest_plane,e)
    for e in mountain:raster_event(cliff_plane,e)
    for e in north_events:raster_event(cliff_plane,e)
    # Mark only art-to-art exposed intervals across actual adjacent F/M owner cells.
    # This generalizes the approved vertical seam measurement to every current 4-way F/M edge.
    gap=np.zeros((H,W),dtype=np.uint8); edge_gap_counts=[];edge_gap_segments=[]
    for (x1,y1),(x2,y2) in fm_edges:
        t=0; count=0;segments=[]
        if x1==x2: # vertical neighboring cells
            top=min(y1,y2); lower=max(y1,y2); bx=(x1-bounds[0])*32; by=(top-bounds[1])*32+32
            top_kind=rows[top-bounds[1]][x1-bounds[0]]
            for d in range(32):
                gx=bx+d
                if top_kind=='M':
                    a=np.flatnonzero(cliff_plane[by-32:by,gx]);b=np.flatnonzero(forest_plane[by:by+32,gx])
                    if len(a) and len(b):
                        lo=by-32+int(a.max())+1;hi=by+int(b.min())
                        if hi>lo:gap[lo:hi,gx]=1;count+=hi-lo;segments.append(['v',gx,lo,hi])
                else:
                    a=np.flatnonzero(forest_plane[by-32:by,gx]);b=np.flatnonzero(cliff_plane[by:by+32,gx])
                    if len(a) and len(b):
                        lo=by-32+int(a.max())+1;hi=by+int(b.min())
                        if hi>lo:gap[lo:hi,gx]=1;count+=hi-lo;segments.append(['v',gx,lo,hi])
        else: # horizontal neighboring cells
            left=min(x1,x2);right=max(x1,x2);by=(y1-bounds[1])*32;bx=(left-bounds[0])*32+32
            left_kind=rows[y1-bounds[1]][left-bounds[0]]
            for d in range(32):
                gy=by+d
                if left_kind=='M':
                    a=np.flatnonzero(cliff_plane[gy,bx-32:bx]);b=np.flatnonzero(forest_plane[gy,bx:bx+32])
                    if len(a) and len(b):
                        lo=bx-32+int(a.max())+1;hi=bx+int(b.min())
                        if hi>lo:gap[gy,lo:hi]=1;count+=hi-lo;segments.append(['h',gy,lo,hi])
                else:
                    a=np.flatnonzero(forest_plane[gy,bx-32:bx]);b=np.flatnonzero(cliff_plane[gy,bx:bx+32])
                    if len(a) and len(b):
                        lo=bx-32+int(a.max())+1;hi=bx+int(b.min())
                        if hi>lo:gap[gy,lo:hi]=1;count+=hi-lo;segments.append(['h',gy,lo,hi])
        edge_gap_counts.append({'edge':[[x1,y1],[x2,y2]],'uncoveredPixelsBefore':count})
        edge_gap_segments.append(segments)
    gap[(forest_plane>0)|(cliff_plane>0)|(guard>0)]=0
    baseline=np.maximum(forest_plane,cliff_plane)
    # Global approved lattice: original row/offset/jitter/source cycle, now evaluated beside
    # every F/M interface; no hand-selected coordinate window or per-location patch.
    cycle=[1,4,5,6,2,3,0]; candidates=[]
    maxrow=int(math.ceil((len(rows)-.55)/1.38))
    for row in range(maxrow+1):
        cy=bounds[1]+.55+row*1.38; offset=(row%2)*.69
        for cx in np.arange(bounds[0]+.45+offset,bounds[2]-.15,.46):
            jx=((((row*17+int(cx*13))%7)-3)*.035);jy=((((row*11+int(cy*19))%7)-3)*.035)
            px=float(cx+jx);py=float(cy+jy)
            # A crown's bottom contact sits roughly one cell below its center; the
            # five-cell lattice window only bounds work near the actual F/M edge.
            # Final root must be F; the exact visible-alpha intersection with the
            # current uncovered interface is checked below before it can be selected.
            cc=(int(math.floor(px)),int(math.floor(py)))
            if not any(abs(cc[0]-ex)+abs(cc[1]-ey)<=5 for ex,ey in edge_points):continue
            rec={'id':f'forest-edge-r{row}-{px:.3f}','center':[round(px,4),round(py,4)],'sourceIndex':cycle[(row+int(cx*2)+int(cy*3))%7],'side':68,'flipX':((row+int(cx*10))%2==1),'candidateRow':row}
            im,(ax,ay),fringe=tree(rec);x=round((px-bounds[0])*32-im.width/2);y=round((py-bounds[1])*32-im.height/2)
            contact=(x+ax,y+ay);rootcell=(bounds[0]+contact[0]//32,bounds[1]+contact[1]//32)
            if owner_cell(*rootcell)!='F':continue
            a=np.asarray(im.getchannel('A'))>0;yy,xx=np.nonzero(a)
            gx=xx+x;gy=yy+y
            if not len(gx) or np.any(gx<0)|np.any(gx>=W)|np.any(gy<0)|np.any(gy>=H):continue
            classes=class_px[gy,gx]
            if np.any((classes!=1)&(classes!=2)):continue
            if np.any(guard[gy,gx]):continue
            ids=gy.astype(np.int64)*W+gx
            target_ids=ids[gap.ravel()[ids]>0]
            if not len(target_ids) and rec['id'] not in layout_ids:continue
            candidates.append({'id':rec['id'],'record':rec,'image':im,'x':x,'y':y,'contact':contact,'ids':ids,'targetIds':target_ids,'sourceFringeDiscarded':fringe})
    candidate_by_id={c['id']:c for c in candidates}
    missing=[v['id'] for v in layout_records if v['id'] not in subgrid_ids and v['id'] not in candidate_by_id]
    if missing: raise RuntimeError('accepted whole-layout crown fails current full-world eligibility: '+', '.join(missing))
    for rec in layout_records:
        if rec['id'] not in subgrid_ids and candidate_by_id[rec['id']]['record']!=rec:
            raise AssertionError(f'accepted whole-layout transform differs from current deterministic candidate: {rec["id"]}')
    remaining=gap.ravel().copy().astype(bool);added=[];pool=candidates[:]
    # Freeze the visually accepted complete placement set. Retain the exact 11
    # approved pilot placements, then every other approved whole-crown record in
    # recipe order; the four fixed 4px records are verified and admitted below.
    for v in pilot_records:
        c=candidate_by_id[v['id']]
        added.append(c);remaining[c['targetIds']]=False;pool.remove(c)
    for rec in layout_records:
        if rec['id'] in pilot_seed_ids or rec['id'] in subgrid_ids:continue
        c=candidate_by_id[rec['id']]
        added.append(c);remaining[c['targetIds']]=False;pool.remove(c)
    # Reapply the one previously reviewed 4px sub-lattice candidate pass to this
    # north+pilot state. It is a fixed four-placement pass from pinned feasibility
    # evidence, not a new search or coordinate patch; every whole sprite is rechecked.
    subgrid_added=[]
    for rec in subgrid_records:
        im,(ax,ay),fringe=tree(rec);px,py=map(float,rec['center'])
        x=round((px-bounds[0])*32-im.width/2);y=round((py-bounds[1])*32-im.height/2);contact=(x+ax,y+ay)
        rootcell=(bounds[0]+contact[0]//32,bounds[1]+contact[1]//32)
        aa=np.asarray(im.getchannel('A'))>0;yy,xx=np.nonzero(aa);gx=xx+x;gy=yy+y
        if owner_cell(*rootcell)!='F' or np.any(gx<0)|np.any(gx>=W)|np.any(gy<0)|np.any(gy>=H):
            raise RuntimeError(f'pinned subgrid crown fails root/bounds: {rec["id"]}')
        if np.any((class_px[gy,gx]!=1)&(class_px[gy,gx]!=2)): raise RuntimeError(f'pinned subgrid crown leaves F/M: {rec["id"]}')
        if np.any(guard[gy,gx]): raise RuntimeError(f'pinned subgrid crown intersects current hero/route guard: {rec["id"]}')
        ids=gy.astype(np.int64)*W+gx;target_ids=ids[remaining.ravel()[ids]]
        if not len(target_ids): raise RuntimeError(f'pinned subgrid crown covers no remaining F/M residual: {rec["id"]}')
        c={'id':rec['id'],'record':rec,'image':im,'x':x,'y':y,'contact':contact,'ids':ids,'targetIds':target_ids,'sourceFringeDiscarded':fringe}
        subgrid_added.append(c);added.append(c);remaining.ravel()[target_ids]=False
    remaining_gap=remaining.reshape((H,W))
    final_alpha=np.maximum(baseline,np.zeros_like(baseline))
    for e in added:
        # Candidate IDs were evaluated at the exact displayed (post-hardcut) alpha.
        final_alpha.ravel()[e['ids']]=255
        events.append({'id':'tree:'+e['id'],'kind':'tree','record':e['record'],'image':e['image'],'x':e['x'],'y':e['y'],'contact':e['contact'],'sourceFringeDiscarded':e['sourceFringeDiscarded']})
        forest_plane.ravel()[e['ids']]=255
    final_alpha=np.maximum(forest_plane,cliff_plane)
    pilot_ref_path=PILOT_ALPHA
    pilot_ref=np.asarray(Image.open(pilot_ref_path).convert('L'))>0
    pilot_crop=final_alpha[416:928,3136:3776]>0
    pilot_xor=int(np.count_nonzero(pilot_crop^pilot_ref))
    pilot_target_xor=int(np.count_nonzero(pilot_crop[:,192:]^pilot_ref[:,192:]))
    residual_edges=[]
    for edge,segments in zip(edge_gap_counts,edge_gap_segments):
        coords=[]
        for seg in segments:
            kind,a,b,c=seg
            if kind=='v': ys=np.flatnonzero(remaining_gap[b:c,a])+b;xs=np.full(len(ys),a,dtype=np.int32)
            else: xs=np.flatnonzero(remaining_gap[a,b:c])+b;ys=np.full(len(xs),a,dtype=np.int32)
            if len(xs):coords.extend([[int(x),int(y)] for x,y in zip(xs,ys)])
        edge['uncoveredPixelsAfter']=len(coords)
        if coords:
            edge['remainingLocalBounds']=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords)+1,max(y for x,y in coords)+1]
            residual_edges.append(edge)
    residual_pixel_count=int(remaining_gap.sum())
    # Classify the reviewed six-pixel eastern residue by exact 8-connected
    # morphology. Do not accept other gaps merely because a hero bounding box is
    # larger; this one is accepted only if its pinned three-component geometry
    # remains unchanged and it has no current route/hero-guard overlap.
    ry,rx=np.nonzero(remaining_gap);unseen=set(zip(rx.tolist(),ry.tolist()));residual_components=[]
    while unseen:
        x0,y0=min(unseen,key=lambda q:(q[1],q[0]));stack=[(x0,y0)];unseen.remove((x0,y0));comp=[]
        while stack:
            x1,y1=stack.pop();comp.append((x1,y1))
            for yy0 in range(y1-1,y1+2):
                for xx0 in range(x1-1,x1+2):
                    q=(xx0,yy0)
                    if q in unseen:unseen.remove(q);stack.append(q)
        residual_components.append({'pixels':len(comp),'bounds':[min(x for x,y in comp),min(y for x,y in comp),max(x for x,y in comp)+1,max(y for x,y in comp)+1]})
    hero_width=max(x for x,y in hero_offsets)-min(x for x,y in hero_offsets)+1;hero_height=max(y for x,y in hero_offsets)-min(y for x,y in hero_offsets)+1
    reviewed_six_pixel_pattern=[{'pixels':2,'bounds':[4016,1809,4018,1810]},{'pixels':1,'bounds':[4049,1809,4050,1810]},{'pixels':3,'bounds':[4060,1809,4063,1810]}]
    accepted_natural_residual=(residual_pixel_count==6 and residual_components==reviewed_six_pixel_pattern and not np.any(remaining_gap & (guard>0)))
    if residual_pixel_count!=0 and not accepted_natural_residual:
        # Preflight evidence only: show every actual F/M edge over current material and
        # mark still uncovered art-to-art intervals. No full output package is emitted.
        evidence=HERE/'evidence';evidence.mkdir(parents=True,exist_ok=True)
        w6,h6=888,1092
        mpath=str(BUNDLE/'portable-root/design/review/overworld-art-blueprint/act-by-act/act1/runtime-v4/act1-painted-overworld-r4/runtime/manifest.json');cpath=str(BUNDLE/'r4-source/paint-source-r4-v5.json');eroot=str(BUNDLE/'empty-runtime')
        ground_renderer=renderer.Act1PaintRenderer(manifest_path=mpath,config_path=cpath,old_root=eroot);ground_renderer.trees=[];ground_renderer.rock_motifs=[]
        apply_owner_ground_policy(ground_renderer,grid)
        sem,_=ground_renderer.render_window(0,0,2368,2912,ppc=6)
        overview=Image.fromarray(sem,'RGB').convert('RGBA')
        low=Image.new('RGBA',(w6,h6),(0,0,0,0))
        for e in sorted(events,key=event_sort_key):
            im=e['image'];sz=(max(1,round(im.width*6/32)),max(1,round(im.height*6/32)));sm=im.resize(sz,Image.Resampling.LANCZOS)
            low.alpha_composite(sm,(round(e['x']*6/32),round(e['y']*6/32)))
        overview.alpha_composite(low)
        d=ImageDraw.Draw(overview)
        for (aa,bb) in fm_edges:
            (x1,y1),(x2,y2)=aa,bb
            if x1==x2: px=(x1-bounds[0])*6;py=(max(y1,y2)-bounds[1])*6;d.line((px,py,px+5,py),fill=(255,220,20,255),width=1)
            else: px=(max(x1,x2)-bounds[0])*6;py=(y1-bounds[1])*6;d.line((px,py,px,py+5),fill=(255,220,20,255),width=1)
        red_alpha=np.asarray(Image.fromarray((remaining_gap.astype(np.uint8)*255),'L').resize((w6,h6),Image.Resampling.NEAREST))
        rd=np.zeros((h6,w6,4),dtype=np.uint8);rd[...,:3]=[255,0,64];rd[...,3]=red_alpha;red=Image.fromarray(rd,'RGBA');overview.alpha_composite(red)
        overview.convert('RGB').save(evidence/'fm-contacts-unresolved-preflight.png',format='PNG',optimize=False)
        save_json(HERE/'preflight-failure.json',{'status':'FAIL_PRECHECK','reason':'the declared global approved-lattice whole-crown set cannot cover every measured exposed art-to-art F/M interval without relaxing root/support/guard rules or inventing placements','remainingPixels':int(remaining_gap.sum()),'eligibleCandidates':len(candidates),'selectedWholeCrowns':len(added),'edgesWithRemaining':residual_edges,'allBoundaryEdges':edge_gap_counts,'overview':'evidence/fm-contacts-unresolved-preflight.png','routeGuardSource':nav,'baselineRouteGuardHits':int(np.count_nonzero((baseline>0)&(guard>0))),'selectedNewRouteGuardHits':int(np.count_nonzero((final_alpha>baseline)&(guard>0))),'selectedNewOwnerPPixels':int(np.count_nonzero((final_alpha>baseline)&(class_px==3))),'sourcePins':{'forestPlacementsSha256':digest(BUNDLE/'placements/forest-r4-whole-act1.json'),'cliffPlacementsSha256':digest(BUNDLE/'placements/cliff-selected-layout-whole-act1.json'),'semanticOwnerSha256':digest(BUNDLE/'current/owner-terrain.json')}})
        return {'preflightFailed':True,'nav':nav,'contactReport':{'FMBoundaryCount':len(fm_edges),'globalLatticeEligibleCandidates':len(candidates),'selectedBoundaryObjects':len(added),'targetGapPixelsBefore':int(gap.sum()),'targetGapPixelsAfter':int(remaining_gap.sum()),'edgesWithRemaining':residual_edges},'bounds':bounds}
    if accepted_natural_residual:
        # Keep the six exposed pixels; never fill, crop, or hide them.
        if not accepted_natural_residual:
            raise RuntimeError(f'F/M residual is not a non-traversable natural pinhole: {residual_pixel_count} pixels, components={residual_components}, heroSpan={hero_width}x{hero_height}')
    baseline_guard_hits=int(np.count_nonzero((baseline>0)&(guard>0)))
    if baseline_guard_hits: raise RuntimeError(f'approved baseline objects overlap regenerated current guards at {baseline_guard_hits} pixels')
    new_guard_hits=int(np.count_nonzero((final_alpha>0)&(guard>0)))
    if new_guard_hits: raise RuntimeError(f'final object art overlaps current route guards at {new_guard_hits} pixels')
    plain=class_px==3
    added_alpha=np.zeros((H,W),dtype=np.uint8)
    for e in added:
        a=np.asarray(e['image'].getchannel('A'))>0;yy,xx=np.nonzero(a);gx=xx+e['x'];gy=yy+e['y'];ok=(gx>=0)&(gx<W)&(gy>=0)&(gy<H);added_alpha[gy[ok],gx[ok]]=255
    new_p_hits=int(np.count_nonzero((added_alpha>0)&plain))
    if new_p_hits: raise RuntimeError(f'new boundary objects spill into owner P at {new_p_hits} pixels')
    north_visible=np.zeros((H,W),dtype=np.uint8)
    north_p_counts={'ridge':0,'fill':0}
    for e in north_events:
        a=np.asarray(e['image'].getchannel('A'))>0;yy,xx=np.nonzero(a);gx=xx+e['x'];gy=yy+e['y'];ok=(gx>=0)&(gx<W)&(gy>=0)&(gy<H);north_visible[gy[ok],gx[ok]]=255
        north_p_counts[e['kind'].removeprefix('north-')]+=int(np.count_nonzero(plain[gy[ok],gx[ok]]))
    if np.any((north_visible>0)&(guard>0)): raise RuntimeError('approved north silhouette overlaps current hero/route guard')
    if np.any(final_alpha[(class_px==0)]):
        # Out-of-semantic coast/object alpha is recorded separately and never silently ignored.
        other_hits=int(np.count_nonzero(final_alpha[class_px==0]))
    else: other_hits=0
    actor_hits=[]
    for cx,cy in sorted(guard_cells):
        ax=(cx-bounds[0])*32+16;ay=(cy-bounds[1])*32+16
        hits=sum(1 for dx,dy in hero_offsets if 0<=ax+dx<W and 0<=ay+dy<H and final_alpha[ay+dy,ax+dx]>0)
        actor_hits.append({'cell':[cx,cy],'visibleArtStencilHits':hits})
    if any(v['visibleArtStencilHits'] for v in actor_hits): raise RuntimeError('final object alpha intersects full selectable-hero stencil at a current route guard')
    # Candidate list for reproducibility; preserve source records and exact selection delta.
    selected_records=[c['record'] for c in added]
    if len(added)!=40 or {e['id'] for e in added}!=set(layout_ids):raise AssertionError('final boundary set differs from exact 40-record accepted recipe')
    contact_report={'FMBoundaryCount':len(fm_edges),'globalLatticeEligibleCandidates':len(candidates),'selectedBoundaryObjects':len(added),'selectedRecords':selected_records,'acceptedLayoutRecipeSha256':digest(LAYOUT_RECIPE),'acceptedLayoutRecipeRecords':layout_records,'targetGapPixelsBefore':int(gap.sum()),'targetGapPixelsAfter':int(remaining_gap.sum()),'routeGuardCells':sorted([list(c) for c in guard_cells]),'routeGuardPixels':int(guard.sum()),'baselineRouteGuardHits':baseline_guard_hits,'finalRouteGuardHits':new_guard_hits,'newOwnerPPixels':new_p_hits,'baselineOwnerPVisiblePixels':int(np.count_nonzero((baseline>0)&plain)),'otherSemanticVisiblePixels':other_hits,'cliffFeedbackOverlay':{'schema':overlay['schema'],'sha256':digest(CLIFF_FEEDBACK_OVERLAY),'sourcePins':overlay['sourcePins'],'removedStableIdentities':sorted(removed_ids),'removedObjectAlphaPixels':removed_overlay_alpha,'addedWholePlacement':added_record,'addedObjectAlphaPixels':added_overlay_alpha,'addedAndRemovedOwnerMOnly':True,'addedAndRemovedRouteGuardHits':0,'visibleAlphaAndCollisionSource':'same final event list; collisionMask uses final alpha threshold 16'},'northRecipe':{'recipeSha256':north_recipe_sha,'pilotReceiptSha256':pilot_input_sha,'objectCount':len(north_events),'alphaUnionPixels':int(np.count_nonzero(np.asarray(north_rgba.getchannel('A')))),'sourceCliffRecords':whole_object_report['sourceObjectCount'],'retainedCliffRecords':whole_object_report['retainedObjectCount'],'finalCliffEventCountAfterFeedbackOverlay':len(mountain),'wholeObjectPolicy':whole_object_report,'cliffAlphaPixelsRemovedInsideReplacement':0,'perPixelRectangleClippingApplied':False,'cliffAnchorCountPreserved':sum(1 for e in mountain if e['contact']),'northOwnerPPixelsByRole':north_p_counts},'pilotSeed':{'receiptSha256':pilot_input_sha,'selectedCrowns':len(pilot_records),'ids':[v['id'] for v in pilot_records],'approvedCrop':[3136,416,640,512],'fullCropAlphaXorPixels':pilot_xor,'originalMeasuredTargetAlphaXorPixels':pilot_target_xor,'originalMeasuredTargetBoundsGlobal32ppc':[3328,416,3776,928]},'single4pxSubgridPass':{'sourceEvidenceSha256':subgrid_doc['evidenceSha256'],'additions':[v['record'] for v in subgrid_added]},'acceptedNaturalResidual':{'pixelCount':residual_pixel_count,'components':residual_components,'selectableHeroAlphaUnionBoundsPx':[hero_width,hero_height],'classification':'three disconnected single-row exposed F/M pinholes (2, 1, and 3 pixels); not a continuous wedge; retained unfilled for visual/native collision review','guardOverlapPixels':int(np.count_nonzero(remaining_gap & (guard>0)))} if accepted_natural_residual else {'pixelCount':0,'components':[]},'actorGuardProof':actor_hits,'sourceAlpha16To127Discarded':int(sum(e['sourceFringeDiscarded'] for e in events)),'edgeTargetSamples':edge_gap_counts}
    north_supports,north_support_proof=north_companion_upper_supports()
    render_events,shared_y_event=expand_north_contact_event(events,north_supports,'fill-04-right-pocket-mass-B-110')
    sid='fill-04-right-pocket-mass-B-110';sup=north_supports[sid]['image'];ox,oy=north_supports[sid]['originWorldCell']
    sx=(ox-bounds[0])*32;sy=(oy-bounds[1])*32-sup.height
    iy0=max(0,-sy);iy1=min(sup.height,H-sy);ix0=max(0,-sx);ix1=min(sup.width,W-sx)
    patch=np.asarray(sup.getchannel('A'))[iy0:iy1,ix0:ix1]>=128
    existing=final_alpha[sy+iy0:sy+iy1,sx+ix0:sx+ix1]>0
    shared_overlap=int(np.count_nonzero(patch&existing));shared_new=int(np.count_nonzero(patch&~existing))
    if (int(patch.sum()),shared_overlap,shared_new)!=(11479,10065,1414):
        raise AssertionError(f'B110 in-map support contact/alpha accounting changed: {int(patch.sum())}/{shared_overlap}/{shared_new}')
    box_x,box_y=sx+ix0,sy+iy0;box_w,box_h=ix1-ix0,iy1-iy0;overlap_events=[]
    for e in events:
        ex,ey=e['x'],e['y'];im=e['image'];ax0=max(box_x,ex);ay0=max(box_y,ey)
        ax1=min(box_x+box_w,ex+im.width);ay1=min(box_y+box_h,ey+im.height)
        if ax1<=ax0 or ay1<=ay0: continue
        event_alpha=np.asarray(im.getchannel('A'))[ay0-ey:ay1-ey,ax0-ex:ax1-ex]>=128
        support_crop=patch[ay0-box_y:ay1-box_y,ax0-box_x:ax1-box_x]
        pixels=int(np.count_nonzero(event_alpha&support_crop))
        if pixels: overlap_events.append({'id':e['id'],'contactY':int(e['contact'][1]),'pixels':pixels})
    expected_overlaps=[
        {'id':'north:ridge-04-broad-joining-mass-B-106','contactY':254,'pixels':3569},
        {'id':'cliff:main|interior-rock-panel|113,218','contactY':277,'pixels':6039},
        {'id':'north:ridge-05-broad-joining-mass-A-112','contactY':307,'pixels':4490},
        {'id':'cliff:main|broad-joining-mass-A|113,219','contactY':339,'pixels':1829},
    ]
    overlap_events=sorted(overlap_events,key=lambda v:(v['contactY'],v['id']))
    if overlap_events!=expected_overlaps:
        raise AssertionError(f'B110 shared contactY overlap inventory changed: {overlap_events}')
    inmap_box=(sx+ix0,sy+iy0,ix1-ix0,iy1-iy0)
    before_scene=render_objects(events,inmap_box).convert('RGBA')
    after_scene=render_objects(render_events,inmap_box).convert('RGBA')
    scene_changed=np.any(np.asarray(before_scene)!=np.asarray(after_scene),axis=2)
    if np.any(scene_changed&~patch):
        raise AssertionError('shared-Y restoration changed rendered colors outside actual B110 support alpha')
    if not scene_changed.any():
        raise AssertionError('shared-Y restoration produced no visible corrected pixels')
    shared_y_event.update({'inMapSupportPixels':int(patch.sum()),'overlapBaselinePixels':shared_overlap,
        'newVisibleAndCollisionPixels':shared_new,'collisionDeltaExpected':1414,
        'inMapRenderedColorChangedPixels':int(scene_changed.sum()),'changesOutsideSupportPixels':0,
        'inMapRenderBoxXYWH':list(inmap_box),'overlapEventsByContactY':overlap_events,
        'orderAnchorAfter':[307],'orderAnchorBefore':[339]})
    return {'man':man,'r26RuntimeManifest':r26,'owner':owner,'rows':rows,'grid':grid,'classPixels':class_px,'guard':guard,'heroOffsets':hero_offsets,'heroPins':hero_pins,'nav':nav,'renderer':renderer,'events':render_events,'northSupports':north_supports,'northSupportProof':north_support_proof,'northSharedYProof':shared_y_event,'forest':forest,'mountain':mountain,'added':added,'selectedRecords':selected_records,'finalAlpha':final_alpha,'collisionMask':final_alpha>=16,'remainingGap':remaining_gap,'contactReport':contact_report,'outsideVisibleObjectPixels':outside_visible,'inputPins':{},'bounds':bounds,'fmEdges':fm_edges}

def event_sort_key(e):
    rec=e.get('record',{})
    org=e.get('sourceOrigin') or rec.get('originWorldCell') or rec.get('center') or [e['x'],e['y']]
    name=e.get('sourceName') or rec.get('asset') or rec.get('id') or e['kind']
    return (e['contact'][1],org[0],org[1],str(name),e['id'])

def expand_north_contact_event(events,supports,stable_id):
    """Restore one connected atlas top in the shared compositor without changing its contactY."""
    original=next((e for e in events if e.get('record',{}).get('id')==stable_id),None)
    if original is None or stable_id not in supports:
        raise AssertionError(f'missing recipe event/support for shared north compositor: {stable_id}')
    upper=supports[stable_id]['image'];lower=original['image'].convert('RGBA')
    if upper.width!=lower.width or upper.height!=300:
        raise AssertionError('connected upper support does not align to its recipe lower crop')
    expanded=Image.new('RGBA',(lower.width,upper.height+lower.height),(0,0,0,0))
    expanded.paste(upper,(0,0));expanded.paste(lower,(0,upper.height))
    if expanded.crop((0,upper.height,lower.width,upper.height+lower.height)).tobytes()!=lower.tobytes():
        raise AssertionError('shared north compositor changed original lower crop pixels')
    replacement=dict(original);replacement['image']=expanded;replacement['y']=int(original['y'])-upper.height
    if event_sort_key(replacement)!=event_sort_key(original):
        raise AssertionError('restored source top changed approved shared contactY order')
    output=[replacement if e is original else e for e in events]
    proof={'id':stable_id,'lowerPixelsExact':True,'originalContact':list(original['contact']),
        'originalSortKey':list(event_sort_key(original)),'expandedSortKey':list(event_sort_key(replacement)),
        'upperHeightPixels':upper.height,'expandedEventYOffset':replacement['y']}
    return output,proof

def render_objects(events,box):
    x0,y0,w,h=box;out=Image.new('RGBA',(w,h),(0,0,0,0))
    for e in sorted(events,key=event_sort_key):
        x,y=e['x'],e['y'];im=e['image']
        if x>=x0+w or y>=y0+h or x+im.width<=x0 or y+im.height<=y0:continue
        out.alpha_composite(im,(x-x0,y-y0))
    return out

def north_companion_upper_supports():
    """Return only the four source-continuous companion-B upper pieces, recipe-pinned."""
    recipe=json.loads(NORTH_RECIPE.read_text())
    specs={o['id']:o for o in recipe.get('objects',[])}
    if len(specs)!=len(recipe.get('objects',[])) or not NORTH_SUPPORT_IDS.issubset(specs):
        raise AssertionError('north support recipe IDs are incomplete or duplicated')
    atlas_path=BUNDLE/'atlases/companion-cliff-kit-imagegen-v2.png'
    if recipe.get('provenance',{}).get('companionAtlasSha256')!=digest(atlas_path):
        raise AssertionError('north support companion atlas differs from recipe provenance')
    atlas=Image.open(atlas_path).convert('RGBA')
    raw_alpha=np.asarray(atlas.getchannel('A'))
    x0,y0,x1,y1=(15,600,583,1218)
    connected=np.count_nonzero((raw_alpha[y0-1,x0:x1]>=128)&(raw_alpha[y0,x0:x1]>=128))
    if connected<1:
        raise AssertionError('companion-B silhouette does not continue across its recipe crop boundary')
    full=atlas.crop((15,0,583,1218)).resize((284,609),Image.Resampling.NEAREST)
    rgba=np.asarray(full).copy(); src_alpha=rgba[...,3].copy()
    rgba[...,3]=np.where(src_alpha>=int(recipe['drawOrder']['sourceAlphaHardCut']),255,0).astype(np.uint8)
    full=Image.fromarray(rgba)
    upper=full.crop((0,0,284,300))
    if not np.asarray(upper.getchannel('A')).any():
        raise AssertionError('companion-B omitted upper segment is empty')
    supports={}
    for stable_id in sorted(NORTH_SUPPORT_IDS):
        spec=specs[stable_id]
        if (spec.get('atlasGroup')!='companion' or spec.get('atlasCrop')!=[15,600,583,1218]
                or float(spec.get('scale',0))!=0.5):
            raise AssertionError(f'unsupported atlas neighbor or transform in north support: {stable_id}')
        crop=atlas.crop(tuple(spec['atlasCrop'])).resize((284,309),Image.Resampling.NEAREST)
        crop_rgba=np.asarray(crop).copy(); crop_alpha=crop_rgba[...,3].copy()
        crop_rgba[...,3]=np.where(crop_alpha>=int(recipe['drawOrder']['sourceAlphaHardCut']),255,0).astype(np.uint8)
        processed=Image.fromarray(crop_rgba)
        if (hashlib.sha256(processed.tobytes()).hexdigest()!=spec.get('processedRgbaSha256') or
                hashlib.sha256(processed.getchannel('A').tobytes()).hexdigest()!=spec.get('processedAlphaSha256')):
            raise AssertionError(f'north support crop differs from exact recipe pixels: {stable_id}')
        if full.crop((0,300,284,609)).tobytes()!=processed.tobytes():
            raise AssertionError(f'north support changed the original lower pixels: {stable_id}')
        supports[stable_id]={'image':upper.copy(),'originWorldCell':list(map(int,spec['originWorldCell']))}
    crop_boundary=full.crop((0,299,284,301))
    return supports,{'sourceAtlasSha256':digest(atlas_path),'recipeSha256':digest(NORTH_RECIPE),
        'supportIds':sorted(NORTH_SUPPORT_IDS),'processedRecipeObjectCount':len(specs),
        'connectedCropBoundaryOpaqueColumns':int(connected),
        'upperSourceCropXYXY':list(NORTH_SUPPORT_CROP),'lowerPixelIdentity':'exact',
        'adjacentProcessedCropBoundaryRows':[299,300],
        'cropBoundaryRgbaSha256':hashlib.sha256(crop_boundary.tobytes()).hexdigest()}

def render_north_support_chunk(c,bounds,supports):
    """Create an optional top-row-only visual overhang image aligned to the chunk edge."""
    if int(c.get('y',-1))!=0: return None
    if int(c['x'])%16 or int(c['width'])%16:
        raise AssertionError('north support chunk geometry is not aligned to 16px-per-cell manifest grid')
    chunk_world_x=bounds[0]+int(c['x'])//16
    width=int(c['width'])*2
    out=Image.new('RGBA',(width,300),(0,0,0,0))
    for support in supports.values():
        world_x=support['originWorldCell'][0]
        left=(world_x-chunk_world_x)*32
        right=left+support['image'].width
        top=(support['originWorldCell'][1]-bounds[1])*32
        bottom=top+support['image'].height
        ix0=max(0,left); ix1=min(width,right)
        iy0=max(0,top); iy1=min(300,bottom)
        if ix1<=ix0 or iy1<=iy0: continue
        out.alpha_composite(support['image'].crop((ix0-left,iy0-top,ix1-left,iy1-top)),(ix0,iy0))
    return out if np.asarray(out.getchannel('A')).any() else None

def north_support_collision_mask(supports,bounds,existing_alpha=None):
    """Project hard-cut restored support pixels into the existing 32ppc QOK domain."""
    mask=np.zeros((H,W),dtype=np.uint8)
    if existing_alpha is None:
        occupied=np.zeros((H,W),dtype=bool)
    else:
        occupied=np.asarray(existing_alpha)>0
        if occupied.shape!=(H,W): raise AssertionError('existing QOK alpha dimensions changed')
    placements=[]
    for stable_id,support in sorted(supports.items()):
        ox,oy=map(int,support['originWorldCell'])
        im=support['image'].convert('RGBA')
        if im.size!=(284,300):
            raise AssertionError(f'north support collision raster changed: {stable_id} {im.size}')
        alpha=np.asarray(im.getchannel('A'))>0
        left=(ox-XMIN)*32
        top=(oy-YMIN)*32-300
        dx0=max(0,left); dy0=max(0,top)
        dx1=min(W,left+im.width); dy1=min(H,top+im.height)
        added=0; inside=0
        if dx1>dx0 and dy1>dy0:
            sx0=dx0-left; sy0=dy0-top
            crop=alpha[sy0:sy0+(dy1-dy0),sx0:sx0+(dx1-dx0)]
            view=mask[dy0:dy1,dx0:dx1]
            inside=int(crop.sum())
            occupied_view=occupied[dy0:dy1,dx0:dx1]
            added=int(np.count_nonzero(crop & ~occupied_view))
            occupied_view[crop]=True
            view[crop]=1
        placements.append({'id':stable_id,'worldOriginCell':[ox,oy],
            'qokOriginPx32':[left,top],'sourceAlphaPixels':int(alpha.sum()),
            'insideMapPixels':inside,
            'newCollisionPixels':added})
    packed=np.packbits(occupied.reshape(-1).astype(np.uint8),bitorder='little').tobytes()
    return mask,{'schema':'north-support-qok-union-v1','bounds':[XMIN,YMIN,XMIN+W//32-1,YMIN+H//32-1],
        'pixelsPerCell':32,'sourceAlphaThreshold':128,'outsideMapPixelsExcluded':True,
        'placements':placements,'supportAlphaPixelsInsideMap':int(mask.sum()),
        'newCollisionPixels':int(sum(v['newCollisionPixels'] for v in placements)),
        'postUnionPackedBitsSha256':hashlib.sha256(packed).hexdigest()}

def apply_north_prefix_mask(base,cliff,support,owner_top_row,bounds,chunk,band_cells=NORTH_PREFIX_BAND_CELLS):
    """Make only the owner-M north prefix transparent up to real cliff contact pixels."""
    if int(chunk.get('y',-1))!=0: return base, None, None
    width=int(chunk['width'])*2; height=int(chunk['height'])*2
    base=base.convert('RGBA'); cliff=cliff.convert('RGBA')
    if base.size!=(width,height) or cliff.size!=(width,height):
        raise AssertionError(f'north prefix mask raster dimensions differ for {chunk.get("id")}')
    if support is not None and (support.width!=width or support.height!=300):
        raise AssertionError(f'north support geometry differs for {chunk.get("id")}')
    if len(owner_top_row)!=(bounds[2]-bounds[0]+1):
        raise AssertionError('north prefix owner row width differs from semantic bounds')
    rgba=np.asarray(base).copy(); original_rgb=rgba[...,:3].copy()
    cut=np.zeros((height,width),dtype=np.uint8)
    fa=np.asarray(cliff.getchannel('A')); sa=np.asarray(support.getchannel('A')) if support is not None else None
    band=min(height,int(band_cells)*32)
    chunk_world_x=bounds[0]+int(chunk['x'])//16
    contacts=0; transparent=0; skipped_no_cliff=0; skipped_north_support=0
    for px in range(width):
        world_cell=chunk_world_x+px//32
        row_index=world_cell-bounds[0]
        if not (0<=row_index<len(owner_top_row)) or owner_top_row[row_index]!='M': continue
        # A connected support pixel north of y=218 means this column's first silhouette
        # lies above the plate; its base prefix is already zero-length.
        if sa is not None and np.any(sa[:,px]):
            skipped_north_support+=1; continue
        hits=np.flatnonzero(fa[:band,px]>0)
        if not len(hits):
            skipped_no_cliff+=1; continue
        contact=int(hits[0]); contacts+=1
        if contact:
            transparent+=int(np.count_nonzero(rgba[:contact,px,3]))
            rgba[:contact,px,3]=0
            cut[:contact,px]=1
    if not np.array_equal(rgba[...,:3],original_rgb):
        raise AssertionError('north prefix mask changed base RGB pixels')
    return Image.fromarray(rgba),cut,{'chunkId':chunk.get('id'),'topWorldY':bounds[1],
        'bandCells':int(band_cells),'mountainContactColumns':contacts,
        'columnsWithSupportAbovePlate':skipped_north_support,
        'mountainColumnsWithoutCliffInBand':skipped_no_cliff,'clearedBasePixels':transparent,
        'rgbBytesUnchanged':True,'lowerBasePixelsUnchanged':True}

def assemble_north_row_alpha(top_chunks,width,band_pixels):
    """Assemble top-row render layers into one global alpha plane before connectivity."""
    width=int(width);band_pixels=int(band_pixels)
    if width<=0 or band_pixels<=0: raise AssertionError('north alpha assembly dimensions must be positive')
    alpha=np.zeros((band_pixels,width),dtype=np.uint8)
    occupied=np.zeros(width,dtype=np.uint8)
    entries=sorted(top_chunks,key=lambda item:int(item[0]['x']))
    for chunk,layer in entries:
        if int(chunk.get('y',-1))!=0: raise AssertionError('north alpha assembly accepts only row-zero chunks')
        x0=int(chunk['x'])*2;w=int(chunk['width'])*2
        if x0<0 or x0+w>width: raise AssertionError(f'north alpha chunk escapes global width: {chunk.get("id")}')
        if layer.size!=(w,int(chunk['height'])*2):
            raise AssertionError(f'north alpha layer dimensions changed: {chunk.get("id")}')
        if np.any(occupied[x0:x0+w]): raise AssertionError(f'north alpha chunks overlap: {chunk.get("id")}')
        local=np.asarray(layer.getchannel('A'))[:band_pixels,:w]
        if local.shape!=(min(band_pixels,int(chunk['height'])*2),w):
            raise AssertionError(f'north alpha band dimensions changed: {chunk.get("id")}')
        alpha[:local.shape[0],x0:x0+w]=local
        occupied[x0:x0+w]=1
    if not occupied.all(): raise AssertionError('north alpha chunks do not cover the global row without gaps')
    return alpha

def north_enclosed_gap_base_cut(visible_alpha,contact_alpha,owner_rows,bounds,prefix_cut,base_opaque,band_cells=NORTH_PREFIX_BAND_CELLS):
    """Cut only enclosed, newly exposed north-water gaps adjacent to the old prefix.

    Candidate components are assembled and labeled globally, not per chunk. A candidate
    must be transparent raised art over opaque base, actual owner-M at its own world row,
    and in a column with real cliff/north contact. It must touch the preserved prefix cut
    by a four-neighbor edge and remain enclosed before the approved band's bottom or the
    plate's left/right edge. This avoids turning a whole north-connected coast into sea.
    """
    from scipy.ndimage import binary_dilation, generate_binary_structure, label
    alpha=np.asarray(visible_alpha);contact=np.asarray(contact_alpha)
    prefix=np.asarray(prefix_cut);opaque=np.asarray(base_opaque)
    if alpha.ndim!=2 or alpha.dtype!=np.uint8: raise AssertionError('north visible alpha must be a uint8 plane')
    if contact.dtype!=np.uint8 or contact.shape!=alpha.shape:
        raise AssertionError('north cliff-contact alpha dimensions/type differ from visible alpha')
    if int(band_cells)<=0: raise AssertionError('north connected band must be positive')
    band=min(alpha.shape[0],int(band_cells)*32)
    expected_cells_x=int(bounds[2])-int(bounds[0])+1;expected_width=expected_cells_x*32
    if alpha.shape[1]!=expected_width or opaque.shape!=alpha.shape or prefix.shape!=(band,expected_width):
        raise AssertionError('north candidate alpha/base/prefix dimensions differ from approved bounds')
    if prefix.dtype!=np.uint8 or np.any((prefix!=0)&(prefix!=1)):
        raise AssertionError('preserved north prefix seed must be a binary uint8 plane')
    if opaque.dtype!=np.bool_: raise AssertionError('north pre-mask base opacity must be a boolean plane')
    if len(owner_rows)<int(band_cells) or any(len(row)!=expected_cells_x for row in owner_rows[:int(band_cells)]):
        raise AssertionError('north semantic owner rows do not cover the full requested band')
    owner_m=np.zeros((band,expected_width),dtype=bool)
    for py in range(band):
        row=owner_rows[min(py//32,len(owner_rows)-1)]
        owner_m[py]=np.repeat(np.fromiter((cell=='M' for cell in row),dtype=bool),32)
    contact_columns=np.any(contact[:band]>0,axis=0)
    candidate=(alpha[:band]==0)&opaque[:band]&owner_m&contact_columns[None,:]&(prefix==0)
    structure=generate_binary_structure(2,1)
    labels,count=label(candidate,structure=structure)
    adjacent_prefix=binary_dilation(prefix.astype(bool),structure=structure)
    accepted=np.zeros_like(candidate)
    seeded_count=bottom_rejected=side_rejected=unseeded_rejected=0
    for ident in range(1,count+1):
        component=labels==ident
        if not component.any(): continue
        yy,xx=np.nonzero(component)
        seeded=bool(np.any(component&adjacent_prefix))
        hits_bottom=bool(np.any(yy==band-1))
        hits_side=bool(np.any((xx==0)|(xx==expected_width-1)))
        if seeded: seeded_count+=1
        if not seeded:
            unseeded_rejected+=1;continue
        if hits_bottom:
            bottom_rejected+=1;continue
        if hits_side:
            side_rejected+=1;continue
        accepted|=component
    if accepted.shape!=(band,expected_width) or np.any(accepted&~candidate):
        raise AssertionError('enclosed north-gap cut escaped opaque owner-M candidate pixels')
    # Every accepted component is seeded; not every pixel needs to touch the seed.
    seeded_labels=set(int(v) for v in np.unique(labels[accepted]) if v)
    for ident in seeded_labels:
        if not np.any((labels==ident)&adjacent_prefix):
            raise AssertionError('accepted north-gap component is not adjacent to preserved prefix')
    if np.any(accepted[band-1]) or np.any(accepted[:,0]) or np.any(accepted[:,-1]):
        raise AssertionError('accepted north-gap component escapes the bounded plate edge')
    return accepted.astype(np.uint8),{
        'schema':'enclosed-north-water-gap-v1','connectivity':4,
        'seed':'four-neighbor adjacency to preserved north prefix cut','bandCells':int(band_cells),
        'ownerTerrainClass':'M at each candidate pixel world row','requiresCliffContactInBand':True,
        'candidatePixels':int(candidate.sum()),'candidateComponents':int(count),
        'seededCandidateComponents':seeded_count,'acceptedComponents':int(len(set(int(v) for v in np.unique(labels[accepted]) if v))),
        'rejectedUnseededComponents':unseeded_rejected,'rejectedBandBottomComponents':bottom_rejected,
        'rejectedPlateSideComponents':side_rejected,'cutPixels':int(accepted.sum()),
        'contactColumns':int(contact_columns.sum()),'ownerMPixels':int(owner_m.sum()),
        'globalChunkSeamsChecked':True}

def north_frontage_skyline_pixels(visible_alpha,events,supports,bounds):
    """Return source-backed skyline points plus one-hop authored-root provenance."""
    alpha=np.asarray(visible_alpha)
    if alpha.ndim!=2 or alpha.dtype!=np.uint8: raise AssertionError('north skyline alpha must be a uint8 plane')
    height,width=alpha.shape
    any_hit=np.any(alpha>0,axis=0)
    first=np.full(width,-1,dtype=np.int32)
    first[any_hit]=np.argmax(alpha[:,any_hit]>0,axis=0)
    points=[];inventory={};root_events=[]
    def event_alpha_on_map(event):
        source=np.asarray(event['image'].getchannel('A'))>=128
        left=int(event['x']);top=int(event['y'])
        x0=max(0,left);x1=min(width,left+source.shape[1]);y0=max(0,top);y1=min(height,top+source.shape[0])
        if x1<=x0 or y1<=y0:return (x0,y0,x0,y0,np.zeros((0,0),dtype=bool))
        return (x0,y0,x1,y1,source[y0-top:y1-top,x0-left:x1-left])
    for event in events:
        kind=event.get('kind');record=event.get('record',{})
        root=(isinstance(kind,str) and kind.startswith('north-'))
        if kind=='cliff':
            origin=record.get('originWorldCell')
            root=isinstance(origin,list) and len(origin)==2 and int(origin[1])==int(bounds[1])
        if root:
            source_id=str(event.get('id',''))
            root_events.append((source_id,event,event_alpha_on_map(event)))
    root_alpha=np.zeros((height,width),dtype=bool)
    for _,_,(x0,y0,x1,y1,mask) in root_events:
        if x1>x0 and y1>y0: root_alpha[y0:y1,x0:x1]|=mask
    eligible={}
    for source_id,event,(x0,y0,x1,y1,mask) in root_events:
        eligible[source_id]={'sourceKind':'authored-north-root','rootSourceIds':[source_id],
            'directOverlapPixels':int(np.count_nonzero(mask&root_alpha[y0:y1,x0:x1])) if x1>x0 and y1>y0 else 0}
    for event in events:
        if event.get('kind')!='cliff': continue
        source_id=str(event.get('id',''))
        if source_id in eligible: continue
        x0,y0,x1,y1,mask=event_alpha_on_map(event)
        overlap=int(np.count_nonzero(mask&root_alpha[y0:y1,x0:x1])) if x1>x0 and y1>y0 else 0
        if overlap:
            direct_roots=[]
            for root_id,_,(rx0,ry0,rx1,ry1,root_mask) in root_events:
                ix0=max(x0,rx0);iy0=max(y0,ry0);ix1=min(x1,rx1);iy1=min(y1,ry1)
                if ix1>ix0 and iy1>iy0 and np.any(
                    mask[iy0-y0:iy1-y0,ix0-x0:ix1-x0]&root_mask[iy0-ry0:iy1-ry0,ix0-rx0:ix1-rx0]):
                    direct_roots.append(root_id)
            direct_roots.sort()
            eligible[source_id]={'sourceKind':'one-hop-north-alpha-overlap',
                'rootSourceIds':direct_roots,'directOverlapPixels':overlap}
    def add_source(source_id,source_kind,image,left,top,threshold,root_ids,direct_overlap):
        aa=np.asarray(image.getchannel('A'))
        x0=max(0,int(left));x1=min(width,int(left)+aa.shape[1])
        for x in range(x0,x1):
            y=int(first[x])
            if y<max(0,int(top)) or y>=min(height,int(top)+aa.shape[0]): continue
            if int(aa[y-int(top),x-int(left)])>=threshold:
                points.append({'sourceId':str(source_id),'sourceKind':source_kind,'rootSourceIds':root_ids,
                    'directOverlapPixels':int(direct_overlap),'x':x,'y':y})
                rec=inventory.setdefault(str(source_id),{'sourceKind':source_kind,
                    'rootSourceIds':list(root_ids),'directOverlapPixels':int(direct_overlap),'skylinePointCount':0})
                rec['skylinePointCount']+=1
    for event in events:
        source_id=str(event.get('id',''))
        info=eligible.get(source_id)
        if info:
            add_source(source_id,info['sourceKind'],event['image'],event['x'],event['y'],128,
                info['rootSourceIds'],info['directOverlapPixels'])
    for support_id,support in sorted(supports.items()):
        ox,oy=map(int,support['originWorldCell'])
        left=(ox-int(bounds[0]))*32;top=(oy-int(bounds[1]))*32-300
        source_id='north-support:'+support_id
        eligible[source_id]={'sourceKind':'north-support-root','rootSourceIds':[source_id],
            'directOverlapPixels':int(np.count_nonzero(np.asarray(support['image'].getchannel('A'))>0))}
        add_source(source_id,'north-support-root',support['image'],left,top,1,
            eligible[source_id]['rootSourceIds'],eligible[source_id]['directOverlapPixels'])
    points.sort(key=lambda p:(p['y'],p['x'],p['sourceId']))
    return first,points,inventory

def north_route_corridor_guard(renderer,bounds):
    """Rasterize exact authored corridor semantic cells into the 32ppc source plane."""
    route=np.zeros((H,W),dtype=bool)
    corridors=renderer.manifest.get('pathConstraints',{}).get('corridors')
    if not isinstance(corridors,list) or not corridors:
        raise AssertionError('R4 semantic route-corridor inventory is missing')
    for corridor in corridors:
        cells=corridor.get('semanticCells')
        if not isinstance(cells,list) or not cells:
            raise AssertionError(f"route corridor has no semantic-cell guard: {corridor.get('id')}")
        for cell in cells:
            x,y=int(cell['x']),int(cell['y'])
            px=(x-int(bounds[0]))*32;py=(y-int(bounds[1]))*32
            if px<0 or py<0 or px+32>W or py+32>H:
                raise AssertionError(f"route corridor cell leaves source geometry: {corridor.get('id')} {x},{y}")
            route[py:py+32,px:px+32]=True
    return route

def north_authored_sea_backing_cut(visible_alpha,semantic_m,semantic_water,base_opaque,
        collision,route_hero_guard,route_corridor_guard,frontage_pixels,bounds):
    """Find complete seaward M components with real, source-authored northern frontage.

    Only exact smoothed R4 M/W semantics participate. Candidate M lies strictly north
    of real in-map art alpha. Components must connect to exterior sea and have a
    qualifying north-recipe/support or northern-boundary legacy cliff at their skyline.
    """
    from scipy.ndimage import binary_dilation,binary_propagation,generate_binary_structure,label
    alpha=np.asarray(visible_alpha)
    m=np.asarray(semantic_m,dtype=bool);water=np.asarray(semantic_water,dtype=bool)
    opaque=np.asarray(base_opaque,dtype=bool);collision=np.asarray(collision,dtype=bool)
    route_guard=np.asarray(route_hero_guard,dtype=bool);corridor_guard=np.asarray(route_corridor_guard,dtype=bool)
    blocked=collision|route_guard|corridor_guard
    if alpha.ndim!=2 or alpha.dtype!=np.uint8: raise AssertionError('north sea alpha must be a uint8 plane')
    shape=alpha.shape
    if any(v.shape!=shape for v in (m,water,opaque,collision,route_guard,corridor_guard,blocked)):
        raise AssertionError('north sea semantic/protection masks differ from visible alpha geometry')
    if len(bounds)!=4 or shape!=( (int(bounds[3])-int(bounds[1])+1)*32,(int(bounds[2])-int(bounds[0])+1)*32 ):
        raise AssertionError('north sea mask geometry differs from semantic world bounds')
    any_hit=np.any(alpha>0,axis=0);first=np.full(shape[1],-1,dtype=np.int32)
    first[any_hit]=np.argmax(alpha[:,any_hit]>0,axis=0)
    rows=np.arange(shape[0],dtype=np.int32)[:,None]
    has_skyline=first>=0
    candidate=m & opaque & (alpha==0) & ~blocked & has_skyline[None,:] & (rows<first[None,:])
    structure=generate_binary_structure(2,1)
    # Exterior sea is exact semantic W connected to the north or either side of the
    # authored domain; inland lakes and southern-only water are not seeds.
    sea_seed=np.zeros(shape,dtype=bool)
    sea_seed[0,:]=water[0,:];sea_seed[:,0]|=water[:,0];sea_seed[:,-1]|=water[:,-1]
    exterior_sea=binary_propagation(sea_seed,structure=structure,mask=water)
    sea_adjacent=binary_dilation(exterior_sea,structure=structure)
    labels,count=label(candidate,structure=structure)
    water_ids=set(int(v) for v in np.unique(labels[candidate&sea_adjacent]) if v)
    ids_by_component={}
    roots_by_component={}
    for point in frontage_pixels:
        x=int(point['x']);y=int(point['y'])
        if 0<=x<shape[1] and 0<y<shape[0]:
            ident=int(labels[y-1,x])
            if ident:
                source_id=str(point['sourceId']);ids_by_component.setdefault(ident,set()).add(source_id)
                roots_by_component.setdefault(ident,{}).setdefault(source_id,set()).update(
                    str(value) for value in point['rootSourceIds'])
    accepted_ids=sorted(ident for ident in water_ids if ids_by_component.get(ident))
    accepted=np.isin(labels,accepted_ids) if accepted_ids else np.zeros(shape,dtype=bool)
    if np.any(accepted&blocked) or np.any(accepted&~m) or np.any(accepted&(alpha>0)):
        raise AssertionError('accepted north sea cut overlaps protected pixels or non-M semantics')
    if np.any(accepted[:,0]) or np.any(accepted[:,-1]) or np.any(accepted[-1]):
        raise RuntimeError('authored north sea component escapes a physical side or southern map boundary')
    components=[]
    for ident in accepted_ids:
        yy,xx=np.nonzero(labels==ident)
        if not len(xx): raise AssertionError('accepted north sea component has no pixels')
        source_ids=sorted(ids_by_component[ident])
        root_ids=sorted({root_id for values in roots_by_component[ident].values() for root_id in values})
        components.append({'sourceIds':source_ids,'frontageRootIds':root_ids,'pixels':int(len(xx)),
            'bboxPixelsXYXY':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],
            'bboxWorldXYXY':[round(int(bounds[0])+float(xx.min())/32,5),round(int(bounds[1])+float(yy.min())/32,5),
                round(int(bounds[0])+float(xx.max()+1)/32,5),round(int(bounds[1])+float(yy.max()+1)/32,5)],
            'seaSeedPixels':int(np.count_nonzero((labels==ident)&sea_adjacent)),
            'realSkylineColumns':int(len(set(int(x) for x in xx if first[int(x)]>=0)))})
    missing_columns=sorted(int(x) for x in np.unique(np.nonzero(accepted)[1]) if first[int(x)]<0)
    proof={'schema':'authored-north-sea-backing-v1','connectivity':4,
        'semanticMountainToken':[128,126,122],'semanticSeaToken':[30,82,170],
        'exteriorSea':'exact semantic W connected to north, west, or east map edge',
        'frontageRule':'north-recipe/support contributor or legacy cliff authored at northern semantic bound',
        'skylineRule':'first real in-map visible-or-support alpha per column; candidate pixels are strictly north of it',
        'searchDomain':'complete authored semantic bounds; no band cutoff or missing-alpha sentinel',
        'candidatePixels':int(candidate.sum()),'candidateComponents':int(count),
        'waterSeededComponents':int(len(water_ids)),'frontageQualifiedComponents':int(len(ids_by_component)),
        'acceptedComponents':len(accepted_ids),'acceptedPixels':int(accepted.sum()),
        'rejectedForMissingWaterOrFrontage':int(count-len(accepted_ids)),
        'missingSkylineColumns':len(missing_columns),'missingSkylineColumnIds':missing_columns,
        'visibleArtOverlapPixels':int(np.count_nonzero(accepted&(alpha>0))),
        'nonMountainSemanticOverlapPixels':int(np.count_nonzero(accepted&~m)),
        'collisionOverlapPixels':int(np.count_nonzero(accepted&collision)),
        'heroRouteGuardOverlapPixels':int(np.count_nonzero(accepted&route_guard)),
        'routeCorridorOverlapPixels':int(np.count_nonzero(accepted&corridor_guard)),
        'touchesWestOrEastMapEdge':False,'touchesSouthMapEdge':False,
        'components':components}
    return accepted.astype(np.uint8),proof

def extend_north_sea_to_authored_contacts(seed_cut,semantic_m,visible_alpha,collision,
        route_hero_guard,route_corridor_guard,events,frontage_inventory):
    """Extend original north-sea pixels sideways only to authored cliff endpoints.

    Each row is visited once. Exact M pixels with no visible art or protection may
    be added only when the row's original seed already lies in that clear run and
    the run's immediate outside endpoint is opaque alpha from an immutable north
    root or one approved direct-overlap child. Added pixels never become seeds.
    """
    seed=np.asarray(seed_cut)
    m=np.asarray(semantic_m,dtype=bool)
    alpha=np.asarray(visible_alpha)
    collision=np.asarray(collision,dtype=bool)
    hero=np.asarray(route_hero_guard,dtype=bool)
    corridor=np.asarray(route_corridor_guard,dtype=bool)
    if seed.ndim!=2 or seed.dtype!=np.uint8 or np.any((seed!=0)&(seed!=1)):
        raise AssertionError('north contact extension seed must be a binary uint8 plane')
    shape=seed.shape
    if alpha.dtype!=np.uint8 or alpha.shape!=shape or any(v.shape!=shape for v in (m,collision,hero,corridor)):
        raise AssertionError('north contact extension semantics/protection geometry differs from seed')
    if not isinstance(frontage_inventory,dict):
        raise AssertionError('north contact extension requires source-authored frontage inventory')
    approved={str(source_id) for source_id,record in frontage_inventory.items()
        if isinstance(record,dict) and record.get('sourceKind') in
            {'authored-north-root','one-hop-north-alpha-overlap'}}
    contact_sources=[]
    contact_union=np.zeros(shape,dtype=bool)
    height,width=shape
    for event in events:
        source_id=str(event.get('id',''))
        if source_id not in approved or event.get('kind')!='cliff':
            continue
        source_alpha=np.asarray(event['image'].getchannel('A'))>=128
        left,top=int(event['x']),int(event['y'])
        x0=max(0,left);x1=min(width,left+source_alpha.shape[1])
        y0=max(0,top);y1=min(height,top+source_alpha.shape[0])
        if x1>x0 and y1>y0:
            local=source_alpha[y0-top:y1-top,x0-left:x1-left].copy()
            contact_sources.append((source_id,x0,y0,x1,y1,local))
            contact_union[y0:y1,x0:x1]|=local
    def contact_ids_at(x,y):
        return sorted(source_id for source_id,x0,y0,x1,y1,local in contact_sources
            if x0<=x<x1 and y0<=y<y1 and local[y-y0,x-x0])
    protected=collision|hero|corridor
    free=m&(alpha==0)&~protected
    out=seed.astype(bool).copy()
    accepted_sources={};accepted_contacts=[]
    for y in range(height):
        if not np.any(seed[y]):
            continue
        edges=np.diff(np.r_[False,free[y],False].astype(np.int8))
        starts=np.flatnonzero(edges==1);ends=np.flatnonzero(edges==-1)
        for start,end in zip(starts,ends):
            original_seeds=np.flatnonzero(seed[y,start:end])
            if not len(original_seeds):
                continue
            first_seed=start+int(original_seeds[0]);last_seed=start+int(original_seeds[-1])+1
            for edge,lo,hi,step in ((start-1,start,first_seed,-1),(end,last_seed,end,1)):
                if lo>=hi or edge<0 or edge>=width or not contact_union[y,edge]:
                    continue
                source_ids=contact_ids_at(edge,y)
                if not source_ids:
                    raise AssertionError('north contact union endpoint has no approved source provenance')
                out[y,lo:hi]=True
                for source_id in source_ids: accepted_sources[source_id]=accepted_sources.get(source_id,0)+(hi-lo)
                accepted_contacts.append({'y':int(y),'endpointX':int(edge),'addedStartX':int(lo),
                    'addedEndX':int(hi),'sourceIds':source_ids})
    from scipy.ndimage import label
    added=out&~seed.astype(bool)
    if np.any(added&~m) or np.any(added&(alpha>0)) or np.any(added&protected):
        raise AssertionError('north contact extension overlaps non-M, visible art, collision, or route guards')
    if np.any(added[~np.any(seed,axis=1)]):
        raise AssertionError('north contact extension added pixels to a row without original north-sea seeds')
    return out.astype(np.uint8),{
        'schema':'north-sea-authored-contact-v1',
        'rule':'single horizontal pass from original accepted north-sea pixels through clear exact-M to first opaque authored contact; no reseeding or new rows',
        'addedPixels':int(added.sum()),'components':int(label(added)[1]),
        'acceptedSourceIds':sorted(accepted_sources),
        'addedPixelsBySource':{key:int(value) for key,value in sorted(accepted_sources.items())},
        'contacts':accepted_contacts,
        'nonMountainSemanticOverlapPixels':int(np.count_nonzero(added&~m)),
        'visibleArtOverlapPixels':int(np.count_nonzero(added&(alpha>0))),
        'collisionOverlapPixels':int(np.count_nonzero(added&collision)),
        'heroRouteGuardOverlapPixels':int(np.count_nonzero(added&hero)),
        'routeCorridorOverlapPixels':int(np.count_nonzero(added&corridor)),
        'outsideOriginalSeedRows':int(added[~np.any(seed,axis=1)].sum()),
    },added

def merge_north_sea_contact_proof(seed_cut,expanded_cut,proof,bounds,fringe_proof,frontage_inventory):
    """Recount accepted sea components after adding their authored contacts."""
    from scipy.ndimage import label
    seed_labels,seed_count=label(np.asarray(seed_cut,dtype=bool),structure=np.array([[0,1,0],[1,1,1],[0,1,0]],dtype=np.uint8))
    final_labels,final_count=label(np.asarray(expanded_cut,dtype=bool),structure=np.array([[0,1,0],[1,1,1],[0,1,0]],dtype=np.uint8))
    if seed_count!=len(proof['components']) or final_count!=seed_count:
        raise AssertionError('north contact proof seed components differ from accepted source proof')
    sources_by_component={}
    for contact in fringe_proof['contacts']:
        y=int(contact['y']);start=int(contact['addedStartX']);end=int(contact['addedEndX'])
        ids=set(int(v) for v in np.unique(final_labels[y,start:end]) if v)
        for ident in ids: sources_by_component.setdefault(ident,set()).update(contact['sourceIds'])
    components=[];pixels=0
    for ident in range(1,final_count+1):
        yy,xx=np.nonzero(final_labels==ident)
        old_ids=sorted(int(v) for v in np.unique(seed_labels[final_labels==ident]) if v)
        if not old_ids: raise AssertionError('north contact extension created a component without original seeds')
        old=[proof['components'][value-1] for value in old_ids]
        source_ids=sorted({source for item in old for source in item['sourceIds']}|sources_by_component.get(ident,set()))
        root_ids=sorted({root for item in old for root in item['frontageRootIds']}|
            {root for source in sources_by_component.get(ident,set())
                for root in frontage_inventory[source]['rootSourceIds']})
        components.append({'sourceIds':source_ids,'frontageRootIds':root_ids,'pixels':int(len(xx)),
            'bboxPixelsXYXY':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],
            'bboxWorldXYXY':[round(int(bounds[0])+float(xx.min())/32,5),round(int(bounds[1])+float(yy.min())/32,5),
                round(int(bounds[0])+float(xx.max()+1)/32,5),round(int(bounds[1])+float(yy.max()+1)/32,5)],
            'seaSeedPixels':sum(item['seaSeedPixels'] for item in old),
            'realSkylineColumns':sum(item['realSkylineColumns'] for item in old)})
        pixels+=int(len(xx))
    if pixels!=int(np.count_nonzero(expanded_cut)):
        raise AssertionError('north contact component pixel counts do not sum to expanded cut')
    proof['components']=components;proof['acceptedComponents']=len(components);proof['acceptedPixels']=pixels
    proof['fringeContact']=fringe_proof
    return proof

def apply_north_enclosed_gap_cut(base,prefix_cut,connected_cut):
    """Apply enclosed gap pixels while preserving every bit of the old prefix cut."""
    base=base.convert('RGBA');rgba=np.asarray(base).copy();prefix=np.asarray(prefix_cut);connected=np.asarray(connected_cut)
    if prefix.ndim!=2 or prefix.shape!=rgba.shape[:2] or prefix.dtype!=np.uint8:
        raise AssertionError('north prefix cut dimensions/type differ from base')
    if connected.ndim!=2 or connected.dtype!=np.uint8 or connected.shape[1]!=rgba.shape[1]:
        raise AssertionError('north connected cut dimensions/type differ from base')
    band=connected.shape[0]
    if band>rgba.shape[0] or np.any(prefix[band:]):
        raise AssertionError('north base cuts escape the approved band')
    if np.any((prefix!=0)&(prefix!=1)) or np.any((connected!=0)&(connected!=1)):
        raise AssertionError('north base cuts must be binary')
    added=connected.astype(bool)&(rgba[:band,:,3]>0)
    combined=prefix.copy();combined[:band]|=connected
    rgba[:band,:,3][combined[:band].astype(bool)]=0
    if not np.array_equal((combined&prefix)!=0,prefix!=0):
        raise AssertionError('north connected cut removed an existing prefix bit')
    if not np.array_equal(rgba[...,:3],np.asarray(base)[...,:3]):
        raise AssertionError('north connected cut changed base RGB')
    expected=np.asarray(base).copy();expected[:band,:,3][combined[:band].astype(bool)]=0
    if not np.array_equal(rgba,expected):
        raise AssertionError('north connected cut changed pixels outside the combined alpha mask')
    return Image.fromarray(rgba),combined,{
        'existingPrefixCutPixels':int(prefix.sum()),'northConnectedCutPixels':int(connected.sum()),
        'northConnectedNewlyClearedBasePixels':int(added.sum()),'combinedBaseCutPixels':int(combined.sum())}

def apply_north_sea_backing_cut(base,cut):
    """Clear only source-derived seaward backing pixels, preserving base RGB."""
    base=base.convert('RGBA');rgba=np.asarray(base).copy();mask=np.asarray(cut)
    if mask.shape!=rgba.shape[:2] or mask.dtype!=np.uint8 or np.any((mask!=0)&(mask!=1)):
        raise AssertionError('authored north sea backing cut geometry/type is invalid')
    newly=np.count_nonzero(mask.astype(bool)&(rgba[...,3]>0))
    rgba[...,3][mask.astype(bool)]=0
    if not np.array_equal(rgba[...,:3],np.asarray(base)[...,:3]):
        raise AssertionError('authored north sea backing cut changed base RGB')
    return Image.fromarray(rgba),{'northSeaBackingPixels':int(mask.sum()),
        'northSeaBackingNewlyClearedBasePixels':int(newly),
        'rgbBytesUnchanged':True}

def persist_north_masked_base(path,masked,stats):
    """Persist a top-chunk base whenever either north-mask pass changed alpha."""
    if (int(stats.get('clearedBasePixels',0))<=0
            and int(stats.get('northConnectedNewlyClearedBasePixels',0))<=0
            and int(stats.get('northSeaBackingNewlyClearedBasePixels',0))<=0):
        return False
    masked.save(path,format='WEBP',lossless=True,quality=100,method=6)
    return True

def apply_north_prefix_mask_6ppc(base,cut32):
    """Mirror the visual-only high-resolution cut in the coarse underpaint substrate."""
    base=base.convert('RGBA'); rgba=np.asarray(base).copy(); before_rgb=rgba[...,:3].copy()
    if rgba.shape[:2]!=(1092,888) or cut32.shape!=(NORTH_PREFIX_BAND_CELLS*32,W):
        raise AssertionError('north underpaint prefix-mask dimensions changed')
    cut6=project_north_prefix_mask_6ppc(cut32)
    nrows=cut6.shape[0]
    rgba[:nrows,:,3][cut6]=0
    if not np.array_equal(rgba[...,:3],before_rgb):
        raise AssertionError('north underpaint mask changed RGB pixels')
    if not np.array_equal(rgba[nrows:],np.asarray(base)[nrows:]):
        raise AssertionError('north underpaint mask changed pixels below the bounded band')
    return Image.fromarray(rgba)

def apply_north_sea_backing_mask_6ppc(base,cut32):
    """Project the complete source-derived 32ppc sea cut to the 6ppc plate."""
    base=base.convert('RGBA');rgba=np.asarray(base).copy();before_rgb=rgba[...,:3].copy()
    projected=project_north_sea_backing_mask_6ppc(cut32)
    if rgba.shape[:2]!=(1092,888) or projected.shape!=(1092,888):
        raise AssertionError('north sea underpaint mask geometry changed')
    rgba[...,3][projected]=0
    if not np.array_equal(rgba[...,:3],before_rgb):
        raise AssertionError('north sea underpaint mask changed RGB pixels')
    return Image.fromarray(rgba)

def project_north_sea_backing_mask_6ppc(cut32):
    cut32=np.asarray(cut32)
    if cut32.shape!=(H,W): raise AssertionError('north sea underpaint source mask must cover exact full map bounds')
    xs=np.clip(np.floor((np.arange(888)+0.5)*(32/6)).astype(np.int32),0,W-1)
    ys=np.clip(np.floor((np.arange(1092)+0.5)*(32/6)).astype(np.int32),0,H-1)
    return cut32[np.ix_(ys,xs)]>0

def project_north_prefix_mask_6ppc(cut32):
    cut32=np.asarray(cut32)
    if cut32.shape!=(NORTH_PREFIX_BAND_CELLS*32,W):
        raise AssertionError('north underpaint projected mask dimensions changed')
    xs=np.clip(np.floor((np.arange(888)+0.5)*(32/6)).astype(np.int32),0,W-1)
    nrows=NORTH_PREFIX_BAND_CELLS*6
    ys=np.clip(np.floor((np.arange(nrows)+0.5)*(32/6)).astype(np.int32),0,cut32.shape[0]-1)
    cut6=cut32[np.ix_(ys,xs)]>0
    expected=np.zeros((1092,888),dtype=bool);expected[:nrows]=cut6
    return expected

def verify_rebuilt_base_mask(cache_base,pristine_base,rebuilt_base,expected_mask,label):
    """Prove reused ground has the new mask, restoring stale cutouts and adding current ones."""
    cached=np.asarray(cache_base.convert('RGBA'));pristine=np.asarray(pristine_base.convert('RGBA'));rebuilt=np.asarray(rebuilt_base.convert('RGBA'))
    expected=np.asarray(expected_mask,dtype=bool)
    if cached.shape!=pristine.shape or rebuilt.shape!=pristine.shape or expected.shape!=pristine.shape[:2]:
        raise AssertionError(f'{label}: cache/pristine/rebuilt mask geometry differs')
    cached_visible=cached[...,3]>0
    if not np.array_equal(cached[...,:3][cached_visible],pristine[...,:3][cached_visible]):
        raise AssertionError(f'{label}: reused visible base material RGB differs from freshly rendered ground')
    old_mask=cached[...,3]==0;new_mask=rebuilt[...,3]==0
    if not np.array_equal(new_mask,expected):
        raise AssertionError(f'{label}: rebuilt base transparency differs from current cliff-contact mask')
    if not np.array_equal(rebuilt[...,:3],pristine[...,:3]):
        raise AssertionError(f'{label}: current mask changed fresh base RGB')
    restored=int(np.count_nonzero(old_mask&~new_mask));added=int(np.count_nonzero(new_mask&~old_mask));xor=int(np.count_nonzero(old_mask^new_mask))
    if restored+added!=xor:
        raise AssertionError(f'{label}: old-vs-current mask delta accounting differs')
    return {'oldMaskedPixels':int(old_mask.sum()),'currentMaskedPixels':int(new_mask.sum()),
        'restoredOldCutoutPixels':restored,'newlyMaskedPixels':added,'oldVsCurrentMaskXorPixels':xor,
        'currentMaskSha256':hashlib.sha256(new_mask.astype(np.uint8).tobytes()).hexdigest()}

def merge_north_prefix_cut(destination,local_cut,x_start):
    """Merge one full-height top-chunk mask into the bounded global prefix plane."""
    if destination.ndim!=2 or local_cut.ndim!=2:
        raise AssertionError('north prefix masks must be 2D arrays')
    x_start=int(x_start);x_end=x_start+local_cut.shape[1]
    if x_start<0 or x_end>destination.shape[1]:
        raise AssertionError('north prefix chunk escapes authored width')
    visible_height=min(destination.shape[0],local_cut.shape[0])
    if np.any(local_cut[visible_height:]):
        raise AssertionError('north prefix mask contains cut pixels below bounded global band')
    if np.any(destination[:visible_height,x_start:x_end]):
        raise AssertionError('north prefix chunk masks overlap in global plane')
    destination[:visible_height,x_start:x_end]=local_cut[:visible_height]

def apply_owner_ground_policy(renderer,ownerGrid):
    """Use one R4 material field for owner F/M ground and retain its old trail factor."""
    owner_grid=np.asarray(ownerGrid)
    original=np.asarray(renderer.classgrid).copy()
    if owner_grid.shape!=original.shape:
        raise AssertionError(f'owner/R4 class grid shape mismatch: {owner_grid.shape} vs {original.shape}')
    if not np.isin(owner_grid,(0,1,2,3)).all():
        raise AssertionError('owner ground grid contains an unsupported class')
    owner_fm=(owner_grid==1)|(owner_grid==2)
    water_overlap=owner_fm & (original=='water')
    if water_overlap.any():
        raise AssertionError(f'owner F/M ground overlaps {int(water_overlap.sum())} R4 water cells')
    renderer.classgrid[owner_fm]='meadow'
    if not np.array_equal(renderer.classgrid[~owner_fm],original[~owner_fm]):
        raise AssertionError('owner ground policy changed a non-F/M R4 material class')
    if np.any(renderer.classgrid[water_overlap]!='water'):
        raise AssertionError('owner ground policy changed an R4 water class')

    # render_window blends routes after computing material weights. Reclassifying cells
    # changes those weights near the boundary, so preserve the exact effective trail factor
    # of the former compositor: clean-meadow weight 1 in owner F/M, original R4 meadow weight
    # elsewhere. The R4 route segments and trail sampling remain the single source of truth.
    new_route_weight=renderer._route_weight
    owner_pixels_by_ppc={}
    def route_with_original_factor(wx,wy,ppc):
        geometric=new_route_weight(wx,wy,ppc)
        if not np.any(geometric):
            return geometric
        if np.any(geometric < -1e-7) or np.any(geometric > 1.0+1e-7):
            raise AssertionError('R4 geometric route weight is outside [0,1]')
        if wx.ndim!=2 or wy.shape!=wx.shape or not wx.size:
            raise AssertionError('R4 route compositor supplied invalid coordinate arrays')
        x0=int(wx[0,0])//ppc;y0=int(wy[0,0])//ppc
        if int(wx[0,0])!=x0*ppc or int(wy[0,0])!=y0*ppc:
            raise AssertionError('R4 route window is not aligned to its material grid')
        height,width=wx.shape
        new_meadow=renderer._weights(x0,y0,width,height,ppc)['meadow']
        changed_grid=renderer.classgrid
        renderer.classgrid=original
        try:
            old_meadow=renderer._weights(x0,y0,width,height,ppc)['meadow']
        finally:
            renderer.classgrid=changed_grid
        if (np.any(new_meadow < -1e-7) or np.any(new_meadow > 1.0+1e-7) or
                np.any(old_meadow < -1e-7) or np.any(old_meadow > 1.0+1e-7)):
            raise AssertionError('R4 meadow weights are outside [0,1]')
        if ppc not in owner_pixels_by_ppc:
            owner_pixels_by_ppc[ppc]=np.repeat(np.repeat(owner_fm,ppc,axis=0),ppc,axis=1)
        owner_px=owner_pixels_by_ppc[ppc]
        owner_window=owner_px[y0*ppc:y0*ppc+height,x0*ppc:x0*ppc+width]
        if owner_window.shape!=geometric.shape:
            raise AssertionError('owner ground route window is outside the R4 map')
        original_factor=np.where(owner_window,1.0,old_meadow).astype(np.float32,copy=False)
        desired=geometric*original_factor
        if np.any(desired < -1e-7) or np.any(desired > 1.0+1e-7):
            raise AssertionError('preserved effective route factor is outside [0,1]')
        impossible=(desired>1e-7)&(new_meadow<=1e-7)
        if impossible.any():
            raise AssertionError(f'cannot preserve {int(impossible.sum())} route pixels with zero new meadow weight')
        adjusted=np.zeros_like(desired,dtype=np.float32)
        np.divide(desired,new_meadow,out=adjusted,where=new_meadow>1e-7)
        reproduced=adjusted*new_meadow
        if not np.allclose(reproduced,desired,rtol=0,atol=1e-6):
            raise AssertionError('R4 effective route factor changed under owner ground policy')
        return adjusted
    renderer._route_weight=route_with_original_factor
    return {'policy':'single-r4-material-field-owner-fm-meadow-v1',
            'ownerFMMaterialCells':int(owner_fm.sum()),
            'ownerFMCellsAlreadyMeadow':int(np.count_nonzero(owner_fm&(original=='meadow'))),
            'ownerFMCellsReclassified':int(np.count_nonzero(owner_fm&(original!='meadow'))),
            'ownerFMWaterOverlap':int(water_overlap.sum()),
            'routeFactor':'preserved existing effective factor: 1 inside owner F/M; original R4 meadow weight outside'}

def render_ground(renderer,box,sharpen=False):
    x0,y0,w,h=box
    # One-cell overscan keeps the owner-approved UnsharpMask filter chunk-edge safe.
    # The material grid and class weights come from the same R4 renderer across every chunk.
    px=0 if x0==0 else 16;py=0 if y0==0 else 16
    right=0 if x0+w>=renderer.grid_w*16 else 16
    bottom=0 if y0+h>=renderer.grid_h*16 else 16
    rx=x0-px;ry=y0-py;rw=w+px+right;rh=h+py+bottom
    a,_=renderer.render_window(rx,ry,rw,rh,ppc=32)
    semantic=Image.fromarray(a,'RGB').convert('RGBA')
    if sharpen: semantic=semantic.filter(ImageFilter.UnsharpMask(radius=.9,percent=130,threshold=2))
    crop=(px*2,py*2,px*2+w*2,py*2+h*2)
    return semantic.crop(crop)

def render_water_r2(renderer,chunk,texture,world_origin,exact_semantic_water_mask,north_backing_mask=None):
    """Render global-phase water, making exact semantic-W pixels fully opaque."""
    x,y,w,h=(int(chunk[k]) for k in ('x','y','width','height'))
    if any(v%16 for v in (x,y,w,h)):
        raise AssertionError(f"water chunk is not aligned to R4's 16px semantic cells: {chunk.get('id')}")
    width,height=w*2,h*2
    weights=renderer._weights(x//16,y//16,width,height,32)
    coverage=weights.get('water')
    if coverage is None or coverage.shape!=(height,width):
        raise AssertionError(f"R4 water material weights have wrong geometry: {chunk.get('id')}")
    coverage=promote_exact_semantic_water_coverage(coverage,exact_semantic_water_mask)
    if north_backing_mask is not None:
        extra=np.asarray(north_backing_mask)
        if extra.shape!=(height,width) or np.any((extra!=0)&(extra!=1)):
            raise AssertionError(f"north sea backing mask has wrong geometry/type: {chunk.get('id')}")
        coverage=np.maximum(coverage,extra.astype(np.float32))
    if not isinstance(world_origin,(list,tuple)) or len(world_origin)<2:
        raise AssertionError('water layer requires the locked global semantic origin')
    rgba=compose_water_r2_layer(texture,coverage,x//16+int(world_origin[0]),y//16+int(world_origin[1]))
    return Image.fromarray(rgba,'RGBA')

def assert_ground_join_matches(join,reference,prefix_cut,origin_x,origin_y,label):
    """Check a stored ground seam without treating hidden RGB as rendered pixels.

    Lossless WebP may canonicalize RGB under transparent pixels.  The prefix
    mask is authored in memory, so its alpha and RGB-preservation invariants
    are checked before encoding; at the encoded seam we require exact alpha
    and exact RGB wherever alpha is visible.
    """
    joined=np.asarray(join.convert('RGBA'))
    reference_rgb=np.asarray(reference.convert('RGB'))
    if joined.shape[:2]!=reference_rgb.shape[:2]:
        raise AssertionError(f'{label}: seam/reference dimensions differ')
    expected_alpha=np.full(joined.shape[:2],255,dtype=np.uint8)
    cut=np.asarray(prefix_cut)
    x0,y0=int(origin_x),int(origin_y)
    x1=x0+joined.shape[1];y1=y0+joined.shape[0]
    cx0=max(0,x0);cx1=min(cut.shape[1],x1)
    cy0=max(0,y0);cy1=min(cut.shape[0],y1)
    if cx0<cx1 and cy0<cy1:
        expected_alpha[cy0-y0:cy1-y0,cx0-x0:cx1-x0][cut[cy0:cy1,cx0:cx1]>0]=0
    if not np.array_equal(joined[:,:,3],expected_alpha):
        raise AssertionError(f'{label}: stored alpha differs from intended north prefix mask')
    visible=expected_alpha>0
    if not np.array_equal(joined[:,:,:3][visible],reference_rgb[visible]):
        raise AssertionError(f'{label}: visible ground RGB differs from independent render')
    return {'alphaPixels':int(expected_alpha.size),'transparentPixels':int((~visible).sum()),
            'visibleRgbPixels':int(visible.sum())}

def expected_qok(alpha,source_hash):
    bits=np.packbits((alpha.ravel()>0).astype(np.uint8),bitorder='little').tobytes()
    head=bytearray(64);head[:8]=b'QOKF8COL';struct.pack_into('<HHIII',head,8,1,64,W,H,32);head[24:56]=bytes.fromhex(source_hash)
    return bytes(head)+bits

def check_qok(path,alpha,source_hash):
    b=Path(path).read_bytes()
    if len(b)!=64+(W*H+7)//8 or b[:8]!=b'QOKF8COL':raise AssertionError('QOKF8COL header/length mismatch')
    ver,hs,w,h,ppc=struct.unpack_from('<HHIII',b,8)
    if (ver,hs,w,h,ppc)!=(1,64,W,H,32):raise AssertionError('QOKF8COL dimensions/version mismatch')
    if b[24:56].hex()!=source_hash:raise AssertionError('QOKF8COL visible-alpha source hash mismatch')
    bits=np.unpackbits(np.frombuffer(b[64:],dtype=np.uint8),bitorder='little')[:W*H].reshape((H,W)).astype(bool)
    if not np.array_equal(bits,alpha>0):raise AssertionError('decoded QOKF8COL differs from exact final alpha')
    return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'decodedPixelCount':int(bits.sum()),'dimensions':[W,H],'pixelsPerCell':32,'bitOrder':'little-within-byte','sourceSha256':source_hash}

def verify_ground_cache(cache_root, current_manifest):
    cache_root=Path(cache_root);pub=cache_root/'public/act1-hifi'
    receipt=json.loads((cache_root/'output-receipt.json').read_text())
    cached=json.loads((pub/'manifest.json').read_text())
    if receipt.get('profileId')!='act1-forward-20261007-v1' or receipt.get('fullWorldComplete') is not True:
        raise AssertionError('ground cache does not come from a complete current-profile generation')
    if receipt.get('sourceBundleManifestSha256')!=digest(BUNDLE/'input-manifest.json'):
        raise AssertionError('ground cache was generated from a different frozen input bundle')
    inventory=receipt['outputInventory'];cache_chunks={c['id']:c for c in cached['chunks']}
    if set(cache_chunks)!={c['id'] for c in current_manifest['chunks']}:
        raise AssertionError('ground cache chunk inventory differs from current manifest')
    reused={'sourceGeneration':str(cache_root),'sourceReceiptSha256':digest(cache_root/'output-receipt.json'),'sourceManifestSha256':digest(pub/'manifest.json'),'sourceBundleManifestSha256':receipt['sourceBundleManifestSha256'],'chunks':{},'underpaint':{}}
    for c in current_manifest['chunks']:
        old=cache_chunks[c['id']]
        for key in ('x','y','width','height','base','water','canopy'):
            if old.get(key)!=c.get(key):raise AssertionError(f'ground cache {key} differs for {c["id"]}')
        entry={}
        for key in ('base','water','canopy'):
            path=pub/c[key];rel='public/act1-hifi/'+c[key];actual=digest(path)
            if inventory.get(rel,{}).get('sha256')!=actual:
                raise AssertionError(f'ground cache output receipt does not bind {c["id"]} {key}')
            manifest_key=key+'Sha256'
            if old.get(manifest_key)!=actual:raise AssertionError(f'ground cache manifest hash mismatch for {c["id"]} {key}')
            if key in ('water','canopy'):
                source=RUNTIME/'chunks'/key/Path(c[key]).name
                expected=c.get(manifest_key)
                if digest(source)!=expected or actual!=expected:
                    raise AssertionError(f'ground cache {key} differs from unchanged current runtime input for {c["id"]}')
            im=Image.open(path)
            if key in ('base','canopy') and im.size!=(c['width']*2,c['height']*2):raise AssertionError(f'ground cache {key} geometry mismatch for {c["id"]}')
            if key=='water' and im.size!=Image.open(RUNTIME/'chunks'/key/Path(c[key]).name).size:raise AssertionError(f'ground cache water geometry differs from unchanged runtime input for {c["id"]}')
            entry[key]=actual
        reused['chunks'][c['id']]=entry
    under='underpaint/act1-plate.png';under_path=pub/under;under_sha=digest(under_path)
    if under_sha!=cached.get('underpaint',{}).get('sha256') or inventory.get('public/act1-hifi/'+under,{}).get('sha256')!=under_sha:
        raise AssertionError('ground cache 6ppc plate does not match its manifest/receipt')
    plate=Image.open(under_path)
    if plate.size!=(888,1092):raise AssertionError('ground cache 6ppc plate dimensions changed')
    reused['underpaint']={'path':under,'sha256':under_sha,'dimensions':list(plate.size)}
    reused['reusedBaseChunkCount']=len(current_manifest['chunks']);reused['reusedWaterChunkCount']=len(current_manifest['chunks']);reused['reusedCanopyChunkCount']=len(current_manifest['chunks'])
    return reused

def gen_one(ctx,label,root,ground_cache=None):
    root=Path(root);pub=root/'public/act1-hifi'
    if pub.exists(): raise FileExistsError(f'clean generation output already exists: {pub}')
    for d in ['chunks/base','chunks/forest','chunks/water','chunks/water-r2','chunks/canopy','chunks/north','underpaint','evidence']:(pub/d if d!='evidence' else root/d).mkdir(parents=True,exist_ok=True)
    recipe=json.loads(WATER_R2_RECIPE.read_text())
    verify_water_r2_recipe(recipe)
    water_texture=load_water_r2_texture(WATER_R2_ASSET)
    water_asset_rel='materials/act1-water-r2.png'
    water_asset_path=pub/water_asset_rel
    water_asset_path.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(WATER_R2_ASSET,water_asset_path)
    water_asset_sha=digest(water_asset_path)
    r4=ctx['renderer'];mpath=str(BUNDLE/'portable-root/design/review/overworld-art-blueprint/act-by-act/act1/runtime-v4/act1-painted-overworld-r4/runtime/manifest.json');cpath=str(BUNDLE/'r4-source/paint-source-r4-v5.json');eroot=str(BUNDLE/'empty-runtime')
    renderer=r4.Act1PaintRenderer(manifest_path=mpath,config_path=cpath,old_root=eroot);renderer.trees=[];renderer.rock_motifs=[]
    semantic_path=Path(r4.MASK).resolve()
    semantic_rgb=np.asarray(Image.open(semantic_path).convert('RGB'))
    if semantic_rgb.shape!=(H//2,W//2,3):
        raise AssertionError(f'current exact smoothed semantic PNG dimensions changed: {semantic_rgb.shape}')
    # The source PNG is a 16px/cell nearest raster. Replicate each exact authored
    # semantic token 2x2 for the 32px/cell backing rule; do not quantize through
    # the renderer's coarser 182x148 class grid.
    semantic_m=np.repeat(np.repeat(np.all(semantic_rgb==np.array([128,126,122],dtype=np.uint8),axis=2),2,axis=0),2,axis=1)
    semantic_water=np.repeat(np.repeat(np.all(semantic_rgb==np.array([30,82,170],dtype=np.uint8),axis=2),2,axis=0),2,axis=1)
    if semantic_m.shape!=(H,W) or semantic_water.shape!=(H,W):
        raise AssertionError('current smoothed R4 semantic masks do not align to final source geometry')
    ground_policy=apply_owner_ground_policy(renderer,ctx['grid'])
    src=BUNDLE/'current/act1-hifi-manifest.json';outman=apply_r26_locked_geometry(copy.deepcopy(ctx['man']),ctx['r26RuntimeManifest']);chunks={c['id']:c for c in outman['chunks']}
    cache_proof=verify_ground_cache(ground_cache,ctx['man']) if ground_cache else None
    north_supports,north_support_proof=ctx['northSupports'],ctx['northSupportProof']
    north_prefix_cut=np.zeros((NORTH_PREFIX_BAND_CELLS*32,W),dtype=np.uint8)
    alpha=ctx['finalAlpha']
    support_mask,support_collision_proof=north_support_collision_mask(north_supports,ctx['bounds'],alpha)
    north_prefix_chunks=[];north_cache_mask_rebuilds=[]
    top_row=ctx['owner']['terrainRows'][0]
    north_cliffs=[e for e in ctx['events'] if e['kind']=='cliff' or e['kind'].startswith('north-')]
    top_chunks=sorted((c for c in outman['chunks'] if int(c['y'])==0),key=lambda c:int(c['x']))
    top_layers={c['id']:render_objects(ctx['events'],(c['x']*2,c['y']*2,c['width']*2,c['height']*2)) for c in top_chunks}
    top_contact_layers={c['id']:render_objects(north_cliffs,(c['x']*2,c['y']*2,c['width']*2,c['height']*2)) for c in top_chunks}
    band_px=NORTH_PREFIX_BAND_CELLS*32
    top_visible_alpha=assemble_north_row_alpha([(c,top_layers[c['id']]) for c in top_chunks],W,band_px)
    top_contact_alpha=assemble_north_row_alpha([(c,top_contact_layers[c['id']]) for c in top_chunks],W,band_px)
    # Derive the preserved legacy prefix on opaque dummy top chunks before the
    # candidate components are labeled. This is geometry-only; real RGB rendering
    # and per-chunk alpha application remain in the existing output loop.
    preserved_prefix=np.zeros((band_px,W),dtype=np.uint8)
    for c in top_chunks:
        local_support=render_north_support_chunk(c,ctx['bounds'],north_supports)
        dummy=Image.new('RGBA',(int(c['width'])*2,int(c['height'])*2),(0,0,0,255))
        _,local_prefix,prefix_stats=apply_north_prefix_mask(
            dummy,top_contact_layers[c['id']],local_support,top_row,ctx['bounds'],c)
        if prefix_stats is None: raise AssertionError('top chunk did not produce the preserved prefix seed')
        x_start=int(c['x'])*2;local_width=int(c['width'])*2
        if x_start<0 or x_start+local_width>W or local_prefix.shape[1]!=local_width:
            raise AssertionError(f'north prefix seed slice differs from top chunk geometry: {c["id"]}')
        if np.any(preserved_prefix[:,x_start:x_start+local_width]):
            raise AssertionError(f'north prefix seed chunks overlap: {c["id"]}')
        preserved_prefix[:,x_start:x_start+local_width]=local_prefix[:band_px]
    north_gap_cut,north_gap_proof=north_enclosed_gap_base_cut(
        top_visible_alpha,top_contact_alpha,ctx['owner']['terrainRows'][:NORTH_PREFIX_BAND_CELLS],
        ctx['bounds'],preserved_prefix,np.ones((band_px,W),dtype=bool))
    skyline_alpha=np.maximum(alpha,support_mask*255).astype(np.uint8)
    _,frontage_pixels,frontage_inventory=north_frontage_skyline_pixels(skyline_alpha,ctx['events'],north_supports,ctx['bounds'])
    route_corridor_guard=north_route_corridor_guard(renderer,ctx['bounds'])
    north_sea_cut,north_sea_proof=north_authored_sea_backing_cut(
        skyline_alpha,semantic_m,semantic_water,np.ones((H,W),dtype=bool),
        ctx['collisionMask']|(support_mask>0),ctx['guard'],route_corridor_guard,
        frontage_pixels,ctx['bounds'])
    north_sea_seed=north_sea_cut
    north_sea_cut,north_fringe_proof,_north_fringe_delta=extend_north_sea_to_authored_contacts(
        north_sea_cut,semantic_m,skyline_alpha,ctx['collisionMask']|(support_mask>0),
        ctx['guard'],route_corridor_guard,ctx['events'],frontage_inventory)
    if north_fringe_proof['outsideOriginalSeedRows']:
        raise AssertionError('north fringe contact extension escaped rows with original sea seeds')
    north_sea_proof=merge_north_sea_contact_proof(
        north_sea_seed,north_sea_cut,north_sea_proof,ctx['bounds'],north_fringe_proof,frontage_inventory)
    north_sea_proof['semanticSourcePath']=semantic_path.relative_to(BUNDLE.resolve()).as_posix()
    north_sea_proof['semanticSourceSha256']=digest(semantic_path)
    north_sea_proof['semanticSourceDimensionsPx']=[W//2,H//2]
    north_sea_proof['semanticSourcePixelsPerCell']=16
    north_sea_proof['semanticProjection']='exact RGB tokens replicated 2x2 with nearest semantics to 32px/cell'
    north_sea_proof['frontageContributorInventory']=[
        {'sourceId':source_id,**frontage_inventory[source_id]} for source_id in sorted(frontage_inventory)]
    north_full_ground_cut=np.zeros((H,W),dtype=np.uint8)
    north_full_ground_cut[:band_px]=preserved_prefix|north_gap_cut
    north_full_ground_cut|=north_sea_cut
    north_gap_by_chunk={}
    for c in top_chunks:
        x_start=int(c['x'])*2; local_width=int(c['width'])*2
        north_gap_by_chunk[c['id']]=north_gap_cut[:,x_start:x_start+local_width]
        if north_gap_by_chunk[c['id']].shape!=(NORTH_PREFIX_BAND_CELLS*32,local_width):
            raise AssertionError(f'north connected cut slice differs from chunk geometry: {c["id"]}')
    # Emit exactly the declared 120 chunk geometries and layer paths; no per-chunk resort.
    for c in outman['chunks']:
        x,y,w,h=c['x'],c['y'],c['width'],c['height'];box=(x*2,y*2,w*2,h*2)
        bp=pub/c['base'];cached_top_base=None
        if cache_proof:
            source=Path(cache_proof['sourceGeneration'])/'public/act1-hifi'/c['base']
            if int(c.get('y',-1))==0:
                # The top-row alpha mask depends on current cliff contacts. A
                # cached masked base can retain stale transparent pixels after
                # an object omission, so render pristine top ground before
                # applying this run's current contact mask.
                cached_top_base=Image.open(source).convert('RGBA')
                base=render_ground(renderer,(x,y,w,h),sharpen=True)
                if base.size!=(w*2,h*2):raise AssertionError(f'rebuilt top base crop size mismatch {c["id"]}: {base.size}')
                base.convert('RGB').save(bp,format='WEBP',lossless=True,quality=100,method=6)
            else:
                shutil.copyfile(source,bp)
                base=Image.open(bp).convert('RGB')
                if base.size!=(w*2,h*2):raise AssertionError(f'cached base crop size mismatch {c["id"]}: {base.size}')
        else:
            base=render_ground(renderer,(x,y,w,h),sharpen=True)
            if base.size!=(w*2,h*2):raise AssertionError(f'base crop size mismatch {c["id"]}: {base.size}')
            base.convert('RGB').save(bp,format='WEBP',lossless=True,quality=100,method=6)
        support=render_north_support_chunk(c,ctx['bounds'],north_supports)
        if support is not None:
            npth=pub/'chunks/north'/(c['id']+'.png')
            support.save(npth,format='PNG',optimize=False)
            c['north']='chunks/north/'+npth.name;c['northSha256']=digest(npth)
        px0,py0=x*2,y*2
        sea_local=north_sea_cut[py0:py0+h*2,px0:px0+w*2]
        if sea_local.shape!=(h*2,w*2): raise AssertionError(f"authored north sea chunk slice changed geometry: {c['id']}")
        water_backing=sea_local
        if int(c.get('y',-1))==0:
            cliff=top_contact_layers[c['id']]
            original_base=base.convert('RGBA')
            masked,cut,stats=apply_north_prefix_mask(original_base,cliff,support,top_row,ctx['bounds'],c)
            if stats is None: raise AssertionError('top chunk did not receive north prefix policy')
            connected=north_gap_by_chunk[c['id']]
            if connected.shape!=(NORTH_PREFIX_BAND_CELLS*32,cut.shape[1]):
                raise AssertionError(f'north connected gap cut geometry differs: {c["id"]}')
            masked,cut,mask_stats=apply_north_enclosed_gap_cut(masked,cut,connected)
            stats.update(mask_stats)
            combined_local=np.zeros((h*2,w*2),dtype=np.uint8)
            combined_local[:cut.shape[0]]=cut
            combined_local|=sea_local
            if not np.array_equal(combined_local,north_full_ground_cut[py0:py0+h*2,px0:px0+w*2]):
                raise AssertionError(f"top ground mask differs from global authored proof: {c['id']}")
            masked,sea_stats=apply_north_sea_backing_cut(masked,sea_local)
            stats.update(sea_stats)
            water_backing=combined_local
            if cached_top_base is not None:
                expected_mask=combined_local.astype(bool)
                cache_mask_proof=verify_rebuilt_base_mask(
                    cached_top_base,original_base,masked,expected_mask,c['id'])
                stats['groundCacheNorthMaskRebuild']=cache_mask_proof
                north_cache_mask_rebuilds.append({'chunkId':c['id'],**cache_mask_proof})
            start=int(c['x'])*2
            if start<0 or start+cut.shape[1]>W: raise AssertionError(f'north prefix chunk escapes authored width: {c["id"]}')
            merge_north_prefix_cut(north_prefix_cut,cut,start)
            north_prefix_chunks.append(stats)
            persist_north_masked_base(bp,masked,stats)
        elif np.any(sea_local):
            original_base=base.convert('RGBA')
            masked,sea_stats=apply_north_sea_backing_cut(original_base,sea_local)
            masked.save(bp,format='WEBP',lossless=True,quality=100,method=6)
            stats=sea_stats
        c['baseSha256']=digest(bp)
        layer=top_layers[c['id']] if int(c.get('y',-1))==0 else render_objects(ctx['events'],box)
        fp=pub/c['forest'];layer.save(fp,format='PNG',optimize=False)
        c['forestSha256']=digest(fp)
        semantic_water_local=semantic_water[py0:py0+h*2,px0:px0+w*2]
        water=render_water_r2(renderer,c,water_texture,ctx['bounds'][:2],semantic_water_local,
            water_backing if np.any(water_backing) else None)
        c['water']='chunks/water-r2/'+c['id']+'.png'
        wp=pub/c['water'];water.save(wp,format='PNG',optimize=False)
        c['waterPixelsPerCell']=32;c['waterSha256']=digest(wp)
        key='canopy'
        source=(Path(cache_proof['sourceGeneration'])/'public/act1-hifi'/c[key]) if cache_proof else (RUNTIME/'chunks'/key/Path(c[key]).name);dest=pub/c[key]
        expected=c[key+'Sha256'];runtime_source=RUNTIME/'chunks'/key/Path(c[key]).name
        if digest(source)!=expected or digest(runtime_source)!=expected:raise AssertionError(f'unchanged {key} source mismatch for {c["id"]}')
        shutil.copyfile(source,dest)
        if digest(dest)!=expected:raise AssertionError(f'copied {key} byte mismatch for {c["id"]}')
        if base.size!=(w*2,h*2) or Image.open(fp).size!=base.size:raise AssertionError(f'chunk geometry mismatch {c["id"]}')
    if cache_proof and len(north_cache_mask_rebuilds)!=len(top_chunks):
        raise AssertionError('ground-cache reuse did not rebuild every current top-row base mask')
    # Coarse base and object fallback are generated from the same semantic policy and sorted assets.
    bounds=ctx['bounds']; width=(bounds[2]-bounds[0]+1)*6;height=(bounds[3]-bounds[1]+1)*6
    cached_plate=Image.open(Path(cache_proof['sourceGeneration'])/'public/act1-hifi/underpaint/act1-plate.png').convert('RGBA') if cache_proof else None
    semantic,_=renderer.render_window(0,0,width//6*16,height//6*16,ppc=6)
    base6=Image.fromarray(semantic,'RGB').convert('RGBA')
    if base6.size!=(width,height):raise AssertionError('6ppc substrate size mismatch')
    # The coarse continuous substrate sits below the chunk base, so apply the
    # exact same full-map visual-only backing mask or it would refill any reveal.
    pristine_base6=base6.copy()
    base6=apply_north_sea_backing_mask_6ppc(base6,north_full_ground_cut)
    if cached_plate is not None:
        coarse_proof=verify_rebuilt_base_mask(
            cached_plate,pristine_base6,base6,
            project_north_sea_backing_mask_6ppc(north_full_ground_cut),'6ppc-underpaint')
    else: coarse_proof=None
    base6.save(pub/'underpaint/act1-plate.png',format='PNG',optimize=False)
    low=Image.new('RGBA',(width,height),(0,0,0,0));low_events=sorted(ctx['events'],key=event_sort_key)
    for e in low_events:
        im=e['image'];size=(max(1,round(im.width*6/32)),max(1,round(im.height*6/32)))
        sm=im.resize(size,Image.Resampling.LANCZOS)
        lx=round(e['x']*6/32);ly=round(e['y']*6/32)
        low.alpha_composite(sm,(lx,ly))
    low.save(pub/'underpaint/forest-rgba.png',format='PNG',optimize=False)
    # Retain the approved visible-art alpha unchanged. The four restored connected
    # north supports add collision only where their hard-cut pixels enter the map;
    # no pre-existing collision bit is removed or dilated.
    alpha_image=Image.fromarray(alpha,'L');alpha_path=root/'evidence/final-visible-raised-alpha.png';alpha_image.save(alpha_path,format='PNG',optimize=False)
    alpha_hash=digest(alpha_path)
    support_collision_path=root/'evidence/north-support-collision-alpha.png'
    Image.fromarray(support_mask*255,'L').save(support_collision_path,format='PNG',optimize=False)
    collision_alpha=np.maximum(alpha,support_mask*255).astype(np.uint8)
    collision_alpha_path=root/'evidence/final-visible-plus-north-support-collision-alpha.png'
    collision_alpha_image=Image.fromarray(collision_alpha,'L')
    collision_alpha_image.save(collision_alpha_path,format='PNG',optimize=False)
    collision_alpha_hash=digest(collision_alpha_path)
    if np.any((alpha>0)&(collision_alpha==0)):
        raise AssertionError('north collision composition removed an existing forest/canopy collision pixel')
    collision_delta=int(np.count_nonzero((collision_alpha>0)&(alpha==0)))
    if collision_delta!=int(support_collision_proof['newCollisionPixels']):
        raise AssertionError('north collision union delta differs from the support mask proof')
    colpath=pub/'forest-collision.bin';colpath.write_bytes(expected_qok(collision_alpha,collision_alpha_hash))
    collision_receipt=check_qok(colpath,collision_alpha,collision_alpha_hash)
    # Current output manifest retains all exact chunk IDs/geometry and unchanged A1OW/canopy.
    for c in outman['chunks']:
        if c['basePixelsPerCell']!=32:raise AssertionError('base ppc metadata changed')
    outman['source']['act1TerrainUnionA1OWSha256']=ctx['man']['source']['act1TerrainUnionA1OWSha256']
    outman['underpaint']['sha256']=digest(pub/'underpaint/act1-plate.png')
    outman['waterTreatment']={'schema':'act1-water-r2-global-phase-v1','assetPath':water_asset_rel,
        'assetSha256':water_asset_sha,'assetDimensionsPx':list(Image.open(water_asset_path).size),
        'sourceRecipePath':str(WATER_R2_RECIPE.relative_to(BUNDLE.parents[1])),
        'sourceRecipeSha256':digest(WATER_R2_RECIPE),
        'sourceAssetPath':str(WATER_R2_ASSET.relative_to(BUNDLE.parents[1])),
        'sourceAssetSha256':digest(WATER_R2_ASSET),
        'pixelsPerCell':32,'sourceTexelsPerCell':96,
        'semanticMask':'R4 _weights("water") floored to 1.0 on exact smoothed semantic W tokens; 32ppc output',
        'phase':'global world-cell origin; 96 texture texels per cell','blend':'normal alpha composite'}
    cache_mask_audit={'topRowBaseRebuiltFromCurrentGround':bool(cache_proof),'topRowChunks':north_cache_mask_rebuilds,
        'underpaintRebuiltFromCurrentGround':bool(cache_proof),'underpaintMaskDelta':coarse_proof,
        'allTopRowChunksRebuilt':not cache_proof or len(north_cache_mask_rebuilds)==len(top_chunks)}
    outman['northSupport']={'schema':NORTH_SUPPORT_SCHEMA,'pixelsPerCell':32,'heightPixels':300,
        'anchor':'north edge of manifest chunk row y=0','depth':'above-plate pixels use the north overhang layer; in-map B110 pixels use the shared contactY foreground compositor',
        'prefixMask':{'northWorldY':ctx['bounds'][1],'bandCells':NORTH_PREFIX_BAND_CELLS,
            'terrainRow':'owner terrain row 0, only M cells','contact':'first nonzero cliff alpha from existing cliff chunks or these four connected support pixels',
            'noContact':'leave base opaque'},'sourceSupport':north_support_proof,
        'northEnclosedWaterGapMask':north_gap_proof,
        'northSeaBackingMask':north_sea_proof,
        'chunks':sorted(c['id'] for c in outman['chunks'] if c.get('north')),
        'sharedContactYCompositor':ctx['northSharedYProof'],
        'prefixChunkProof':north_prefix_chunks,'collisionChanged':bool(collision_delta),
        'collisionUnion':support_collision_proof}
    outman['forestMode']='whole-object-v8'
    outman['collision']={'artifact':'forest-collision.bin','dimensionsPx32':[W,H],'sha256':digest(colpath),'sourceArtifact':'../evidence/final-visible-plus-north-support-collision-alpha.png','sourceSha256':collision_alpha_hash,'format':'qok-forest-bitset-v1','version':1,'bounds':[16,218,163,399],'pixelsPerCell':32,'alphaThreshold':16,'bytes':colpath.stat().st_size,'treeDilationSourcePixels':0,'geometryManifestSha256':hashlib.sha256(json.dumps({'bounds':[16,218,163,399],'ppc':32,'chunks':[(c['id'],c['x'],c['y'],c['width'],c['height']) for c in outman['chunks']]},separators=(',',':')).encode()).hexdigest(),'sourceInputs':[{'label':'final-rendered-raised-art-alpha','path':'../evidence/final-visible-raised-alpha.png','sha256':alpha_hash,'threshold':16,'bitOrder':'little-within-byte'},{'label':'connected-companion-north-support-alpha-clipped-to-map-bounds','path':'../evidence/north-support-collision-alpha.png','sha256':digest(support_collision_path),'threshold':16,'bitOrder':'little-within-byte'}],'composition':'QOK bits are the union of unchanged globally sorted forest+cliff raised-art alpha and the four connected companion-B north-support alpha pixels clipped to authored map bounds; no prior bit removal and no dilation','compositionDigest':hashlib.sha256(b'edu-rpg-act1-forward-visible-alpha-plus-north-support-v1\0'+bytes.fromhex(alpha_hash)+bytes.fromhex(digest(support_collision_path))).hexdigest()}
    outman['forwardTerrainProfile']={'profileId':'act1-forward-20261007-v1','status':'generated-static-profile-not-runtime-approved','generatorSha256':digest(Path(__file__)),'groundPolicy':'single R4 material field; reclassify only nonwater owner F/M ground cells as meadow before world-anchored material composition; preserve the existing effective route factor and all water cells','raisedArtPolicy':'2061 current forest records + current cliffs classified against the pinned north XYXY rectangle; omit 25 fully-contained old objects, retain 6 crossers and 163 disjoint objects whole + nine approved whole north objects + exact 11 pilot seeds and accepted 40-record whole-crown boundary recipe; hard-cut display alpha128; shared contactY/source-origin sort; restore only four source-connected companion-B upper segments aligned to unchanged approved lower pixels','collisionAuthority':'QOKF8COL union of unchanged final visible forest+cliff alpha and only in-map hard-cut alpha from the four connected companion-B north supports; no prior bit removals or dilation','fullWorldComplete':True,'gateReady':False,'nativeVerified':False,'northRecipeSha256':digest(NORTH_RECIPE),'acceptedLayoutRecipeSha256':digest(LAYOUT_RECIPE),'northObjectCount':9,'pilotSeedCount':11,'boundaryPlacementCount':len(ctx['selectedRecords']),'boundaryPlacementRecords':ctx['selectedRecords'],'sourceAlphaFringeIgnored':True,'acceptedNaturalResidual':ctx['contactReport'].get('acceptedNaturalResidual',{'pixelCount':0,'components':[]})}
    source_overlay=verified_a1ow_v2_source_overlay(ctx['man'])
    outman['source'].pop('act1TerrainUnionA1OWProvenance',None)
    outman['source'].update(source_overlay)
    manifest_path=pub/'manifest.json';save_json(manifest_path,outman)
    # Exact global alpha reconstructed from all 120 layer chunks, including any east padding.
    maxx=max(c['x']+c['width'] for c in outman['chunks'])*2;maxy=max(c['y']+c['height'] for c in outman['chunks'])*2
    assembled=np.zeros((maxy,maxx),dtype=np.uint8)
    for c in outman['chunks']:
        im=np.asarray(Image.open(pub/c['forest']).convert('RGBA').getchannel('A'))
        ox=c['x']*2;oy=c['y']*2;assembled[oy:oy+im.shape[0],ox:ox+im.shape[1]]=im
    if np.any(assembled[:,W:]):raise AssertionError('rendered forest/cliff alpha extends beyond QOK authored bounds')
    if not np.array_equal(assembled[:H,:W],collision_alpha):raise AssertionError('rendered chunk alpha differs from baseline-plus-north-support union')
    # Exact pixel parity for each adjacent chunk pair and every 2x2 corner neighborhood.
    ordered=sorted(ctx['events'],key=event_sort_key);by={(c['x'],c['y']):c for c in outman['chunks']}
    checked_edges=0;checked_corners=0
    for c in outman['chunks']:
        right=by.get((c['x']+c['width'],c['y']))
        if right and right['height']==c['height']:
            box=(c['x']*2,c['y']*2,(c['width']+right['width'])*2,c['height']*2)
            ref=render_objects(ordered,box);join=Image.new('RGBA',ref.size);join.alpha_composite(Image.open(pub/c['forest']).convert('RGBA'),(0,0));join.alpha_composite(Image.open(pub/right['forest']).convert('RGBA'),(c['width']*2,0))
            if join.tobytes()!=ref.tobytes():raise AssertionError(f'forest pixel seam mismatch at {c["id"]} right')
            checked_edges+=1
        down=by.get((c['x'],c['y']+c['height']))
        if down and down['width']==c['width']:
            box=(c['x']*2,c['y']*2,c['width']*2,(c['height']+down['height'])*2)
            ref=render_objects(ordered,box);join=Image.new('RGBA',ref.size);join.alpha_composite(Image.open(pub/c['forest']).convert('RGBA'),(0,0));join.alpha_composite(Image.open(pub/down['forest']).convert('RGBA'),(0,c['height']*2))
            if join.tobytes()!=ref.tobytes():raise AssertionError(f'forest pixel seam mismatch at {c["id"]} down')
            checked_edges+=1
        if right and down:
            diag=by.get((right['x'],down['y']))
            if diag:
                bw=(c['width']+right['width'])*2;bh=(c['height']+down['height'])*2;box=(c['x']*2,c['y']*2,bw,bh)
                ref=render_objects(ordered,box);join=Image.new('RGBA',ref.size)
                for cc,ox,oy in [(c,0,0),(right,c['width']*2,0),(down,0,c['height']*2),(diag,c['width']*2,c['height']*2)]:join.alpha_composite(Image.open(pub/cc['forest']).convert('RGBA'),(ox,oy))
                if join.tobytes()!=ref.tobytes():raise AssertionError(f'forest pixel corner mismatch at {c["id"]}')
                checked_corners+=1
    if checked_edges<200 or checked_corners<90:raise AssertionError(f'incomplete chunk edge/corner census {checked_edges}/{checked_corners}')
    # Base ground seams/corners are independently re-rendered with overscan and compared.
    # One-cell stripes around every joined edge plus a two-cell square at every corner.
    base_edges=0;base_corners=0
    for c in outman['chunks']:
        right=by.get((c['x']+c['width'],c['y']))
        if right and right['height']==c['height']:
            bx=(c['x']+c['width'])*2;box=(bx//2-16,c['y'],32,c['height'])
            ref=render_ground(renderer,box,sharpen=True)
            leftim=Image.open(pub/c['base']).convert('RGBA');rightim=Image.open(pub/right['base']).convert('RGBA')
            join=Image.new('RGBA',(64,c['height']*2));join.paste(leftim.crop((leftim.width-32,0,leftim.width,c['height']*2)),(0,0));join.paste(rightim.crop((0,0,32,c['height']*2)),(32,0))
            assert_ground_join_matches(join,ref,north_full_ground_cut,box[0]*2,box[1]*2,f'base ground vertical seam at {c["id"]}')
            base_edges+=1
        down=by.get((c['x'],c['y']+c['height']))
        if down and down['width']==c['width']:
            byy=(c['y']+c['height'])*2;box=(c['x'],byy//2-16,c['width'],32)
            ref=render_ground(renderer,box,sharpen=True)
            upim=Image.open(pub/c['base']).convert('RGBA');downim=Image.open(pub/down['base']).convert('RGBA')
            join=Image.new('RGBA',(c['width']*2,64));join.paste(upim.crop((0,upim.height-32,upim.width,upim.height)),(0,0));join.paste(downim.crop((0,0,downim.width,32)),(0,32))
            assert_ground_join_matches(join,ref,north_full_ground_cut,box[0]*2,box[1]*2,f'base ground horizontal seam at {c["id"]}')
            base_edges+=1
        if right and down:
            diag=by.get((right['x'],down['y']))
            if diag:
                bx=(c['x']+c['width'])*2;byy=(c['y']+c['height'])*2;box=(bx//2-16,byy//2-16,32,32)
                ref=render_ground(renderer,box,sharpen=True)
                join=Image.new('RGBA',(64,64))
                for cc,dx,dy in [(c,0,0),(right,32,0),(down,0,32),(diag,32,32)]:
                    im=Image.open(pub/cc['base']).convert('RGBA');sx=im.width-32 if dx==0 else 0;sy=im.height-32 if dy==0 else 0;join.paste(im.crop((sx,sy,sx+32,sy+32)),(dx,dy))
                assert_ground_join_matches(join,ref,north_full_ground_cut,box[0]*2,box[1]*2,f'base ground corner at {c["id"]}')
                base_corners+=1
    if base_edges<200 or base_corners<90:raise AssertionError(f'incomplete base edge/corner census {base_edges}/{base_corners}')
    # Build 6ppc review image and mark every current F/M adjacency for a whole-map contact montage.
    montage=base6.copy();montage.alpha_composite(low)
    draw=ImageDraw.Draw(montage)
    for (a,b) in [(a,b) for a,b in []]:pass
    for (x1,y1),(x2,y2) in ctx['fmEdges']:
        if x1==x2:
            px=(x1-bounds[0])*6;py=(max(y1,y2)-bounds[1])*6
            draw.line((px,py,px+5,py),fill=(255,220,20,255),width=1)
        else:
            px=(max(x1,x2)-bounds[0])*6;py=(y1-bounds[1])*6
            draw.line((px,py,px,py+5),fill=(255,220,20,255),width=1)
    residual=ctx['remainingGap'];ry,rx=np.nonzero(residual)
    if len(rx):
        for component in ctx['contactReport']['acceptedNaturalResidual']['components']:
            x0,y0,x1,y1=component['bounds'];cx=round(((x0+x1-1)/2)*6/32);cy=round(((y0+y1-1)/2)*6/32)
            draw.ellipse((cx-2,cy-2,cx+2,cy+2),fill=(255,24,50,255),outline=(255,255,255,255),width=1)
        draw.text((6,6),f"RED = {len(rx)} retained residual pixels in {len(ctx['contactReport']['acceptedNaturalResidual']['components'])} disconnected components",fill=(255,255,255,255),stroke_width=2,stroke_fill=(0,0,0,255))
    montage.convert('RGB').save(root/'evidence/fm-contacts-overview.png',format='PNG',optimize=False)
    if len(rx):
        x0=max(0,int(rx.min())-24);x1=min(W,int(rx.max())+25);y0=max(0,int(ry.min())-24);y1=min(H,int(ry.max())+25);box=(x0,y0,x1-x0,y1-y0)
        close_base=Image.new('RGB',(box[2],box[3]),(0,0,0));close_raised=Image.new('RGBA',(box[2],box[3]),(0,0,0,0))
        for cc in outman['chunks']:
            gx0,gy0=cc['x']*2,cc['y']*2;gx1,gy1=gx0+cc['width']*2,gy0+cc['height']*2
            ix0,iy0=max(x0,gx0),max(y0,gy0);ix1,iy1=min(x1,gx1),min(y1,gy1)
            if ix1<=ix0 or iy1<=iy0:continue
            crop_box=(ix0-gx0,iy0-gy0,ix1-gx0,iy1-gy0);dest=(ix0-x0,iy0-y0)
            cb=Image.open(pub/cc['base']).convert('RGB').crop(crop_box);close_base.paste(cb,dest)
            cr=Image.open(pub/cc['forest']).convert('RGBA').crop(crop_box);close_raised.alpha_composite(cr,dest)
        close_scene=close_base.convert('RGBA');close_scene.alpha_composite(close_raised)
        region=residual[y0:y1,x0:x1];overlay=np.zeros((box[3],box[2],4),dtype=np.uint8);overlay[region]=[255,20,48,255];close_scene.alpha_composite(Image.fromarray(overlay,'RGBA'))
        title='6 exposed pixels; 3 separate components (2+1+3)'
        cd=ImageDraw.Draw(close_scene);cd.text((1,1),title,fill=(255,255,255,255),stroke_width=2,stroke_fill=(0,0,0,255))
        close_scene.resize((box[2]*8,box[3]*8),Image.Resampling.NEAREST).convert('RGB').save(root/'evidence/fm-residual-closeup.png',format='PNG',optimize=False)
    if root.name=='generation-a':
        (HERE/'evidence').mkdir(parents=True,exist_ok=True)
        montage.save(HERE/'evidence/fm-contacts-overview.png',format='PNG',optimize=False)
    # Quantify 6ppc LANCZOS support not covered by high-resolution collision when
    # projected back to its 32ppc footprint. This is separate evidence, not parity.
    low_alpha=np.asarray(low.getchannel('A'))
    high_projected=np.asarray(alpha_image.resize((width,height),Image.Resampling.NEAREST))
    high16=high_projected>=16;high128=high_projected>=128
    low16=low_alpha>=16;low128=low_alpha>=128
    low_only16=low16 & ~high16;low_only128=low128 & ~high128
    from scipy.ndimage import distance_transform_edt
    dist_to_high=distance_transform_edt(~high16)
    def support_metrics(mask):
        vals=dist_to_high[mask]
        return {'pixels':int(mask.sum()),'maxDistanceFromProjectedHighresSupport6ppcPx':float(vals.max()) if vals.size else 0.0,'p95DistanceFromProjectedHighresSupport6ppcPx':float(np.percentile(vals,95)) if vals.size else 0.0}
    low_only=low_alpha>0
    low_support={'lowres6ppcAlphaThresholdCounts':{'gt0':int(np.count_nonzero(low_alpha>0)),'gte16':int(low16.sum()),'gte128':int(low128.sum())},'projectedHighresCollisionThresholds':{'gte16':int(high16.sum()),'gte128':int(high128.sum())},'supportOutsideProjectedHighresCollision':{'gt0':support_metrics((low_alpha>0)&~high16),'gte16':support_metrics(low_only16),'gte128':support_metrics(low_only128)},'interpretation':'6ppc LANCZOS support outside the projected 32ppc collision is reported at alpha>0, >=16, and >=128; distance is to nearest projected high-resolution support pixel in 6ppc coordinates. This measures fringe and possible silhouette displacement but does not certify rendered fallback parity.','lowresOnlyMaskSha256':hashlib.sha256(low_only.astype(np.uint8).tobytes()).hexdigest()}
    low_only_im=Image.fromarray((low_only.astype(np.uint8)*255),'L');low_only_im.save(root/'evidence/lowres-only-support-6ppc.png',format='PNG',optimize=False)
    # Exact complete path/byte/hash inventory for this generated runtime package and evidence.
    allfiles={}
    for p in sorted(root.rglob('*')):
        if p.is_file() and p.name not in ('output-receipt.json',):
            rel=str(p.relative_to(root));allfiles[rel]={'bytes':p.stat().st_size,'sha256':digest(p)}
    receipt={'profileId':'act1-forward-20261007-v1','generationLabel':label,'generatedAtFixed':'deterministic; no wall-clock fields','generatorSha256':digest(Path(__file__)),'acceptedLayoutRecipeSha256':digest(LAYOUT_RECIPE),'northRecipeSha256':digest(NORTH_RECIPE),'waterRecipeSha256':digest(WATER_R2_RECIPE),'fullWorldComplete':True,'gateReady':False,'nativeVerified':False,'sourceBundleManifestSha256':digest(BUNDLE/'input-manifest.json'),'a1owReview':{'path':A1OW_REVIEW_REL,'sha256':A1OW_REVIEW_SHA256,'schema':'independent-a1ow-v2-integration-review-v1'},'groundCacheReuse':cache_proof,'groundCacheMaskRebuild':cache_mask_audit,'groundComposition':ground_policy,'waterTreatment':outman['waterTreatment'],'outputInventory':allfiles,'sourceAlpha':{'path':'evidence/final-visible-raised-alpha.png','sha256':alpha_hash,'pixelsSha256':pix_digest(alpha_image),'bounds':[16,218,163,399],'dimensions':[4736,5824],'pixelsPerCell':32,'thresholdBeforeCollision':128,'collisionThreshold':16,'collisionEqualsBaselineRaisedArtAlpha':bool(np.array_equal(ctx['collisionMask'],alpha>0)),'collisionUnionAddsNorthSupportPixels':collision_delta,'collisionUnionSourceSha256':collision_alpha_hash},'northSupportCollision':support_collision_proof,'sharedContactYNorthEvent':ctx['northSharedYProof'],'collisionPack':collision_receipt,'lowresFallbackSupport':low_support,'chunks':{'count':len(outman['chunks']),'ids':[c['id'] for c in outman['chunks']],'geometryPreserved':True,'basePixelsPerCell':32,'inputGeometryPixelsPerCell':16,'waterPixelsPerCell':32,'waterSourceTexelsPerCell':96,'layerDimensionsValidated':True,'waterRebuiltFromCurrentSemanticMask':True,'renderedAlphaEqualsBaselinePlusNorthSupportUnion':True,'objectAdjacentSeamsPixelExact':checked_edges,'objectCornersPixelExact':checked_corners,'baseGroundAdjacentSeamsPixelExact':base_edges,'baseGroundCornersPixelExact':base_corners},'boundaryRule':ctx['contactReport'],'routeSource':ctx['nav'],'northRecipe':ctx['contactReport']['northRecipe'],'pilotSeed':ctx['contactReport']['pilotSeed'],'limitations':['static full Act1 generation only; no app/public/gate/native changes','actual game new-game spawn/save-resume and runtime collision/streaming are unverified','6ppc underpaint/fallback alpha is LANCZOS-resampled and is not proven silhouette-identical to the 32ppc QOK collision; see lowresFallbackSupport','current A1OW was copied exactly and left unchanged; QOK collision is the union of baseline raised-art alpha and in-map connected north-support alpha; no prior bits are removed','R26 polygon authority remains design-only, not runtime collision']}
    save_json(root/'output-receipt.json',receipt)
    return receipt

def main():
    global HERE,RUNTIME,PILOT_RECEIPT,PILOT_ALPHA
    ap=argparse.ArgumentParser();ap.add_argument('--work-root',required=True,help='writable evidence/output root outside the source profile bundle');ap.add_argument('--runtime-root',default=str(RUNTIME),help='read-only current public/act1-hifi source tree');ap.add_argument('--pilot-receipt',default=str(PILOT_RECEIPT));ap.add_argument('--pilot-alpha',default=str(PILOT_ALPHA));ap.add_argument('--plan-only',action='store_true');ap.add_argument('--single-generation',action='store_true',help='generate only output A for a bounded portable-source replay');ap.add_argument('--output-a',default='generation-corrected-a');ap.add_argument('--output-b',default='generation-corrected-b');ap.add_argument('--reuse-ground-from',default=None,help='optional verified complete prior output cache; omit to regenerate ground');ap.add_argument('--metadata-only-rebind',action='store_true',help='re-emit the locked R26 geometry metadata over an exact frozen output inventory');ap.add_argument('--source-output',default=str(PROFILE_ROOT/'generated-output'));ap.add_argument('--source-receipt',default=str(PROFILE_ROOT/'evidence/output-receipt.json'));args=ap.parse_args()
    HERE=Path(args.work_root).resolve();RUNTIME=Path(args.runtime_root).resolve();PILOT_RECEIPT=Path(args.pilot_receipt).resolve();PILOT_ALPHA=Path(args.pilot_alpha).resolve()
    if args.metadata_only_rebind:
        a=HERE/args.output_a;b=HERE/args.output_b
        result=rebind_metadata_only(args.source_output,args.source_receipt,a,b)
        save_json(HERE/'metadata-only-rebind-comparison.json',result)
        print(json.dumps(result,indent=2),flush=True)
        return
    started=time.time();ctx=make_context();
    if ctx.get('preflightFailed'):
        print(json.dumps({'phase':'boundary-preflight','elapsedSeconds':round(time.time()-started,1),'candidateCount':ctx['contactReport']['globalLatticeEligibleCandidates'],'selected':ctx['contactReport']['selectedBoundaryObjects'],'targetBefore':ctx['contactReport']['targetGapPixelsBefore'],'targetAfter':ctx['contactReport']['targetGapPixelsAfter'],'status':'FAIL_PRECHECK'},indent=2),flush=True)
    else:
        print(json.dumps({'phase':'boundary-preflight','elapsedSeconds':round(time.time()-started,1),'candidateCount':ctx['contactReport']['globalLatticeEligibleCandidates'],'selected':len(ctx['selectedRecords']),'targetBefore':ctx['contactReport']['targetGapPixelsBefore'],'targetAfter':ctx['contactReport']['targetGapPixelsAfter'],'newP':ctx['contactReport']['newOwnerPPixels'],'guardHits':ctx['contactReport']['finalRouteGuardHits']},indent=2),flush=True)
    if args.plan_only and ctx.get('preflightFailed'):
        print('preflight failed; wrote preflight-failure.json; no output generation started',flush=True)
        return
    if args.plan_only:
        save_json(HERE/'preflight.json',{'profileId':'act1-forward-20261007-v1','routeSource':ctx['nav'],'boundaryRule':ctx['contactReport'],'sourcePins':{'bundleManifestSha256':digest(BUNDLE/'input-manifest.json'),'rendererSha256':digest(BUNDLE/'r4-source/scripts/render_material_map_r4.py'),'configSha256':digest(BUNDLE/'r4-source/paint-source-r4-v5.json'),'forestPlacementSha256':digest(BUNDLE/'placements/forest-r4-whole-act1.json'),'cliffPlacementSha256':digest(BUNDLE/'placements/cliff-selected-layout-whole-act1.json')},'planOnly':True})
        return
    if ctx.get('preflightFailed'):raise RuntimeError('full generation stopped: global F/M boundary coverage precheck failed; see preflight-failure.json')
    a=HERE/args.output_a;b=HERE/args.output_b;cache=Path(args.reuse_ground_from).resolve() if args.reuse_ground_from else None
    output_dirs=(a,) if args.single_generation else (a,b)
    for p in output_dirs:
        if p.exists(): raise FileExistsError(f'refusing to overwrite existing generation directory {p}')
    for p in output_dirs: p.mkdir()
    for root,label in ((a,'A'),(b,'B')):
        t=time.time();r=gen_one(ctx,label,root,cache)
        print(json.dumps({'phase':'generation-complete','label':label,'seconds':round(time.time()-t,1),'files':len(r['outputInventory']),'outputReceipt':str(root/'output-receipt.json')}),flush=True)
        if args.single_generation: return
    ra=json.loads((a/'output-receipt.json').read_text());rb=json.loads((b/'output-receipt.json').read_text())
    ia=ra['outputInventory'];ib=rb['outputInventory'];differences=[]
    if ia.keys()!=ib.keys():differences=sorted(set(ia)^set(ib))
    else:differences=[k for k in ia if ia[k]!=ib[k]]
    result={'status':'PASS' if not differences else 'FAIL','profileId':'act1-forward-20261007-v1','generationAReceiptSha256':digest(a/'output-receipt.json'),'generationBReceiptSha256':digest(b/'output-receipt.json'),'pathSetMatches':not differences,'outputInventoryMismatches':differences,'cleanDeterministicRegeneration':not differences,'fullWorldComplete':True,'gateReady':False,'generationA':str(a),'generationB':str(b),'generatedAtFixed':'deterministic'}
    save_json(HERE/'regeneration-comparison.json',result)
    if differences:raise AssertionError('two clean full generations differ: '+str(differences[:10]))
    print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__':main()
