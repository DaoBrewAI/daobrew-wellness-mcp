"""
Morphology stage — long-term biometric statistical deep-dive (越详细越好).

Consumes ONLY: raw HealthKit pulls (read-only) + reconstructed pattern_timeline.json
+ calendar_events.json + meetings.json.  No server, no DB, no model re-run.

Produces:
  - morphology.json            (all numeric outputs, honest CIs/flags)
  - charts 06..13 into DaoBrewStrategy/assets/biometrics-2026-07/  (warm dark theme)

Honesty rules baked in:
  * worn days are NOT calendar-continuous (26 worn days spanning 3/18-6/22, 34-day
    blackout 5/20-6/21, lone straggler 6/22). Rolling baselines are calendar-anchored
    with an explicit min-worn-days requirement; where thin, flagged low_confidence.
  * HRV n=77 total (~2/day). Every HRV effect is labelled directional unless noted.
  * per-pattern physiology LEADS with RAW pre-gate pattern (the biometrically
    meaningful label). The gated/app-shown pattern is partly circular (DEPLETION==low
    steps by gate construction) and reported only as such.
  * CONSTRICTION(metal) is near-unmeasurable here (3 respiratory samples ever, no
    location/social signals) — n=1 raw day is anecdotal noise, flagged.
"""
import json, statistics, math, os, random
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.lines import Line2D

random.seed(7); np.random.seed(7)

DATA = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/data"
PV2  = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/pattern-v2"
ASSETS = "/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07"
os.makedirs(ASSETS, exist_ok=True)
PT = timezone(timedelta(hours=-7))  # US/Pacific PDT (whole Mar-Jul window is DST)

# ---------------- warm dark theme (CEO brief: #1a1208 bg, amber/peach) ----------------
BG="#1a1208"; PANEL="#20160c"; FG="#f2e7d5"; MUT="#b59b78"; GRID="#3a2c1a"
AMBER="#e8a23c"; PEACH="#f2b98a"
plt.rcParams.update({
    "figure.facecolor":BG,"axes.facecolor":BG,"savefig.facecolor":BG,
    "axes.edgecolor":"#4a3a24","axes.labelcolor":FG,"text.color":FG,
    "xtick.color":MUT,"ytick.color":MUT,"grid.color":GRID,
    "font.family":"DejaVu Sans","font.size":11,"axes.titlesize":14,
    "axes.titleweight":"bold","axes.titlecolor":FG,
    "figure.dpi":140,"axes.grid":True,"grid.alpha":0.35,"axes.linewidth":1.0,
    "legend.framealpha":0.0,"legend.fontsize":9,
})
PCOL={"TENSION":"#7fb069","OVERDRIVE":"#e0563c","STAGNATION":"#c9a227",
      "CONSTRICTION":"#c9bfa8","DEPLETION":"#5a93b8","BALANCED":"#8a7a5a"}
NODATA="#2a1f12"
CHR="#e8663c"; CHRV="#5ab0d8"; CRHR="#e8a23c"; CSTEP="#c9a36a"; CENE="#d98a4a"
ORDER=["TENSION","OVERDRIVE","STAGNATION","CONSTRICTION","DEPLETION"]

def savefig(fig, name):
    fig.savefig(f"{ASSETS}/{name}", bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print("chart ->", name)

# ---------------- load ----------------
def load(metric):
    d=json.load(open(f"{DATA}/hk_{metric}.json"))["data"]["samples"]
    return sorted((datetime.fromisoformat(s["timestamp"]).astimezone(PT), float(s["value"])) for s in d)

hr=load("heart_rate"); hrv=load("heart_rate_variability"); rhr=load("resting_heart_rate")
steps=load("step_count"); energy=load("active_energy_burned"); resp=load("respiratory_rate")
tl=json.load(open(f"{PV2}/pattern_timeline.json"))["timeline"]
tl_by={t["date"]:t for t in tl}
cal=json.load(open(f"{DATA}/calendar_events.json"))
mtg=json.load(open(f"{DATA}/meetings.json"))

def dkey(dt): return dt.strftime("%Y-%m-%d")

# calendar/meeting density per Pacific day
events_by_day=defaultdict(list)
for e in cal:
    if e.get("ts"): events_by_day[dkey(datetime.fromtimestamp(e["ts"],PT))].append(e.get("title","")[:60])
mtg_by_day=defaultdict(list)
for m in mtg:
    d=m.get("date") or (dkey(datetime.fromtimestamp(m["ts"],PT)) if m.get("ts") else None)
    if d: mtg_by_day[d].append(m.get("title","")[:40])

# ---------------- per-day feature table (recomputed cleanly from raw) ----------------
def bucket(samples):
    b=defaultdict(list)
    for dt,v in samples: b[dkey(dt)].append(v)
    return b
hrB=bucket(hr); hrvB=bucket(hrv); rhrB=bucket(rhr); stB=bucket(steps); enB=bucket(energy)

def cv(vals):
    if len(vals)<2: return None
    m=statistics.mean(vals)
    return (statistics.pstdev(vals)/m) if m else None

days=[]
for d in sorted(hrB):                       # worn days = days with HR samples (26)
    h=hrB[d]
    row={
        "date":d,
        "hr_mean":round(statistics.mean(h),1),
        "hr_p10":round(float(np.percentile(h,10)),1),   # tonic (low-activity) HR proxy
        "hr_p90":round(float(np.percentile(h,90)),1),
        "hr_max":round(max(h),1),
        "hr_cv":round(cv(h),4) if cv(h) is not None else None,  # HR lability -> drives wood/TENSION
        "n_hr":len(h),
        "hrv_mean":round(statistics.mean(hrvB[d]),1) if d in hrvB else None,
        "hrv_min":round(min(hrvB[d]),1) if d in hrvB else None,
        "n_hrv":len(hrvB.get(d,[])),
        "rhr":round(statistics.mean(rhrB[d]),1) if d in rhrB else None,
        "n_rhr":len(rhrB.get(d,[])),
        "steps":int(sum(stB.get(d,[0]))),
        "energy":round(sum(enB.get(d,[0])),1),
        "n_meetings":len(mtg_by_day.get(d,[]))+len(events_by_day.get(d,[])),
    }
    t=tl_by.get(d,{})
    row["quadrant"]=t.get("quadrant")
    row["dominant_raw"]=t.get("dominant_pattern_raw_pre_gate")
    row["dominant_gated"]=t.get("dominant_pattern")
    row["yin"]=t.get("yin_score"); row["yang"]=t.get("yang_score")
    days.append(row)

worn=[r["date"] for r in days]
print("worn days:",len(worn),worn[0],"->",worn[-1])
dt_worn=[datetime.strptime(d,"%Y-%m-%d") for d in worn]

# ================= 1. BASELINES & DRIFT =================
def calendar_rolling(metric, win_days, min_worn=2):
    """calendar-anchored trailing rolling mean; None where < min_worn worn days in window."""
    out=[]
    for i,d in enumerate(dt_worn):
        lo=d-timedelta(days=win_days-1)
        vals=[days[j][metric] for j in range(i+1)
              if lo<=dt_worn[j]<=d and days[j][metric] is not None]
        out.append((round(statistics.mean(vals),2), len(vals)) if len(vals)>=min_worn else (None,len(vals)))
    return out

baselines={}
for metric in ["hrv_mean","rhr","hr_p10","hr_mean","steps","energy"]:
    baselines[metric]={f"roll{w}":calendar_rolling(metric,w) for w in (7,14,28)}

def changepoint(metric, min_seg=4, nperm=5000):
    """single-split binary segmentation on worn-day-ordered series; permutation p. Directional (small n)."""
    xs=[(r["date"],r[metric]) for r in days if r[metric] is not None]
    x=np.array([v for _,v in xs]); dts=[d for d,_ in xs]; n=len(x)
    if n < 2*min_seg: return None
    def maxt(a):
        best=(-1,None)
        for k in range(min_seg,n-min_seg):
            m1,m2=a[:k].mean(),a[k:].mean()
            s1,s2=a[:k].std(ddof=1),a[k:].std(ddof=1)
            se=math.sqrt(s1**2/k+s2**2/(n-k)) or 1e-9
            t=abs(m2-m1)/se
            if t>best[0]: best=(t,k)
        return best
    tobs,kbest=maxt(x)
    cnt=0
    for _ in range(nperm):
        p=x.copy(); np.random.shuffle(p)
        if maxt(p)[0]>=tobs: cnt+=1
    pval=(cnt+1)/(nperm+1)
    pooled=math.sqrt(((kbest-1)*x[:kbest].std(ddof=1)**2+(n-kbest-1)*x[kbest:].std(ddof=1)**2)/(n-2)) or 1e-9
    return {"metric":metric,"n":n,"split_index":int(kbest),"split_date":dts[kbest],
            "before_mean":round(float(x[:kbest].mean()),2),"after_mean":round(float(x[kbest:].mean()),2),
            "before_n":int(kbest),"after_n":int(n-kbest),
            "cohens_d":round(float((x[kbest:].mean()-x[:kbest].mean())/pooled),2),
            "perm_p":round(pval,4),"tstat":round(float(tobs),2)}

changepoints={m:changepoint(m) for m in ["hrv_mean","rhr","hr_p10","steps","energy"]}

# linear trend (OLS) per metric over worn-day index (directional)
def trend(metric):
    xs=[(i,r[metric]) for i,r in enumerate(days) if r[metric] is not None]
    if len(xs)<4: return None
    xi=np.array([a for a,_ in xs],float); y=np.array([b for _,b in xs],float)
    A=np.vstack([xi,np.ones_like(xi)]).T
    slope,intercept=np.linalg.lstsq(A,y,rcond=None)[0]
    yhat=A@[slope,intercept]; ss_res=((y-yhat)**2).sum(); ss_tot=((y-y.mean())**2).sum()
    r2=1-ss_res/ss_tot if ss_tot else 0
    return {"slope_per_worn_day":round(float(slope),3),"r2":round(float(r2),3),"n":len(xs),
            "net_change_over_window":round(float(slope*(xi[-1]-xi[0])),1)}
trends={m:trend(m) for m in ["hrv_mean","rhr","hr_p10","hr_mean","steps","energy"]}

# regimes (named, honest — all within worn window; NO mid-June regime because no data there)
def regime_stats(lo,hi):
    sub=[r for r in days if lo<=r["date"]<=hi]
    def mm(k):
        v=[r[k] for r in sub if r[k] is not None]
        return round(statistics.mean(v),1) if v else None
    return {"span":f"{lo}..{hi}","n_worn":len(sub),"hrv_mean":mm("hrv_mean"),
            "rhr_mean":mm("rhr"),"hr_p10_mean":mm("hr_p10"),"hr_mean":mm("hr_mean"),
            "steps_median":int(statistics.median([r["steps"] for r in sub])) if sub else None,
            "raw_pattern_mix":dict(Counter(r["dominant_raw"] for r in sub))}
regimes={
    "R1_late_march_high_reserve":regime_stats("2026-03-18","2026-03-30"),
    "R2_april_grind":regime_stats("2026-04-08","2026-04-30"),
    "R3_may_activity_ramp":regime_stats("2026-05-04","2026-05-19"),
    "R4_lone_june_reading":regime_stats("2026-06-22","2026-06-22"),
}

# ================= 2. RHYTHMS =================
# circadian
byhour_hr=defaultdict(list); byhour_hrv=defaultdict(list); byhour_steps=defaultdict(list)
for dt,v in hr: byhour_hr[dt.hour].append(v)
for dt,v in hrv: byhour_hrv[dt.hour].append(v)
for dt,v in steps: byhour_steps[dt.hour].append(v)
circadian={"hr":{h:{"median":round(float(np.median(byhour_hr[h])),1),"p25":round(float(np.percentile(byhour_hr[h],25)),1),
                    "p75":round(float(np.percentile(byhour_hr[h],75)),1),"n":len(byhour_hr[h])} for h in range(24) if byhour_hr[h]},
           "hrv_3h_bins":{}, "wear_samples_by_hour":{h:len(byhour_hr[h]) for h in range(24)}}
for b in range(0,24,3):
    vs=[v for h in range(b,b+3) for v in byhour_hrv[h]]
    if vs: circadian["hrv_3h_bins"][f"{b:02d}-{b+3:02d}"]={"mean":round(statistics.mean(vs),1),"n":len(vs)}

# weekly (day-of-week)
DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
weekly={}
for i,name in enumerate(DOW):
    sub=[r for r in days if datetime.strptime(r["date"],"%Y-%m-%d").weekday()==i]
    def wm(k):
        v=[r[k] for r in sub if r[k] is not None]; return round(statistics.mean(v),1) if v else None
    weekly[name]={"n_worn":len(sub),"hr_p10":wm("hr_p10"),"hrv_mean":wm("hrv_mean"),
                  "rhr":wm("rhr"),"steps":int(statistics.mean([r["steps"] for r in sub])) if sub else None,
                  "energy":wm("energy"),"n_meetings":round(statistics.mean([r["n_meetings"] for r in sub]),1) if sub else None}

# work-session coupling: meeting/event density vs biometrics (Spearman + bootstrap CI)
def spearman(a,b):
    pairs=[(x,y) for x,y in zip(a,b) if x is not None and y is not None]
    if len(pairs)<5: return None
    xa=[p[0] for p in pairs]; ya=[p[1] for p in pairs]
    def rank(v):
        order=sorted(range(len(v)),key=lambda i:v[i]); rk=[0]*len(v)
        i=0
        while i<len(v):
            j=i
            while j+1<len(v) and v[order[j+1]]==v[order[i]]: j+=1
            avg=(i+j)/2+1
            for k in range(i,j+1): rk[order[k]]=avg
            i=j+1
        return rk
    rx,ry=rank(xa),rank(ya); n=len(xa)
    mx=statistics.mean(rx); my=statistics.mean(ry)
    num=sum((rx[i]-mx)*(ry[i]-my) for i in range(n))
    den=math.sqrt(sum((rx[i]-mx)**2 for i in range(n))*sum((ry[i]-my)**2 for i in range(n))) or 1e-9
    rho=num/den
    # bootstrap CI
    boot=[]
    for _ in range(3000):
        idx=[random.randrange(n) for _ in range(n)]
        bx=[xa[i] for i in idx]; by=[ya[i] for i in idx]
        rbx,rby=rank(bx),rank(by); bmx=statistics.mean(rbx); bmy=statistics.mean(rby)
        bn=sum((rbx[i]-bmx)*(rby[i]-bmy) for i in range(n))
        bd=math.sqrt(sum((rbx[i]-bmx)**2 for i in range(n))*sum((rby[i]-bmy)**2 for i in range(n))) or 1e-9
        boot.append(bn/bd)
    return {"rho":round(rho,2),"n":n,"ci95":[round(np.percentile(boot,2.5),2),round(np.percentile(boot,97.5),2)]}

meet=[r["n_meetings"] for r in days]
coupling={
    "meetings_vs_steps":spearman(meet,[r["steps"] for r in days]),
    "meetings_vs_energy":spearman(meet,[r["energy"] for r in days]),
    "meetings_vs_hr_mean":spearman(meet,[r["hr_mean"] for r in days]),
    "meetings_vs_hrv":spearman(meet,[r["hrv_mean"] for r in days]),
    "meetings_vs_rhr":spearman(meet,[r["rhr"] for r in days]),
    "steps_vs_hr_mean":spearman([r["steps"] for r in days],[r["hr_mean"] for r in days]),
}

# ================= 3. PER-PATTERN PHYSIOLOGY (raw pre-gate primary) =================
def group_stats(label_key):
    groups=defaultdict(lambda:defaultdict(list))
    for r in days:
        g=r[label_key]
        if not g: continue
        for k in ["hrv_mean","rhr","hr_mean","hr_p10","hr_cv","steps","energy"]:
            if r[k] is not None: groups[g][k].append(r[k])
    out={}
    for g,mets in groups.items():
        out[g]={"n_days":sum(1 for r in days if r[label_key]==g),
                "dates":[r["date"] for r in days if r[label_key]==g]}
        for k,vs in mets.items():
            out[g][k]={"mean":round(statistics.mean(vs),1),
                       "sd":round(statistics.pstdev(vs),1) if len(vs)>1 else None,
                       "n":len(vs),"min":round(min(vs),1),"max":round(max(vs),1)}
    return out
pattern_phys_raw=group_stats("dominant_raw")
pattern_phys_gated=group_stats("dominant_gated")

def hedges_g(a,b,nboot=5000):
    a=[x for x in a if x is not None]; b=[x for x in b if x is not None]
    if len(a)<2 or len(b)<2: return None
    na,nb=len(a),len(b); ma,mb=statistics.mean(a),statistics.mean(b)
    sa,sb=statistics.stdev(a),statistics.stdev(b)
    sp=math.sqrt(((na-1)*sa**2+(nb-1)*sb**2)/(na+nb-2)) or 1e-9
    d=(ma-mb)/sp; J=1-3/(4*(na+nb)-9); g=d*J
    boot=[]
    for _ in range(nboot):
        ba=[a[random.randrange(na)] for _ in range(na)]; bb=[b[random.randrange(nb)] for _ in range(nb)]
        bsa,bsb=statistics.stdev(ba),statistics.stdev(bb)
        bsp=math.sqrt(((na-1)*bsa**2+(nb-1)*bsb**2)/(na+nb-2)) or 1e-9
        boot.append((statistics.mean(ba)-statistics.mean(bb))/bsp*J)
    return {"hedges_g":round(g,2),"ci95":[round(np.percentile(boot,2.5),2),round(np.percentile(boot,97.5),2)],
            "mean_a":round(ma,1),"mean_b":round(mb,1),"n_a":na,"n_b":nb}

def vals(pat,metric): return [r[metric] for r in days if r["dominant_raw"]==pat and r[metric] is not None]
effect_TENvsOVR={m:hedges_g(vals("TENSION",m),vals("OVERDRIVE",m))
                 for m in ["hrv_mean","rhr","hr_mean","hr_p10","hr_cv","steps","energy"]}

# ================= 4. NOTABLE EPISODES (top acute events) =================
# personal expanding baseline (leave-one-day-out mean) for HRV & RHR & hr_p10
def loo_z(metric):
    xs=[(r["date"],r[metric]) for r in days if r[metric] is not None]
    vals_=[v for _,v in xs]; out={}
    for i,(d,v) in enumerate(xs):
        others=[vals_[j] for j in range(len(xs)) if j!=i]
        mu=statistics.mean(others); sd=statistics.pstdev(others) or 1e-9
        out[d]={"value":v,"z":round((v-mu)/sd,2),"pct_vs_mean":round((v/mu-1)*100,1)}
    return out
hrv_z=loo_z("hrv_mean"); rhr_z=loo_z("rhr"); hrp10_z=loo_z("hr_p10")

episodes=[]
for r in days:
    d=r["date"]
    # acute = autonomic-stress markers ONLY (HRV suppression + RHR elevation), per brief.
    # tonic HR (hr_p10) is kept as CONTEXT, not scored, so exercise-heavy days don't masquerade as stress.
    acute=0.0
    if d in hrv_z: acute+=max(0,-hrv_z[d]["z"])  # low HRV = acute
    if d in rhr_z: acute+=max(0, rhr_z[d]["z"])   # high RHR = acute
    ctx=(mtg_by_day.get(d,[])+events_by_day.get(d,[]))
    episodes.append({"date":d,"acute_score":round(acute,2),
        "hrv_mean":r["hrv_mean"],"hrv_z":hrv_z.get(d,{}).get("z"),
        "rhr":r["rhr"],"rhr_z":rhr_z.get(d,{}).get("z"),
        "hr_max":r["hr_max"],"hr_p10":r["hr_p10"],"hr_p10_z":hrp10_z.get(d,{}).get("z"),
        "steps":r["steps"],"quadrant":r["quadrant"],
        "dominant_raw":r["dominant_raw"],"dominant_gated":r["dominant_gated"],
        "context":ctx[:3]})
top_episodes=sorted(episodes,key=lambda e:e["acute_score"],reverse=True)[:10]
# also biggest single HRV dips and RHR spikes explicitly
hrv_dips=sorted([{"date":d,**v} for d,v in hrv_z.items()],key=lambda x:x["z"])[:6]
rhr_spikes=sorted([{"date":d,**v} for d,v in rhr_z.items()],key=lambda x:-x["z"])[:6]

# ================= WRITE morphology.json =================
allhr=[v for _,v in hr]; allhrv=[v for _,v in hrv]; allrhr=[v for _,v in rhr]
out={
 "generated_at":datetime.now(timezone.utc).isoformat(),
 "stage":"morphology_deep",
 "inputs":{"hr_samples":len(hr),"hrv_samples":len(hrv),"rhr_samples":len(rhr),
           "steps_samples":len(steps),"energy_samples":len(energy),"resp_samples":len(resp),
           "worn_days":len(worn),"worn_span":[worn[0],worn[-1]]},
 "coverage_caveats":{
   "worn_days_not_continuous":True,
   "blackout":"2026-05-20..2026-06-21 (34 cal days, zero samples)",
   "post_blackout":"only 2026-06-22 has data; nothing after 6/22; live /state/current is empty-data fallback",
   "hrv_n_total":len(allhrv),"hrv_per_day_median":round(statistics.median([r["n_hrv"] for r in days if r["n_hrv"]]),1),
   "rhr_n_total":len(allrhr),"resp_n_total":len(resp),
   "metal_unmeasurable":"CONSTRICTION needs respiratory+location+social signals; 3 resp samples ever, no location/app data -> raw metal is noise",
   "wear_time_confound":"HR/HRV only recorded while worn; circadian & daily means skew to worn (mostly daytime/active) hours"},
 "summary_stats":{
   "hr":{"mean":round(statistics.mean(allhr),1),"min":min(allhr),"max":max(allhr),"n":len(allhr)},
   "hrv":{"mean":round(statistics.mean(allhrv),1),"min":round(min(allhrv),1),"max":round(max(allhrv),1),"n":len(allhrv),
          "note":"pooled across samples; day-mean HRV never < 30ms -> no day-resolution suppression signature"},
   "rhr":{"mean":round(statistics.mean(allrhr),1),"min":min(allrhr),"max":max(allrhr),"n":len(allrhr)},
   "steps_per_worn_day_median":int(statistics.median([r["steps"] for r in days]))},
 "per_day":days,
 "baselines_rolling":baselines,
 "changepoints":changepoints,
 "trends_ols":trends,
 "regimes":regimes,
 "circadian":circadian,
 "weekly":weekly,
 "work_session_coupling":coupling,
 "pattern_physiology_raw_pre_gate":pattern_phys_raw,
 "pattern_physiology_gated_app_shown":pattern_phys_gated,
 "effect_TENSION_vs_OVERDRIVE_raw":effect_TENvsOVR,
 "notable_episodes_top10":top_episodes,
 "biggest_hrv_dips":hrv_dips,
 "biggest_rhr_spikes":rhr_spikes,
}
json.dump(out,open(f"{PV2}/morphology.json","w"),indent=1,default=str)
print("wrote morphology.json")
print("changepoints:",{k:(v["split_date"],v["before_mean"],"->",v["after_mean"],"p=",v["perm_p"]) for k,v in changepoints.items() if v})
print("TEN vs OVR HRV:",effect_TENvsOVR["hrv_mean"])
print("TEN vs OVR RHR:",effect_TENvsOVR["rhr"])
print("coupling meet~steps:",coupling["meetings_vs_steps"])

# ============================================================================
#  CHARTS 06..13
# ============================================================================
xi=np.arange(len(worn)); lab=[d[5:] for d in worn]

# ---- 06 baseline drift + changepoints + regimes ----
fig,axes=plt.subplots(4,1,figsize=(15,12),sharex=True)
def draw_regimes(ax):
    spans=[("2026-03-18","2026-03-30","#3a2c1a","R1 late-Mar\nhigh reserve"),
           ("2026-04-08","2026-04-30","#2c2414","R2 April grind"),
           ("2026-05-04","2026-05-19","#3a2414","R3 May ramp"),
           ("2026-06-22","2026-06-22","#241a10","R4 lone")]
    for lo,hi,c,txt in spans:
        i0=worn.index(lo) if lo in worn else None
        i1=worn.index(hi) if hi in worn else None
        if i0 is not None and i1 is not None:
            ax.axvspan(i0-0.5,i1+0.5,color=c,alpha=0.5,zorder=0)
def plot_metric(ax,metric,color,label,unit):
    y=[r[metric] for r in days]
    draw_regimes(ax)
    ax.plot(xi,[v if v is not None else np.nan for v in y],"-o",color=color,ms=5,lw=1.8,label=label,zorder=3)
    for w,st,al in [(7,":",0.55),(14,"--",0.75),(28,"-",0.5)]:
        rb=[v for v,_ in baselines[metric][f"roll{w}"]]
        ax.plot(xi,[v if v is not None else np.nan for v in rb],st,color=color,alpha=al,lw=1.3,label=f"{w}d rolling")
    cp=changepoints.get(metric)
    if cp and cp["split_date"] in worn:
        k=worn.index(cp["split_date"])
        ax.axvline(k-0.5,color=AMBER,lw=1.6,ls="-",alpha=0.9,zorder=4)
        ax.annotate(f"changepoint {cp['split_date'][5:]}\n{cp['before_mean']}→{cp['after_mean']} (d={cp['cohens_d']}, p={cp['perm_p']})",
                    xy=(k-0.5,ax.get_ylim()[1]),xytext=(k+0.3,0.86),textcoords=("data","axes fraction"),
                    color=AMBER,fontsize=8.5,va="top")
    ax.set_ylabel(f"{label}\n({unit})"); ax.legend(ncol=5,loc="upper left",fontsize=8)
plot_metric(axes[0],"hrv_mean",CHRV,"daily mean HRV","ms")
axes[0].set_title("Baseline drift & changepoints across 26 worn days  ·  x-axis = worn days only (gaps compressed)  ·  regime bands shaded  ·  small-n → directional")
plot_metric(axes[1],"rhr",CRHR,"resting HR","bpm")
plot_metric(axes[2],"hr_p10",CHR,"tonic HR (daily p10)","bpm")
axes[3].bar(xi,[r["steps"] for r in days],color=CSTEP,alpha=0.85); draw_regimes(axes[3])
axes[3].set_ylabel("daily steps"); axes[3].axhline(10000,color=AMBER,ls="--",alpha=0.5,lw=1)
axes[3].set_xticks(xi); axes[3].set_xticklabels(lab,rotation=90,fontsize=8)
axes[3].annotate("34-day watch blackout begins →",xy=(len(worn)-1.5,0.8),xycoords=("data","axes fraction"),
                 color="#e08b3d",fontsize=9,ha="right")
savefig(fig,"06_baseline_drift.png")

# ---- 07 pattern calendar heatmap (raw + gated) ----
def calendar_grid(field):
    start=datetime(2026,3,16)  # Monday before 3/18
    cells={}
    for t in tl:
        dd=datetime.strptime(t["date"],"%Y-%m-%d"); wk=(dd-start).days//7; wd=dd.weekday()
        cells[(wk,wd)]=t
    return cells,start
cells,start=calendar_grid("x")
nweeks=max(k[0] for k in cells)+1
fig,axes=plt.subplots(2,1,figsize=(15,7))
for ax,field,ttl in [(axes[0],"dominant_pattern_raw_pre_gate","RAW biometric pattern (pre-gate) — the physiologically meaningful signal"),
                     (axes[1],"dominant_pattern","APP-SHOWN pattern (after yin/yang eligibility gate) — DEPLETION is gate-manufactured")]:
    for (wk,wd),t in cells.items():
        p=t.get(field); q=t.get("source_quality")
        col=NODATA if q=="no_data" else PCOL.get(p,"#8a7a5a") if p else PCOL["BALANCED"]
        ax.add_patch(plt.Rectangle((wk,6-wd),0.94,0.94,facecolor=col,edgecolor=BG,lw=1.5))
    ax.set_xlim(-0.5,nweeks+0.5); ax.set_ylim(-0.5,7.5); ax.set_aspect("equal")
    ax.set_yticks([6-i+0.47 for i in range(7)]); ax.set_yticklabels(DOW,fontsize=9)
    wkstarts={}
    for (wk,wd),t in cells.items(): wkstarts.setdefault(wk,t["date"][5:])
    ax.set_xticks([w+0.47 for w in sorted(wkstarts)]); ax.set_xticklabels([wkstarts[w] for w in sorted(wkstarts)],fontsize=8)
    ax.set_title(ttl,fontsize=12); ax.grid(False)
    for sp in ax.spines.values(): sp.set_visible(False)
leg=[Patch(color=PCOL[p],label=p) for p in ORDER]+[Patch(color=PCOL["BALANCED"],label="BALANCED (no active pattern, n=1)"),Patch(color=NODATA,label="NOT WORN")]
axes[1].legend(handles=leg,ncol=7,loc="upper center",bbox_to_anchor=(0.5,-0.15),fontsize=8.5)
fig.suptitle("Pattern calendar morphology  ·  Mar–Jul 2026  ·  n=1 (Yiming)  ·  raw signal is TENSION-led; the gate rewrites it to DEPLETION",
             fontsize=13.5,color=FG,y=0.98)
savefig(fig,"07_pattern_calendar_heatmap.png")

# ---- 08 per-pattern physiology distributions (raw) ----
fig,axes=plt.subplots(1,4,figsize=(19,6))
def strip(ax,metric,ttl,unit,sep=None):
    data=[]; labels=[]; cols=[]
    for p in ORDER:
        vs=[r[metric] for r in days if r["dominant_raw"]==p and r[metric] is not None]
        if vs: data.append(vs); labels.append(f"{p}\nn={len(vs)}"); cols.append(PCOL[p])
    bp=ax.boxplot(data,patch_artist=True,widths=0.5,showfliers=False,medianprops=dict(color=BG,lw=2))
    for patch,c in zip(bp["boxes"],cols): patch.set_facecolor(c); patch.set_alpha(0.55)
    for wk in bp["whiskers"]+bp["caps"]: wk.set_color(MUT)
    for i,vs in enumerate(data):
        jx=np.random.normal(i+1,0.06,len(vs))
        ax.scatter(jx,vs,color=cols[i],edgecolor=BG,s=42,zorder=3,lw=0.6)
    ax.set_xticks(range(1,len(labels)+1)); ax.set_xticklabels(labels,fontsize=8.5)
    ax.set_ylabel(f"{ttl} ({unit})"); ax.set_title(ttl,fontsize=12)
    if sep: ax.text(0.5,0.965,sep,transform=ax.transAxes,ha="center",va="top",color=AMBER,fontsize=8.5)
g=effect_TENvsOVR
strip(axes[0],"hr_mean","whole-day HR (mean)","bpm",f"TEN vs OVR g={g['hr_mean']['hedges_g']}  ← REAL separator")
strip(axes[1],"hrv_mean","daily mean HRV","ms",f"TEN vs OVR g={g['hrv_mean']['hedges_g']}  (CI crosses 0 → null)")
strip(axes[2],"rhr","resting HR","bpm",f"TEN vs OVR g={g['rhr']['hedges_g']}  (null)")
strip(axes[3],"steps","daily steps","count","STAGNATION = the low-step tail")
fig.suptitle("Per-pattern physiology by RAW pattern  ·  TENSION vs OVERDRIVE separate on whole-day HR LEVEL (g=-3.26), NOT on the "
             "autonomic markers HRV/resting-HR (CIs cross 0)  ·  i.e. patterns re-encode cardio load, not autonomic state  ·  STAGNATION n=3 / CONSTRICTION absent → anecdotal",
             fontsize=11.5,color=FG,y=1.03)
savefig(fig,"08_per_pattern_physiology.png")

# ---- 09 circadian HR + HRV ----
fig,(ax,ax2)=plt.subplots(2,1,figsize=(13,7.5),sharex=True,gridspec_kw={"height_ratios":[3,1]})
hrs=sorted(circadian["hr"]); med=[circadian["hr"][h]["median"] for h in hrs]
p25=[circadian["hr"][h]["p25"] for h in hrs]; p75=[circadian["hr"][h]["p75"] for h in hrs]
ax.fill_between(hrs,p25,p75,color=CHR,alpha=0.18,label="HR IQR")
ax.plot(hrs,med,"-o",color=CHR,ms=5,lw=2,label="median HR")
ax.axvspan(0,6,color="#241a10",alpha=0.6)
# HRV 3h bins on twin axis
axb=ax.twinx()
for b,st in circadian["hrv_3h_bins"].items():
    c0=int(b[:2]); axb.scatter([c0+1.5],[st["mean"]],color=CHRV,s=90,zorder=5,edgecolor=BG)
    axb.annotate(f"n={st['n']}",(c0+1.5,st["mean"]),textcoords="offset points",xytext=(0,8),color=CHRV,fontsize=8,ha="center")
axb.plot([int(b[:2])+1.5 for b in circadian["hrv_3h_bins"]],[st["mean"] for st in circadian["hrv_3h_bins"].values()],
         "--",color=CHRV,alpha=0.6,label="mean HRV (3h bins)")
axb.set_ylabel("HRV (ms)",color=CHRV); axb.tick_params(axis="y",colors=CHRV); axb.grid(False)
ax.set_ylabel("HR (bpm)",color=CHR)
ax.set_title("Circadian morphology  ·  5,642 HR samples + 77 HRV samples pooled by Pacific hour-of-day  ·  wear-time confounded (see counts below)")
ax.legend(loc="upper left",fontsize=9); axb.legend(loc="upper right",fontsize=9)
cnt=[circadian["wear_samples_by_hour"][h] for h in range(24)]
ax2.bar(range(24),cnt,color=AMBER,alpha=0.8)
ax2.set_ylabel("# HR samples\n(=wear time)"); ax2.set_xlabel("hour of day (Pacific)"); ax2.set_xticks(range(0,24,2))
savefig(fig,"09_circadian_profile.png")

# ---- 10 weekly structure ----
fig,axes=plt.subplots(1,3,figsize=(16,5.5))
present=[d for d in DOW if weekly[d]["n_worn"]>0]
def wbar(ax,key,ttl,unit,color,ref=None):
    y=[weekly[d][key] for d in present]; n=[weekly[d]["n_worn"] for d in present]
    ax.bar(range(len(present)),[v if v is not None else 0 for v in y],color=color,alpha=0.85)
    for i,(v,nn) in enumerate(zip(y,n)):
        if v is not None: ax.text(i,v,f"{v}\nn={nn}",ha="center",va="bottom",fontsize=8,color=FG)
    ax.set_xticks(range(len(present))); ax.set_xticklabels(present,fontsize=9)
    ax.set_ylabel(f"{ttl} ({unit})"); ax.set_title(ttl)
    if ref: ax.axhline(ref,color=AMBER,ls="--",alpha=0.5,lw=1)
wbar(axes[0],"hrv_mean","mean HRV by weekday","ms",CHRV)
wbar(axes[1],"hr_p10","tonic HR by weekday","bpm",CHR)
wbar(axes[2],"steps","mean steps by weekday","count",CSTEP)
fig.suptitle("Weekly structure  ·  26 worn days spread ~3–4 per weekday → directional only, no weekday claim is significant",
             fontsize=12,color=FG,y=1.03)
savefig(fig,"10_weekly_structure.png")

# ---- 11 acute-episode timeline ----
fig,ax=plt.subplots(figsize=(15,6))
hz=[hrv_z.get(r["date"],{}).get("z") for r in days]
rz=[rhr_z.get(r["date"],{}).get("z") for r in days]
ax.axhline(0,color=MUT,lw=0.8)
ax.bar(xi-0.2,[v if v is not None else 0 for v in hz],0.4,color=CHRV,label="HRV z (vs personal mean, low=acute)")
ax.bar(xi+0.2,[v if v is not None else 0 for v in rz],0.4,color=CHR,label="RHR z (high=acute)")
ax.axhspan(-3,-1,color="#402018",alpha=0.25)
top5=set(e["date"] for e in top_episodes[:5])
for i,r in enumerate(days):
    if r["date"] in top5:
        ax.annotate(r["date"][5:],xy=(i,(hz[i] or 0)),xytext=(i,-2.6),color=AMBER,fontsize=8,ha="center",
                    arrowprops=dict(arrowstyle="-",color=AMBER,alpha=0.5))
ax.set_xticks(xi); ax.set_xticklabels(lab,rotation=90,fontsize=8)
ax.set_ylabel("z-score vs personal baseline"); ax.legend(loc="upper right",fontsize=9)
ax.set_title("Acute-episode timeline  ·  per-day HRV suppression & RHR elevation vs leave-one-out personal baseline  ·  top-5 acute days labelled")
savefig(fig,"11_acute_episode_timeline.png")

# ---- 12 activity/meeting coupling ----
fig,(ax,ax2)=plt.subplots(1,2,figsize=(15,6))
mv=[r["n_meetings"] for r in days]; sv=[r["steps"] for r in days]
cols=[PCOL.get(r["dominant_raw"],"#8a7a5a") for r in days]
ax.scatter(mv,sv,c=cols,s=70,edgecolor=BG,lw=0.7)
cp=coupling["meetings_vs_steps"]
ax.set_xlabel("calendar events + meetings that day"); ax.set_ylabel("daily steps")
ax.set_title(f"Meeting load vs activity  ·  Spearman ρ={cp['rho']} CI{cp['ci95']} (n={cp['n']})")
# dual time series
axb=ax2.twinx()
ax2.bar(xi,mv,color=AMBER,alpha=0.5,label="meeting/event count")
axb.plot(xi,[r["hr_mean"] for r in days],"-o",color=CHR,ms=4,label="daily mean HR")
ax2.set_ylabel("meetings/events",color=AMBER); axb.set_ylabel("mean HR (bpm)",color=CHR); axb.grid(False)
ax2.set_xticks(xi[::2]); ax2.set_xticklabels(lab[::2],rotation=90,fontsize=7)
ax2.set_title("Meeting density & HR over worn days")
cph=coupling["meetings_vs_hr_mean"]
ax2.annotate(f"meet~HR ρ={cph['rho']} CI{cph['ci95']}",xy=(0.02,0.94),xycoords="axes fraction",color=FG,fontsize=9)
leg=[Patch(color=PCOL[p],label=p) for p in ORDER]
ax.legend(handles=leg,fontsize=8,loc="upper right",title="raw pattern",title_fontsize=8)
savefig(fig,"12_activity_meeting_coupling.png")

# ---- 13 HRV-RHR state space colored by raw pattern ----
fig,ax=plt.subplots(figsize=(10,8))
for p in ORDER:
    xs=[r["hrv_mean"] for r in days if r["dominant_raw"]==p and r["hrv_mean"] is not None and r["rhr"] is not None]
    ys=[r["rhr"] for r in days if r["dominant_raw"]==p and r["hrv_mean"] is not None and r["rhr"] is not None]
    ds=[r["date"] for r in days if r["dominant_raw"]==p and r["hrv_mean"] is not None and r["rhr"] is not None]
    if xs:
        ax.scatter(xs,ys,color=PCOL[p],s=110,edgecolor=BG,lw=0.8,label=f"{p} (n={len(xs)})",zorder=3)
        for x,y,d in zip(xs,ys,ds): ax.annotate(d[5:],(x,y),textcoords="offset points",xytext=(5,4),fontsize=7,color=MUT)
allx=[r["hrv_mean"] for r in days if r["hrv_mean"] and r["rhr"]]; ally=[r["rhr"] for r in days if r["hrv_mean"] and r["rhr"]]
ax.axvline(statistics.mean(allx),color=MUT,ls=":",alpha=0.6); ax.axhline(statistics.mean(ally),color=MUT,ls=":",alpha=0.6)
ax.text(statistics.mean(allx)+1,min(ally),"personal mean HRV",color=MUT,fontsize=8)
ax.set_xlabel("daily mean HRV (ms) — right = more parasympathetic reserve")
ax.set_ylabel("resting HR (bpm) — up = more sympathetic load")
ax.set_title("Biometric state-space  ·  HRV × resting-HR colored by RAW pattern  ·  the two gold-standard autonomic\nmarkers do NOT separate the patterns (colors fully intermix)  ·  separation lives in whole-day HR level  ·  n=1")
ax.legend(fontsize=9,loc="upper right")
savefig(fig,"13_hrv_rhr_state_space.png")

print("ALL CHARTS DONE ->",ASSETS)
for f in sorted(os.listdir(ASSETS)): print("  ",f)
