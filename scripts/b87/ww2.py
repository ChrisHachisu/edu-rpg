import sys,re,base64,numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0,'/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock')
import truth as T
from comp import region
from coll import coll
def runs_bottom(m):
    rb=np.full(m.shape,-1)
    for x in range(m.shape[1]):
        col=m[:,x]; y=m.shape[0]-1
        while y>=0:
            if col[y]:
                b=y
                while y>=0 and col[y]: rb[y,x]=b; y-=1
            else: y-=1
    return rb
def trim_top(m,t):
    out=m.copy()
    for x in range(m.shape[1]):
        col=m[:,x]; y=0
        while y<len(col):
            if col[y]:
                s=y
                while y<len(col) and col[y]: y+=1
                if s>0 and (y-s)>t+16: out[s:s+t,x]=False   # only runs with open ground north of them
            else: y+=1
    return out

M=T.M; R='/home/claude/edu-rpg/public/act1-hifi'
cx0,cy0,cx1,cy1=96,225,107,235
bg=region(cx0,cy0,cx1,cy1,('base','water-r2'))
W,H=bg.size
fl=Image.new('RGBA',(W,H),(0,0,0,0))
import comp
for c in range((cx0-16)//16,(cx1-1-16)//16+1):
    for r in range((cy0-218)//16,(cy1-1-218)//16+1):
        im=comp.layer('forest',c,r)
        if im: fl.paste(im,((16+16*c-cx0)*32,(218+16*r-cy0)*32))
falpha=np.array(fl)[...,3]
rock=coll(cx0,cy0,cx1,cy1).astype(bool)
src=open('/home/claude/edu-rpg/public/dq-tiles.js').read()
b64=re.search(r"A1M_WW_MASK_B64='([^']+)'",src).group(1)
m144=np.unpackbits(np.frombuffer(base64.b64decode(b64),np.uint8),bitorder='little')[:144*144].reshape(144,144).astype(bool)
m96=np.array(Image.fromarray(m144.astype(np.uint8)*255).resize((96,96),Image.NEAREST))>0
spr=Image.open(R+'/landmarks/whispering-woods.png').convert('RGBA').resize((96,96),Image.LANCZOS)
ccx=(101-cx0)*32+16; ccy=(231-cy0)*32+16; sx=round(ccx-76*2/3); sy=round(ccy-90*2/3)
def place(m):
    o=np.zeros((H,W),bool); o[sy:sy+96,sx:sx+96]=m; return o
def cell(x,y):
    o=np.zeros((H,W),bool); o[(y-cy0)*32:(y-cy0+1)*32,(x-cx0)*32:(x-cx0+1)*32]=True; return o
def band(m,b):
    out=np.zeros_like(m)
    for x in range(m.shape[1]):
        ys=np.where(m[:,x])[0]
        if len(ys): e=ys.max(); out[max(0,e-b+1):e+1,x]=m[max(0,e-b+1):e+1,x]
    return out
# ---- build 86 as coded: soles forbidden where whole-body outline hits rock, disc vs full WW mask, 3 door-row cells
nb=T.to_soles(T.body_forbidden(rock)); nb[:T.SOLE+1]=nb[T.SOLE+1]
now=nb | T.disc(place(m96),8) | cell(100,231)|cell(101,231)|cell(102,231)
# ---- proposed: feet footprint (bottom 10 px of outline) vs rock trimmed of its top 24 px; WW base band only; door cell only
feet=T.pts[T.pts[:,1]>=T.SOLE-10]
def feet_forbidden(rk):
    out=np.zeros_like(rk)
    for dx,dy in feet:
        out|=np.roll(rk,(-(dy-T.SOLE),-dx),(0,1))   # sole point s hits rock at s+(dx,dy-SOLE)
    return out
rock2=trim_top(rock&(falpha>=128),24)
pro=feet_forbidden(rock2) | T.disc(place(band(m96,14)),6) | cell(101,231)
def frame(i): return T.frame(i)
FS=T.FS
def render(block, soles, behind, fi):
    img=bg.copy(); hx,hy=soles; f=frame(fi); pos=(hx-FS//2, hy-T.SOLE-FS//2)
    rb=runs_bottom(falpha>16)
    if behind:
        a=np.array(fl); a[...,3][rb>hy]=0; img.alpha_composite(Image.fromarray(a))
        img.alpha_composite(f,pos)
        a=np.array(fl); a[...,3][rb<=hy]=0; img.alpha_composite(Image.fromarray(a))
        img.alpha_composite(spr,(sx,sy))
    else:
        img.alpha_composite(fl); img.alpha_composite(spr,(sx,sy)); clean=img.copy(); clean.alpha_composite(f,pos)
        tinted=T.tint(img,block,a=105); tinted.alpha_composite(f,pos)
        return tinted.resize((W*2,H*2),Image.NEAREST), clean.resize((W*2,H*2),Image.NEAREST)
    tinted=T.tint(img,block,a=105)
    return tinted.resize((W*2,H*2),Image.NEAREST), img.resize((W*2,H*2),Image.NEAREST)
def closest_from_north(block,x):
    col=block[:,x]; ys=np.where(~col)[0]
    # walk south from the open strip below the cliff: first blocked sole y after first open
    open_start=ys[ys>(227-cy0)*32][0] if (ys>(227-cy0)*32).any() else ys[0]
    y=open_start
    while y<H and not col[y]: y+=1
    return y-1, open_start
hx=ccx-4
yn,on=closest_from_north(now,hx); yp,op=closest_from_north(pro,hx)
print('now soles open from',on,'stop',yn,' pro open',op,'stop',yp)
a,_=render(now,(hx,max(yn,on)),False,9); b,bc=render(pro,(hx,yp),True,9)
a.save(M+'/ww2_now.png'); b.save(M+'/ww2_pro.png'); bc.save(M+'/ww2_pro_clean.png')
gap=Image.new('RGB',(a.width*2+20,a.height),(255,255,255)); gap.paste(a.convert('RGB'),(0,0)); gap.paste(b.convert('RGB'),(a.width+20,0)); gap.save(M+'/ww2_pair.png')
