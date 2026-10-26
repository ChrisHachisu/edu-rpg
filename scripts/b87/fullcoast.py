import numpy as np, time
from PIL import Image
import coast
from scipy import ndimage as ndi
M='/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock'
t=time.time()
H0,W0=192*32,160*32
keep=np.zeros((H0,W0),bool); keep[:,4736-64:]=True; keep[5824-64:,:]=True
coast.PLATE=(4736,5824)
cur,pro,water=coast.build(16,218,16+160,218+192)
E=coast.EXTRA; print('built',time.time()-t)
sand=E['sandimg']  # float HxWx3: land w/ sand, water textured
H,W=water.shape
wrgb=sand.copy(); wrgb[E['rs']]*=0.62
# 1px antialiased water edge
wa=ndi.gaussian_filter(water.astype(np.float32),0.6); wa[water]=np.maximum(wa[water],0.5); wa=np.clip((wa-0.25)*2,0,1)
wl=np.dstack([np.clip(wrgb,0,255).astype(np.uint8),(wa*255).astype(np.uint8)])
foam=np.zeros((H,W,4),np.uint8)
foam[E['f2']]=[215,238,255,110]; foam[E['rf']]=[225,242,255,140]; foam[E['f1']]=[240,250,255,200]
base=np.clip(sand,0,255).astype(np.uint8)
np.save(M+'/out87/water_mask.npy',np.packbits(water))
for c in range(10):
  for r in range(12):
    w=128 if c==9 else 512; h=192 if r==11 else 512
    sl=(slice(r*512,r*512+h),slice(c*512,c*512+w))
    Image.fromarray(base[sl]).save(f'{M}/out87/base/c{c}-r{r}.webp',quality=92,method=6)
    Image.fromarray(wl[sl]).save(f'{M}/out87/water-r2/c{c}-r{r}.png',optimize=True)
    Image.fromarray(foam[sl]).save(f'{M}/out87/foam/c{c}-r{r}.png',optimize=True)
pro.convert('RGB').resize((W//4,H//4),Image.LANCZOS).save(M+'/out87/preview.png')
print('done',time.time()-t)
