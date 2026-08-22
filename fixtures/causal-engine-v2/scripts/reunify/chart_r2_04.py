#!/usr/bin/env python3
"""r2-04_join_feasibility_unified.png — can the rumination corpus reach the pattern layer?
Four stacked lanes over Mar–Jul 2026: (1) worn days (pattern-computable), (2) Granola
meetings, (3) CEO verbatim memory lines, (4) the three candidates' June citation dates.
The 34-day void (5/20-6/21) is shaded. Headline: the corpus that generates rumination
signal (5/24→) and the days we can compute a pattern (≤5/19 + lone 6/22) do not overlap —
0/3 candidate citation dates have ANY biometric backing, unchanged by reunification."""
import json, os, datetime
from datetime import date, timedelta
from zoneinfo import ZoneInfo
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

PT=ZoneInfo("America/Los_Angeles")
HERE=os.path.dirname(__file__)
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
OUT="/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07/r2-04_join_feasibility_unified.png"
BG="#1a1208"; TEXT="#f2e7d5"; MUTED="#b7a689"; AMBER="#c9a227"; GREEN="#7fb069"
BLUE="#5a93b8"; RED="#e0563c"; VIOLET="#b48ead"; TEAL="#6fb3a8"

TL=json.load(open(os.path.join(HERE,"remap","pattern_timeline_unified.json")))["timeline"]
worn=sorted(d["date"] for d in TL if d["source_quality"]=="real_inference")
recovered={"2026-04-10","2026-04-12"}
meetings=json.load(open(f"{SP}/data/meetings.json"))
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
def dstr(ts): return datetime.datetime.fromtimestamp(float(ts),PT).strftime("%Y-%m-%d")
meet_days=sorted({dstr(m["ts"]) for m in meetings})
mem_days=sorted({dstr(m["ts"]) for m in mem})

cand={"pricing_gate":["2026-06-10","2026-06-11","2026-06-26"],
      "demo_polish":["2026-05-22","2026-06-11","2026-06-26"],
      "attribution_doubt":["2026-06-24","2026-06-26"]}

x0=date(2026,3,16); x1=date(2026,7,5)
def xd(s):
    d=date.fromisoformat(s) if isinstance(s,str) else s
    return (d-x0).days
VOID_A=date(2026,5,20); VOID_B=date(2026,6,21)

fig,ax=plt.subplots(figsize=(15,7.6),facecolor=BG)
ax.set_facecolor(BG)
lanes={"worn":4,"meet":3,"mem":2,"cand":0.6}
# void
ax.axvspan(xd(VOID_A),xd(VOID_B),color=RED,alpha=0.12,zorder=0)
ax.text((xd(VOID_A)+xd(VOID_B))/2,5.15,"34-day biometric void  5/20–6/21",color=RED,ha="center",fontsize=10,fontweight="bold")

# lane 1 worn days
for d in worn:
    c=GREEN if d in recovered else (AMBER if d=="2026-06-22" else TEAL)
    ax.add_patch(Rectangle((xd(d)-0.35,lanes["worn"]-0.28),0.7,0.56,facecolor=c,edgecolor=BG,lw=0.4,zorder=3))
# lane 2 meetings
for d in meet_days:
    ax.add_patch(Rectangle((xd(d)-0.35,lanes["meet"]-0.28),0.7,0.56,facecolor=BLUE,edgecolor=BG,lw=0.4,zorder=3))
# lane 3 memory (density)
from collections import Counter
mc=Counter(mem_days)
mx=max(mc.values())
for d,c in mc.items():
    h=0.18+0.42*(c/mx)
    ax.add_patch(Rectangle((xd(d)-0.35,lanes["mem"]-h/2),0.7,h,facecolor=VIOLET,edgecolor=BG,lw=0.3,zorder=3))
# lane 4 candidate citation dates
cc={"pricing_gate":RED,"demo_polish":AMBER,"attribution_doubt":VIOLET}
yy={"pricing_gate":1.05,"demo_polish":0.6,"attribution_doubt":0.15}
for name,dates in cand.items():
    for d in dates:
        backed = d in worn
        ax.scatter([xd(d)],[yy[name]],s=90,marker="v",
                   facecolor=("none"),edgecolor=cc[name],lw=1.8,zorder=4)
        # red X = no biometric backing
        if not backed:
            ax.text(xd(d),yy[name],"×",color=RED,fontsize=11,ha="center",va="center",fontweight="bold",zorder=5)
    ax.text(xd(x1)+0.5,yy[name],name.replace("_"," "),color=cc[name],fontsize=8.6,va="center",ha="left")

ax.set_xlim(0,xd(x1)+12); ax.set_ylim(-0.3,5.6)
ax.set_yticks([lanes["worn"],lanes["meet"],lanes["mem"],lanes["cand"]])
ax.set_yticklabels(["worn days\n(pattern-computable)","Granola meetings","CEO memory lines\n(height=volume)","candidate\ncitation dates"],
                   color=TEXT,fontsize=9)
for sp in ax.spines.values(): sp.set_visible(False)
ax.tick_params(length=0,colors=MUTED)
# month ticks
xt=[];xl=[]; d=x0
while d<=x1:
    if d.day==1 or d==x0: xt.append(xd(d)); xl.append(d.strftime("%b %-d"))
    d+=timedelta(days=1)
for d,l in [(date(2026,5,19),"5/19"),(date(2026,5,24),"5/24"),(date(2026,6,22),"6/22")]:
    xt.append(xd(d)); xl.append(l)
ax.set_xticks(xt); ax.set_xticklabels(xl,color=MUTED,fontsize=8)

fig.suptitle("Root-cause join feasibility on the reunified timeline  ·  n=1 (Yiming)",
             color=TEXT,fontsize=15,fontweight="bold",x=0.065,y=0.965,ha="left")
fig.text(0.065,0.905,
    "Worn days (≤5/19 dense + lone 6/22) and the rumination corpus (meetings 5/24→, June memory) do NOT overlap.  "
    "Green = 2 stitch-recovered April days.",
    color=MUTED,fontsize=9.8,ha="left")
fig.text(0.065,0.028,
    "Every candidate June citation date (▽) has ZERO biometric backing (×) — the reunification recovered only April, so 0/3 candidates gain pattern-layer support.",
    color=RED,fontsize=10,ha="left",fontweight="bold")
fig.subplots_adjust(left=0.115,right=0.90,top=0.86,bottom=0.10)
fig.savefig(OUT,dpi=150,facecolor=BG)
print("wrote",OUT)
print("worn:",len(worn),"meet_days:",len(meet_days),"mem_days:",len(mem_days))
