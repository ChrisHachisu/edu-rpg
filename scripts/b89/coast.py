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

def _fill_comp(fa_,rock,corr,water,done,cm):
    H,W=rock.shape
    _,(iy_,ix_)=ndi.distance_transform_edt(~rock,return_indices=True)
    yy_,xx_=np.nonzero(cm)
    vy=(iy_[yy_,xx_]-yy_).mean(); vx=(ix_[yy_,xx_]-xx_).mean(); L_=max(1e-3,np.hypot(vx,vy))
    uy,ux=vy/L_,vx/L_
    best=None
    for d in range(32,640,8):
        sy_=yy_+int(round(uy*d)); sx_=xx_+int(round(ux*d))
        ok=(sy_>=0)&(sy_<H)&(sx_>=0)&(sx_<W)
        ok[ok]&=rock[sy_[ok],sx_[ok]]&(fa_[sy_[ok],sx_[ok],3]>200)&~corr[sy_[ok],sx_[ok]]
        if best is None or ok.mean()>best[0]: best=(ok.mean(),d,ok,sy_,sx_)
        if ok.mean()>0.97: break
    _,d,ok,sy_,sx_=best
    fa_[yy_[ok],xx_[ok]]=fa_[sy_[ok],sx_[ok]]; done[yy_[ok],xx_[ok]]=True
    for extra in (48,96,144,192,240,-24,-48):
        rem=~done[yy_,xx_]
        if not rem.any(): break
        sy2=yy_[rem]+int(round(uy*(d+extra))); sx2=xx_[rem]+int(round(ux*(d+extra)))
        ok2=(sy2>=0)&(sy2<H)&(sx2>=0)&(sx2<W)
        ok2[ok2]&=rock[sy2[ok2],sx2[ok2]]&(fa_[sy2[ok2],sx2[ok2],3]>200)&~corr[sy2[ok2],sx2[ok2]]
        yr,xr=yy_[rem][ok2],xx_[rem][ok2]; fa_[yr,xr]=fa_[sy2[ok2],sx2[ok2]]; done[yr,xr]=True
    hole=cm&~done
    if hole.any():
        srcm=done|(rock&(fa_[...,3]>200))
        _,(ny_,nx_)=ndi.distance_transform_edt(~srcm,return_indices=True)
        hy,hx=np.nonzero(hole); fa_[hy,hx]=fa_[ny_[hy,hx],nx_[hy,hx]]; done[hy,hx]=True
    fi_=fa_.astype(int); blu=done&cm&(fi_[...,2]>fi_[...,0]+25)
    if blu.any():
        srcm=(done|(rock&(fa_[...,3]>200)))&~blu
        _,(ny_,nx_)=ndi.distance_transform_edt(~srcm,return_indices=True)
        hy,hx=np.nonzero(blu); fa_[hy,hx]=fa_[ny_[hy,hx],nx_[hy,hx]]
    dwn=ndi.distance_transform_edt(~water)
    foot=done&cm&(dwn<5)
    fa_[foot,:3]=(fa_[foot,:3]*0.8).astype(np.uint8)
def rockfill(fa_,rock,corr,water,margin=700):
    done=np.zeros_like(corr)
    lr,nr=ndi.label(corr)
    for comp,sl in enumerate(ndi.find_objects(lr),1):
        if sl is None: continue
        y0=max(0,sl[0].start-margin); y1=min(corr.shape[0],sl[0].stop+margin)
        x0=max(0,sl[1].start-margin); x1=min(corr.shape[1],sl[1].stop+margin)
        S=(slice(y0,y1),slice(x0,x1))
        sub=fa_[S]; dsub=done[S]
        _fill_comp(sub,rock[S],corr[S],water[S],dsub,lr[S]==comp)
    return done
EXTRA={}
CORRIDOR=0
ROCKFILL=False
MILD=0
JOIN=0
FRONT=0
FORCE=[]
APRON=0
PLATE=None
def build(cx0,cy0,cx1,cy1,seed=1,keep=None):
    base=np.array(layer_region('base',cx0,cy0,cx1,cy1).convert('RGB')).astype(float)
    wat=np.array(layer_region('water-r2',cx0,cy0,cx1,cy1)).astype(float)
    fo=layer_region('forest',cx0,cy0,cx1,cy1)
    H,W=base.shape[:2]
    wa=wat[...,3]/255.0
    gx,gy=(cx0-16)*32,(cy0-218)*32
    for (x0,y0,x1,y1) in FORCE:
        # build 91: rock paint removed by hand; the sea takes its place
        X0,Y0,X1,Y1=max(0,x0-gx),max(0,y0-gy),min(wa.shape[1],x1-gx),min(wa.shape[0],y1-gy)
        if X1>X0 and Y1>Y0:
            fa_=np.array(fo)[Y0:Y1,X0:X1,3]
            wa[Y0:Y1,X0:X1]=np.where(fa_<=40,1.0,wa[Y0:Y1,X0:X1])
    if PLATE:
        pw,ph=PLATE
        for a_ in (wa,):
            a_[:,pw:]=a_[:,pw-1:pw]; a_[ph:,:]=a_[ph-1:ph,:]
        base[:,pw:]=base[:,pw-1:pw]; base[ph:,:]=base[ph-1:ph,:]
    f_=np.array(fo).astype(np.int16); A_=f_[...,3]>40
    lum_=(f_[...,0]+f_[...,1]+f_[...,2])/3
    rs_=A_&(f_[...,0]>=f_[...,1]-4)&(lum_>70)
    frac_=ndi.uniform_filter(rs_.astype(np.float32),31); fa_=ndi.uniform_filter(A_.astype(np.float32),31)
    rock=A_&(frac_>0.3*np.maximum(fa_,1e-3))
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
    if CORRIDOR:
        dr_=ndi.distance_transform_edt(~rock); dw_=ndi.distance_transform_edt(~water)
        cand=~water&~rock&grassy&(dr_+dw_<CORRIDOR)&(dw_<CORRIDOR*0.75)
        lc,nc=ndi.label(cand)
        if nc:
            touch=set(np.unique(lc[ndi.binary_dilation(water,iterations=2)&cand]))-{0}
            corr=np.isin(lc,list(touch))
            if ROCKFILL:
                corr=(ndi.binary_closing(corr|rock,iterations=8)&~rock&ndi.binary_dilation(corr,iterations=40)) | corr
                if MILD:
                    # only beside the range (rock in the same row), never over painted peaks;
                    # grass below the natural base stays land so the south outline is untouched
                    side=ndi.maximum_filter1d(rock,size=2*MILD+1,axis=1)
                    keepland=corr&~(side&(f_[...,3]<=40))
                    corr=corr&~keepland
                fa_=np.array(fo).copy(); done=rockfill(fa_,rock,corr,water)
                fo=Image.fromarray(fa_); rock=rock|done; EXTRA['rockfill']=done
                water=water|(corr&~done)
            else:
                if FRONT:
                    # build 91: grass in FRONT of a mountain (rock above it in the same column) is the
                    # land the base stands on, so it stays; only grass BESIDE the range turns to sea.
                    above=ndi.maximum_filter1d(rock,size=2*FRONT+1,axis=0,origin=FRONT)
                    corr=corr&~above
                water=water|corr
        water=ndi.binary_opening(water,iterations=2)|(water&ndi.binary_dilation(rock,iterations=2))
        lg2,ng2=ndi.label(~water&~rock)
        if ng2:
            gs2=ndi.sum(np.ones_like(lg2),lg2,range(1,ng2+1))
            tl2=set(np.unique(lg2[ndi.binary_dilation(water,iterations=2)]))
            water=water|np.isin(lg2,[i+1 for i,v in enumerate(gs2) if v<8000 and (i+1) in tl2])
    if JOIN:
        # build 91: where the coast meets a mountain's base, fill the notch so the land outline runs
        # smoothly into the base corner. Only water nearer to grass than to rock is filled, so the
        # sea still touches the mountain's sides and the mountain paint is never changed.
        A=~water
        D=ndi.distance_transform_edt(~A)<=JOIN
        clo=ndi.distance_transform_edt(D)>JOIN
        land=A&~rock
        dg=ndi.distance_transform_edt(~land); dr2=ndi.distance_transform_edt(~rock)
        fill=clo&water&(dg<dr2)&(dr2<JOIN*2.5)
        EXTRA['join']=fill
        water=water&~fill
    apron=np.zeros_like(water)
    if APRON:
        # the mountain's foot follows the island outline: smooth the land+rock silhouette near rock
        solid=(~water)|rock
        sm=ndi.gaussian_filter(solid.astype(np.float32),APRON)>0.5
        sm=ndi.binary_closing(sm,iterations=6)
        near=ndi.binary_dilation(rock,iterations=int(APRON*3))
        apron=water&sm&near&~rock
        lab_,n_=ndi.label(apron)
        if n_:
            sz_=ndi.sum(np.ones_like(lab_),lab_,range(1,n_+1))
            apron=np.isin(lab_,[i+1 for i,v in enumerate(sz_) if v>=40])
        water=water&~apron
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
    rockzone=ndi.binary_dilation(rock|brock|apron,iterations=16)
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
    if apron.any():
        # rocky foot: scree tone, lighter under the cliff, darker toward the sea
        da=ndi.distance_transform_edt(~water)  # distance from water
        nn=noise((H,W),3,seed+11); sp=(np.random.default_rng(seed+12).random((H,W))<0.12)
        t=np.clip(da/10,0,1)[...,None]
        scree=np.stack([88+30*nn,80+26*nn,70+22*nn],-1)*(0.82+0.25*t)
        scree[sp]*=0.75
        out=np.where(apron[...,None],scree,out)
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
    rock=rock|apron
    rn=np.zeros_like(rock)
    for k in range(1,13): rn[k:]|=rock[:-k]
    rn=ndi.binary_dilation(rn,structure=np.ones((1,5),bool))
    rs=water&(dw<=7)&rn&ndi.binary_dilation(rock,iterations=8)
    out=np.where(rs[...,None],out*0.62,out)
    rf=water&(dw<=1.5)&rn&ndi.binary_dilation(rock,iterations=3)&(noise((H,W),3,seed+6)>0.5)
    out=np.where(rf[...,None],0.5*out+0.5*np.array([220,240,255]),out)
    pro=Image.fromarray(np.clip(out,0,255).astype(np.uint8)).convert('RGBA'); pro.alpha_composite(fo)
    EXTRA['apron']=apron; EXTRA['forest']=fo
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
