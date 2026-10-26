import numpy as np, os
from PIL import Image
import crest
M=os.path.dirname(os.path.abspath(__file__))
n=0
for c in range(10):
  for r in range(12):
    a=np.array(Image.open(f'{M}/out88/water-r2/c{c}-r{r}.png'))[...,3]>=128
    if not a.any(): continue
    # pad so shore fades see water across chunk edges
    for k,f in enumerate(crest.frames(a,c*512,r*512)):
        Image.fromarray(f).save(f'{M}/out88/crest/c{c}-r{r}-{k}.png',optimize=True); n+=1
print('frames',n)
