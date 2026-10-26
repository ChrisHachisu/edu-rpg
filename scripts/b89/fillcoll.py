# Build 89: rock-filled pixels (new opaque forest-layer rock where build 86 had none) become collision.
import numpy as np,os
from PIL import Image
M=os.path.dirname(os.path.abspath(__file__)); O=M+'/orig86/public/act1-hifi/chunks/forest'
SRC='/home/claude/edu-rpg/public/act1-hifi/forest-collision.bin'; DST=M+'/out88/forest-collision.bin'
raw=bytearray(open(SRC,'rb').read()); W,H=4736,5824
b=np.unpackbits(np.frombuffer(bytes(raw[64:]),np.uint8),bitorder='little')[:W*H].reshape(H,W).astype(bool)
add=0
for f in sorted(os.listdir(M+'/out88/forest')):
    c,r=[int(v[1:]) for v in f[:-4].split('-')]
    n=np.array(Image.open(M+'/out88/forest/'+f).convert('RGBA'))[...,3]>40
    o=np.array(Image.open(O+'/'+f).convert('RGBA'))[...,3]>40
    new=n&~o; h,w=new.shape
    sl=(slice(r*512,r*512+h),slice(c*512,c*512+w)); add+=int((new&~b[sl]).sum()); b[sl]|=new
print('added',add)
raw[64:64+(W*H+7)//8]=np.packbits(b.ravel(),bitorder='little').tobytes()
open(DST,'wb').write(bytes(raw))
