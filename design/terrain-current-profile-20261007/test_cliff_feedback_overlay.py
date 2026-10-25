#!/usr/bin/env python3
"""Fast source-pinned checks for the explicit cliff feedback overlay."""
import json
from pathlib import Path
from types import ModuleType
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
GENERATOR=HERE/'generate_forward_profile.py'
OVERLAY=HERE/'placements/cliff-current-feedback-overlay-v1.json'
LAYOUT=HERE/'placements/cliff-selected-layout-whole-act1.json'
NORTH=HERE/'north-contact-y-20261007-recipe-v1.json'

gen=ModuleType('terrain_forward_generator')
gen.__file__=str(GENERATOR)
exec(compile(GENERATOR.read_text(),str(GENERATOR),'exec'),gen.__dict__)
overlay=json.loads(OVERLAY.read_text())
layout=json.loads(LAYOUT.read_text())
north=json.loads(NORTH.read_text())
source_sha=gen.digest(LAYOUT)
north_sha=gen.digest(NORTH)
source_ids=[gen.cliff_stable_identity(p) for p in layout['placements']]
component_by_id={gen.cliff_stable_identity(p):p for p in layout['placements']}
atlas_paths={
    'main':HERE/'atlases/act1-cliff-kit-imagegen-v1.png',
    'companion':HERE/'atlases/companion-cliff-kit-imagegen-v2.png',
}
atlas_hashes={key:gen.digest(path) for key,path in atlas_paths.items()}
atlases={key:Image.open(path).convert('RGBA') for key,path in atlas_paths.items()}
components={x['name']:x for x in json.loads((HERE/'placements/cliff-composition-report.json').read_text())['coordinateContract']['assetComponents']}
source_events=[]
for record in layout['placements']:
    image=atlases[record['group']].crop(tuple(components[record['asset']]['sourceCrop']))
    scale=.5 if record['group']=='main' else .125
    image=image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.NEAREST)
    rgba=np.asarray(image).copy()
    rgba[...,3]=np.where(rgba[...,3]>=128,255,0).astype(np.uint8)
    origin=record['originWorldCell']
    source_events.append({'record':record,'image':Image.fromarray(rgba),
        'x':(origin[0]-16)*32,'y':(origin[1]-218)*32})

canonical,policy=gen.apply_north_whole_object_policy(
    source_events,north,source_sha,tuple(north['northWindow']['replacementRectGlobalXYXY']))
canonical_ids={gen.cliff_stable_identity(event['record']) for event in canonical}
removed,added=gen.validate_cliff_feedback_overlay(
    overlay,source_sha,north_sha,atlas_hashes,canonical_ids)
assert len(source_ids)==194 and policy['sourceObjectCount']==194
assert policy['retainedObjectCount']==169 and len(canonical_ids)==169
assert len(removed)==18 and removed.issubset(canonical_ids)
assert not (removed & {key for key,value in component_by_id.items() if value['group']=='main'})
assert added=={'group':'main','asset':'broad-joining-mass-A','originWorldCell':[34,242]}

east_tip={
    'companion|companion-low-shoulder|160,218',
    'companion|companion-low-shoulder|160,219',
    'companion|companion-tall-fin|160,218',
}
assert east_tip.issubset(removed)
assert not (removed & {f'companion|{asset}|{x},{y}' for asset,x,y in [
    ('companion-low-shoulder',160,374),('companion-narrow-buttress',162,228),
    ('companion-tall-fin',163,373),('companion-low-shoulder',159,225),
    ('companion-low-shoulder',161,240),('companion-tall-fin',163,260),
    ('companion-narrow-buttress',162,273),
]})

owner=json.loads((HERE/'current/owner-terrain.json').read_text())['acts']['1']
bounds=owner['bounds'];rows=owner['terrainRows']
classes=np.repeat(np.repeat(np.array([[{'F':1,'M':2,'.':3}.get(c,0) for c in row] for row in rows],dtype=np.uint8),32,axis=0),32,axis=1)
manifest=json.loads((gen.RUNTIME/'manifest.json').read_text())
nav=gen.current_navigation(manifest)
offsets,_=gen.build_hero_offsets()
guard=np.zeros(classes.shape,dtype=np.uint8)
guard_cells={(v['exit']['x'],v['exit']['y']) for v in nav['landmarks']}
guard_cells.update((a['x'],a['y']) for v in nav['landmarks'] for a in v['approaches'])
guard_cells.add((nav['startCell']['x'],nav['startCell']['y']))
for cx,cy in guard_cells:
    ax=(cx-bounds[0])*32+16;ay=(cy-bounds[1])*32+16
    for dx,dy in offsets:
        x,y=ax+dx,ay+dy
        if 0<=x<guard.shape[1] and 0<=y<guard.shape[0]:guard[y,x]=1

events_by_id={gen.cliff_stable_identity(e['record']):e for e in canonical}
for stable_id in sorted(removed):
    event=events_by_id[stable_id]
    alpha=np.asarray(event['image'].getchannel('A'))>0
    yy,xx=np.nonzero(alpha);gx=xx+event['x'];gy=yy+event['y']
    assert np.all((gx>=0)&(gx<classes.shape[1])&(gy>=0)&(gy<classes.shape[0]))
    assert np.all(classes[gy,gx]==2),f'{stable_id} leaves owner M'
    assert not np.any(guard[gy,gx]),f'{stable_id} touches current route/hero guard'

component=components[added['asset']]
image=atlases[added['group']].crop(tuple(component['sourceCrop']))
image=image.resize((round(image.width*.5),round(image.height*.5)),Image.Resampling.NEAREST)
alpha=np.asarray(image.getchannel('A'))>=128;yy,xx=np.nonzero(alpha)
gx=xx+(added['originWorldCell'][0]-bounds[0])*32;gy=yy+(added['originWorldCell'][1]-bounds[1])*32
assert np.all((gx>=0)&(gx<classes.shape[1])&(gy>=0)&(gy<classes.shape[0]))
assert np.all(classes[gy,gx]==2) and not np.any(guard[gy,gx])

cache_base=Image.new('RGBA',(4,4),(30,40,50,255));cached_alpha=np.asarray(cache_base.getchannel('A')).copy();cached_alpha[0,0]=0;cached_alpha[1,1]=0;cache_base.putalpha(Image.fromarray(cached_alpha))
pristine=Image.new('RGBA',(4,4),(30,40,50,255));rebuilt=pristine.copy();rebuilt_alpha=np.asarray(rebuilt.getchannel('A')).copy();rebuilt_alpha[1,1]=0;rebuilt_alpha[2,2]=0;rebuilt.putalpha(Image.fromarray(rebuilt_alpha))
expected=np.zeros((4,4),dtype=bool);expected[1,1]=expected[2,2]=True
mask_proof=gen.verify_rebuilt_base_mask(cache_base,pristine,rebuilt,expected,'unit-top-mask')
assert mask_proof['restoredOldCutoutPixels']==1 and mask_proof['newlyMaskedPixels']==1 and mask_proof['oldVsCurrentMaskXorPixels']==2
hidden_rgb=np.asarray(cache_base).copy();hidden_rgb[0,0,:3]=[1,2,3];hidden_rgb[1,1,:3]=[4,5,6]
hidden_cache=Image.fromarray(hidden_rgb,'RGBA')
hidden_proof=gen.verify_rebuilt_base_mask(hidden_cache,pristine,rebuilt,expected,'unit-transparent-cache-rgb')
assert hidden_proof['restoredOldCutoutPixels']==1 and hidden_proof['newlyMaskedPixels']==1
visible_rgb=np.asarray(cache_base).copy();visible_rgb[0,1,0]=31
visible_cache=Image.fromarray(visible_rgb,'RGBA')
try:
    gen.verify_rebuilt_base_mask(visible_cache,pristine,rebuilt,expected,'unit-visible-cache-rgb')
except AssertionError as exc:
    assert 'visible base material RGB differs' in str(exc)
else:
    raise AssertionError('cache-mask rebuild check accepted an opaque cached RGB mismatch')
bad=pristine.copy()
try:
    gen.verify_rebuilt_base_mask(cache_base,pristine,bad,expected,'unit-stale-mask')
except AssertionError:
    pass
else:
    raise AssertionError('cache-mask rebuild check accepted a stale unmasked result')
print('PASS: 169 canonical cliffs; 18 removals and whole-main addition are guarded; old-vs-current cache-mask check handles transparent RGB, rejects visible RGB mismatch, and restores stale/applies current cuts')
