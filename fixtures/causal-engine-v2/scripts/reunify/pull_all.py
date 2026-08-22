#!/usr/bin/env python3
"""Pull all metrics x identities from DaoBrew backend. Stage: Identity."""
import json, os, time, urllib.request, urllib.error

BASE = "https://daobrew-backend-iaupcwo6dq-uw.a.run.app"
RAW = "/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/reunify/raw"
os.makedirs(RAW, exist_ok=True)

IDENTITIES = {
    "apikey": {"Authorization": "Bearer dbk_n6exu553"},
    "deviceA": {"X-Device-ID": "4A008E08-4076-4BA6-B930-3C41B6E50153"},
    "deviceB": {"X-Device-ID": "51A5B98C-7034-4B24-B2A5-C8621E32CBC9"},
}
METRICS = ["heart_rate", "heart_rate_variability", "resting_heart_rate",
           "respiratory_rate", "step_count", "active_energy_burned"]

def fetch(path, headers, out_name):
    url = BASE + path
    req = urllib.request.Request(url, headers={**headers, "Accept": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
        data = json.loads(body)
        with open(os.path.join(RAW, out_name), "w") as f:
            json.dump(data, f)
        n = None
        d = data.get("data", {}) if isinstance(data, dict) else {}
        if isinstance(d, dict):
            if "samples" in d: n = len(d["samples"])
            elif "states" in d: n = len(d["states"])
            elif "logs" in d: n = len(d["logs"])
            elif "session_logs" in d: n = len(d["session_logs"])
        print(f"OK  {out_name}  n={n}  bytes={len(body)}  {time.time()-t0:.1f}s")
        return True
    except urllib.error.HTTPError as e:
        print(f"ERR {out_name}  HTTP {e.code}: {e.read()[:200]}")
    except Exception as e:
        print(f"ERR {out_name}  {type(e).__name__}: {e}")
    return False

now_ts = int(time.time())
start_2026 = 1767225600  # 2026-01-01 00:00 UTC
start_2025q4 = 1759276800  # 2025-10-01, extra margin

for ident, hdrs in IDENTITIES.items():
    for m in METRICS:
        fetch(f"/api/v1/healthkit/history?metric={m}&range=year", hdrs, f"{ident}__{m}__year.json")
    # state history full span (chunk by month to dodge limits)
    fetch(f"/api/v1/state/history?start_ts={start_2025q4}&end_ts={now_ts}&limit=100", hdrs, f"{ident}__state_history_full.json")
    fetch("/api/v1/state/current", hdrs, f"{ident}__state_current.json")
    fetch("/api/v1/session/logs?limit=100", hdrs, f"{ident}__session_logs.json")
print("DONE")
