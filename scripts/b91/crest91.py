# Build 91: option A "blue glints", 3 frames per chunk at half resolution, RGB PRE-MULTIPLIED by alpha.
# The game uploads chunk layers as straight-alpha ImageBitmaps but Phaser blends premultiplied, so a
# straight-alpha overlay adds its full colour wherever alpha>0 (build 90's white sea). Premultiplied
# pixels draw correctly under that blend.
import numpy as np, os
from PIL import Image
import crest2
M=os.path.dirname(os.path.abspath(__file__)); D=M+'/out91/crest'; os.makedirs(D,exist_ok=True)
n=0
for c in range(10):
  for r in range(12):
    a=np.array(Image.open(f'{M}/out91/water-r2/c{c}-r{r}.png'))[...,3]>=128
    if not a.any(): continue
    for k,f in enumerate(crest2.frames(a,c*512,r*512,'glint')):
        h,w=f.shape[:2]
        x=np.array(Image.fromarray(f).resize((w//2,h//2),Image.BOX)).astype(np.float32)
        x[...,:3]=np.round(x[...,:3]*x[...,3:]/255.0)
        Image.fromarray(x.astype(np.uint8)).save(f'{D}/c{c}-r{r}-{k}.png',optimize=True); n+=1
print(n)
