import numpy as np, os
from PIL import Image
from scipy import ndimage as ndi
import os
os.environ.pop('BASE_DIR',None)
import comp
M='/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock'
NC,NR=10,12
W,H=NC*512,NR*512
base=np.zeros((H,W,3),np.uint8); wat=np.zeros((H,W),np.uint8); fo=np.zeros((H,W),np.uint8)
for c in range(NC):
  for r in range(NR):
    for k,arr in (('base',base),('water-r2',wat),('forest',fo)):
      im=comp.layer(k,c,r)
      if im is None: continue
      a=np.array(im); h,w=a.shape[:2]
      if k=='base': arr[r*512:r*512+h,c*512:c*512+w]=a[...,:3]
      else: arr[r*512:r*512+h,c*512:c*512+w]=a[...,3]
b=base.astype(int)
path=(b[...,0]>b[...,1]+4)&(b[...,0]>b[...,2]+40)&(wat<128)
path=ndi.binary_opening(path,iterations=1)
import json
L=json.load(open('/home/claude/edu-rpg/public/act1-hifi/landmarks/landmarks.json'))['landmarks']
yy,xx=np.ogrid[:H,:W]
for l in L:
    cx=(l['cell'][0]-16+0.5)*32; cy=(l['cell'][1]-218+0.5)*32
    path&=((xx-cx)**2+(yy-cy)**2)>(3.2*32)**2
lab,n=ndi.label(path); sz=ndi.sum(np.ones_like(lab),lab,range(1,n+1))
path=np.isin(lab,[i+1 for i,v in enumerate(sz) if v>=60])
mask=ndi.binary_dilation(path,iterations=8)
print('path px',path.sum())
out=base.copy(); todo=mask.copy()
offs=[(0,48),(0,-48),(48,0),(-48,0),(40,40),(-40,40),(40,-40),(-40,-40),(0,96),(0,-96),(96,0),(-96,0),(80,80),(-80,-80),(80,-80),(-80,80),(0,160),(160,0),(0,-160),(-160,0)]
bad=mask|(wat>=40)|(fo>40)
for dy,dx in offs:
    if not todo.any(): break
    src=np.roll(out,(-dy,-dx),(0,1)); sb=np.roll(bad,(-dy,-dx),(0,1))
    ok=todo&~sb
    out[ok]=src[ok]; todo&=~ok
print('left',todo.sum())
bad=mask|(wat>=40)
for dy,dx in offs:
    if not todo.any(): break
    src=np.roll(out,(-dy,-dx),(0,1)); sb=np.roll(bad,(-dy,-dx),(0,1))
    ok=todo&~sb; out[ok]=src[ok]; todo&=~ok
print('left2',todo.sum())
# feather the seam
ring=mask&~ndi.binary_erosion(mask,iterations=2)
blur=ndi.uniform_filter(out.astype(float),size=(3,3,1))
out[ring]=(0.5*out[ring]+0.5*blur[ring]).astype(np.uint8)
np.save(M+'/pathmask.npy',np.packbits(path))
for c in range(NC):
  for r in range(NR):
    im0=comp.layer('base',c,r)
    if im0 is None: continue
    w,h=im0.size
    Image.fromarray(out[r*512:r*512+h,c*512:c*512+w]).save(f'{M}/base_nopath/c{c}-r{r}.png')
