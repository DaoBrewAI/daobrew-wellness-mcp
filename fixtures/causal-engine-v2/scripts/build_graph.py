import json, datetime, subprocess, os, uuid
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def E(s): return int(datetime.datetime.strptime(s,"%Y-%m-%d %H:%M").replace(tzinfo=PDT).timestamp())
states=json.load(open(f"{SP}/data/state_history.json"))
# find real depletion bucket ts near key dates
def dep_ts(date):
    cands=[s["bucket_ts"] for s in states if s["category"]=="running_on_empty" and datetime.datetime.fromtimestamp(s["bucket_ts"],PDT).strftime("%Y-%m-%d")==date]
    return int(cands[-1]) if cands else E(date+" 17:00")
def dep_detail(date):
    cands=[s for s in states if s["category"]=="running_on_empty" and datetime.datetime.fromtimestamp(s["bucket_ts"],PDT).strftime("%Y-%m-%d")==date]
    return cands[-1] if cands else None
NOW=int(datetime.datetime.now().timestamp())
DB="/tmp/daobrew-real-graph.db"
if os.path.exists(DB): os.remove(DB)
RAW_USER_ID=os.environ.get("DAOBREW_USER_ID","")
if RAW_USER_ID != RAW_USER_ID.strip():
    raise SystemExit("set DAOBREW_USER_ID to a canonical UUID; whitespace is not allowed")
try:
    USER_ID=str(uuid.UUID(RAW_USER_ID)).upper()
except (ValueError, AttributeError):
    raise SystemExit("set DAOBREW_USER_ID to a canonical UUID; labels, api keys, and 'local' are not identities")
USER_ID_SQL=USER_ID.replace("'","''")

# real depletion episodes
e_pricing1=dep_ts("2026-06-13"); d1=dep_detail("2026-06-13")
e_pricing2=dep_ts("2026-06-26"); d2=dep_detail("2026-06-26")
e_pricing3=dep_ts("2026-06-14"); d3=dep_detail("2026-06-14")
e_demo1=dep_ts("2026-05-22");   dd1=dep_detail("2026-05-22")
e_demo2=dep_ts("2026-06-27");   dd2=dep_detail("2026-06-27")
e_causal=dep_ts("2026-06-26")

def J(o): return json.dumps(o,ensure_ascii=False).replace("'","''")

nodes=[]
edges=[]
def node(nid,kind,title,sub,occ,src,ref,props):
    nodes.append((nid,kind,title,sub,occ,src,ref,J(props)))
def edge(eid,s,d,kind,label,w=1.0):
    edges.append((eid,s,d,kind,label,w))

# ---- meetings (real Granola / calendar) ----
node('mtg_wsync_jun10','meeting','Weekly sync · DaoBrew','Jun 10 · pricing tiers',E("2026-06-10 11:00"),'granola','granola:d40dd37d',
 {"kind":"meeting","source_card":{"source_kind":"meeting","summary":"Tier pricing churned: free/monthly/annual/lifetime; the room could not answer what a paid user actually gets.","key_points":["'Open question blocking the MVP'","'What the actual benefit I can gain when I pay?'"],"topics":["#pricing","#mvp"],"why_linked":"Same fortnight as a run of depletion evenings (Jun 11-15)."}})
node('mtg_wsync_jun24','meeting','Weekly sync · DaoBrew','Jun 24 · causal + demo',E("2026-06-24 11:00"),'granola','granola:567e40c6',
 {"kind":"meeting","source_card":{"source_kind":"meeting","summary":"Causal root-cause discovery and 'detonation' discussed; demo readiness named a priority.","key_points":["'No dashboard or control surface built yet; still manual'","'Demo readiness flagged as a current priority theme'"],"topics":["#causal","#demo"],"why_linked":"Precedes the Jun 26-27 depletion cluster."}})
node('mtg_design_jun29','meeting','Design discussion','Jun 29 · UI / stress patterns',E("2026-06-29 17:00"),'granola','granola:c4527b76',
 {"kind":"meeting","source_card":{"source_kind":"meeting","summary":"UI logic, default setup, onboarding learning curve, grey-out concerns; landing-page value prop debated.","key_points":["'onboarding/learning curve'","'grey out and abstract UI elements as concerns'"],"topics":["#demo","#design"],"why_linked":"Same-day as a Jun 29 depletion bucket."}})
node('cal_premeeting','meeting','DaoBrew · pre-meeting reset','recurring calendar block',E("2026-06-24 10:30"),'google_calendar','calendar:pre-meeting-reset',
 {"kind":"calendar_event","source_card":{"source_kind":"calendar_event","summary":"App's own scheduled reset block — calendar-only.","evidence_gap":"Calendar-only: no matched note."}})

# ---- episodes (real depletion buckets) ----
def epi(nid,title,sub,ts,detail):
    y=detail["yang_score"] if detail else None; yin=detail["yin_score"] if detail else None
    node(nid,'episode',title,sub,ts,'sentinel',f'episode:{nid}',
     {"category":"running_on_empty","pattern":"depletion","yang_score":y,"yin_score":yin,
      "evidence_grade":"candidate","note":"backend half-day bucket; ~evening PDT","evidence_ticks":{"calendar":True,"granola":True,"memory":True}})
epi('ep_dep_jun13','Depletion · Jun 13 eve','running_on_empty',e_pricing1,d1)
epi('ep_dep_jun14','Depletion · Jun 14 eve','running_on_empty',e_pricing3,d3)
epi('ep_dep_jun26','Depletion · Jun 26 eve','running_on_empty',e_pricing2,d2)
epi('ep_dep_may22','Depletion · May 22 eve','running_on_empty',e_demo1,dd1)
epi('ep_dep_jun27','Depletion · Jun 27 eve','running_on_empty',e_demo2,dd2)

# ---- ghosts ----
node('ghost_pricing_gate','ghost','Pricing/tier value never settles','recurring · Jun 10-26',e_pricing2,'reasoner','reasoner:ghost_pricing_gate',
 {"status":"suggested","root_scale":"Primary","claim_level":"attribution_candidate",
  "evidence_grade":"co-occurred x3 · 2 sources · cited spans",
  "brief":{"cause":"The pricing/tier value proposition keeps reopening — 'what does a paid user actually get' has stayed unanswered across a meeting, a strategy rewrite, and a late-night build, each near an evening depletion reading.",
   "evidence":["Jun 10 note: 'What the actual benefit I can gain when I pay?' / 'Open question blocking the MVP'","Jun 11 memory: rewrite '$20.99 = Seeing + Detonate, demo-first'","Jun 26 memory (late night): re-litigating B2B/B2C three-tier structure, high frustration"],
   "context":"Depletion enriched 2.9x vs flow near pricing days; but time-of-day and a sustained mid-June low confound this.",
   "confound":"Strong RTM + late-night work confound: depletion is an evening bucket and pricing work happened in the evenings.",
   "artifact_spec":"One page: for each tier (B2C x3, B2B x3) write the single concrete benefit unlocked at purchase; kill 'join the paid beta' language. Decide lifetime-vs-annual framing once.",
   "suggested_block":{"title":"DaoBrew · pricing value one-pager","start_offset_min":60,"duration_min":30}}})
node('ghost_demo_polish','ghost','Late-night demo/design polish grind','recurring · May 22-Jun 27',e_demo2,'reasoner','reasoner:ghost_demo_polish',
 {"status":"watching","root_scale":"Watching","claim_level":"attribution_candidate",
  "evidence_grade":"co-occurred x3 · time-of-day confound",
  "brief":{"cause":"High-frustration, low-tractability visual polish (Figma->SwiftUI fidelity, UI tabs, demo recording) recurs late at night near depletion.",
   "evidence":["May 22 memory: '你跟Figma的差距挺大的' / '这个太丑了' (fidelity frustration)","Jun 11 memory: '第一性原理...这真的是好的 demo 效果吗?'","Jun 26 memory: redo iOS tab layout + rerun frontend designer"],
   "confound":"Heavily confounded by hour-of-day: this is evening work, and evening = depletion bucket. Not stress-specific."}})
node('ghost_causal_doubt','ghost','\"Causal Brain doesn\'t work\" self-doubt','recurring · Jun 24-30',e_causal,'reasoner','reasoner:ghost_causal_doubt',
 {"status":"watching","root_scale":"Watching","claim_level":"attribution_candidate",
  "evidence_grade":"thin · low base rate",
  "brief":{"cause":"Recurring doubt that the product's own attribution engine is empty — surfaced in-meeting and late at night.",
   "evidence":["Jun 24 note: 'No dashboard or control surface built yet; still manual'","Jun 26 memory: 'Causal Brain 是完全是哑巴的...这些 trigger...都是瞎写的'"],
   "confound":"Only 2 clean occasions; causal theme has a very low base rate so enrichment is unstable."}})

# ---- edges ----
edge('e1','mtg_wsync_jun10','ep_dep_jun13','triggered','same fortnight')
edge('e2','ep_dep_jun13','ghost_pricing_gate','evidence_for','co-occurred · Jun 13')
edge('e3','ep_dep_jun14','ghost_pricing_gate','evidence_for','co-occurred · Jun 14')
edge('e4','ep_dep_jun26','ghost_pricing_gate','evidence_for','co-occurred · Jun 26')
edge('e5','mtg_wsync_jun10','ghost_pricing_gate','suggests','cited: benefit-when-I-pay')
edge('e6','mtg_wsync_jun24','ep_dep_jun26','triggered','precedes cluster',0.6)
edge('e7','mtg_wsync_jun24','ghost_causal_doubt','suggests','cited: no dashboard yet')
edge('e8','ep_dep_jun26','ghost_causal_doubt','evidence_for','co-occurred · Jun 26',0.6)
edge('e9','mtg_design_jun29','ep_dep_jun27','relates_to','context, not cause',0.4)
edge('e10','ep_dep_may22','ghost_demo_polish','evidence_for','co-occurred · May 22',0.6)
edge('e11','ep_dep_jun27','ghost_demo_polish','evidence_for','co-occurred · Jun 27',0.6)
edge('e12','mtg_design_jun29','ghost_demo_polish','suggests','cited: onboarding/grey-out',0.5)
edge('e13','cal_premeeting','ep_dep_jun26','relates_to','context, not cause',0.3)

# ---- emit SQL ----
ddl=open("/Users/yz/DaobrewAI/DaobrewSentinelMac/scripts/seed-demo-graph.sh").read()
# extract CREATE TABLE statements verbatim
import re
sql=[]
sql.append("""CREATE TABLE IF NOT EXISTS graph_nodes(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('pattern','meeting','episode','theme','ghost','prediction','intervention','memory_hit')),
  title TEXT NOT NULL, subtitle TEXT, element TEXT, occurred_at_ts INTEGER,
  source TEXT, source_ref TEXT, props_json TEXT NOT NULL DEFAULT '{}', embedding BLOB, created_at_ts INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nodes_dedup ON graph_nodes(user_id, kind, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS graph_edges(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, src_id TEXT NOT NULL, dst_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('triggered','manifested','tagged','clusters','suggests','evidence_for','predicts','caused','relates_to')),
  label TEXT, weight REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', created_at_ts INTEGER NOT NULL,
  UNIQUE(user_id, src_id, dst_id, kind));""")
for n in nodes:
    nid,kind,title,sub,occ,src,ref,props=n
    title=title.replace("'","''"); sub=(sub or "").replace("'","''")
    sql.append(f"INSERT INTO graph_nodes (id,user_id,kind,title,subtitle,element,occurred_at_ts,source,source_ref,props_json,created_at_ts) VALUES ('{nid}','{USER_ID_SQL}','{kind}','{title}','{sub}',NULL,{occ},'{src}','{ref}','{props}',{NOW});")
for e in edges:
    eid,s,d,kind,label,w=e
    label=label.replace("'","''")
    sql.append(f"INSERT INTO graph_edges (id,user_id,src_id,dst_id,kind,label,weight,props_json,created_at_ts) VALUES ('{eid}','{USER_ID_SQL}','{s}','{d}','{kind}','{label}',{w},'{{}}',{NOW});")
open(f"{SP}/graph.sql","w").write("\n".join(sql))
subprocess.run(["sqlite3",DB],input="\n".join(sql),text=True,check=True)
print("built",DB)
out=subprocess.run(["sqlite3",DB,"SELECT kind, COUNT(*) FROM graph_nodes GROUP BY kind; SELECT '---'; SELECT kind, COUNT(*) FROM graph_edges GROUP BY kind; SELECT '--- ghosts ---'; SELECT id, json_extract(props_json,'$.status') FROM graph_nodes WHERE kind='ghost';"],capture_output=True,text=True)
print(out.stdout, out.stderr)
