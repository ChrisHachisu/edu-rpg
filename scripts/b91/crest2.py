# Build 91 water candidates (no white). mode 'glint': crests in the water's own highlight blue.
# mode 'surface': the water texture itself drifts (shifted copies of the material, cross-faded).
import numpy as np
from scipy import ndimage as ndi
import crest
T,hl,TH,TW=crest.T,crest.hl,crest.TH,crest.TW
def frames(water,gx0,gy0,mode,K=3):
    H,W=water.shape
    fade=np.clip((ndi.distance_transform_edt(water)-2)/5,0,1)
    ys=np.arange(H)+gy0; xs=np.arange(W)+gx0
    out=[]
    for k in range(K):
        ph=2*np.pi*k/K
        sx=(xs[None,:]+40*k/K+5*np.sin(ys[:,None]/19.0+ph)).astype(int)%TW
        sy=(ys[:,None]+12*k/K+0*xs[None,:]).astype(int)%TH
        f=np.zeros((H,W,4),np.uint8)
        if mode=='glint':
            sx2=(xs[None,:]-20*k/K+4*np.sin(ys[:,None]/31.0-ph)+TW//2).astype(int)%TW
            sy2=(ys[:,None]+TH//3+0*xs[None,:]).astype(int)%TH
            a=np.maximum(hl[sy,sx],hl[sy2,sx2]*0.8)*(0.6+0.4*np.sin(ph+xs[None,:]/57.0+ys[:,None]/41.0))
            f[...,0]=70; f[...,1]=165; f[...,2]=228
            f[...,3]=(np.clip(a*1.2,0,1)*fade*water*175).astype(np.uint8)
        else:
            f[...,:3]=T[sy,sx].astype(np.uint8)
            f[...,3]=(fade*water*150).astype(np.uint8)
        out.append(f)
    return out
