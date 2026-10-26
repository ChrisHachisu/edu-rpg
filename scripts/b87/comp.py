import sys, os
from PIL import Image
R='/home/claude/edu-rpg/public/act1-hifi'
X0,Y0=16,218; P=32
def layer(kind, c, r):
    ext={'base':'webp','canopy':'webp'}.get(kind,'png')
    p=f'{R}/chunks/{kind}/c{c}-r{r}.{ext}'
    if kind=='base' and os.environ.get('BASE_DIR'):
        q=os.environ['BASE_DIR']+f'/c{c}-r{r}.png'
        if os.path.exists(q): p=q
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None
def region(cx0,cy0,cx1,cy1,kinds=('base','water-r2','forest')):
    W=(cx1-cx0)*P; H=(cy1-cy0)*P
    out=Image.new('RGBA',(W,H),(0,0,0,255))
    for c in range((cx0-X0)//16,(cx1-1-X0)//16+1):
        for r in range((cy0-Y0)//16,(cy1-1-Y0)//16+1):
            ox=(X0+16*c-cx0)*P; oy=(Y0+16*r-cy0)*P
            for k in kinds:
                im=layer(k,c,r)
                if im is None: continue
                pass
                out.alpha_composite(im,(0,0) if False else (0,0)) if False else None
                tmp=Image.new('RGBA',(W,H),(0,0,0,0)); tmp.paste(im,(ox,oy)); out=Image.alpha_composite(out,tmp)
    return out
if __name__=='__main__':
    a=list(map(int,sys.argv[1:5])); region(*a).save(sys.argv[5])
