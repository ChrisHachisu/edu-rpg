# Faithful reproduction of build 86 overworld collision (dq-tiles.js a1mFree):
#  1) a1fHeroFree: EVERY opaque pixel of the union of all 12 hero frames (+1px margin) vs forest-collision.bin
#  2) a1mWwContactFree: sole disc r=12 solver px (8 collision px) vs the full Whispering Woods mask
#  3) canMove: soles may not enter blocked tiles (100,231),(101,231 door),(102,231)
import sys,re,base64,numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
sys.path.insert(0,'/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock')
from comp import region, layer
from coll import coll
M='/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock'
P='/home/claude/edu-rpg/public'
S=1.0125/0.7*32/48
sheet=np.array(Image.open(P+'/assets/hero/hero-g3-walk.png').convert('RGBA'))
def frame(i): return Image.fromarray(sheet[:,i*64:(i+1)*64]).resize((round(64*S),round(64*S)),Image.NEAREST)
FS=round(64*S)
# stencil points relative to sprite centre, exactly as a1fBuildStencil
pts=set()
for f in range(12):
    a=sheet[:,f*64:(f+1)*64,3]>8
    for y,x in zip(*np.nonzero(a)): pts.add((round((x+0.5-32)*S),round((y+0.5-32)*S)))
pts=np.array(sorted(pts)); mnx,mny=pts.min(0); mxx,mxy=pts.max(0)
K=np.zeros((mxy-mny+1,mxx-mnx+1)); K[pts[:,1]-mny,pts[:,0]-mnx]=1
a0=sheet[:,0:64,3]>8; sole_row=np.nonzero(a0.any(1))[0].max()
SOLE=round((sole_row+0.5-32)*S)   # sprite centre -> soles, collision px
print('stencil',K.shape,'sole',SOLE)
def body_forbidden(rock):
    r=rock|np.roll(rock,1,0)|np.roll(rock,-1,0)|np.roll(rock,1,1)|np.roll(rock,-1,1)
    # sprite centre c forbidden if rock at c+p for any stencil p  ->  correlate rock with K
    c=fftconvolve(r.astype(float),K[::-1,::-1],mode='full')>0.5
    # index c_full[y,x] corresponds to centre (y - (mxy), x - (mxx))
    H,W=rock.shape; out=c[mxy:mxy+H, mxx:mxx+W] if False else None
    out=np.zeros_like(rock)
    full=c; oy=-mny; ox=-mnx  # full[y+ (K.h-1) - ...]
    # derive offset empirically: centre (y,x) hits rock at (y+dy,x+dx); full index = (y+dy)+(Kh-1-(dy-mny))
    kh,kw=K.shape
    out=full[kh-1+mny:kh-1+mny+H, kw-1+mnx:kw-1+mnx+W]
    return out
def to_soles(cent):  # forbidden sprite centres -> forbidden sole points
    s=np.zeros_like(cent); 
    if SOLE>0: s[SOLE:]=cent[:-SOLE]
    return s
def disc(m,r):
    yy,xx=np.mgrid[-r:r+1,-r:r+1]; return ndi.binary_dilation(m,structure=(xx*xx+yy*yy)<=r*r)
def tint(img,m,col=(230,40,40),a=120):
    o=np.array(img.convert('RGBA')).astype(np.int32)
    for i in range(3): o[...,i][m]=(o[...,i][m]*(255-a)+col[i]*a)//255
    return Image.fromarray(o.astype(np.uint8))
