#!/usr/bin/env python3
"""Coverage inventory: per identity x metric: n, date range, monthly histogram, per-day counts May-Jul."""
import json, os, collections
from datetime import datetime, timezone

RAW = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/reunify/raw"
IDENTS = ["apikey", "deviceA", "deviceB"]
METRICS = ["heart_rate", "heart_rate_variability", "resting_heart_rate",
           "respiratory_rate", "step_count", "active_energy_burned"]

out = {}
for ident in IDENTS:
    out[ident] = {}
    for m in METRICS:
        p = os.path.join(RAW, f"{ident}__{m}__year.json")
        with open(p) as f:
            d = json.load(f)
        samples = d.get("data", {}).get("samples", [])
        ts = sorted(s["timestamp"] for s in samples)
        months = collections.Counter(t[:7] for t in ts)
        days = collections.Counter(t[:10] for t in ts if t[:7] in ("2026-05", "2026-06", "2026-07"))
        out[ident][m] = {
            "n": len(ts),
            "first": ts[0] if ts else None,
            "last": ts[-1] if ts else None,
            "by_month": dict(sorted(months.items())),
            "by_day_may_jul": dict(sorted(days.items())),
        }
    # state history
    p = os.path.join(RAW, f"{ident}__state_history_full.json")
    with open(p) as f:
        d = json.load(f)
    states = d.get("data", {}).get("states", [])
    sts = sorted(s.get("timestamp") or s.get("ts") or s.get("created_at_ts") or 0 for s in states)
    def fmt(t):
        if isinstance(t, (int, float)) and t > 0:
            return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
        return t if t else None
    smonths = collections.Counter(
        datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m") if isinstance(t,(int,float)) and t>0 else str(t)[:7]
        for t in sts if t)
    out[ident]["state_history"] = {
        "n": len(states),
        "first": fmt(sts[0]) if sts else None,
        "last": fmt(sts[-1]) if sts else None,
        "by_month": dict(sorted(smonths.items())),
        "keys_sample": sorted(states[0].keys()) if states else None,
    }
    # session logs
    p = os.path.join(RAW, f"{ident}__session_logs.json")
    with open(p) as f:
        d = json.load(f)
    dd = d.get("data", {})
    logs = dd.get("logs") or dd.get("session_logs") or (dd if isinstance(dd, list) else [])
    out[ident]["session_logs_n"] = len(logs) if isinstance(logs, list) else str(dd)[:200]

with open(os.path.join(RAW, "..", "coverage_matrix.json"), "w") as f:
    json.dump(out, f, indent=1)

# compact print
for ident in IDENTS:
    print(f"\n=== {ident} ===")
    for m in METRICS:
        c = out[ident][m]
        print(f"{m:26s} n={c['n']:6d}  {str(c['first'])[:19]} -> {str(c['last'])[:19]}")
        if c["by_month"]:
            print(f"{'':26s} months: {c['by_month']}")
    sh = out[ident]["state_history"]
    print(f"{'state_history':26s} n={sh['n']:6d}  {str(sh['first'])[:19]} -> {str(sh['last'])[:19]} months={sh['by_month']}")
    print(f"{'session_logs':26s} n={out[ident]['session_logs_n']}")
