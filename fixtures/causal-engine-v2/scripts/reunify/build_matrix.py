#!/usr/bin/env python3
"""Emit clean consolidated coverage_matrix.json for downstream reunify stages."""
import json, os, collections
from datetime import datetime, timezone
RAW = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/reunify/raw"
OUT = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/reunify/coverage_matrix.json"
IDENTS = {"apikey":"apikey:dbk_n6exu553","deviceA":"4A008E08-4076-4BA6-B930-3C41B6E50153","deviceB":"51A5B98C-7034-4B24-B2A5-C8621E32CBC9"}
METRICS = ["heart_rate","heart_rate_variability","resting_heart_rate","respiratory_rate","step_count","active_energy_burned"]
def mo(t): return datetime.fromtimestamp(t,tz=timezone.utc).strftime("%Y-%m")
LAST_REAL_SAMPLE_TS = 1782523147  # deviceA HR 2026-06-23T01:39:07Z = union last biometric

matrix = {"generated_at": datetime.now(timezone.utc).isoformat(),
          "identities": IDENTS,
          "union_last_biometric_utc": "2026-06-23T01:39:07Z",
          "per_identity": {}}
for ident, uid in IDENTS.items():
    node = {"user_id": uid, "healthkit": {}, "state_history": {}, "session_logs_n": 0}
    for m in METRICS:
        s = json.load(open(os.path.join(RAW,f"{ident}__{m}__year.json")))["data"]["samples"]
        ts = sorted(x["timestamp"] for x in s)
        node["healthkit"][m] = {"n":len(ts),"first":ts[0] if ts else None,"last":ts[-1] if ts else None,
                                "by_month":dict(sorted(collections.Counter(t[:7] for t in ts).items()))}
    st = json.load(open(os.path.join(RAW,f"{ident}__state_history_full.json")))["data"]["states"]
    if st:
        bts=[x["bucket_ts"] for x in st]
        node["state_history"]={"n":len(st),
            "first":datetime.fromtimestamp(min(bts),tz=timezone.utc).isoformat(),
            "last":datetime.fromtimestamp(max(bts),tz=timezone.utc).isoformat(),
            "by_month":dict(sorted(collections.Counter(mo(b) for b in bts).items())),
            "source_quality":dict(collections.Counter(x.get("source_quality") for x in st)),
            "n_after_union_last_biometric":sum(1 for b in bts if b>LAST_REAL_SAMPLE_TS),
            "flag":"MOCK-CONTAMINATED post 2026-06-23: data_verified label with no biometric substrate"}
    else:
        node["state_history"]={"n":0}
    sess=json.load(open(os.path.join(RAW,f"{ident}__session_logs.json")))["data"]
    node["session_logs_n"]=len(sess.get("sessions",[])) if isinstance(sess,dict) else 0
    matrix["per_identity"][ident]=node

# union of raw biometrics across both device silos (apikey contributes nothing)
union={}
for m in METRICS:
    allts=[]
    for ident in ("deviceA","deviceB"):
        allts += [x["timestamp"] for x in json.load(open(os.path.join(RAW,f"{ident}__{m}__year.json")))["data"]["samples"]]
    allts.sort()
    union[m]={"n":len(allts),"first":allts[0] if allts else None,"last":allts[-1] if allts else None}
matrix["union_deviceA_plus_deviceB"]=union
json.dump(matrix,open(OUT,"w"),indent=1)
print("wrote",OUT)
print(json.dumps({m:union[m] for m in METRICS},indent=1))
