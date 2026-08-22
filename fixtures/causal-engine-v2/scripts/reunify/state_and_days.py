#!/usr/bin/env python3
import json, os, collections
from datetime import datetime, timezone
RAW = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/reunify/raw"
def dstr(ts): return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
def mstr(ts): return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m")

for ident in ["apikey","deviceA","deviceB"]:
    d = json.load(open(os.path.join(RAW,f"{ident}__state_history_full.json")))
    states = d["data"]["states"]
    print(f"\n=== {ident} state_history n={len(states)} ===")
    if not states: continue
    bts = sorted(s["bucket_ts"] for s in states)
    print(f"  bucket range: {dstr(bts[0])} -> {dstr(bts[-1])}")
    print(f"  by_month: {dict(sorted(collections.Counter(mstr(s['bucket_ts']) for s in states).items()))}")
    print(f"  source_quality: {dict(collections.Counter(s.get('source_quality') for s in states))}")
    # source_quality by month
    sqm = collections.defaultdict(collections.Counter)
    for s in states: sqm[mstr(s['bucket_ts'])][s.get('source_quality')] += 1
    for mo in sorted(sqm): print(f"    {mo}: {dict(sqm[mo])}")

# per-day May-Jul for deviceA key metrics
print("\n=== deviceA per-day (May-Jul) ===")
for m in ["heart_rate","step_count","active_energy_burned","heart_rate_variability","resting_heart_rate"]:
    d = json.load(open(os.path.join(RAW,f"deviceA__{m}__year.json")))
    samples = d["data"]["samples"]
    days = collections.Counter(s["timestamp"][:10] for s in samples if s["timestamp"][:7] in ("2026-05","2026-06","2026-07"))
    print(f"\n  {m}:")
    for day in sorted(days): print(f"    {day}: {days[day]}")

print("\n=== deviceB per-day (all) heart_rate/step ===")
for m in ["heart_rate","step_count"]:
    d = json.load(open(os.path.join(RAW,f"deviceB__{m}__year.json")))
    days = collections.Counter(s["timestamp"][:10] for s in d["data"]["samples"])
    print(f"  {m}: {dict(sorted(days.items()))}")
