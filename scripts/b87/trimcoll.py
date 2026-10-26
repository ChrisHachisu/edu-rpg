import numpy as np
SRC='/home/claude/edu-rpg/public/act1-hifi/forest-collision.bin'
DST='/tmp/claude-0/-home-claude-edu-rpg/5d54a5fd-4cc4-5f3b-813e-93002b58e286/scratchpad/mock/out87/forest-collision.bin'
raw=bytearray(open(SRC,'rb').read()); W,H=4736,5824
b=np.unpackbits(np.frombuffer(bytes(raw[64:]),np.uint8),bitorder='little')[:W*H].reshape(H,W).astype(bool)
T=24; MINRUN=T+16
rb=np.zeros((H,W),np.int32); rb[H-1]=H-1
for y in range(H-2,-1,-1):
    rb[y]=np.where(b[y]&b[y+1],rb[y+1],y)
start=b.copy(); start[1:]&=~b[:-1]; start[0]=False
L=rb-np.arange(H)[:,None]+1
sel=start&(L>MINRUN)
out=b.copy()
ys,xs=np.nonzero(sel)
for k in range(T): out[ys+k,xs]=False
print('cleared',int(b.sum()-out.sum()),'of',int(b.sum()))
raw[64:]=np.packbits(out.ravel(),bitorder='little').tobytes()
open(DST,'wb').write(bytes(raw))
