import sys,numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
sys.path.insert(0,'/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock')
import comp
R='/home/claude/edu-rpg/public/act1-hifi'; M='/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock'
def layer_region(kind,cx0,cy0,cx1,cy1):
    W=(cx1-cx0)*32;H=(cy1-cy0)*32; out=Image.new('RGBA',(W,H),(0,0,0,0))
    for c in range((cx0-16)//16,(cx1-1-16)//16+1):
        for r in range((cy0-218)//16,(cy1-1-218)//16+1):
            im=comp.layer(kind,c,r)
            if im: out.paste(im,((16+16*c-cx0)*32,(218+16*r-cy0)*32))
    return out
def noise(shape,scale,seed):
    rng=np.random.default_rng(seed); h,w=shape
    n=rng.random((h//scale+2,w//scale+2))
    return np.array(Image.fromarray((n*255).astype(np.uint8)).resize((w+2*scale,h+2*scale),Image.BICUBIC))[scale:scale+h,scale:scale+w]/255.0
EXTRA={}
PLATE=None
def build(cx0,cy0,cx1,cy1,seed=1,keep=None):
    base=np.array(layer_region('base',cx0,cy0,cx1,cy1).convert('RGB')).astype(float)
    wat=np.array(layer_region('water-r2',cx0,cy0,cx1,cy1)).astype(float)
    fo=layer_region('forest',cx0,cy0,cx1,cy1)
    H,W=base.shape[:2]
    wa=wat[...,3]/255.0
    if PLATE:
        pw,ph=PLATE
        for a_ in (wa,):
            a_[:,pw:]=a_[:,pw-1:pw]; a_[ph:,:]=a_[ph-1:ph,:]
        base[:,pw:]=base[:,pw-1:pw]; base[ph:,:]=base[ph-1:ph,:]
    fa=np.array(fo).astype(int)
    green=(fa[...,1]>fa[...,0]+6)&(fa[...,1]>fa[...,2]+6)
    rockpx=(fa[...,3]>40)&~green
    # mountains are mostly non-green; trees mostly green: decide per small blob neighbourhood
    rfrac=ndi.uniform_filter(rockpx.astype(np.float32),15); afrac=ndi.uniform_filter((fa[...,3]>40).astype(np.float32),15)
    rock=(fa[...,3]>40)&(rfrac>0.5*np.maximum(afrac,1e-3))
    # current composite
    cur=base*(1-wa[...,None])+wat[...,:3]*wa[...,None]
    curI=Image.fromarray(cur.astype(np.uint8)).convert('RGBA'); curI.alpha_composite(fo)
    # smooth, slightly irregular shoreline
    soft=ndi.gaussian_filter(wa,7)+ (noise((H,W),14,seed)-0.5)*0.28 + (noise((H,W),5,seed+1)-0.5)*0.10
    water=soft>0.5
    # the grass ribbon between rock and water becomes water: rock overhangs the sea
    near_rock=ndi.binary_dilation(rock,iterations=22)
    grassy=(base[...,1]>base[...,0]+8)&(base[...,1]>base[...,2]+20)
    ribbon=near_rock & ~rock & grassy & ndi.binary_dilation(water,iterations=26)
    water=water|ribbon
    water=ndi.binary_opening(water,iterations=2)
    lab,n=ndi.label(~water)
    if n:
        sizes=ndi.sum(np.ones_like(lab),lab,range(1,n+1))
        small=np.isin(lab,[i+1 for i,s in enumerate(sizes) if s<4000])
        water=water|small
    labw,nw=ndi.label(water)
    if nw:
        sz=ndi.sum(np.ones_like(labw),labw,range(1,nw+1))
        water=water&~np.isin(labw,[i+1 for i,s in enumerate(sz) if s<300])
    # leftover grass slivers wedged between rock and sea also become sea
    lg,ng=ndi.label(~water&~rock)
    if ng:
        gs=ndi.sum(np.ones_like(lg),lg,range(1,ng+1))
        touch=ndi.binary_dilation(water,iterations=2)
        tl=set(np.unique(lg[touch]))
        water=water|(grassy&np.isin(lg,[i+1 for i,v in enumerate(gs) if v<8000 and (i+1) in tl]))
    if keep is not None: water=np.where(keep,wa>0.5,water)
    # water texture: tile the R2 material (96 texels/cell -> 32 px/cell)
    mat=Image.open(R+'/materials/act1-water-r2.png').convert('RGB'); mat=mat.resize((mat.width//3,mat.height//3),Image.LANCZOS)
    tile=np.array(mat).astype(float); th,tw=tile.shape[:2]
    oy=((cy0*32)%th); ox=((cx0*32)%tw)
    ty=(np.arange(H)+oy)%th; tx=(np.arange(W)+ox)%tw
    wtex=tile[ty][:,tx]
    wtex=np.where(wa[...,None]>0.6, wat[...,:3], wtex)
    land=~water
    dl=ndi.distance_transform_edt(land)      # distance into land from water
    dw=ndi.distance_transform_edt(water)     # distance into water from land
    mx=base.max(-1); mn=base.min(-1)
    brock=(mx-mn<45)&(base[...,2]<base[...,0]+10)&(base[...,1]<base[...,0]+15)&~water
    brock=ndi.binary_opening(brock,iterations=2)
    rockzone=ndi.binary_dilation(rock|brock,iterations=16)
    sandw=11+6*noise((H,W),9,seed+2)
    sand=land&(dl<=sandw)&~rockzone
    ls,ns=ndi.label(sand)
    if ns:
        ss=ndi.sum(np.ones_like(ls),ls,range(1,ns+1))
        sand=sand&~np.isin(ls,[i+1 for i,v in enumerate(ss) if v<900])
    out=np.where(land[...,None],base,wtex)
    # sand: warm, pixel-dithered
    n=noise((H,W),2,seed+3); speck=(np.random.default_rng(seed+4).random((H,W))<0.08)
    sandc=np.stack([226+14*n,198+12*n,140+10*n],-1)
    sandc[speck]=[196,166,112]
    wet=sand&(dl<3.2)
    sandc=np.where(wet[...,None],sandc*0.86,sandc)
    out=np.where(sand[...,None],sandc,out)
    # soft blend sand->grass
    edge=land&(dl>sandw)&(dl<sandw+2.5)&~rockzone
    out=np.where(edge[...,None],0.5*out+0.5*np.array([200,190,110]),out)
    EXTRA['sandimg']=out.copy()
    # foam: bright line hugging sand shores, dim second line offshore
    shore_sand=ndi.binary_dilation(sand,iterations=1)
    f1=water&(dw<=2.2)&ndi.binary_dilation(sand,iterations=3)
    f2=water&(dw>5)&(dw<=6.4)&(noise((H,W),6,seed+5)>0.45)&ndi.binary_dilation(sand,iterations=8)
    out=np.where(f1[...,None],0.25*out+0.75*np.array([235,248,255]),out)
    out=np.where(f2[...,None],0.6*out+0.4*np.array([210,236,255]),out)
    # rock meets water: dark contact shadow, thin broken foam
    rs=water&(dw<=7)&ndi.binary_dilation(rock,iterations=8)
    out=np.where(rs[...,None],out*0.62,out)
    rf=water&(dw<=1.5)&ndi.binary_dilation(rock,iterations=3)&(noise((H,W),3,seed+6)>0.5)
    out=np.where(rf[...,None],0.5*out+0.5*np.array([220,240,255]),out)
    pro=Image.fromarray(np.clip(out,0,255).astype(np.uint8)).convert('RGBA'); pro.alpha_composite(fo)
    EXTRA.update(f1=f1,f2=f2,rs=rs,rf=rf,water=water)
    return curI,pro,water
if __name__=='__main__':
    a=list(map(int,sys.argv[1:5])); name=sys.argv[5]
    cur,pro,water=build(*a)
    cur.save(M+f'/{name}_cur.png'); pro.save(M+f'/{name}_pro.png')
    np.save(M+f'/{name}_water.npy',water)
    s=lambda im: im.convert('RGB').resize((im.width//2,im.height//2))
    o=Image.new('RGB',(cur.width+10,cur.height//2*2+0),(255,255,255))
    o=Image.new('RGB',(cur.width+10,cur.height//2),(255,255,255)); o.paste(s(cur),(0,0)); o.paste(s(pro),(cur.width//2+10,0)); o.save(M+f'/{name}_pair_s.png')
