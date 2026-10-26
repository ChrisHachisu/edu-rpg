# Moving-water overlay: K phase frames of sparse wave-crest highlights, cross-faded at runtime.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
MAT='/home/claude/edu-rpg/public/act1-hifi/materials/act1-water-r2.png'
K=4
_t=Image.open(MAT).convert('RGB'); _t=_t.resize((_t.width//3,_t.height//3),Image.LANCZOS)
T=np.array(_t).astype(np.float32); TL=T.mean(-1); TH,TW=TL.shape
hl=np.clip((TL-np.percentile(TL,70))/(np.percentile(TL,98)-np.percentile(TL,70)),0,1)
def frames(water, gx0, gy0):
    """water: bool HxW for a region whose top-left is global px (gx0,gy0). Returns K RGBA uint8 arrays."""
    H,W=water.shape
    dw=ndi.distance_transform_edt(water)
    fade=np.clip((dw-2)/5,0,1)
    ys=np.arange(H)+gy0; xs=np.arange(W)+gx0
    out=[]
    for k in range(K):
        ph=2*np.pi*k/K
        # crests drift east ~24 px per cycle and bob with a row-wise sine
        sx=(xs[None,:]+ (40*k/K) + 5*np.sin(ys[:,None]/19.0+ph)).astype(int)%TW
        sy=(ys[:,None]+ (12*k/K) + 0*xs[None,:]).astype(int)%TH
        a=hl[sy,sx]
        # second, slower layer going the other way, so crests form and break rather than just slide
        sx2=(xs[None,:]*1 - (20*k/K) + 4*np.sin(ys[:,None]/31.0-ph)+TW//2).astype(int)%TW
        sy2=(ys[:,None]+TH//3).astype(int)%TH
        a=np.maximum(a, hl[sy2,sx2]*0.8)*(0.6+0.4*np.sin(ph+xs[None,:]/57.0+ys[:,None]/41.0))
        a=np.clip(a,0,1)*fade*water
        f=np.zeros((H,W,4),np.uint8); f[...,0]=225; f[...,1]=242; f[...,2]=255; f[...,3]=(np.clip(a*1.15,0,1)*235).astype(np.uint8)
        out.append(f)
    return out
