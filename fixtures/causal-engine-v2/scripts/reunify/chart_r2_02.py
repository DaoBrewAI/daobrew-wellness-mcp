#!/usr/bin/env python3
"""r2-02_baselines_unified.png — rolling autonomic baselines on the REUNIFIED span.
Per-worn-day HRV (daily mean), resting HR, tonic HR (p10) with 14-day rolling
baselines, the 34-day biometric void (5/20-6/21) shaded, the 2 stitch-recovered
April days (4/10,4/12) ringed, and the lone 6/22 blip marked. Honest: n=28 worn
days, HRV ~2 samples/day, all effects directional only."""
import json, os, statistics
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

PT = ZoneInfo("America/Los_Angeles")
HERE = os.path.dirname(__file__)
OUT = "/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07/r2-02_baselines_unified.png"
BG="#1a1208"; PANEL="#211910"; EMPTY="#2a1f12"; TEXT="#f2e7d5"; MUTED="#b7a689"
AMBER="#c9a227"; GREEN="#7fb069"; BLUE="#5a93b8"; RED="#e0563c"; VIOLET="#b48ead"

U = json.load(open(os.path.join(HERE,"unified_samples.json")))["metrics"]
TL = json.load(open(os.path.join(HERE,"remap","pattern_timeline_unified.json")))["timeline"]

def pt_day(ts): return datetime.fromisoformat(ts).astimezone(PT).date()

# per-day daily metrics from unified samples
by_day = {}
for m,samples in U.items():
    for s in samples:
        d = pt_day(s["ts"]); by_day.setdefault(d,{}).setdefault(m,[]).append(s["value"])

worn = sorted(d for d in by_day if by_day[d].get("heart_rate"))
recovered = {date(2026,4,10), date(2026,4,12)}
blip = date(2026,6,22)

def daily(d,m,fn):
    vs=by_day.get(d,{}).get(m); return fn(vs) if vs else None
hrv_d = {d: daily(d,"heart_rate_variability",statistics.mean) for d in worn}
rhr_d = {d: daily(d,"resting_heart_rate",statistics.median) for d in worn}
tonic_d = {d: (np.percentile(by_day[d]["heart_rate"],10) if by_day[d].get("heart_rate") else None) for d in worn}

def rolling(series, win=14):
    out={}
    for d in worn:
        prior=[series[x] for x in worn if x<=d and (d-x).days<win and series.get(x) is not None]
        out[d]=statistics.mean(prior) if prior else None
    return out
hrv_b=rolling(hrv_d); rhr_b=rolling(rhr_d); tonic_b=rolling(tonic_d)

fig,axes=plt.subplots(3,1,figsize=(14.5,9.2),facecolor=BG,sharex=True)
fig.subplots_adjust(left=0.065,right=0.985,top=0.87,bottom=0.075,hspace=0.22)
x0=date(2026,3,16); x1=date(2026,7,5)
def xd(d): return (d-x0).days
VOID_A=date(2026,5,20); VOID_B=date(2026,6,21)

panels=[("HRV — daily mean (ms)",hrv_d,hrv_b,VIOLET,"55→53 ms drift; r²=0.06 weak"),
        ("Resting HR — daily median (bpm)",rhr_d,rhr_b,AMBER,"flat ~64; no robust changepoint"),
        ("Tonic HR — daily p10 (bpm)",tonic_d,tonic_b,RED,"activity-linked floor")]
for ax,(title,dd,bb,col,note) in zip(axes,panels):
    ax.set_facecolor(BG)
    # void band
    ax.axvspan(xd(VOID_A),xd(VOID_B),color=RED,alpha=0.10,zorder=0)
    xs=[xd(d) for d in worn if dd[d] is not None]; ys=[dd[d] for d in worn if dd[d] is not None]
    bx=[xd(d) for d in worn if bb[d] is not None]; by=[bb[d] for d in worn if bb[d] is not None]
    ax.plot(bx,by,color=col,lw=2.0,alpha=0.55,zorder=2,label="14-day rolling baseline")
    ax.scatter(xs,ys,s=34,color=col,edgecolor=BG,lw=0.6,zorder=3,label="worn-day value")
    # recovered April days ringed
    for d in recovered:
        if dd.get(d) is not None:
            ax.scatter([xd(d)],[dd[d]],s=150,facecolor="none",edgecolor=GREEN,lw=2.4,zorder=5)
    # 6/22 blip
    if dd.get(blip) is not None:
        ax.scatter([xd(blip)],[dd[blip]],s=150,facecolor="none",edgecolor=AMBER,lw=2.2,linestyle="--",zorder=5)
    ax.set_title(title,color=TEXT,fontsize=11.5,fontweight="bold",loc="left",pad=5)
    ax.text(0.995,0.90,note,transform=ax.transAxes,color=MUTED,fontsize=8.5,ha="right",va="top",style="italic")
    for sp in ax.spines.values(): sp.set_color("#3a2c1a")
    ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
    ax.tick_params(colors=MUTED,labelsize=8)
    ax.set_xlim(0,xd(x1))
# month ticks
xt=[];xl=[]
d=x0
while d<=x1:
    if d.day in (1,) or d==x0:
        xt.append(xd(d)); xl.append(d.strftime("%b %-d"))
    d+=timedelta(days=1)
# add key day ticks
for d,l in [(date(2026,5,19),"5/19"),(blip,"6/22")]:
    xt.append(xd(d)); xl.append(l)
axes[-1].set_xticks(xt); axes[-1].set_xticklabels(xl,color=MUTED,fontsize=8,rotation=0)

axes[0].legend(loc="lower left",bbox_to_anchor=(0,1.18),ncol=2,frameon=False,labelcolor=TEXT,fontsize=8.6)
# void label
axes[0].text(xd(VOID_A)+ (xd(VOID_B)-xd(VOID_A))/2, axes[0].get_ylim()[1]*0.97,
             "34-day biometric void\n5/20 – 6/21 (zero samples)",color=RED,fontsize=8.4,ha="center",va="top",fontweight="bold")

fig.suptitle("Autonomic baselines on the reunified timeline  ·  n=28 worn days (deviceA ∪ deviceB)  ·  n=1 (Yiming)",
             color=TEXT,fontsize=14.5,fontweight="bold",x=0.065,y=0.965,ha="left")
fig.text(0.065,0.915,
    "Green rings = 2 April days recovered by the stitch (4/10, 4/12) — both inside the dense block, densifying not extending.  "
    "Amber dashed = lone 6/22 blip.",
    color=MUTED,fontsize=9.6,ha="left")
fig.text(0.065,0.895,
    "The 34-day void separates the last dense day (5/19) from the entire June meeting corpus; reunification does not fill it. HRV ~2 samples/day → effects directional only.",
    color=MUTED,fontsize=9.6,ha="left")
fig.savefig(OUT,dpi=150,facecolor=BG)
print("wrote",OUT)
