import json, datetime, statistics, collections, re
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def load(p): return json.load(open(f"{SP}/data/{p}"))
states=load("state_history.json"); states.sort(key=lambda s:s["bucket_ts"])
meetings=load("meetings.json")
cal=load("calendar_events.json")
hrv=load("hk_heart_rate_variability.json")["data"]["samples"]
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]

def dstr(t): return datetime.datetime.fromtimestamp(t,PDT).strftime("%Y-%m-%d %H:%M")

# ---------- THEME taxonomy ----------
THEMES={
 "demo_readiness":["demo","walkthrough","pitch","deck","demo story","demo prep","dashboard","control surface","landing page","onboarding"],
 "investor_fundraising":["investor","seed","raise","fundrais","incubator","term sheet"," cap","angel","ai2","valuation","3m ","600k","warm intro"],
 "causal_rootcause":["causal","root cause","detonat","structural causal","counterfactual","reasoning chain","attribution","causal discovery","causal inference","stress graph"],
 "memory_architecture":["memory","schema","vector","embedding","context management","analogical graph","memory bank","memory layer","project memory","graph"],
 "pricing_monetization":["pricing","tier","paywall","subscription","budget","license","ltv","cac","monetiz","lifetime","free trial","revenue"],
 "b2b_b2c_positioning":["b2b","b2c","wearable","oura","whoop","white-label","brand","partner","precoin","pre coin","flywheel","positioning"],
 "gtm_outreach":["go-to-market","go to market","gtm","outreach","linkedin","reddit","marketing","user acquisition","validation","mom test","cold "],
 "product_intervention":["breathing","breathwork","intervention","proactive","nudge","resonance","session","reminder","autotask"],
}
def themes_of(text):
    t=text.lower(); found=set()
    for name,kws in THEMES.items():
        for kw in kws:
            if kw in t: found.add(name); break
    return found

# ---------- STRESS EPISODES ----------
# (A) state buckets classified stress by backend
stress_cats={"pushing_it","running_on_empty"}
def pattern_of(s):
    if s["category"]=="pushing_it": return "overdrive/tension" if s["yang_score"]>=60 else "tension"
    if s["category"]=="running_on_empty": return "depletion"
    return None
episodes=[]
for s in states:
    if s["category"] in stress_cats:
        episodes.append({"ts":s["bucket_ts"],"kind":"state","pattern":pattern_of(s),
                         "detail":f'{s["category"]} yang={s["yang_score"]} yin={s["yin_score"]}',"quality":s["source_quality"]})
# (B) HRV dips: below (rolling baseline - 1 stdev). baseline = median of prior 14d window
hrv=[{"ts":datetime.datetime.fromisoformat(h["timestamp"].replace("Z","+00:00")).timestamp(),"v":h["value"]} for h in hrv]
hrv.sort(key=lambda x:x["ts"])
allv=[h["v"] for h in hrv]; med=statistics.median(allv); sd=statistics.pstdev(allv)
for i,h in enumerate(hrv):
    prior=[x["v"] for x in hrv if x["ts"]<h["ts"] and x["ts"]>=h["ts"]-14*86400]
    base=statistics.median(prior) if len(prior)>=5 else med
    if h["v"] < base-0.6*sd:   # meaningful dip
        episodes.append({"ts":h["ts"],"kind":"hrv","pattern":"hrv_dip",
                         "detail":f'HRV {h["v"]:.0f} vs base {base:.0f} (-{(base-h["v"]):.0f})',"quality":"data_verified"})
episodes.sort(key=lambda e:e["ts"])
print("EPISODES: state=%d hrv=%d total=%d"%(sum(1 for e in episodes if e["kind"]=="state"),
      sum(1 for e in episodes if e["kind"]=="hrv"), len(episodes)))
print("episode date range:", dstr(episodes[0]["ts"])[:10],"->",dstr(episodes[-1]["ts"])[:10])

# ---------- JOIN across windows ----------
WINDOWS={"same_hour":3600,"half_day":6*3600,"same_day":12*3600,"±2day":2*86400}
# meetings+calendar as work context
work=[]
for m in meetings: work.append({"ts":m["ts"],"text":m["text"],"src":"granola","title":m["title"],"date":m["date"]})
for c in cal:
    if c["title"] and len(c["title"])>2:
        work.append({"ts":c["ts"],"text":c["title"]+". "+c.get("desc",""),"src":"calendar","title":c["title"],"date":c["date"]})

def near(items,ts,w):
    return [x for x in items if abs(x["ts"]-ts)<=w]

# For each window: count theme co-occurrences (episode has >=1 work item of theme within window)
print("\n=== THEME co-occurrence with stress episodes, by window ===")
print("window       ", "  ".join(f"{t[:11]:12s}" for t in THEMES))
rows={}
for wname,w in WINDOWS.items():
    counts=collections.Counter()
    theme_ep=collections.defaultdict(set)
    for ei,ep in enumerate(episodes):
        wk=near(work,ep["ts"],w)
        th=set()
        for x in wk: th|=themes_of(x["text"])
        for t in th:
            counts[t]+=1; theme_ep[t].add(ei)
    rows[wname]=(counts,theme_ep)
    print(f"{wname:12s}", "  ".join(f"{counts[t]:12d}" for t in THEMES))

# cross-source recurrence: theme near stress in BOTH a meeting and a memory line
print("\n=== CROSS-SOURCE recurrence (meeting-theme AND memory-theme both within window of same episode) ===")
for wname,w in [("half_day",6*3600),("same_day",12*3600),("±2day",2*86400)]:
    print(f"\n-- window={wname} --")
    for tname in THEMES:
        eps_hit=[]
        for ei,ep in enumerate(episodes):
            mtgs=[x for x in near(meetings,ep["ts"],w) if tname in themes_of(x["text"])]
            mems=[x for x in near(mem,ep["ts"],w) if tname in themes_of(x["text"])]
            if mtgs and mems:
                eps_hit.append((ei,ep,mtgs,mems))
        if len(eps_hit)>=2:
            dates=sorted({dstr(e[1]["ts"])[:10] for e in eps_hit})
            print(f"  {tname:22s} episodes={len(eps_hit):2d} dates={dates}")

# save episodes + work for citation step
json.dump({"episodes":episodes,"work":work},open(f"{SP}/data/joined.json","w"),ensure_ascii=False)
