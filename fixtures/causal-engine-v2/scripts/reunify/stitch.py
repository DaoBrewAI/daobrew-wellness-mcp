#!/usr/bin/env python3
"""
STAGE = Stitch. Unify biometric samples across all three identities
(apikey:dbk_n6exu553, deviceA 4A008E08, deviceB 51A5B98C), dedupe, tag source,
emit unified_samples.json + coverage_report.json.

DEDUPE RULE (documented):
  Canonical key per sample = (metric, ts_second, value_r) where
    ts_second = ISO-8601 UTC timestamp truncated to whole seconds
    value_r   = round(value, 4)
  - EXACT duplicate  : identical key -> collapse to ONE unified sample; union
                       the set of source identities that supplied it.
  We deliberately do NOT apply a wider same-value time-window merge. Verified in
  this dataset: (a) all timestamps are whole-second (no sub-second jitter to
  absorb); (b) every timestamp that repeats carries an identical value -- i.e.
  the only collisions are literal re-ingested rows (a 2026-04-20 re-sync
  double-wrote ~1.1k active-energy / 463 HR rows); (c) a value+/-2s window would
  destroy LEGITIMATE distinct increments -- active_energy and step_count
  routinely log the same small value seconds apart, and the 7 step timestamps
  that repeat with DIFFERENT values are real second-resolution collisions that
  must be kept. So exact-key collapse is both sufficient and non-destructive.
  Cross-device collisions = 0 (deviceA/deviceB are complementary, not
  duplicative), so the device union densifies coverage rather than overlapping.

TIMEZONE: samples are stored UTC. The per-day density calendar and worn-day
counts are computed in America/Los_Angeles (Pacific) -- the wearer's local day
and the convention used by the prior-art findings (last real day = 6/22 local,
= 2026-06-23T01:39:07Z). first/last per metric are reported in BOTH UTC and PT.
"""
import json, os
from collections import defaultdict, Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

RAW = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.dirname(__file__)
PT = ZoneInfo("America/Los_Angeles")

IDENT = {
    "apikey":  "apikey:dbk_n6exu553",
    "deviceA": "4A008E08-4076-4BA6-B930-3C41B6E50153",
    "deviceB": "51A5B98C-7034-4B24-B2A5-C8621E32CBC9",
}
METRICS = ["heart_rate", "heart_rate_variability", "resting_heart_rate",
           "respiratory_rate", "step_count", "active_energy_burned"]

def load(ident, metric):
    p = os.path.join(RAW, f"{ident}__{metric}__year.json")
    if not os.path.exists(p):
        return []
    d = json.load(open(p))
    if not d.get("success"):
        return []
    return d["data"].get("samples") or []

def ts_second(iso):
    dt = datetime.fromisoformat(iso)
    return dt.replace(microsecond=0).isoformat()

def local_date(iso):
    return datetime.fromisoformat(iso).astimezone(PT).date().isoformat()

# ---- collect raw, tagged by source ----
raw_by_metric = defaultdict(list)  # metric -> list of (ts_iso, value, source)
for ident in IDENT:
    for m in METRICS:
        for s in load(ident, m):
            raw_by_metric[m].append((s["timestamp"], float(s["value"]), ident))

# ---- dedupe ----
unified = {}   # metric -> list of unified samples
dedupe_stats = {}
for m, rows in raw_by_metric.items():
    buckets = {}  # key -> {ts, value, sources:set}
    exact_dups = 0
    cross_device_dups = 0
    for ts, val, src in rows:
        vr = round(val, 4)
        tsec = ts_second(ts)
        key = (tsec, vr)
        if key in buckets:
            exact_dups += 1
            if src not in buckets[key]["sources"]:
                cross_device_dups += 1
            buckets[key]["sources"].add(src)
            continue
        buckets[key] = {"ts": ts, "value": val, "sources": {src}}
    samples = sorted(buckets.values(), key=lambda x: x["ts"])
    for s in samples:
        s["sources"] = sorted(s["sources"])
    unified[m] = samples
    dedupe_stats[m] = {
        "raw_rows": len(rows),
        "unified": len(samples),
        "exact_dups_removed": exact_dups,
        "cross_device_dups": cross_device_dups,
        "by_source_raw": dict(Counter(src for _, _, src in rows)),
    }

# ---- write unified_samples.json ----
unified_out = {
    "generated_at": datetime.now(tz=ZoneInfo("UTC")).isoformat(),
    "identities": IDENT,
    "dedupe_rule": "key=(metric,ts_second,round(value,4)); exact-key collapse only, union sources; no same-value time-window merge (would destroy legit repeated increments)",
    "timezone_for_calendar": "America/Los_Angeles",
    "metrics": {},
}
for m in METRICS:
    unified_out["metrics"][m] = [
        {"ts": s["ts"], "value": s["value"], "sources": s["sources"]}
        for s in unified.get(m, [])
    ]
json.dump(unified_out, open(os.path.join(OUT, "unified_samples.json"), "w"))

# ---- coverage report ----
def first_last(samples):
    if not samples:
        return None
    f, l = samples[0]["ts"], samples[-1]["ts"]
    return {
        "first_utc": f, "last_utc": l,
        "first_pt": datetime.fromisoformat(f).astimezone(PT).strftime("%Y-%m-%d %H:%M %Z"),
        "last_pt":  datetime.fromisoformat(l).astimezone(PT).strftime("%Y-%m-%d %H:%M %Z"),
        "first_pt_date": local_date(f), "last_pt_date": local_date(l),
    }

# per-day per-metric density (Pacific)
day_metric = defaultdict(lambda: defaultdict(int))
day_sources = defaultdict(set)
for m in METRICS:
    for s in unified[m]:
        d = local_date(s["ts"])
        day_metric[d][m] += 1
        for src in s["sources"]:
            day_sources[d].add(src)

all_days = sorted(day_metric.keys())

# worn day = Pacific day with >=1 heart_rate sample (canonical presence signal)
worn_days = sorted([d for d in all_days if day_metric[d]["heart_rate"] > 0])
# broader: any biometric
any_biom_days = all_days

# genuine gaps within span (Pacific), based on worn_days (HR presence)
def gaps(days):
    if not days:
        return []
    out = []
    ds = [datetime.fromisoformat(x).date() for x in days]
    for a, b in zip(ds, ds[1:]):
        delta = (b - a).days
        if delta > 1:
            out.append({"after": a.isoformat(), "before": b.isoformat(), "gap_days": delta - 1})
    return out

# meeting era analysis (5/24 -> now, per prior art Granola 5/24-6/30)
MEET_START = "2026-05-24"
meeting_era_worn = [d for d in worn_days if d >= MEET_START]
meeting_era_anybiom = [d for d in any_biom_days if d >= MEET_START]

# device-A-only worn days (pre-stitch view) vs unified worn days -> what stitch recovered
def worn_for_source(src):
    dd = defaultdict(int)
    for s in unified["heart_rate"]:
        if src in s["sources"]:
            dd[local_date(s["ts"])] += 1
    return sorted(d for d, c in dd.items() if c > 0)

worn_A = worn_for_source("deviceA")
worn_B = worn_for_source("deviceB")
recovered = sorted(set(worn_days) - set(worn_A))  # days present in unified HR but not device-A

report = {
    "generated_at": unified_out["generated_at"],
    "dedupe_stats": dedupe_stats,
    "per_metric_first_last": {m: first_last(unified[m]) for m in METRICS},
    "per_metric_unified_count": {m: len(unified[m]) for m in METRICS},
    "worn_day_definition": ">=1 heart_rate sample on a Pacific calendar day",
    "worn_days_unified": worn_days,
    "worn_days_count_unified": len(worn_days),
    "worn_days_deviceA_only": worn_A,
    "worn_days_deviceA_only_count": len(worn_A),
    "worn_days_deviceB": worn_B,
    "worn_days_recovered_by_stitch": recovered,
    "any_biometric_days": any_biom_days,
    "any_biometric_days_count": len(any_biom_days),
    "genuine_gaps_HR_worn": gaps(worn_days),
    "meeting_era": {
        "start": MEET_START,
        "worn_days_in_meeting_era_HR": meeting_era_worn,
        "any_biometric_days_in_meeting_era": meeting_era_anybiom,
    },
    "per_day_metric_counts": {d: dict(day_metric[d]) for d in all_days},
    "per_day_sources": {d: sorted(day_sources[d]) for d in all_days},
}
json.dump(report, open(os.path.join(OUT, "coverage_report.json"), "w"), indent=1)

# ---- console summary ----
print("=== DEDUPE ===")
for m in METRICS:
    s = dedupe_stats[m]
    print(f"  {m:24s} raw={s['raw_rows']:5d} unified={s['unified']:5d} "
          f"exactdup={s['exact_dups_removed']} crossdev={s['cross_device_dups']} "
          f"by_source={s['by_source_raw']}")
print("\n=== FIRST/LAST (unified) ===")
for m in METRICS:
    fl = report["per_metric_first_last"][m]
    if fl:
        print(f"  {m:24s} {fl['first_pt_date']} -> {fl['last_pt_date']}  (last UTC {fl['last_utc']})")
    else:
        print(f"  {m:24s} (none)")
print(f"\nWORN DAYS (HR, Pacific): unified={len(worn_days)}  deviceA-only={len(worn_A)}  "
      f"recovered_by_stitch={recovered}")
print("worn day span:", worn_days[0], "->", worn_days[-1])
print("genuine gaps (HR worn):")
for g in report["genuine_gaps_HR_worn"]:
    print("   ", g)
print("\n=== MEETING ERA (>= 5/24) ===")
print("  worn days (HR):", meeting_era_worn)
print("  any-biometric days:", meeting_era_anybiom)
