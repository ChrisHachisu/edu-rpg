# Build 90 candidate: 3 crest frames per chunk at HALF resolution (drawn 2x) -> ~1/5 of build 89's memory.
import numpy as np, os
from PIL import Image
import crest
crest.K=3
M=os.path.dirname(os.path.abspath(__file__)); D=M+'/out90/crest'; os.makedirs(D,exist_ok=True)
tot=0
for c in range(10):
  for r in range(12):
    a=np.array(Image.open(f'{M}/out88/water-r2/c{c}-r{r}.png'))[...,3]>=128
    if not a.any(): continue
    for k,f in enumerate(crest.frames(a,c*512,r*512)):
        im=Image.fromarray(f); h,w=f.shape[:2]
        im=im.resize((w//2,h//2),Image.BOX); im.save(f'{D}/c{c}-r{r}-{k}.png',optimize=True); tot+=1
print(tot)
