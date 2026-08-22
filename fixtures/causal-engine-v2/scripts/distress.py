import json, datetime, statistics, collections
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def load(p): return json.load(open(f"{SP}/data/{p}"))
states=load("state_history.json"); states.sort(key=lambda s:s["bucket_ts"])
meetings=load("meetings.json"); cal=load("calendar_events.json")
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
hrv=[{"ts":datetime.datetime.fromisoformat(h["timestamp"].replace("Z","+00:00")).timestamp(),"v":h["value"]} for h in load("hk_heart_rate_variability.json")["data"]["samples"]]
hrv.sort(key=lambda x:x["ts"])
def dstr(t): return datetime.datetime.fromtimestamp(t,PDT).strftime("%Y-%m-%d")
THEMES={
 "demo_readiness":["demo","walkthrough","pitch","deck","dashboard","landing page","onboarding"],
 "investor_fundraising":["investor","seed","raise","fundrais","incubator","term sheet","angel","ai2","valuation","warm intro"],
 "causal_rootcause":["causal","root cause","detonat","counterfactual","reasoning chain","attribution","stress graph"],
 "memory_architecture":["memory","schema","vector","embedding","context management","memory bank","memory layer","project memory"],
 "pricing_monetization":["pricing","tier","paywall","subscription","budget","license","ltv","cac","lifetime","free trial"],
 "b2b_b2c_positioning":["b2b","b2c","wearable","oura","whoop","white-label","brand","partner","precoin","flywheel","positioning"],
 "gtm_outreach":["go-to-market","gtm","outreach","linkedin","reddit","marketing","user acquisition","validation","mom test"],
 "product_intervention":["breathing","breathwork","intervention","proactive","resonance"],
}
def themes_of(t):
    t=t.lower(); return {n for n,kw in THEMES.items() if any(k in t for k in kw)}
work=[{"ts":m["ts"],"text":m["text"]} for m in meetings]
for c in cal:
    if c["title"] and len(c["title"])>2: work.append({"ts":c["ts"],"text":c["title"]+" "+c.get("desc","")})
def near(items,ts,w): return [x for x in items if abs(x["ts"]-ts)<=w]

# Narrow distress: running_on_empty (depletion) + acute HRV dips; control = in_flow (good engaged)
deplete=[s["bucket_ts"] for s in states if s["category"]=="running_on_empty"]
overdrive=[s["bucket_ts"] for s in states if s["category"]=="pushing_it"]
inflow=[s["bucket_ts"] for s in states if s["category"]=="in_flow"]
allv=[h["v"] for h in hrv]; sd=statistics.pstdev(allv)
dips=[]; nondips=[]
for h in hrv:
    prior=[x["v"] for x in hrv if h["ts"]-14*86400<=x["ts"]<h["ts"]]
    base=statistics.median(prior) if len(prior)>=5 else statistics.median(allv)
    (dips if h["v"]<base-0.6*sd else nondips).append(h["ts"])

def enrich(theme,pos,neg,W):
    def r(b): return sum(1 for ts in b if any(theme in themes_of(x["text"]) for x in near(work,ts,W)))/max(1,len(b))
    rp,rn=r(pos),r(neg); return rp,rn,(rp/rn if rn>0 else float('inf'))

print("== ENRICHMENT: depletion(running_on_empty n=%d) vs in_flow(n=%d), same-day =="%(len(deplete),len(inflow)))
for tn in THEMES:
    rp,rn,e=enrich(tn,deplete,inflow,12*3600)
    print(f"  {tn:22s} deplete={rp*100:4.0f}% inflow={rn*100:4.0f}% enrich={e:.2f}x")
print("\n== ENRICHMENT: acute HRV dips(n=%d) vs non-dips(n=%d), half-day window =="%(len(dips),len(nondips)))
for tn in THEMES:
    rp,rn,e=enrich(tn,dips,nondips,6*3600)
    print(f"  {tn:22s} dip={rp*100:4.0f}% nondip={rn*100:4.0f}% enrich={e:.2f}x")
print("\n== ENRICHMENT: overdrive(pushing_it n=%d) vs in_flow(n=%d), same-day =="%(len(overdrive),len(inflow)))
for tn in THEMES:
    rp,rn,e=enrich(tn,overdrive,inflow,12*3600)
    print(f"  {tn:22s} over={rp*100:4.0f}% inflow={rn*100:4.0f}% enrich={e:.2f}x")

# lead/lag around acute HRV dips: meetings in [-6h,+6h]
print("\n== lead/lag of themed meetings around acute HRV dips (±6h) ==")
for tn in THEMES:
    b=a=0
    for ts in dips:
        for x in near(meetings,ts,6*3600):
            if tn in themes_of(x["text"]):
                if x["ts"]<=ts: b+=1
                else: a+=1
    if b+a>0: print(f"  {tn:22s} before(dread)={b} after(rumination)={a}")
