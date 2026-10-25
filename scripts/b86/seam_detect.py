import sys, numpy as np
from PIL import Image
# Collapse 3x device px to the 1x canvas grid, then flag canvas rows that differ from BOTH
# neighbours across most of the width (a 1-px horizontal line), ignoring UI-covered regions.
def rows(path, x0=0, x1=390, y0=10, y1=780):
    a=np.asarray(Image.open(path).convert('RGB'),dtype=np.float32)[1::3,1::3]  # canvas-px centres
    a=a[:, x0:x1]
    hits=[]
    for y in range(max(1,y0), min(a.shape[0]-1,y1)):
        up=np.abs(a[y]-a[y-1]).sum(1); dn=np.abs(a[y]-a[y+1]).sum(1); ud=np.abs(a[y-1]-a[y+1]).sum(1)
        frac=np.mean((up>40)&(dn>40)&(ud<up*0.5))
        if frac>0.5: hits.append((y,round(float(frac),2)))
    return hits
for p in sys.argv[1:]:
    print(p.split('/')[-1], rows(p))
