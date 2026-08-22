import json, datetime, statistics, collections
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PV=f"{SP}/pattern-v2"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def dstr(t): return datetime.datetime.fromtimestamp(t,PDT).strftime("%Y-%m-%d")
def load(p): return json.load(open(f"{SP}/data/{p}"))

# ---- sources (reuse last night's exact taxonomy for comparability) ----
THEMES={
 "demo_readiness":["demo","walkthrough","pitch","deck","demo story","demo prep","dashboard","control surface","landing page","onboarding"],
 "investor_fundraising":["investor","seed","raise","fundrais","incubator","term sheet"," cap","angel","ai2","valuation","3m ","600k","warm intro"],
 "causal_rootcause":["causal","root cause","detonat","structural causal","counterfactual","reasoning chain","attribution","causal discovery","causal inference","stress graph"],
 "memory_architecture":["memory","schema","vector","embedding","context management","analogical graph","memory bank","memory layer","project memory"],
 "pricing_monetization":["pricing","tier","paywall","subscription","budget","license","ltv","cac","monetiz","lifetime","free trial","revenue"],
 "b2b_b2c_positioning":["b2b","b2c","wearable","oura","whoop","white-label","brand","partner","precoin","pre coin","flywheel","positioning"],
 "gtm_outreach":["go-to-market","go to market","gtm","outreach","linkedin","reddit","marketing","user acquisition","validation","mom test"],
 "product_intervention":["breathing","breathwork","intervention","proactive","nudge","resonance"],
}
def themes_of(text):
    t=text.lower(); f=set()
    for n,kws in THEMES.items():
        if any(kw in t for kw in kws): f.add(n)
    return f

meetings=load("meetings.json")
for m in meetings: m["ts"]=float(m["ts"])
cal=load("calendar_events.json")
for c in cal: c["ts"]=float(c["ts"])
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
# work = meetings + calendar titles (as last night)
work=[{"ts":m["ts"],"text":m["text"],"src":"granola"} for m in meetings]
for c in cal:
    if c["title"] and len(c["title"])>2:
        work.append({"ts":c["ts"],"text":c["title"]+". "+c.get("desc",""),"src":"calendar"})
# work_all also includes memory (verbatim CEO prompts) for the theme-rate definition
mem_work=[{"ts":m["ts"],"text":m["text"],"src":"memory"} for m in mem]

def near(items,ts,w): return [x for x in items if abs(x["ts"]-ts)<=w]

# ---- pattern timeline: worn days ----
tl=json.load(open(f"{PV}/pattern_timeline.json"))["timeline"]
worn=[d for d in tl if d["source_quality"]=="real_inference"]
worn.sort(key=lambda d:d["date"])
# day anchor = local noon of that date (join windows measured from noon)
def anchor(datestr):
    y,m,dd=map(int,datestr.split("-"))
    return datetime.datetime(y,m,dd,12,0,tzinfo=PDT).timestamp()
for d in worn: d["anchor"]=anchor(d["date"])

out={"generated_at":datetime.datetime.now().isoformat(),
     "note":"PatternJoin stage. Denominator = 26 worn (real_inference) days, all 2026-03-18..05-19 + lone 06-22.",
     "theme_taxonomy":{k:v for k,v in THEMES.items()}}

# ============================================================
# 0. OVERLAP DIAGNOSTIC — can the rumination corpus even reach the pattern layer?
# ============================================================
worn_dates=set(d["date"] for d in worn)
def daycov(items):
    return sorted({dstr(x["ts"]) for x in items} & worn_dates)
overlap={
 "worn_days":sorted(worn_dates),
 "n_worn":len(worn),
 "worn_window":[min(worn_dates),max(worn_dates)],
 "meeting_corpus_window":[dstr(min(m["ts"] for m in meetings)),dstr(max(m["ts"] for m in meetings))],
 "memory_corpus_window":[dstr(min(m["ts"] for m in mem)),dstr(max(m["ts"] for m in mem))],
 "calendar_window":[dstr(min(c["ts"] for c in cal)),dstr(max(c["ts"] for c in cal))],
 "worn_days_with_meeting_sameday":daycov(meetings),
 "worn_days_with_memory_sameday":daycov(mem),
 "worn_days_with_calendar_sameday":daycov([c for c in cal if c["title"]]),
}
# window overlap: how many worn days have >=1 themed OR any work item within window W
for wlabel,W in [("same_day_pm12h",12*3600),("pm2d",2*86400)]:
    mh=sum(1 for d in worn if near(meetings,d["anchor"],W))
    memh=sum(1 for d in worn if near(mem,d["anchor"],W))
    ch=sum(1 for d in worn if near([c for c in cal if c["title"]],d["anchor"],W))
    overlap[f"worn_days_touching_meeting_{wlabel}"]=mh
    overlap[f"worn_days_touching_memory_{wlabel}"]=memh
    overlap[f"worn_days_touching_calendar_{wlabel}"]=ch
out["overlap_diagnostic"]=overlap

# ============================================================
# 1. PATTERN GROUPS (raw biometric axis + gated app-shown axis)
# ============================================================
def group(key):  # key -> {pattern: [worn day dicts]}
    g=collections.defaultdict(list)
    for d in worn: g[d[key]].append(d)
    return g
raw_g=group("dominant_pattern_raw_pre_gate")
gate_g=group("dominant_pattern")
out["pattern_group_sizes"]={
 "raw_pre_gate":{k:len(v) for k,v in sorted(raw_g.items())},
 "gated_app_shown":{k:len(v) for k,v in sorted(gate_g.items())},
 "balanced_flag_days":[d["date"] for d in worn if d["balanced_flag"]],
}

# theme hit-rate for a set of days, over a source, within window W
def rate(days,source,tn,W):
    hit=[d["date"] for d in days if any(tn in themes_of(x["text"]) for x in near(source,d["anchor"],W))]
    return len(hit),len(days),hit

def enrich_table(groups,source,W,ref_label,ref_days):
    tab={}
    for pat,days in sorted(groups.items()):
        row={}
        for tn in THEMES:
            h,n,hd=rate(days,source,tn,W)
            row[tn]={"hits":h,"n":n,"rate":round(h/n,3) if n else 0,"days":hd}
        tab[pat]={"n":len(days),"themes":row}
    # enrichment ratio vs reference
    rref={}
    for tn in THEMES:
        h,n,_=rate(ref_days,source,tn,W)
        rref[tn]=h/n if n else 0
    for pat in tab:
        for tn in THEMES:
            r=tab[pat]["themes"][tn]["rate"]; rr=rref[tn]
            tab[pat]["themes"][tn]["enrich_vs_ref"]=(round(r/rr,2) if rr>0 else (float('inf') if r>0 else 0.0))
    return {"reference_class":ref_label,"reference_n":len(ref_days),"reference_rates":{t:round(v,3) for t,v in rref.items()},"by_pattern":tab}

# reference classes (NO balanced pattern exists → define 最低压 operationally, several ways, all flagged)
recharging=[d for d in worn if d["quadrant"]=="recharging"]           # "good low" quadrant, n~9
stagnation_raw=raw_g.get("STAGNATION",[])                              # raw low-activity tail, n=3
balanced_day=[d for d in worn if d["balanced_flag"]]                  # n=1 (3/28)

W=12*3600
out["enrichment_raw_axis_calendar"]=enrich_table(raw_g,work,W,"recharging_quadrant_worn",recharging)
out["enrichment_gated_axis_calendar"]=enrich_table(gate_g,work,W,"recharging_quadrant_worn",recharging)
out["enrichment_raw_axis_memory"]=enrich_table(raw_g,mem_work,W,"recharging_quadrant_worn",recharging)
out["enrichment_gated_axis_memory"]=enrich_table(gate_g,mem_work,W,"recharging_quadrant_worn",recharging)

# ============================================================
# 2. DIRECT PAIRWISE CONTRASTS (the physiologically meaningful splits)
# ============================================================
def pair(a_days,b_days,alabel,blabel,source,W):
    res={}
    for tn in THEMES:
        ha,na,hda=rate(a_days,source,tn,W); hb,nb,hdb=rate(b_days,source,tn,W)
        ra=ha/na if na else 0; rb=hb/nb if nb else 0
        res[tn]={f"{alabel}_rate":round(ra,3),f"{blabel}_rate":round(rb,3),
                 "enrich":(round(ra/rb,2) if rb>0 else (float('inf') if ra>0 else 0.0)),
                 f"{alabel}_days":hda,f"{blabel}_days":hdb}
    return res
out["pairwise"]={
 "raw_TENSION_vs_OVERDRIVE_calendar":pair(raw_g.get("TENSION",[]),raw_g.get("OVERDRIVE",[]),"tension","overdrive",work,W),
 "gated_DEPLETION_vs_OVERDRIVE_calendar":pair(gate_g.get("DEPLETION",[]),gate_g.get("OVERDRIVE",[]),"depletion","overdrive",work,W),
 "raw_TENSION_vs_OVERDRIVE_memory":pair(raw_g.get("TENSION",[]),raw_g.get("OVERDRIVE",[]),"tension","overdrive",mem_work,W),
 "gated_DEPLETION_vs_OVERDRIVE_memory":pair(gate_g.get("DEPLETION",[]),gate_g.get("OVERDRIVE",[]),"depletion","overdrive",mem_work,W),
}

# ============================================================
# 3. HRV lead/lag on fine signal (±6h) — where data allows
# ============================================================
hrv=[{"ts":datetime.datetime.fromisoformat(h["timestamp"].replace("Z","+00:00")).timestamp(),"v":h["value"]}
     for h in load("hk_heart_rate_variability.json")["data"]["samples"]]
hrv.sort(key=lambda x:x["ts"])
allv=[h["v"] for h in hrv]; sd=statistics.pstdev(allv)
dips=[]
for h in hrv:
    prior=[x["v"] for x in hrv if h["ts"]-14*86400<=x["ts"]<h["ts"]]
    base=statistics.median(prior) if len(prior)>=5 else statistics.median(allv)
    if h["v"]<base-0.6*sd: dips.append(h["ts"])
leadlag={"n_hrv_total":len(hrv),"n_acute_dips":len(dips),"window":"±6h"}
ll={}
for tn in THEMES:
    b=a=0; bm=am=0
    for ts in dips:
        for x in near(meetings,ts,6*3600):
            if tn in themes_of(x["text"]): (b if x["ts"]<=ts else a).__class__  # noop
        for x in near(mem,ts,6*3600):
            if tn in themes_of(x["text"]):
                if x["ts"]<=ts: bm+=1
                else: am+=1
        for x in near(meetings,ts,6*3600):
            if tn in themes_of(x["text"]):
                if x["ts"]<=ts: b+=1
                else: a+=1
    if b+a+bm+am>0:
        ll[tn]={"meeting_before":b,"meeting_after":a,"memory_before":bm,"memory_after":am}
leadlag["themed_items_within_6h_of_dip"]=ll
out["hrv_leadlag"]=leadlag

# ============================================================
# 4. Candidate revalidation on the pattern axis
# ============================================================
# citation dates from last night's candidates (June-dated) → do they have pattern-layer biometrics?
cand_dates={
 "pricing_gate":["2026-06-10","2026-06-11","2026-06-26"],
 "demo_polish":["2026-05-22","2026-06-11","2026-06-26"],
 "attribution_doubt":["2026-06-24","2026-06-26"],
}
tl_by_date={d["date"]:d for d in tl}
cand_eval={}
for c,dates in cand_dates.items():
    ev=[]
    for dt in dates:
        d=tl_by_date.get(dt)
        ev.append({"date":dt,"source_quality":(d["source_quality"] if d else "MISSING"),
                   "has_pattern_biometrics":bool(d and d["source_quality"]=="real_inference"),
                   "gated_pattern":(d["dominant_pattern"] if d and d["source_quality"]=="real_inference" else None),
                   "raw_pattern":(d["dominant_pattern_raw_pre_gate"] if d and d["source_quality"]=="real_inference" else None)})
    cand_eval[c]={"citation_dates":dates,"per_date":ev,
                  "pattern_layer_backed_dates":[e["date"] for e in ev if e["has_pattern_biometrics"]]}
out["candidate_revalidation"]=cand_eval

# quadrant comparison anchor (from last night)
out["quadrant_layer_reference"]={
 "pricing_monetization":2.89,"b2b_b2c_positioning":4.00,"product_intervention":3.11,
 "demo_readiness":1.71,"memory_architecture":1.60,
 "note":"running_on_empty vs in_flow same-day enrichment, quadrant layer, n=271 buckets over 105 days"}

json.dump(out,open(f"{PV}/enrichment.json","w"),ensure_ascii=False,indent=1)
print("WROTE enrichment.json")

# ---- console headline ----
print("\n=== OVERLAP DIAGNOSTIC ===")
for k in ["worn_window","meeting_corpus_window","memory_corpus_window",
          "worn_days_with_meeting_sameday","worn_days_with_memory_sameday","worn_days_with_calendar_sameday",
          "worn_days_touching_meeting_pm2d","worn_days_touching_memory_pm2d","worn_days_touching_calendar_pm2d"]:
    print(f"  {k}: {overlap[k]}")
print("\n=== PATTERN GROUP SIZES ===",out["pattern_group_sizes"])
print("\n=== gated DEPLETION vs OVERDRIVE (calendar, same-day) ===")
for tn,r in out["pairwise"]["gated_DEPLETION_vs_OVERDRIVE_calendar"].items():
    print(f"  {tn:22s} dep={r['depletion_rate']:.2f} over={r['overdrive_rate']:.2f} enrich={r['enrich']}")
print("\n=== raw TENSION vs OVERDRIVE (calendar, same-day) ===")
for tn,r in out["pairwise"]["raw_TENSION_vs_OVERDRIVE_calendar"].items():
    print(f"  {tn:22s} ten={r['tension_rate']:.2f} over={r['overdrive_rate']:.2f} enrich={r['enrich']}")
print("\n=== HRV lead/lag themed items within 6h of dip ===",json.dumps(leadlag["themed_items_within_6h_of_dip"]))
print("\n=== CANDIDATE pattern-layer backing ===")
for c,e in cand_eval.items():
    print(f"  {c}: cited {e['citation_dates']} -> pattern-backed dates = {e['pattern_layer_backed_dates']}")
