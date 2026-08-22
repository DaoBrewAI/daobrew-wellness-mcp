"""Convert unified_samples.json (source-tagged, exact-deduped, deviceA∪deviceB)
into per-metric hk_<metric>.json files matching the reconstruct.py input schema
{"data":{"samples":[{"value","timestamp"}]}}. This is the ONLY input change vs the
prior deviceA-only pattern-v2 run: the biometric substrate is now the reunified union.
"""
import json
SP="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad"
U=json.load(open(f"{SP}/reunify/unified_samples.json"))
OUT=f"{SP}/reunify/data_unified"
metrics=U["metrics"]
summary={}
for metric,samples in metrics.items():
    rows=[{"value":s["value"],"timestamp":s["ts"]} for s in samples]
    rows.sort(key=lambda r:r["timestamp"])
    # count how many samples carry deviceB (recovered by stitch)
    nB=sum(1 for s in samples if "deviceB" in s["sources"])
    nA=sum(1 for s in samples if "deviceA" in s["sources"])
    ncross=sum(1 for s in samples if len(s["sources"])>1)
    json.dump({"success":True,"data":{"metric":metric,"range":"year","samples":rows,"aggregated":None},
               "error":None,"timestamp":None,"version":"unified"},
              open(f"{OUT}/hk_{metric}.json","w"))
    summary[metric]={"unified_n":len(rows),"has_deviceA":nA,"has_deviceB":nB,"cross_device":ncross}
print(json.dumps(summary,indent=1))
