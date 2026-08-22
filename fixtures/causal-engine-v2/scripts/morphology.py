"""
Deep long-term biometric morphology analysis over the 26 worn days (3/18-6/22).
Produces per-day aggregates, circadian morphology, HRV depletion signature,
and dark-themed matplotlib charts into DaoBrewStrategy/assets/biometrics-2026-07/.
Read-only: consumes raw HK pulls + reconstructed pattern_timeline.json.
"""
import json, statistics
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

DATA = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/data"
PV2  = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/pattern-v2"
ASSETS = "/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07"
PT = timezone(timedelta(hours=-7))

# ---- dark theme ----
plt.rcParams.update({
    "figure.facecolor":"#0d0f12","axes.facecolor":"#0d0f12","savefig.facecolor":"#0d0f12",
    "axes.edgecolor":"#3a3f47","axes.labelcolor":"#d7dce3","text.color":"#e7ecf3",
    "xtick.color":"#9aa4b2","ytick.color":"#9aa4b2","grid.color":"#1e242c",
    "font.family":"DejaVu Sans","font.size":10,"axes.titlesize":13,"axes.titleweight":"bold",
    "figure.dpi":140,"axes.grid":True,"grid.alpha":0.5,"axes.linewidth":0.8,
})
C = {"tension":"#4F7E51","overdrive":"#A52716","stagnation":"#887D43","constriction":"#5D5C58",
     "depletion":"#304E5C","balanced":"#4a5a6a","gap":"#1a1d22","hr":"#e0533d","hrv":"#3d9be0",
     "rhr":"#e0a13d","steps":"#7d5de0","accent":"#c8a24a"}
PMAP = {"TENSION":"tension","OVERDRIVE":"overdrive","STAGNATION":"stagnation",
        "CONSTRICTION":"constriction","DEPLETION":"depletion"}

def load(metric):
    d = json.load(open(f"{DATA}/hk_{metric}.json"))["data"]["samples"]
    return sorted((datetime.fromisoformat(s["timestamp"]), float(s["value"])) for s in d)

hr=load("heart_rate"); hrv=load("heart_rate_variability"); rhr=load("resting_heart_rate")
steps=load("step_count"); energy=load("active_energy_burned")
tl = json.load(open(f"{PV2}/pattern_timeline.json"))["timeline"]

def day_local(dt): return dt.astimezone(PT).strftime("%Y-%m-%d")

def daily_agg(samples, agg):
    by=defaultdict(list)
    for dt,v in samples: by[day_local(dt)].append(v)
    return {d:(sum(vs) if agg=="sum" else statistics.mean(vs)) for d,vs in by.items()}, {d:len(vs) for d,vs in by.items()}

hr_d,_=daily_agg(hr,"mean"); hrv_d,_=daily_agg(hrv,"mean"); rhr_d,_=daily_agg(rhr,"mean")
steps_d,_=daily_agg(steps,"sum"); energy_d,_=daily_agg(energy,"sum")
worn=sorted(hr_d)   # 26 days
print("worn days:",len(worn), worn[0],"->",worn[-1])

# rolling 14-worn-day baseline
def rolling(vals, w=14):
    out=[];
    for i in range(len(vals)):
        lo=max(0,i-w); win=[v for v in vals[max(0,i-w):i] if v is not None]
        out.append(statistics.mean(win) if win else None)
    return out
hr_series=[hr_d[d] for d in worn]; hrv_series=[hrv_d.get(d) for d in worn]
hr_base=rolling(hr_series); hrv_base=rolling(hrv_series)

# ---- save daily morphology json ----
morph=[]
for i,d in enumerate(worn):
    row=next((t for t in tl if t["date"]==d), {})
    morph.append({"date":d,"hr_mean":round(hr_d[d],1),"hrv_mean":round(hrv_d[d],1) if d in hrv_d else None,
        "rhr":round(rhr_d[d],1) if d in rhr_d else None,"steps":int(steps_d.get(d,0)),
        "active_energy":round(energy_d.get(d,0),1),
        "hrv_vs_14d_base_pct": (round((hrv_d[d]/hrv_base[i]-1)*100,1) if (d in hrv_d and hrv_base[i]) else None),
        "quadrant":row.get("quadrant"),"dominant_gated":row.get("dominant_pattern"),
        "dominant_raw":row.get("dominant_pattern_raw_pre_gate"),"balanced_flag":row.get("balanced_flag")})
json.dump(morph, open(f"{PV2}/daily_morphology.json","w"), indent=1)

# ================= CHART 1: master coverage + pattern strip =================
fig,axes=plt.subplots(3,1,figsize=(15,8),sharex=True,gridspec_kw={"height_ratios":[1.1,1.1,0.5]})
alldays=[t["date"] for t in tl]
x=np.arange(len(alldays))
# quadrant + gated pattern strip
ax=axes[0]
for i,t in enumerate(tl):
    q=t.get("source_quality")
    if q=="no_data":
        ax.axvspan(i-0.5,i+0.5,color=C["gap"]); continue
    p=t.get("dominant_pattern"); col=C.get(PMAP.get(p,"balanced"),"#555") if p else C["balanced"]
    if t.get("balanced_flag"): col=C["balanced"]
    ax.axvspan(i-0.5,i+0.5,color=col,alpha=0.92)
ax.set_yticks([]); ax.set_ylabel("App-shown\npattern\n(gated)",rotation=0,ha="right",va="center")
ax.set_title("DaoBrew biometric coverage & pattern morphology  ·  Mar 18 – Jul 2 2026  ·  n=1 (Yiming)  ·  gated = quadrant-forced pattern the app surfaces")
# raw pattern strip
ax=axes[1]
for i,t in enumerate(tl):
    if t.get("source_quality")=="no_data":
        ax.axvspan(i-0.5,i+0.5,color=C["gap"]); continue
    p=t.get("dominant_pattern_raw_pre_gate"); col=C.get(PMAP.get(p,"balanced"),"#555") if p else C["balanced"]
    ax.axvspan(i-0.5,i+0.5,color=col,alpha=0.92)
ax.set_yticks([]); ax.set_ylabel("Raw biometric\npattern\n(pre-gate)",rotation=0,ha="right",va="center")
# coverage bar
ax=axes[2]
cov=[1 if t["source_quality"]=="real_inference" else (0.4 if t["source_quality"]=="sparse_data" else 0) for t in tl]
ax.bar(x,cov,width=1.0,color=[C["accent"] if c==1 else ("#7a6a2a" if c>0 else C["gap"]) for c in cov])
ax.set_yticks([]); ax.set_ylabel("HR samples\nthat day",rotation=0,ha="right",va="center")
# x ticks weekly
ticks=[i for i,t in enumerate(tl) if datetime.strptime(t["date"],"%Y-%m-%d").weekday()==0]
ax.set_xticks(ticks); ax.set_xticklabels([tl[i]["date"][5:] for i in ticks],rotation=0)
ax.set_xlim(-0.5,len(tl)-0.5)
# legend
from matplotlib.patches import Patch
leg=[Patch(color=C[k],label=k.upper()) for k in ["tension","overdrive","stagnation","constriction","depletion"]]
leg+=[Patch(color=C["balanced"],label="BALANCED (no active pattern)"),Patch(color=C["gap"],label="NO DATA (watch not worn)")]
axes[0].legend(handles=leg,ncol=7,loc="upper center",bbox_to_anchor=(0.5,-0.02),frameon=False,fontsize=8)
# annotate the 34-day blackout
gi=[i for i,t in enumerate(tl) if t["source_quality"]=="no_data"]
axes[2].annotate("34-day watch blackout (5/20–6/21)",xy=(0.62,0.5),xycoords="axes fraction",color="#e08b3d",fontsize=9,ha="center")
plt.tight_layout()
plt.savefig(f"{ASSETS}/01_coverage_pattern_timeline.png",bbox_inches="tight")
plt.close()

# ================= CHART 2: biometric morphology (HR/HRV/RHR/steps) =================
fig,axes=plt.subplots(4,1,figsize=(15,10),sharex=True)
xi=np.arange(len(worn)); lab=[d[5:] for d in worn]
ax=axes[0]
ax.plot(xi,hr_series,"-o",color=C["hr"],ms=4,label="daily mean HR")
ax.plot(xi,[b if b else np.nan for b in hr_base],"--",color=C["hr"],alpha=0.5,label="14-worn-day rolling mean")
ax.set_ylabel("HR (bpm)"); ax.legend(fontsize=8,loc="upper right")
ax.set_title("Long-term biometric morphology across 26 worn days  ·  gaps compressed (worn days only, not calendar-spaced)")
ax=axes[1]
ax.plot(xi,hrv_series,"-o",color=C["hrv"],ms=4,label="daily mean HRV (SDNN)")
ax.plot(xi,[b if b else np.nan for b in hrv_base],"--",color=C["hrv"],alpha=0.5,label="14-worn-day rolling mean")
ax.axhspan(0,30,color="#402020",alpha=0.3); ax.text(0.2,12,"suppressed HRV band (<30ms)",color="#e08b8b",fontsize=8)
ax.set_ylabel("HRV (ms)"); ax.legend(fontsize=8,loc="upper right")
ax=axes[2]
rv=[rhr_d.get(d) for d in worn]
ax.plot(xi,[v if v else np.nan for v in rv],"-o",color=C["rhr"],ms=4,label="resting HR")
ax.set_ylabel("RHR (bpm)"); ax.legend(fontsize=8,loc="upper right")
ax=axes[3]
ax.bar(xi,[steps_d.get(d,0) for d in worn],color=C["steps"],alpha=0.85,label="daily steps")
ax.axhline(1200,color="#c8a24a",ls="--",alpha=0.6,label="wuxing steps ref (1200 = yang pivot)")
ax.set_ylabel("steps"); ax.legend(fontsize=8,loc="upper right")
ax.set_xticks(xi); ax.set_xticklabels(lab,rotation=90,fontsize=7)
plt.tight_layout(); plt.savefig(f"{ASSETS}/02_biometric_morphology.png",bbox_inches="tight"); plt.close()

# ================= CHART 3: raw vs gated pattern (the artifact) =================
real=[t for t in tl if t["source_quality"]=="real_inference"]
raw_c=Counter(t["dominant_pattern_raw_pre_gate"] for t in real)
gat_c=Counter(t["dominant_pattern"] for t in real)
order=["TENSION","OVERDRIVE","STAGNATION","CONSTRICTION","DEPLETION"]
fig,ax=plt.subplots(figsize=(10,6))
w=0.38; xi=np.arange(len(order))
ax.bar(xi-w/2,[raw_c.get(p,0) for p in order],w,color="#3d9be0",label="RAW biometric signal (pre-gate)")
ax.bar(xi+w/2,[gat_c.get(p,0) for p in order],w,color="#A52716",label="APP-SHOWN (after yin/yang eligibility gate)")
ax.set_xticks(xi); ax.set_xticklabels(order,fontsize=9)
ax.set_ylabel("# of worn days as dominant pattern")
ax.set_title("The gate rewrites the headline: raw cardiovascular signal is TENSION-dominant,\nbut low daily steps force the app to show DEPLETION/OVERDRIVE  ·  26 worn days")
ax.legend(fontsize=9)
for i,p in enumerate(order):
    ax.text(i-w/2,raw_c.get(p,0)+0.15,str(raw_c.get(p,0)),ha="center",color="#3d9be0",fontsize=9)
    ax.text(i+w/2,gat_c.get(p,0)+0.15,str(gat_c.get(p,0)),ha="center",color="#e0664d",fontsize=9)
plt.tight_layout(); plt.savefig(f"{ASSETS}/03_raw_vs_gated_pattern.png",bbox_inches="tight"); plt.close()

# ================= CHART 4: circadian HR morphology =================
byhour=defaultdict(list)
for dt,v in hr: byhour[dt.astimezone(PT).hour].append(v)
hours=list(range(24)); med=[np.median(byhour[h]) if byhour[h] else np.nan for h in hours]
p25=[np.percentile(byhour[h],25) if byhour[h] else np.nan for h in hours]
p75=[np.percentile(byhour[h],75) if byhour[h] else np.nan for h in hours]
cnt=[len(byhour[h]) for h in hours]
fig,(ax,ax2)=plt.subplots(2,1,figsize=(12,7),sharex=True,gridspec_kw={"height_ratios":[3,1]})
ax.fill_between(hours,p25,p75,color=C["hr"],alpha=0.2,label="IQR")
ax.plot(hours,med,"-o",color=C["hr"],ms=4,label="median HR")
ax.axvspan(0,6,color="#1b2735",alpha=0.5); ax.text(2.6,ax.get_ylim()[1]*0.96 if False else 62,"night",color="#7a90b0",fontsize=8,ha="center")
ax.set_ylabel("HR (bpm)"); ax.legend(fontsize=8)
ax.set_title("Circadian HR morphology  ·  all 5,642 HR samples pooled by Pacific hour-of-day  ·  reveals when the watch is actually worn")
ax2.bar(hours,cnt,color=C["accent"],alpha=0.8)
ax2.set_ylabel("# samples"); ax2.set_xlabel("hour of day (Pacific)"); ax2.set_xticks(range(0,24,2))
plt.tight_layout(); plt.savefig(f"{ASSETS}/04_circadian_hr.png",bbox_inches="tight"); plt.close()

# ================= CHART 5: HRV depletion signature vs baseline =================
fig,ax=plt.subplots(figsize=(12,5.5))
dev=[(m["date"],m["hrv_vs_14d_base_pct"]) for m in morph if m["hrv_vs_14d_base_pct"] is not None]
xi=np.arange(len(dev))
vals=[d[1] for d in dev]
ax.bar(xi,vals,color=[C["depletion"] if v<0 else C["tension"] for v in vals],alpha=0.9)
ax.axhline(0,color="#888",lw=0.8)
ax.set_xticks(xi); ax.set_xticklabels([d[0][5:] for d in dev],rotation=90,fontsize=7)
ax.set_ylabel("HRV vs 14-worn-day baseline (%)")
ax.set_title("HRV depletion signature  ·  each worn day's mean HRV vs personal rolling baseline  ·  below-zero = suppressed parasympathetic reserve")
plt.tight_layout(); plt.savefig(f"{ASSETS}/05_hrv_depletion_signature.png",bbox_inches="tight"); plt.close()

# ---- summary stats ----
allhr=[v for _,v in hr]; allhrv=[v for _,v in hrv]; allrhr=[v for _,v in rhr]
print("HR   mean %.1f  range %.0f-%.0f"%(statistics.mean(allhr),min(allhr),max(allhr)))
print("HRV  mean %.1f  range %.0f-%.0f  n=%d"%(statistics.mean(allhrv),min(allhrv),max(allhrv),len(allhrv)))
print("RHR  mean %.1f  range %.0f-%.0f"%(statistics.mean(allrhr),min(allrhr),max(allrhr)))
print("steps/worn-day median %d"%int(statistics.median([steps_d.get(d,0) for d in worn])))
print("worn days with HRV<30ms:", sum(1 for d in worn if hrv_d.get(d,99)<30),"/",len(worn))
print("charts ->",ASSETS)
import os
for f in sorted(os.listdir(ASSETS)): print("  ",f)
