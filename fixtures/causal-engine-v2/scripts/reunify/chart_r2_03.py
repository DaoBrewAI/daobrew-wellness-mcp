#!/usr/bin/env python3
"""r2-03_raw_vs_gated_unified.png — the gating artifact on the reunified span.
Left: dominant stress pattern from RAW biometric signal (pre-gate).
Right: pattern the APP actually shows (post yin/yang eligibility gate).
Flow ribbons show how raw days get rewritten. Headline: raw DEPLETION = 0 days,
yet the app shows DEPLETION on 21 of 28 worn days — 100% gate-manufactured."""
import json, os
from collections import Counter, defaultdict
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, PathPatch
from matplotlib.path import Path

HERE=os.path.dirname(__file__)
OUT="/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07/r2-03_raw_vs_gated_unified.png"
BG="#1a1208"; TEXT="#f2e7d5"; MUTED="#b7a689"; AMBER="#c9a227"; GREEN="#7fb069"
BLUE="#5a93b8"; RED="#e0563c"; VIOLET="#b48ead"; TEAL="#6fb3a8"

TL=json.load(open(os.path.join(HERE,"remap","pattern_timeline_unified.json")))["timeline"]
worn=[d for d in TL if d["source_quality"]=="real_inference"]

PCOL={"TENSION":TEAL,"OVERDRIVE":RED,"STAGNATION":AMBER,"CONSTRICTION":VIOLET,"DEPLETION":BLUE,None:"#4a3a24"}
ORDER=["TENSION","OVERDRIVE","STAGNATION","CONSTRICTION","DEPLETION"]

raw_c=Counter(d["dominant_pattern_raw_pre_gate"] for d in worn)
gate_c=Counter(d["dominant_pattern"] for d in worn)
flows=defaultdict(int)
for d in worn:
    flows[(d["dominant_pattern_raw_pre_gate"],d["dominant_pattern"])]+=1

fig,ax=plt.subplots(figsize=(13.5,8.2),facecolor=BG)
ax.set_facecolor(BG); ax.set_xlim(0,10); ax.set_ylim(0,len(worn)+3); ax.axis("off")
LX=1.6; RX=8.4; BW=0.55
n=len(worn)

# stack positions
def stack(counter):
    pos={}; y=0.5
    for p in ORDER:
        c=counter.get(p,0)
        if c>0: pos[p]=(y,y+c); y+=c+0.25
    return pos,y
lpos,_=stack(raw_c); rpos,_=stack(gate_c)

def box(x,p,span,side):
    y0,y1=span
    ax.add_patch(Rectangle((x,y0),BW,y1-y0,facecolor=PCOL[p],edgecolor=BG,lw=1.2))
    ax.text(x+(BW+0.15 if side=="r" else -0.15),(y0+y1)/2,f"{p}  {raw_c.get(p,0) if side=='l' else gate_c.get(p,0)}",
            color=TEXT,fontsize=10,va="center",ha="left" if side=="r" else "right",fontweight="bold")
for p,span in lpos.items(): box(LX,p,span,"l")
for p,span in rpos.items(): box(RX,p,span,"r")

# flow ribbons
lcur={p:s[0] for p,s in lpos.items()}; rcur={p:s[0] for p,s in rpos.items()}
for (src,dst),c in sorted(flows.items(),key=lambda kv:-kv[1]):
    if src not in lpos or dst not in rpos: continue
    ly0=lcur[src]; ly1=ly0+c; lcur[src]=ly1
    ry0=rcur[dst]; ry1=ry0+c; rcur[dst]=ry1
    x0=LX+BW; x1=RX
    verts=[(x0,ly0),((x0+x1)/2,ly0),((x0+x1)/2,ry0),(x1,ry0),
           (x1,ry1),((x0+x1)/2,ry1),((x0+x1)/2,ly1),(x0,ly1),(x0,ly0)]
    codes=[Path.MOVETO,Path.CURVE4,Path.CURVE4,Path.CURVE4,Path.LINETO,Path.CURVE4,Path.CURVE4,Path.CURVE4,Path.CLOSEPOLY]
    col=PCOL[dst] if dst else "#555"
    ax.add_patch(PathPatch(Path(verts,codes),facecolor=col,edgecolor="none",alpha=0.28))

ax.text(LX+BW/2,n+2.0,"RAW biometric signal\n(pre-gate)",color=TEXT,fontsize=12,ha="center",fontweight="bold")
ax.text(RX+BW/2,n+2.0,"APP shows\n(post yin/yang gate)",color=TEXT,fontsize=12,ha="center",fontweight="bold")

fig.suptitle("Stress pattern: raw signal vs what the app shows  ·  reunified n=28 worn days",
             color=TEXT,fontsize=15,fontweight="bold",x=0.5,y=0.965)
fig.text(0.5,0.915,
    "RAW dominant: TENSION 14 · OVERDRIVE 8 · STAGNATION 5 · CONSTRICTION 1 · DEPLETION 0."
    "   Gate rewrites low-step days to DEPLETION and pushing-it days to OVERDRIVE.",
    color=MUTED,fontsize=9.8,ha="center")
fig.text(0.5,0.045,
    "DEPLETION is shown on 21/28 days yet appears on ZERO raw-signal days — it is 100% manufactured by the step-driven eligibility gate. "
    "Unchanged by reunification (+2 April days were raw TENSION).",
    color=RED,fontsize=9.8,ha="center",fontweight="bold")
fig.savefig(OUT,dpi=150,facecolor=BG,bbox_inches="tight")
print("wrote",OUT)
print("raw:",dict(raw_c)); print("gated:",dict(gate_c))
