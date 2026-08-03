#!/usr/bin/env python3
"""Render the Gate-1 macro review views from the generated class map."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from act1_terrain_class_lib import CODE, LANDMARKS, OUTPUT, PALETTE, ROUTES, grid_from_output

def rgb(hexcode: str): return tuple(int(hexcode[i:i+2], 16) for i in (1,3,5))
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=OUTPUT);a=p.parse_args();o=a.output
    g=grid_from_output(o); overlay=np.load(o/'bridge-overlay.npy'); h,w=g.shape
    palette=np.array([rgb(PALETTE[n]) for n in CODE],dtype=np.uint8); base=palette[g]
    base[overlay]=rgb(PALETTE['bridge'])
    logic=Image.fromarray(base,'RGB').resize((w*16,h*16),Image.Resampling.NEAREST)
    logic.save(o/'terrain-logic-view.png',compress_level=9,optimize=False)
    blocked=np.isin(g,[CODE['water'],CODE['forest'],CODE['cliff'],CODE['mountain'],CODE['structure'],CODE['landmarkSolid']]) & ~overlay
    bar=np.zeros((h,w,3),dtype=np.uint8);bar[:]=[218,225,209];bar[blocked]=[35,42,47]
    barrier=Image.fromarray(bar,'RGB').resize((w*16,h*16),Image.Resampling.NEAREST);barrier.save(o/'barrier-only-view.png',compress_level=9,optimize=False)
    ov=logic.copy();d=ImageDraw.Draw(ov)
    for route, pts in ROUTES.items(): d.line([(x*16+8,y*16+8) for x,y in pts],fill=(255,245,100),width=4,joint='curve')
    for name,info in LANDMARKS.items():
        x,y=info['approach'];d.ellipse((x*16+2,y*16+2,x*16+14,y*16+14),fill=(255,80,100),outline=(20,20,20));d.text((x*16+10,y*16-2),name,fill=(255,255,255),stroke_width=1,stroke_fill=(0,0,0))
    ov.save(o/'anchor-route-overlay.png',compress_level=9,optimize=False)
    sheet=Image.new('RGB',(900,600),(27,34,39));sd=ImageDraw.Draw(sheet);cells=[('Greenhollow–Millbrook Bridge',(82,117)),('Millbrook–Port Pass',(100,85)),('Port–Reef Causeway',(124,127)),('Port–Darkfang Gap',(108,55)),('Crystal Seal Gate',(132,75))]
    for i,(name,(x,y)) in enumerate(cells):
        crop=logic.crop((max(0,x*16-128),max(0,y*16-128),min(logic.width,x*16+128),min(logic.height,y*16+128))).resize((260,260),Image.Resampling.NEAREST);px=(i%3)*300+20;py=(i//3)*300+25;sheet.paste(crop,(px,py));sd.text((px,py+265),name,fill='white')
    sheet.save(o/'gateway-close-up-sheet.png',compress_level=9,optimize=False)
    logic.save(o/'native-scale-render.png',compress_level=9,optimize=False)
    logic.resize((320,400),Image.Resampling.LANCZOS).save(o/'phone-scale-render.png',compress_level=9,optimize=False)
if __name__=='__main__':main()
