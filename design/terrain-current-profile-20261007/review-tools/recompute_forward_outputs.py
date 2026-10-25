"""Independent, bounded recomputation for frozen forward-profile output artifacts.

This is a portable-arguments adaptation of the W-side review checker. All paths
are supplied by the reviewer; no task-specific absolute path is embedded here.
It reads outputs and source inputs only and writes a JSON report only.
"""
import argparse
import math
from pathlib import Path
import hashlib, json, struct
import numpy as np
from PIL import Image
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--candidate',type=Path,required=True,help='candidate checkout root')
parser.add_argument('--bundle',type=Path,required=True,help='frozen 37-file terrain input bundle')
parser.add_argument('--run-a',type=Path,required=True,help='first clean-generation output root')
parser.add_argument('--run-b',type=Path,required=True,help='second clean-generation output root')
parser.add_argument('--portable',type=Path,required=True,help='portable-source generation output root')
parser.add_argument('--a1ow-map-proof',type=Path,required=True,help='frozen full 320x400 plated map proof used for A1OW support recomputation')
parser.add_argument('--report',type=Path,required=True,help='write recomputation JSON outside the candidate')
args=parser.parse_args()
C=args.candidate.resolve(); PROFILE=C/'design/terrain-current-profile-20261007'
BUNDLE=args.bundle.resolve(); A=args.run_a.resolve(); B=args.run_b.resolve(); OUT=args.portable.resolve()
if not __debug__:
    raise SystemExit('refusing optimized Python: checker assertions must remain active')
if not all(path.is_dir() for path in (C,BUNDLE,A,B,OUT)):
    raise SystemExit('candidate, bundle, and all three output roots must exist as directories')
REPORT=args.report.resolve()
if REPORT.is_relative_to(C):
    raise SystemExit('review report must be written outside the candidate checkout')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def safe_under(root, rel, label):
    rel_path=Path(rel)
    if rel_path.is_absolute() or '\\' in str(rel) or '..' in rel_path.parts:
        raise RuntimeError(f'unsafe {label} path: {rel!r}')
    path=(root/rel_path).resolve(strict=True)
    if not path.is_file() or not path.is_relative_to(root.resolve(strict=True)):
        raise RuntimeError(f'{label} path is missing or escapes its root: {rel!r}')
    return path
def inventory_errors(root, rec):
    errs=[]
    for rel, spec in rec['outputInventory'].items():
        try: p=safe_under(root,rel,'inventory')
        except (OSError,RuntimeError) as exc: errs.append({'invalid':rel,'reason':str(exc)}); continue
        if not p.is_file(): errs.append({'missing':rel}); continue
        if p.stat().st_size!=spec['bytes'] or sha(p)!=spec['sha256']: errs.append({'mismatch':rel})
    return errs
def slice_function(source, name):
    start=source.find(f'\n  function {name}(')
    assert start>=0,f'missing A1OW semantics source function: {name}'
    body=source.find('{',start); assert body>=0
    depth=0
    for end in range(body,len(source)):
        if source[end]=='{': depth+=1
        elif source[end]=='}':
            depth-=1
            if depth==0: return source[start+1:end+1]
    raise AssertionError(f'unbalanced A1OW semantics function: {name}')
def fnv1a32(data):
    value=0x811c9dc5
    for byte in data: value=((value^byte)*0x01000193)&0xffffffff
    return value
receipts={n:json.loads(safe_under(p,'output-receipt.json',f'{n} output receipt').read_text())
          for n,p in [('a',A),('b',B),('portable',OUT)]}
assert len(receipts['portable']['outputInventory'])==488
assert all(not inventory_errors(p, receipts[k]) for k,p in [('a',A),('b',B),('portable',OUT)])
assert receipts['a']['outputInventory']==receipts['b']['outputInventory']
inv_a=receipts['a']['outputInventory']; inv_p=receipts['portable']['outputInventory']
diffs={k:{'a':inv_a[k],'portable':inv_p.get(k)} for k in set(inv_a)|set(inv_p) if inv_a.get(k)!=inv_p.get(k)}
assert inv_a==receipts['b']['outputInventory']==inv_p
# The candidate keeps public outputs under public/ and a mirrored 488-row
# package under generated-output/ without the public/ prefix. Verify both copies
# from the candidate's pinned receipt, including the installed public bytes.
installed_receipt_path=PROFILE/'evidence/output-receipt.json'
installed_receipt=json.loads(installed_receipt_path.read_text())
assert installed_receipt['outputInventory']==inv_a
installed_errors=[]
for rel,spec in installed_receipt['outputInventory'].items():
    generated_rel=rel[len('public/'):] if rel.startswith('public/') else rel
    generated_path=safe_under(PROFILE/'generated-output',generated_rel,'installed generated output')
    if generated_path.stat().st_size!=spec['bytes'] or sha(generated_path)!=spec['sha256']:
        installed_errors.append({'scope':'generated-output','path':rel})
    if rel.startswith('public/'):
        public_path=safe_under(C,rel,'installed public output')
        if public_path.stat().st_size!=spec['bytes'] or sha(public_path)!=spec['sha256']:
            installed_errors.append({'scope':'public','path':rel})
assert not installed_errors,installed_errors[:5]
install_receipt_path=PROFILE/'evidence/whole-rock-integration-20261008/install-receipt.json'
install_receipt=json.loads(install_receipt_path.read_text())
assert install_receipt['sourceReceiptSha256']==sha(A/'output-receipt.json')
assert install_receipt['sourceInventoryCount']==488 and install_receipt['publicExpected']==484
assert install_receipt['publicActual']==533 and install_receipt['preservedUnrelatedPublicOverlayCount']==49
# Rebuild the high-resolution raised alpha directly from the 120 emitted forest chunks.
manifest=json.loads(safe_under(OUT,'public/act1-hifi/manifest.json','generated manifest').read_text())
chunks=manifest['chunks']; cw=max(c['x']+c['width'] for c in chunks)*2; ch=max(c['y']+c['height'] for c in chunks)*2
assembled=np.zeros((ch,cw),dtype=np.uint8)
for c in chunks:
    alpha=np.asarray(Image.open(safe_under(OUT/'public/act1-hifi',c['forest'],'forest chunk')).convert('RGBA').getchannel('A'))
    x,y=c['x']*2,c['y']*2
    assembled[y:y+alpha.shape[0],x:x+alpha.shape[1]]=alpha
alpha_path=safe_under(OUT,receipts['portable']['sourceAlpha']['path'],'visible raised alpha')
raw_alpha=np.asarray(Image.open(alpha_path).convert('L'))
assert assembled.shape==(ch,cw) and np.array_equal(assembled[:raw_alpha.shape[0],:raw_alpha.shape[1]],raw_alpha)
assert not np.any(assembled[:,raw_alpha.shape[1]:])
assert sha(alpha_path)==receipts['portable']['sourceAlpha']['sha256']
assert set(np.unique(raw_alpha)).issubset({0,255})
# Decode exact production QOKF8COL layout (header 64, dimensions 4736x5824, LSB0).
collision=safe_under(OUT,'public/act1-hifi/forest-collision.bin','collision pack').read_bytes()
magic=collision[:8].decode('ascii'); version, header, width, height, ppc=struct.unpack_from('<HHIII',collision,8)
source_hash=collision[24:56].hex(); bits=np.unpackbits(np.frombuffer(collision[64:],dtype=np.uint8),bitorder='little')[:width*height].reshape((height,width)).astype(np.uint8)*255
assert (magic,version,header,width,height,ppc)==('QOKF8COL',1,64,4736,5824,32)
assert source_hash==sha(alpha_path) and np.array_equal(bits,raw_alpha)
# Check underpaint as a distinct, validated source layer and bind its placement to
# the active runtime override. The low-resolution substrate remains below base and
# the separate forest-underpaint stencil; this is source/static evidence, not a
# claim that a packaged runtime has loaded it successfully.
under=manifest.get('underpaint'); forest_under=manifest.get('forestUnderpaint')
assert isinstance(under,dict) and isinstance(forest_under,dict)
under_path=safe_under(OUT/'public/act1-hifi',under.get('src'),'base underpaint')
forest_under_path=safe_under(OUT/'public/act1-hifi',forest_under.get('src'),'forest underpaint')
assert (under.get('pixelWidth'),under.get('pixelHeight'),under.get('pixelsPerCell'))==(888,1092,6)
assert (forest_under.get('width'),forest_under.get('height'),forest_under.get('pixelsPerCell'))==(888,1092,6)
assert under.get('sha256')==sha(under_path) and forest_under_path.is_file()
under_im=Image.open(under_path).convert('RGB'); forest_under_im=Image.open(forest_under_path).convert('RGBA')
assert under_im.size==(888,1092) and forest_under_im.size==(888,1092)
dq_path=C/'public/dq-tiles.js'; dq_sha=sha(dq_path); dq_source=dq_path.read_text()
assert dq_sha=='c18ce18e2f25ef6779165389d86163cea64136711f8999c4fd843154e6799c7a'
assert 'function owmBakeParse(ab)' in dq_source and 'if(h.getUint32(0,true)!==0x574F3141)' in dq_source
assert "setDepth(0.7).setScale(scale)" in dq_source and "['base',1.1,baseScaleX,baseScaleY,1]" in dq_source
assert "['forest',A1A_CANOPY_DEPTH,forestScaleX,forestScaleY,1]" in dq_source and 'var A1A_CANOPY_DEPTH=9.5' in dq_source
assert manifest.get('underpaint',{}).get('pixelsPerCell')==6 and manifest.get('forestMode')=='whole-object-v8'
semantic_bounds=manifest.get('semanticBounds')
assert semantic_bounds==[16,218,163,399]
assert forest_under.get('bounds')==semantic_bounds
# Recompute phase at every emitted chunk edge in runtime display space. Underpaint
# pixels scale by OW_TILE/6; 32ppc chunk pixels scale by OW_TILE/32. Both must land
# on the same world-cell boundaries for each chunk origin and extent.
phase_rows=[]; phase_coverage=np.zeros((semantic_bounds[3]-semantic_bounds[1]+1,semantic_bounds[2]-semantic_bounds[0]+1),dtype=np.uint8)
for c in chunks:
    assert all(c[k]%16==0 for k in ('x','y','width','height'))
    cell_x0=c['x']//16; cell_y0=c['y']//16
    cell_x1=(c['x']+c['width'])//16; cell_y1=(c['y']+c['height'])//16
    region_w=semantic_bounds[2]-semantic_bounds[0]+1; region_h=semantic_bounds[3]-semantic_bounds[1]+1
    ix0=max(cell_x0,0); iy0=max(cell_y0,0)
    ix1=min(cell_x1,region_w); iy1=min(cell_y1,region_h)
    if ix0>=ix1 or iy0>=iy1: continue
    under_x0=ix0*6; under_y0=iy0*6
    under_x1=ix1*6; under_y1=iy1*6
    base_x0=(ix0-cell_x0)*32
    base_y0=(iy0-cell_y0)*32
    base_x1=(ix1-cell_x0)*32
    base_y1=(iy1-cell_y0)*32
    assert (under_x0*32,under_y0*32,under_x1*32,under_y1*32)==(
        (c['x']*2+base_x0)*6,(c['y']*2+base_y0)*6,
        (c['x']*2+base_x1)*6,(c['y']*2+base_y1)*6)
    assert 0<=under_x0<under_x1<=888 and 0<=under_y0<under_y1<=1092
    phase_coverage[iy0:iy1,ix0:ix1]+=1
    phase_rows.append(c['id'])
assert len(phase_rows)==120 and np.all(phase_coverage==1)
# Decode A1OW-v2, recompute semantics/support, and prove its payload is the frozen v1 body.
live_manifest=json.loads(safe_under(C/'design/terrain-current-profile-20261007/current','act1-hifi-manifest.json','current runtime manifest').read_text())
assert sha(C/'design/terrain-current-profile-20261007/current/act1-hifi-manifest.json')=='c6d69d659ea4e82b09feabae624c2cbd4406627405bb389a36547bd44cc4183f'
a1ow_path=safe_under(C/'public','act1-overworld-walk.bin','A1OW runtime input')
a1ow_bytes=a1ow_path.read_bytes(); a1ow_sha=sha(a1ow_path)
assert len(a1ow_bytes)>=96 and a1ow_bytes[:4]==b'A1OW'
av,appc,amw,amh,afar,aheader=struct.unpack_from('<HHHHHH',a1ow_bytes,4)
ablocks,asupport_fnv=struct.unpack_from('<II',a1ow_bytes,16)
areserved=struct.unpack_from('<II',a1ow_bytes,24)
asemantics,asupport=a1ow_bytes[32:64].hex(),a1ow_bytes[64:96].hex()
apayload_sha=hashlib.sha256(a1ow_bytes[96:]).hexdigest()
assert (av,appc,amw,amh,afar,aheader,ablocks,areserved)==(2,48,320,400,255,96,4094,(0,0))
assert len(a1ow_bytes)==96+amw*amh*2+ablocks*48*48
assert a1ow_sha=='00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6'
assert apayload_sha=='05be9638d04a692668c3a1c8b4bd3d809216bcede2e090a74a0712cb5467498c'
assert asemantics=='a6e6e7f228d040381539618d99f03e774a16dd7cadbaf8cc76a115934d324f67'
assert asupport=='eeaf65c08cda239ea8755a3af0026ed0ca61e19a2683cafc10610b5c4027914a' and asupport_fnv==4271507709
assert apayload_sha=='05be9638d04a692668c3a1c8b4bd3d809216bcede2e090a74a0712cb5467498c'
functions=['_h','vnoise','et','fieldAt','waterField','mountainField','buildMutedWater','owmSupportBounds','owmSupportEt','owmSupportInputBytes']
semantic_source='\n'.join(slice_function(dq_source,name) for name in functions).encode('utf-8')
semantic_contract={'schema':'a1ow-field-semantics-v2','profileId':'act1-forward-20261007-v1',
 'sourceSha256':hashlib.sha256(semantic_source).hexdigest(),'functions':functions,'map':[320,400],
 'tile':48,'far':255,'act1Bounds':[16,218,163,399],'platePad':40,'guard':4,
 'mutedWater':{'connectivity':4,'threshold':12},
 'fields':{'water':{'want':2,'bridge':5,'wiggle':0.26,'scale':20,'seed':33},'mountain':{'want':4,'amplitude':0.20,'scale':18,'seed':91}},
 'packedDistances':'two-pass-chamfer-3-4-clamped-far','version':2}
computed_semantics=hashlib.sha256(json.dumps(semantic_contract,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert computed_semantics==asemantics
map_proof=json.loads(args.a1ow_map_proof.read_text())
assert (map_proof['width'],map_proof['height'])==(320,400)
map_rows=map_proof['rows']; assert len(map_rows)==400 and all(len(row)==320 for row in map_rows)
flat_map=bytes(value for row in map_rows for value in row)
assert hashlib.sha256(flat_map).hexdigest()==map_proof['platedSha256']
seen=bytearray(320*400); muted=set()
for my in range(400):
    for mx in range(320):
        idx=my*320+mx
        if map_rows[my][mx]!=2 or seen[idx]: continue
        stack=[(mx,my)]; component=[]; seen[idx]=1
        while stack:
            cx,cy=stack.pop(); component.append((cx,cy))
            for nx,ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                if 0<=nx<320 and 0<=ny<400 and map_rows[ny][nx]==2:
                    ni=ny*320+nx
                    if not seen[ni]: seen[ni]=1; stack.append((nx,ny))
        if len(component)<=12: muted.update(cy*320+cx for cx,cy in component)
support_bounds={'x0':0,'y0':173,'x1':208,'y1':399}; classes=bytearray()
for my in range(173,400):
    for mx in range(209):
        value=map_rows[my][mx]
        if value==2 and my*320+mx in muted: value=0
        classes.append(1 if value==2 else 2 if value==5 else 3 if value==4 else 0)
support_domain={'schema':'a1ow-effective-support-v1','profileId':'act1-forward-20261007-v1',
 'bounds':support_bounds,'dimensions':[320,400],'tile':48,'far':255,'platePad':40,'guard':4,
 'mutedWaterThreshold':12,'waterWiggle':0.26,'semanticsSha256':computed_semantics}
support_bytes=json.dumps(support_domain,separators=(',',':'),ensure_ascii=False).encode()+b'\0'+classes
computed_support=hashlib.sha256(support_bytes).hexdigest(); computed_fnv=fnv1a32(support_bytes)
assert computed_support==asupport and computed_fnv==asupport_fnv
assert manifest['source']['act1TerrainUnionA1OWSha256']==a1ow_sha
assert manifest['source']['act1TerrainUnionA1OWVersion']==av
assert manifest['source']['act1TerrainUnionA1OWSupportSha256']==asupport
assert manifest['source']['act1TerrainUnionA1OWSemanticsSha256']==asemantics
assert manifest['source']['act1TerrainUnionA1OWPayloadSha256']==apayload_sha
assert live_manifest['source']['act1TerrainUnionA1OWScope']=='water only inside semantic bounds [16,218,163,399]; mountain remains analytic outside and in the 40-cell bake padding'
assert "function mountainField(map,wx,wy)" in dq_source and 'var OWM_FIELD_OWNED={2:1,4:1,5:1}' in dq_source
assert sha(C/'public/act1-world-map.js')=='fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f'
assert sha(C/'dist/assets/index-BhoGQRaA.js')=='ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456'
# Recompute every manifest safe-cell center against QOK using all selectable
# frames from both current hero sheets at the exact overworld-to-collision scale.
safe_cells=manifest.get('safeCells')
assert isinstance(safe_cells,list) and len(safe_cells)==149
safe_collision_checks={}
for hero_name,hero_rel in [('g3','assets/hero/hero-g3-walk.png'),('male','assets/hero/hero-male-walk.png')]:
    hero_path=safe_under(C/'public',hero_rel,f'{hero_name} hero sheet')
    hero=np.asarray(Image.open(hero_path).convert('RGBA'))
    assert hero.shape==(64,768,4),f'unexpected {hero_name} hero sheet shape'
    offsets=set()
    for frame in range(12):
        frame_alpha=hero[:,frame*64:(frame+1)*64,3]
        yy,xx=np.nonzero(frame_alpha>8)
        for px,py in zip(xx.tolist(),yy.tolist()):
            offsets.add((math.floor(((px+0.5)-32.0)*1.0125/0.7*32/48+0.5),
                         math.floor(((py+0.5)-32.0)*1.0125/0.7*32/48+0.5)))
    offsets=np.asarray(sorted(offsets),dtype=np.int16)
    hits=[]
    for cell in safe_cells:
        assert isinstance(cell,dict) and type(cell.get('x')) is int and type(cell.get('y')) is int
        actor_x=cell['x']*48+24; actor_y=cell['y']*48+24
        center_x=math.floor((actor_x-16*48)*32/48+0.5)
        center_y=math.floor((actor_y-218*48)*32/48+0.5)
        for dx,dy in ((0,0),(-1,0),(1,0),(0,-1),(0,1)):
            qx=center_x+offsets[:,0]+dx; qy=center_y+offsets[:,1]+dy
            inside=(qx>=0)&(qy>=0)&(qx<width)&(qy<height)
            bad=np.flatnonzero(inside & (bits[np.clip(qy,0,height-1),np.clip(qx,0,width-1)]!=0))
            if len(bad): hits.append({'cell':[cell['x'],cell['y']],'offset':[int(offsets[bad[0],0]),int(offsets[bad[0],1])],'substepPadding':[dx,dy]})
    assert not hits,f'{hero_name} full selectable-frame stencil collides with QOK at {len(hits)} safe cells'
    safe_collision_checks[hero_name]={'sourceSha256':sha(hero_path),'unionStencilPoints':int(len(offsets)),
        'safeCellCentersChecked':len(safe_cells),'substepSamplesPerCell':5,'qokHits':0}
# Match retained base geometry/current water+canopy hashes, A1OW source pin, and layer layout.
source_manifest=json.loads((BUNDLE/'current/act1-hifi-manifest.json').read_text())
assert len(chunks)==len(source_manifest['chunks'])==120
locked_r26_fields=('designLocks','semanticBounds','semanticRows','chunkSize','streaming','detailRegions','pathConstraints')
r26_bundle=json.loads((PROFILE/'r4-source/runtime/manifest.json').read_text())
r26_candidate_path=C/'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/runtime/manifest.json'
r26_candidate=json.loads(r26_candidate_path.read_text())
assert r26_bundle['revision']==r26_candidate['revision']==manifest['revision']==12
assert len(r26_bundle['chunks'])==len(r26_candidate['chunks'])==len(chunks)==120
for field in locked_r26_fields:
    assert r26_bundle.get(field)==r26_candidate.get(field)==manifest.get(field),f'R26 locked field changed: {field}'
assert [(x['id'],x['x'],x['y'],x['width'],x['height']) for x in chunks]==[(x['id'],x['x'],x['y'],x['width'],x['height']) for x in source_manifest['chunks']]
for c in chunks:
    assert c['basePixelsPerCell']==32
    for layer in ('water','canopy'):
        assert c[layer+'Sha256']==next(x[layer+'Sha256'] for x in source_manifest['chunks'] if x['id']==c['id'])
        assert sha(safe_under(OUT/'public/act1-hifi',c[layer],f'{layer} chunk'))==c[layer+'Sha256']
for key,value in source_manifest['source'].items():
    if key.startswith('act1TerrainUnionA1OW'): continue
    assert manifest['source'].get(key)==value,f'non-A1OW source provenance changed: {key}'
# Independently rasterize the exact nine owner-approved north transforms and contact row.
north=json.loads((PROFILE/'north-contact-y-20261007-recipe-v1.json').read_text())
atlases={'main':BUNDLE/'atlases/act1-cliff-kit-imagegen-v1.png','companion':BUNDLE/'atlases/companion-cliff-kit-imagegen-v2.png'}
assert north['northWindow']['replacementRectLocalXYWH']==[40,0,890,400]
assert north['northWindow']['northRasterOrigin']==[2304,0]
assert north['northWindow']['replacementRectGlobalXYXY']==[2344,0,3234,400]
union=Image.new('L',(1152,768),0);contacts=[]
for spec in north['objects']:
    group=spec['atlasGroup']; assert group in atlases
    assert sha(atlases[group])==spec['atlasSha256'],f"atlas source pin mismatch: {spec['id']}"
    assert group==('main' if spec['name'].endswith('-A') else 'companion'),f"atlas group/name mismatch: {spec['id']}"
    atlas=Image.open(atlases[group]).convert('RGBA')
    x0,y0,x1,y1=map(int,spec['atlasCrop']); src=atlas.crop((x0,y0,x1,y1))
    im=src.resize((round(src.width*float(spec['scale'])),round(src.height*float(spec['scale'])),),Image.Resampling.NEAREST)
    rgba=np.asarray(im).copy(); aa=rgba[...,3].copy()
    rgba[...,3]=np.where(aa>=128,255,0).astype(np.uint8)
    assert hashlib.sha256(rgba.tobytes()).hexdigest()==spec['processedRgbaSha256'],f"processed RGBA mismatch: {spec['id']}"
    cut=np.where(aa>=128,255,0).astype(np.uint8)
    assert hashlib.sha256(cut.tobytes()).hexdigest()==spec['processedAlphaSha256'],f"processed alpha mismatch: {spec['id']}"
    mask=Image.fromarray(cut); ox,oy=map(int,spec['originWorldCell']); lx=(ox-88)*32; ly=(oy-218)*32
    union.paste(Image.fromarray(np.maximum(np.asarray(union.crop((lx,ly,lx+mask.width,ly+mask.height))),cut)),(lx,ly))
    yy,xx=np.nonzero(cut); bottom=int(yy.max()); row=np.flatnonzero(cut[bottom]>0)
    contacts.append({'id':spec['id'],'contactXLocalPx':lx+int(np.median(row)),'contactYLocalPx':ly+bottom,
                     'originX':int(ox),'originY':int(oy),'name':spec['name']})
contacts.sort(key=lambda c:(c['contactYLocalPx'],c['originX'],c['originY'],c['name'],c['id']))
contacts=[{k:c[k] for k in ('id','contactXLocalPx','contactYLocalPx')} for c in contacts]
expected=north['expectedPreviewInvariant']['contactYDrawOrder']
assert len(north['objects'])==9 and int(np.count_nonzero(np.asarray(union)))==north['expectedPreviewInvariant']['alphaUnionPixels']
assert contacts==expected
# Recipes: exact 40 IDs, immutable 11 seeds included, approved flank replacements present.
layout=json.loads((PROFILE/'accepted-whole-layout-v2.json').read_text())
rows=layout['boundaryPlacementRecords']; ids={r['id'] for r in rows}
pilot=set(layout['approvedPilotSeedIds'])
assert len(rows)==40 and len(ids)==40 and len(pilot)==11 and pilot<=ids
assert 'forest-edge-r14-118.925' in ids and 'forest-edge-r16-135.625' in ids
assert not any('136.050' in i for i in ids)
rep=receipts['portable']; br=rep['boundaryRule']
assert br['FMBoundaryCount']==78 and br['selectedBoundaryObjects']==40 and br['targetGapPixelsBefore']==36421 and br['targetGapPixelsAfter']==6
assert br['finalRouteGuardHits']==0 and br['newOwnerPPixels']==0
assert br['acceptedNaturalResidual']['components']==[
 {'pixels':2,'bounds':[4016,1809,4018,1810]}, {'pixels':1,'bounds':[4049,1809,4050,1810]}, {'pixels':3,'bounds':[4060,1809,4063,1810]}]
whole=br['northRecipe']['wholeObjectPolicy']; whole_recipe=north['wholeObjectPolicy']
placement_path=safe_under(BUNDLE,'placements/cliff-selected-layout-whole-act1.json','source cliff placements')
placements=json.loads(placement_path.read_text())['placements']
components_doc=json.loads(safe_under(BUNDLE,'placements/cliff-composition-report.json','cliff composition').read_text())
components={c['name']:c for c in components_doc['coordinateContract']['assetComponents']}
assert len(placements)==194 and sha(placement_path)==whole_recipe['sourcePlacementSha256']
cliff_ids=[]; cliff_classes={'contained':[],'crossing':[],'disjoint':[]}
for rec in placements:
    group,asset=rec['group'],rec['asset']; origin=rec['originWorldCell']
    stable=f"{group}|{asset}|{int(origin[0])},{int(origin[1])}"
    cliff_ids.append(stable)
    atlas=Image.open(atlases[group]).convert('RGBA')
    src=atlas.crop(tuple(components[asset]['sourceCrop']))
    scale=.5 if group=='main' else .125
    im=src.resize((round(src.width*scale),round(src.height*scale)),Image.Resampling.NEAREST)
    yy,xx=np.nonzero(np.asarray(im.getchannel('A'))>=128)
    assert len(xx)>0,f'empty source cliff sprite {stable}'
    gx=xx+(int(origin[0])-16)*32; gy=yy+(int(origin[1])-218)*32
    inside=(gx>=2344)&(gx<3234)&(gy>=0)&(gy<400)
    category='contained' if int(inside.sum())==len(xx) else ('crossing' if np.any(inside) else 'disjoint')
    cliff_classes[category].append(stable)
assert len(cliff_ids)==len(set(cliff_ids))==194
assert {k:len(v) for k,v in cliff_classes.items()}=={'contained':25,'crossing':6,'disjoint':163}
expected=whole_recipe['expectedStableIdentities']
assert sorted(cliff_classes['contained'])==sorted(expected['contained'])
assert sorted(cliff_classes['crossing'])==sorted(expected['crossing'])
assert sorted(cliff_classes['disjoint'])==sorted(set(cliff_ids)-set(cliff_classes['contained'])-set(cliff_classes['crossing']))
assert whole['sourcePlacementSha256']==whole_recipe['sourcePlacementSha256']
assert whole['sourceObjectCount']==194 and whole['classificationCounts']=={'contained':25,'crossing':6,'disjoint':163}
assert whole['retainedObjectCount']==169 and whole['retainedDisjointCount']==163
assert sorted(whole['omittedContainedStableIdentities'])==sorted(cliff_classes['contained'])
assert sorted(whole['retainedCrossingStableIdentities'])==sorted(cliff_classes['crossing'])
assert whole['perPixelRectangleClippingApplied'] is False
assert br['northRecipe']['objectCount']==9 and br['northRecipe']['sourceCliffRecords']==194
assert br['northRecipe']['retainedCliffRecords']==169 and br['northRecipe']['cliffAnchorCountPreserved']==169
assert br['northRecipe']['cliffAlphaPixelsRemovedInsideReplacement']==0
assert br['pilotSeed']['selectedCrowns']==11 and br['pilotSeed']['originalMeasuredTargetAlphaXorPixels']==0
assert rep['routeSource']['exitCount']==8 and rep['routeSource']['approachCount']==11 and rep['routeSource']['mapRevision']==7
assert rep['fullWorldComplete'] is True and rep['gateReady'] is False and rep['nativeVerified'] is False
# Bind the frozen current-profile route audit and direct-contact samples without
# upgrading their inconclusive/static-only result to gameplay acceptance.
whole_evidence=PROFILE/'evidence/whole-rock-integration-20261008'
route_dir=whole_evidence/'route-audit'
route_runner=PROFILE/'review-tools/audit_forward_profile_routes_v2.py'
route_report_path=route_dir/'ROUTE-AUDIT.json'; route_paths_path=route_dir/'route-paths.json'
route_closure_path=route_dir/'route-audit-v2-binding-closure.json'
route=json.loads(route_report_path.read_text()); route_paths=json.loads(route_paths_path.read_text())
route_closure=json.loads(route_closure_path.read_text())
assert sha(route_runner)=='9b22791aaa5c72802760a4905ce6e94bce2bb55fe7888a075d2fe86c802764ef'
assert route_closure['status']=='PASS_POST_RUN_V2_BINDING'
assert route_closure['finalReviewedRunnerSha256']==sha(route_runner)
assert route_closure['routeReportSha256']==sha(route_report_path)
assert route_closure['routePathDataSha256']==sha(route_paths_path)
assert route_closure['targetResultRecordsExactlyEqualToPriorQokAudit'] is True
assert route_closure['completeWaypointsExactlyEqualToPriorQokAudit'] is True
assert route['status']=='inconclusive' and route_paths['status']=='inconclusive'
assert route['targetCount']==20 and route['authority']['routeGraphStepCanonicalPx']==6
assert route['authority']['edgeSamplesMaxGapCanonicalPx']<=1.2
route_counts={hero:{status:sum(v['status']==status for v in group.values())
                    for status in ('pass','blocked-at-target','expansion-cap')}
              for hero,group in route['heroResults'].items()}
assert route_counts=={'g3':{'pass':11,'blocked-at-target':5,'expansion-cap':4},
                      'male':{'pass':11,'blocked-at-target':5,'expansion-cap':4}}
assert route['sourceInputs']['a1ow']['sha256']==a1ow_sha
assert route['sourceInputs']['qok']['sha256']==sha(OUT/'public/act1-hifi/forest-collision.bin')
assert route['sourceInputs']['finalAlpha']['sha256']==sha(alpha_path)
assert route['sourceInputs']['activeOutputManifest']['sha256']==sha(OUT/'public/act1-hifi/manifest.json')
direct_path=whole_evidence/'direct-contact-static-review.json'; direct=json.loads(direct_path.read_text())
assert direct['status']=='PASS_BOUNDED_STATIC_CONTACTS'
assert direct['routeAuditorSha256']==sha(route_runner)
assert direct['sourceInputs']['qokSha256']==sha(OUT/'public/act1-hifi/forest-collision.bin')
assert direct['sourceInputs']['finalAlphaSha256']==sha(alpha_path)
assert direct['sourceInputs']['a1owV2Sha256']==a1ow_sha
for hero in ('g3','male'):
    nr=direct['results'][hero]['north106230']; fr=direct['results'][hero]['flank117234']
    assert all(v['free'] for v in nr['positions']) and all(v['free'] for v in nr['edges'])
    assert [v['free'] for v in fr['positions']]==[True,True,False]
    assert [v['free'] for v in fr['edges']]==[True,True,False,False]
assert not route.get('nativeVerified',False) and not route.get('collisionAwareAllRoutesProven',False)
descriptor_path=PROFILE/'forward-profile-descriptor.json'
descriptor=json.loads(descriptor_path.read_text())
assert descriptor['releaseEligible'] is False
assert len(descriptor['pendingDynamicChecks'])==6 and len(descriptor['pendingProofAssertions'])==11
# Exact source pins.
source=PROFILE/'generate_forward_profile.py'
assert sha(source)=='571f8f1a8bb803aea8dd2d5ab1ef34c3bfde2162c6a42b9d86f8ed3d69e383d4'
assert rep['generatorSha256']==sha(source)
result={
 'status':'PASS_BOUNDED_STATIC_OUTPUT_RECOMPUTATION',
 'source':{'path':str(source),'sha256':sha(source)},
 'portableReceiptSha256':sha(OUT/'output-receipt.json'),
 'outputInventory':{'fileCount':488,'AInventoryErrors':0,'BInventoryErrors':0,'portableInventoryErrors':0,'AandBIdentical':True,'frozenOutputRootsIdentical':True,'installedCandidateReceiptSha256':sha(installed_receipt_path),'installedGeneratedAndPublicCopiesMatchAllRows':True,'installedInventoryErrors':len(installed_errors),'installReceiptSha256':sha(install_receipt_path),'preservedUnrelatedPublicOverlays':install_receipt['preservedUnrelatedPublicOverlayCount'],'portableVsAOnlyExpectedDifferences':diffs},
 'outputAlpha':{'sha256':sha(OUT/receipts['portable']['sourceAlpha']['path']),'pixels':int(np.count_nonzero(raw_alpha)),'shape':[raw_alpha.shape[1],raw_alpha.shape[0]],'chunkReconstructionXorPixels':0,'thresholdValues':sorted(int(x) for x in np.unique(raw_alpha))},
 'qok':{'magic':magic,'version':version,'headerBytes':header,'width':width,'height':height,'pixelsPerCell':ppc,'sourceSha256Matches':True,'xorPixels':0},
 'underpaintPhase':{'manifestSha256':sha(OUT/'public/act1-hifi/manifest.json'),'baseUnderpaintSha256':sha(under_path),'forestUnderpaintSha256':sha(forest_under_path),'dimensionsPx6':[888,1092],'pixelsPerCell':6,'semanticBounds':semantic_bounds,'activeDqTilesSha256':dq_sha,'runtimeDepths':{'substrate':0.7,'base':1.1,'forestStencil':9.5},'recomputedChunkOriginAndEdgeAlignment':{'chunksIntersectingSemanticBounds':len(phase_rows),'mismatches':0,'semanticCellsCoveredExactlyOnce':True,'sameOwTileWorldGrid':True},'staticSourceAndVisualEvidenceOnly':True},
 'a1owDecode':{'sha256':a1ow_sha,'bytes':len(a1ow_bytes),'format':'A1OW-v2','version':av,'headerBytes':aheader,'pixelsPerCell':appc,'mapCells':[amw,amh],'far':afar,'reservedBytesZero':True,'blocks':ablocks,'supportFNV32':computed_fnv,'supportSha256':computed_support,'semanticsSha256':computed_semantics,'payloadSha256':apayload_sha,'payloadMatchesFrozenV1BodySha256':True,'supportBounds':support_bounds,'supportClassBytes':len(classes),'supportEffectiveClassBytesSha256':hashlib.sha256(bytes(classes)).hexdigest(),'supportMapProofSha256':sha(args.a1ow_map_proof),'productionParserSourceSha256':dq_sha,'scope':live_manifest['source']['act1TerrainUnionA1OWScope'],'mountainsRemainAnalytic':True,'fullRuntimeMovementUnproven':True},
 'safeCellsQok':{'count':len(safe_cells),'collisionSha256':sha(OUT/'public/act1-hifi/forest-collision.bin'),'heroChecks':safe_collision_checks},
 'geometryAndCopies':{'chunkCount':len(chunks),'sourceGeometryExact':True,'allWaterAndCanopyHashesMatchFrozenCurrentManifest':True,'A1OWSourcePinPreserved':True,'r26LockedFieldsExact':list(locked_r26_fields),'r26AuthoritySha256':sha(r26_candidate_path),'pathConstraintsSha256':hashlib.sha256(json.dumps(manifest['pathConstraints'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'designLocksSha256':hashlib.sha256(json.dumps(manifest['designLocks'],sort_keys=True,separators=(',',':')).encode()).hexdigest()},
 'northRecipe':{'objects':9,'recomputedAlphaUnionPixels':int(np.count_nonzero(np.asarray(union))),'expectedAlphaUnionPixels':north['expectedPreviewInvariant']['alphaUnionPixels'],'contactRowsMatchApprovedRecipe':True,'atlasGroups':{g:sum(o['atlasGroup']==g for o in north['objects']) for g in atlases},'perPieceSourceAndProcessedHashesVerified':True,'ownerApprovedNorthPlainPixels':br['northRecipe']['northOwnerPPixelsByRole']},
 'wholeObjectPolicy':{'sourcePlacementSha256':sha(placement_path),'sourceObjects':len(cliff_ids),'stableIdentityCount':len(set(cliff_ids)),'rectangleGlobalXYXY':[2344,0,3234,400],'classificationCounts':{k:len(v) for k,v in cliff_classes.items()},'omittedContainedStableIdentityCount':len(cliff_classes['contained']),'retainedCrossingStableIdentityCount':len(cliff_classes['crossing']),'retainedDisjointStableIdentityCount':len(cliff_classes['disjoint']),'retainedTotal':len(cliff_classes['crossing'])+len(cliff_classes['disjoint']),'perPixelClipping':False,'receiptMatchesIndependentClassification':True},
 'boundary':{'FMEdges':br['FMBoundaryCount'],'placements':len(rows),'immutablePilotSeeds':len(pilot),'flank118925':True,'flank135625':True,'rejected136050Absent':True,'targetBefore':br['targetGapPixelsBefore'],'targetAfter':br['targetGapPixelsAfter'],'newPPixelsBoundaryOnly':br['newOwnerPPixels'],'currentGuardHits':br['finalRouteGuardHits'],'retainedResidual':br['acceptedNaturalResidual']},
 'routeEvidence':{'runnerSha256':sha(route_runner),'reportSha256':sha(route_report_path),'pathDataSha256':sha(route_paths_path),'bindingClosureSha256':sha(route_closure_path),'status':route['status'],'targetsPerHero':route['targetCount'],'perHeroCounts':route_counts,'targetResultsAndWaypointsMatchPriorAudit':True,'collisionAwareAllRoutesProven':False,'nativeMovementProven':False,'caveProgressionProven':False,'portSapphireAnchorProven':False,'reason':'The static collision-aware audit remains inconclusive: it has blocked tile-center anchors and expansion-capped searches. Exact parity with the prior audit proves no named-route regression, not all-route connectivity.'},
 'directContactSamples':{'reportSha256':sha(direct_path),'status':direct['status'],'northBothDirectionsPassForBothHeroes':True,'flankOpenApproachContactPassForBothHeroes':True,'flankRockSideBlockedForBothHeroes':True,'nativeMovementProven':False},
 'deliveryState':{'fullWorldComplete':True,'gateReady':False,'nativeVerified':False,'releaseEligible':descriptor['releaseEligible'],'nativeGroupsPending':len(descriptor['pendingDynamicChecks']),'pendingDynamicChecks':descriptor['pendingDynamicChecks'],'nativeAssertionsPending':len(descriptor['pendingProofAssertions']),'pendingProofAssertions':descriptor['pendingProofAssertions']},
 'limitations':['The collision-aware audit remains inconclusive (11 pass, 5 blocked-at-target, 4 capped per hero); equal prior waypoint paths do not establish all-route connectivity.','Port Sapphire stand and Crystal Cave entry/round-trip remain unresolved; Coastal Reef has an item-dependent Flame Cloak exception.','Static output only; native runtime streaming, lowres fallback parity, device behavior, movement, transitions, cave/Port acceptance remain unverified.']
}
REPORT.parent.mkdir(parents=True,exist_ok=True)
REPORT.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','outputInventory','qok','underpaintPhase','a1owDecode','safeCellsQok','geometryAndCopies','northRecipe','boundary','routeEvidence']},indent=2))
