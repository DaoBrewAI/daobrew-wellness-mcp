#!/usr/bin/env python3
"""r2-01_unified_coverage.png — GitHub-style calendar heatmap, Pacific days.
Top panel: device-A-only (pre-stitch).  Bottom: unified (deviceA UNION deviceB).
Colour = total biometric samples logged that Pacific day (log scale).
Green outline = days RECOVERED by the stitch (present in unified, absent in A-only).
The visual proof: the stitch densifies the March dense block; the meeting era
(5/24 -> ) stays empty except the isolated 6/22 blip."""
import json, os
from collections import defaultdict
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.colors import LinearSegmentedColormap

PT = ZoneInfo("America/Los_Angeles")
HERE = os.path.dirname(__file__)
OUT = "/Users/yz/DaoBrewStrategy/assets/biometrics-2026-07/r2-01_unified_coverage.png"

BG      = "#1a1208"
PANEL   = "#211910"
EMPTY   = "#2a1f12"
TEXT    = "#f2e7d5"
MUTED   = "#b7a689"
AMBER   = "#c9a227"
GREEN   = "#7fb069"
BLUE    = "#5a93b8"
RED     = "#e0563c"

U = json.load(open(os.path.join(HERE, "unified_samples.json")))
METRICS = list(U["metrics"].keys())

# per-Pacific-day total samples, split by view
def pt_day(ts):
    return datetime.fromisoformat(ts).astimezone(PT).date()

total_unified = defaultdict(int)
total_A       = defaultdict(int)
hr_unified    = defaultdict(int)
hr_A          = defaultdict(int)
for m in METRICS:
    for s in U["metrics"][m]:
        d = pt_day(s["ts"])
        total_unified[d] += 1
        if "deviceA" in s["sources"]:
            total_A[d] += 1
        if m == "heart_rate":
            hr_unified[d] += 1
            if "deviceA" in s["sources"]:
                hr_A[d] += 1

# recovered = HR-worn in unified but not in device-A-only
recovered = sorted(d for d in hr_unified if hr_unified[d] > 0 and hr_A.get(d, 0) == 0)

# calendar span: week-aligned Mon..Sun, Mar 16 (Mon) .. Jun 30 area -> extend to Jul 05 Sun
start = date(2026, 3, 16)          # Monday before first data (3/18)
end   = date(2026, 7, 5)           # Sunday, covers meeting era to 6/30 + tail
# week columns
def monday(d): return d - timedelta(days=d.weekday())
weeks = []
w = monday(start)
while w <= end:
    weeks.append(w)
    w += timedelta(days=7)
n_weeks = len(weeks)
week_idx = {wk: i for i, wk in enumerate(weeks)}

MEET_START = date(2026, 5, 24)
GAP_A = date(2026, 5, 19)   # last dense day
GAP_B = date(2026, 6, 22)   # isolated blip

# colour ramp: EMPTY -> deep amber -> bright amber/cream (log density)
ramp = LinearSegmentedColormap.from_list(
    "amberdense", [EMPTY, "#5a3d12", "#8a5f16", AMBER, "#f0d67a"])
vmax = np.log1p(max(total_unified.values()))

def cell_colour(cnt):
    if cnt <= 0:
        return EMPTY
    return ramp(0.12 + 0.88 * (np.log1p(cnt) / vmax))

WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

fig, axes = plt.subplots(2, 1, figsize=(15.5, 7.6), facecolor=BG)
fig.subplots_adjust(left=0.06, right=0.985, top=0.78, bottom=0.09, hspace=0.42)

def draw(ax, totals, title, mark_recovered):
    ax.set_facecolor(BG)
    for wi, wk in enumerate(weeks):
        for dow in range(7):
            d = wk + timedelta(days=dow)
            cnt = totals.get(d, 0)
            fc = cell_colour(cnt)
            ax.add_patch(Rectangle((wi, 6 - dow), 0.92, 0.92, facecolor=fc,
                                   edgecolor=BG, linewidth=1.2))
            if mark_recovered and d in recovered:
                ax.add_patch(Rectangle((wi, 6 - dow), 0.92, 0.92, facecolor="none",
                                       edgecolor=GREEN, linewidth=2.6, zorder=6))
    # meeting-era shaded band (whole weeks that intersect >= 5/24)
    for wi, wk in enumerate(weeks):
        if wk + timedelta(days=6) >= MEET_START:
            ax.add_patch(Rectangle((wi - 0.04, -0.35), 1.0, 7.55, facecolor=BLUE,
                                   alpha=0.13, edgecolor="none", zorder=0))
    # markers: last-dense (5/19), blip (6/22)
    for dd, lbl, col in [(GAP_A, "last dense 5/19", RED), (GAP_B, "6/22 blip", AMBER)]:
        wi = week_idx[monday(dd)]; dow = dd.weekday()
        ax.add_patch(Rectangle((wi, 6 - dow), 0.92, 0.92, facecolor="none",
                               edgecolor=col, linewidth=1.8, linestyle=(0, (2, 1)), zorder=5))
    ax.set_xlim(-0.5, n_weeks + 0.2)
    ax.set_ylim(-0.5, 7.3)
    ax.set_yticks([6 - i + 0.46 for i in range(7)])
    ax.set_yticklabels(WD, color=MUTED, fontsize=8)
    # month labels on x
    xt, xl = [], []
    last_m = None
    for wi, wk in enumerate(weeks):
        m = wk.strftime("%b")
        if m != last_m:
            xt.append(wi + 0.4); xl.append(wk.strftime("%b %-d")); last_m = m
    ax.set_xticks(xt); ax.set_xticklabels(xl, color=MUTED, fontsize=8)
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.tick_params(length=0)
    ax.set_title(title, color=TEXT, fontsize=12.5, fontweight="bold", loc="left", pad=8)

draw(axes[0], total_A,
     "PRE-STITCH  ·  device-A only (4A008E08) — 26 worn days", mark_recovered=False)
draw(axes[1], total_unified,
     "UNIFIED  ·  deviceA ∪ deviceB — 28 worn days  (green = 2 days recovered by the stitch)",
     mark_recovered=True)

fig.suptitle(
    "Unified biometric coverage  ·  Mar–Jul 2026  ·  n=1 (Yiming)  ·  Pacific days  ·  "
    "cell brightness = samples logged that day (log)",
    color=TEXT, fontsize=14.5, fontweight="bold", x=0.06, y=0.955, ha="left")
fig.text(0.06, 0.895,
    "Reunifying the two device silos adds ONLY 4/10 & 4/12 (both inside the March dense block).",
    color=MUTED, fontsize=10.2, ha="left")
fig.text(0.06, 0.868,
    "The meeting era (5/24→, blue band) stays biometrically empty except the isolated 6/22 blip — a 34-day gap the stitch does not close.",
    color=MUTED, fontsize=10.2, ha="left")

# legend
from matplotlib.lines import Line2D
lg = [
    Line2D([0],[0], marker="s", color="none", markerfacecolor=cell_colour(1200),
           markersize=12, label="high density"),
    Line2D([0],[0], marker="s", color="none", markerfacecolor=cell_colour(40),
           markersize=12, label="sparse"),
    Line2D([0],[0], marker="s", color="none", markerfacecolor=EMPTY,
           markeredgecolor="#3a2c1a", markersize=12, label="not worn"),
    Line2D([0],[0], marker="s", color="none", markerfacecolor="none",
           markeredgecolor=GREEN, markeredgewidth=2.4, markersize=12, label="recovered by stitch"),
    Line2D([0],[0], marker="s", color="none", markerfacecolor=BLUE, alpha=0.5,
           markersize=12, label="meeting era (5/24→)"),
]
axes[0].legend(handles=lg, ncol=5, loc="lower left", bbox_to_anchor=(0.0, 1.20),
               frameon=False, labelcolor=TEXT, fontsize=8.6,
               handletextpad=0.4, columnspacing=1.4)

fig.savefig(OUT, dpi=150, facecolor=BG)
print("wrote", OUT)
print("recovered days:", [d.isoformat() for d in recovered])
print("device-A worn:", sum(1 for d in hr_A if hr_A[d] > 0),
      " unified worn:", sum(1 for d in hr_unified if hr_unified[d] > 0))
