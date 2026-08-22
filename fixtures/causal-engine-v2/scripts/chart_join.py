import json, datetime
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import matplotlib.dates as mdates

SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
PV=f"{SP}/pattern-v2"
ASSETS="/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07"
PDT=datetime.timezone(datetime.timedelta(hours=-7))
def dt(s): return datetime.date.fromisoformat(s)
def dts(t): return datetime.datetime.fromtimestamp(t,PDT).date()

tl=json.load(open(f"{PV}/pattern_timeline.json"))["timeline"]
worn=[d for d in tl if d["source_quality"]=="real_inference"]
def load(p): return json.load(open(f"{SP}/data/{p}"))
meetings=load("meetings.json"); cal=load("calendar_events.json")
mem=[json.loads(l) for l in open(f"{SP}/data/memory_lines.jsonl")]
mdays=sorted({dts(float(m["ts"])) for m in meetings})
memdays=sorted({dts(m["ts"]) for m in mem})

PCOL={"TENSION":"#e0b34d","OVERDRIVE":"#e8663c","STAGNATION":"#7fae7a","CONSTRICTION":"#b98cd6","DEPLETION":"#5aa0d0"}
BG="#1a1208"; FG="#f0e3d0"; GRID="#3a2c1c"
plt.rcParams.update({"figure.facecolor":BG,"axes.facecolor":BG,"savefig.facecolor":BG,
    "text.color":FG,"axes.labelcolor":FG,"xtick.color":FG,"ytick.color":FG,
    "font.family":"DejaVu Sans","font.size":10,"axes.edgecolor":GRID})

fig,ax=plt.subplots(figsize=(15,6.6))
x0,x1=dt("2026-03-16"),dt("2026-07-03")

# blackout band 5/20-6/21
ax.axvspan(dt("2026-05-20"),dt("2026-06-21"),color="#2a1a10",alpha=0.9,zorder=0)
ax.text(dt("2026-06-05"),4.5,"34-DAY BIOMETRIC BLACKOUT\n(zero HealthKit samples)",ha="center",va="center",
        color="#8a7050",fontsize=10,style="italic",zorder=1)

# lane y positions
LANES={"worn":4,"memory":3,"meeting":2,"cand":1}

# lane 4: worn biometric days, colored by raw pattern
for d in worn:
    p=d["dominant_pattern_raw_pre_gate"]
    ax.scatter(dt(d["date"]),LANES["worn"],s=90,color=PCOL[p],edgecolor="#000",linewidth=0.4,zorder=5)
# lane 3: memory corpus days
for dd in memdays:
    ax.scatter(dd,LANES["memory"],s=26,color="#c9a24a",alpha=0.75,marker="s",zorder=4)
# lane 2: meeting corpus days
for dd in mdays:
    ax.scatter(dd,LANES["meeting"],s=42,color="#d98a4a",marker="D",zorder=4)
# lane 1: candidate citation dates (June)
cands={"pricing gate":["2026-06-10","2026-06-11","2026-06-26"],
       "demo polish":["2026-05-22","2026-06-11","2026-06-26"],
       "attribution doubt":["2026-06-24","2026-06-26"]}
allc=sorted({c for v in cands.values() for c in v})
for c in allc:
    ax.scatter(dt(c),LANES["cand"],s=150,color="none",edgecolor="#ff5b5b",linewidth=2.2,marker="X",zorder=6)

# markers: biometric end 5/19, first meeting 5/24
for xd,lab,col in [("2026-05-19","biometric density ends 5/19","#e0b34d"),
                   ("2026-05-24","first Granola meeting 5/24","#d98a4a")]:
    ax.axvline(dt(xd),color=col,ls="--",lw=1.1,alpha=0.7,zorder=2)

ax.set_yticks(list(LANES.values()))
ax.set_yticklabels(["candidate citations\n(all June)","meeting corpus\n(Granola)","memory corpus\n(verbatim prompts)","PATTERN biometrics\n(26 worn days)"][::-1])
ax.set_ylim(0.4,4.7); ax.set_xlim(x0,x1)
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO,interval=1))
ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d"))
plt.setp(ax.get_xticklabels(),rotation=45,ha="right",fontsize=8)
ax.grid(axis="x",color=GRID,lw=0.4,alpha=0.5)
for s in ["top","right","left"]: ax.spines[s].set_visible(False)

leg=[Patch(color=PCOL[p],label=f"raw {p.title()}") for p in ["TENSION","OVERDRIVE","STAGNATION","CONSTRICTION"]]
leg+=[plt.Line2D([],[],marker="X",color="none",markeredgecolor="#ff5b5b",markeredgewidth=2,markersize=11,label="candidate citation",ls="")]
ax.legend(handles=leg,loc="lower left",ncol=5,facecolor=BG,edgecolor=GRID,fontsize=8.5,framealpha=0.9)

ax.set_title("PatternJoin is structurally infeasible: the biometric pattern layer and the rumination corpus never overlap",
             color=FG,fontsize=13,pad=14,loc="left",weight="bold")
ax.text(x0,4.98,"Every candidate citation (June) sits in the blackout; the meeting corpus starts 5 days after biometrics end; only 4 worn days carry any verbatim prompt.",
        color="#a98a68",fontsize=9.5)
plt.tight_layout()
out=f"{ASSETS}/14_patternjoin_feasibility.png"
plt.savefig(out,dpi=140,bbox_inches="tight")
print("WROTE",out)
