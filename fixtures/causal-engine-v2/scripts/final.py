import json, datetime, statistics, collections
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def load(p): return json.load(open(f"{SP}/data/{p}"))
states=load("state_history.json"); states.sort(key=lambda s:s["bucket_ts"])
meetings=load("meetings.json"); cal=load("calendar_events.json")
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
hrv=[{"ts":datetime.datetime.fromisoformat(h["timestamp"].replace("Z","+00:00")).timestamp(),"v":h["value"]} for h in load("hk_heart_rate_variability.json")["data"]["samples"]]
hrv.sort(key=lambda x:x["ts"])
def dd(t): return datetime.datetime.fromtimestamp(t,PDT).strftime("%Y-%m-%d")
THEMES={
 "demo_readiness":["demo","walkthrough","pitch","deck","dashboard","landing page","onboarding"],
 "investor_fundraising":["investor","seed","raise","fundrais","incubator","term sheet","angel","ai2","valuation","warm intro"],
 "memory_architecture":["memory","schema","vector","embedding","context management","memory bank","memory layer","project memory"],
 "pricing_monetization":["pricing","tier","paywall","subscription","budget","license","ltv","cac","lifetime","free trial"],
 "b2b_b2c_positioning":["b2b","b2c","wearable","oura","whoop","white-label","brand","partner","precoin","flywheel","positioning"],
 "gtm_outreach":["go-to-market","gtm","outreach","linkedin","reddit","marketing","user acquisition","validation","mom test"],
}
def themes_of(t):
    t=t.lower(); return {n for n,kw in THEMES.items() if any(k in t for k in kw)}
def near(items,ts,w): return [x for x in items if abs(x["ts"]-ts)<=w]

# distress episodes: running_on_empty buckets + acute HRV dips
allv=[h["v"] for h in hrv]; sd=statistics.pstdev(allv)
dips=[]
for h in hrv:
    prior=[x["v"] for x in hrv if h["ts"]-14*86400<=x["ts"]<h["ts"]]
    base=statistics.median(prior) if len(prior)>=5 else statistics.median(allv)
    if h["v"]<base-0.6*sd: dips.append({"ts":h["ts"],"detail":f'HRV {h["v"]:.0f} vs base {base:.0f}'})
dep=[{"ts":s["bucket_ts"],"detail":f'depletion yang={s["yang_score"]} yin={s["yin_score"]}'} for s in states if s["category"]=="running_on_empty"]
episodes=sorted(dep+dips,key=lambda e:e["ts"])
W=12*3600
print("distress episodes: depletion=%d hrv_dip=%d"%(len(dep),len(dips)))
print(f"\n{'theme':20s} {'xsrc_days':>9s}  dates")
cand={}
for tn in THEMES:
    days=collections.defaultdict(lambda:{"mtg":[],"mem":[]})
    for ep in episodes:
        ms=[x for x in near(meetings,ep["ts"],W) if tn in themes_of(x["text"])]
        me=[x for x in near(mem,ep["ts"],W) if tn in themes_of(x["text"])]
        if ms and me:
            d=dd(ep["ts"]); days[d]["mtg"]+=ms; days[d]["mem"]+=me
    if len(days)>=3:
        cand[tn]=days
        print(f"{tn:20s} {len(days):9d}  {sorted(days)}")
json.dump({tn:sorted(d) for tn,d in cand.items()},open(f"{SP}/data/candidates.json","w"))

# Pull verbatim memory spans for candidate themes (memory lines ARE verbatim user text)
print("\n=== VERBATIM memory spans per candidate theme (date · source · text) ===")
for tn in cand:
    print(f"\n--- {tn} ---")
    seen=set()
    for m in mem:
        if tn in themes_of(m["text"]):
            d=dd(m["ts"])
            key=m["text"][:60]
            if key in seen: continue
            seen.add(key)
            # only show ones near a distress day
            print(f"[{d} · {m['source'].split(':')[0]}] {m['text'][:200].strip()}")
            if len(seen)>=4: break
