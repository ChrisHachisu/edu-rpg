# Build 89: town collision = sprite outline (alpha>=128, closed), gate channel carved; same format as cave-bands.json
import json,hashlib,base64,numpy as np
from PIL import Image
from scipy import ndimage as ndi
R='/home/claude/edu-rpg/public/act1-hifi/landmarks/'
L={l['slug']:l for l in json.load(open(R+'landmarks.json'))['landmarks']}
GATE={'greenhollow':'south','millbrook':'south','port-sapphire':'north'}
out={}
for slug,side in GATE.items():
    l=L[slug]; S=l['size']; ax,ay=l['anchor']; p=R+slug+'.png'
    a=np.array(Image.open(p).convert('RGBA'))[...,3]>=128
    assert a.shape==(S,S)
    m=ndi.binary_closing(np.pad(a,6),iterations=4)[6:-6,6:-6]|a
    if side=='south': m[max(0,ay-12):,ax-15:ax+16]=False
    else: m[:ay+13,ax-15:ax+16]=False
    out[slug]={'cell':l['cell'],'anchor':l['anchor'],'size':S,'gate':side,
      'artSha256':hashlib.sha256(open(p,'rb').read()).hexdigest(),
      'maskB64':base64.b64encode(np.packbits(m.ravel(),bitorder='little').tobytes()).decode(),
      'soleRadiusWorldPx':9}
    Image.fromarray((m*255).astype(np.uint8)).save(f'townmask_{slug}.png'); print(slug,int(m.sum()))
json.dump(out,open('town-masks.json','w'),indent=1)
