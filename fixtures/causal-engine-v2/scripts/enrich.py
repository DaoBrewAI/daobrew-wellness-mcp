import json, datetime, statistics, collections
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def load(p): return json.load(open(f"{SP}/data/{p}"))
states=load("state_history.json"); states.sort(key=lambda s:s["bucket_ts"])
meetings=load("meetings.json"); cal=load("calendar_events.json")
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
def dstr(t): return datetime.datetime.fromtimestamp(t,PDT).strftime("%Y-%m-%d")
exec(open(f"{SP}/analyze.py").read().split("# ---------- STRESS EPISODES")[0].split("THEMES=")[1].join(["THEMES=",""]) ) if False else None
# redefine THEMES + themes_of locally
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
work=[{"ts":m["ts"],"text":m["text"],"src":"granola"} for m in meetings]
for c in cal:
    if c["title"] and len(c["title"])>2: work.append({"ts":c["ts"],"text":c["title"]+". "+c.get("desc",""),"src":"calendar"})
def near(items,ts,w): return [x for x in items if abs(x["ts"]-ts)<=w]

stress=[s for s in states if s["category"] in ("pushing_it","running_on_empty")]
calm=[s for s in states if s["category"] in ("in_flow","recharging")]
W=12*3600  # same-day
print("stress buckets=%d calm buckets=%d"%(len(stress),len(calm)))
print(f"\n{'theme':22s} {'stress%':>8s} {'calm%':>8s} {'enrich':>7s}  {'xsrc_eps':>8s}  lead/lag(before/after stress)")
results=[]
for tn in THEMES:
    def rate(buckets):
        hit=sum(1 for s in buckets if any(tn in themes_of(x["text"]) for x in near(work,s["bucket_ts"],W)))
        return hit/len(buckets)
    sr=rate(stress); cr=rate(calm); enr=sr/cr if cr>0 else float('inf')
    # cross-source episodes (meeting+memory both) at same-day, count distinct DAYS
    xdays=set(); before=after=0
    for s in stress:
        ts=s["bucket_ts"]
        mtgs=[x for x in near(meetings,ts,W) if tn in themes_of(x["text"])]
        mems=[x for x in near(mem,ts,W) if tn in themes_of(x["text"])]
        if mtgs and mems:
            xdays.add(dstr(ts))
            for x in mtgs:
                if x["ts"]<=ts: before+=1
                else: after+=1
    results.append((tn,sr,cr,enr,len(xdays),before,after))
    print(f"{tn:22s} {sr*100:7.0f}% {cr*100:7.0f}% {enr:6.2f}x  {len(xdays):8d}  before={before} after={after}")
# rank by enrichment * cross-source days
print("\n=== RANKED candidates (enrichment>=1.15 AND cross-source days>=3) ===")
ranked=sorted([r for r in results if r[3]>=1.15 and r[4]>=3], key=lambda r:-(r[3]*r[4]))
for r in ranked:
    print(f"  {r[0]:22s} enrich={r[3]:.2f}x xsrc_days={r[4]} lead/lag {r[5]}/{r[6]}")
