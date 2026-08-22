"""
Local read-only reconstruction of the PATTERN layer (five WuXing stress patterns)
over the full Mar 18 - Jul 2 window, using the EXACT production inference code
imported from daobrew_backend (no server, no DB writes).

Pattern layer = wood/fire/earth/metal/water WuXing scores, mapped to
TENSION / OVERDRIVE / STAGNATION / CONSTRICTION / DEPLETION (DaobrewIOS Models.swift:136-168).

Pipeline mirrors daobrew_backend/utils/update_cycle.py::perform_update (algorithmic path):
  raw samples -> FeatureExtractor.extract_intraday_features
              -> YinYangStateInference.infer_state (quadrant)
              -> FeatureExtractor.normalize_for_wuxing (flat keys; from origin/main)
              -> wuxing.infer_states (5 element scores, yin/yang modulation)
              -> _enforce_element_eligibility (quadrant gating)
"""
import json, sys, statistics
from collections import defaultdict
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/Users/yz/DaobrewAI")
# Skip daobrew_backend/__init__.py (imports psycopg via main) — only the
# pure state_inference modules are needed for this read-only recompute.
import types as _types
_pkg = _types.ModuleType("daobrew_backend"); _pkg.__path__ = ["/Users/yz/DaobrewAI/daobrew_backend"]
sys.modules.setdefault("daobrew_backend", _pkg)
_sub = _types.ModuleType("daobrew_backend.state_inference"); _sub.__path__ = ["/Users/yz/DaobrewAI/daobrew_backend/state_inference"]
sys.modules.setdefault("daobrew_backend.state_inference", _sub)

from daobrew_backend.state_inference.yinyang import YinYangStateInference
from daobrew_backend.state_inference.wuxing import infer_states
# origin/main version of normalize_for_wuxing (HEAD lacks it) — vendored copy
import importlib.util
spec = importlib.util.spec_from_file_location(
    "prod_features_main",
    __import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "..", "prod_features_main.py"),
)
prod_feat = importlib.util.module_from_spec(spec)
# stub the relative import used by prod_features_main
import types
pkg = types.ModuleType("daobrew_backend.healthkit.ingestion")
class HealthDataSample: pass
class HealthMetricType: pass
pkg.HealthDataSample = HealthDataSample
pkg.HealthMetricType = HealthMetricType
sys.modules.setdefault("daobrew_backend.healthkit.ingestion", pkg)
# prod_features_main uses `from ..healthkit.ingestion import ...` — rewrite to absolute
src = open(spec.origin).read().replace("from ..healthkit.ingestion import", "from daobrew_backend.healthkit.ingestion import")
exec(compile(src, spec.origin, "exec"), prod_feat.__dict__)
FeatureExtractor = prod_feat.FeatureExtractor

# Eligibility enforcement (copied verbatim from update_cycle.py::_enforce_element_eligibility)
def enforce_eligibility(wuxing_states, yy_category):
    states = {e: dict(s) for e, s in wuxing_states.items()}
    if yy_category == 'in_flow':
        pass
    elif yy_category == 'pushing_it':
        for elem in ('earth', 'water', 'metal'):
            if not states.get(elem, {}).get('active', False):
                states[elem] = {"score": 0, "active": False}
        states['fire'] = {"score": max(75, states.get('fire', {}).get('score', 75)), "active": True}
    elif yy_category in ('recharging', 'running_on_empty'):
        for elem in ('earth', 'fire', 'wood'):
            if not states.get(elem, {}).get('active', False):
                states[elem] = {"score": 0, "active": False}
        states['water'] = {"score": max(75, states.get('water', {}).get('score', 75)), "active": True}
    return states

PATTERN_NAME = {"wood":"TENSION","fire":"OVERDRIVE","earth":"STAGNATION","metal":"CONSTRICTION","water":"DEPLETION"}
ELEMENTS = ("wood","fire","earth","metal","water")

# Input: hk_<metric>.json files ({"data":{"samples":[{"timestamp","value"}]}}).
# Default derives them from the committed unified_v2.json via build_inputs();
# override with RECONSTRUCT_DATA_DIR for a raw pull directory.
import os as _os
HERE_DIR = _os.path.dirname(_os.path.abspath(__file__))
FIXTURES = _os.path.abspath(_os.path.join(HERE_DIR, "..", ".."))
DATA = _os.environ.get("RECONSTRUCT_DATA_DIR", _os.path.join(HERE_DIR, "_data_unified_derived"))

def build_inputs():
    if _os.path.isdir(DATA) and _os.listdir(DATA):
        return
    _os.makedirs(DATA, exist_ok=True)
    u = json.load(open(_os.path.join(FIXTURES, "data", "reunified", "unified_v2.json")))
    for metric, samples in u["metrics"].items():
        json.dump({"data": {"samples": [{"timestamp": s["ts"], "value": s["value"]} for s in samples]}},
                  open(_os.path.join(DATA, f"hk_{metric}.json"), "w"))
build_inputs()

def load(metric):
    d = json.load(open(f"{DATA}/hk_{metric}.json"))["data"]["samples"]
    out = []
    for s in d:
        ts = datetime.fromisoformat(s["timestamp"]).timestamp()
        out.append((ts, float(s["value"])))
    return sorted(out)

hr   = load("heart_rate")
hrv  = load("heart_rate_variability")
rhr  = load("resting_heart_rate")
steps= load("step_count")
energy=load("active_energy_burned")
resp = load("respiratory_rate")

# Pacific local day boundaries (user device is US/Pacific: 03-18T19:24Z = 12:24 PDT)
PT = timezone(timedelta(hours=-7))  # PDT for this window (Mar-Jul all DST)

def in_range(samples, lo, hi):
    return [v for (t,v) in samples if lo <= t < hi]

# Simple lightweight HealthDataSample-like for feature extractor
class S:
    def __init__(self, v): self.value = v

def feats_for_window(lo, hi):
    hk = {
        "heart_rate":[S(v) for v in in_range(hr,lo,hi)],
        "heart_rate_variability":[S(v) for v in in_range(hrv,lo,hi)],
        "step_count":[S(v) for v in in_range(steps,lo,hi)],
        "active_energy_burned":[S(v) for v in in_range(energy,lo,hi)],
        "respiratory_rate":[S(v) for v in in_range(resp,lo,hi)],
    }
    return hk

# ---- Rolling baselines, EMA per production update_rolling_baseline, walked day by day ----
def make_baseline():
    return {}

def update_baseline(bl, features):
    metric_map = {
        "heart_rate": features.get("heart_rate", {}).get("mean_hr"),
        "hrv": features.get("hrv", {}).get("mean_hrv"),
        "respiratory_rate": features.get("respiratory", {}).get("mean_respiratory_rate"),
    }
    for name, val in metric_map.items():
        if val is None: continue
        if name in bl:
            m,s,c = FeatureExtractor.update_rolling_baseline(bl[name]["baseline_mean"], bl[name]["baseline_std"], bl[name]["sample_count"], val)
        else:
            m,s,c = val, 0.01, 1
        bl[name] = {"baseline_mean":m, "baseline_std":s, "sample_count":c}

yy_engine = YinYangStateInference()

def classify_window(hk, baselines, prev_yy, min_hr_samples=3):
    feats = FeatureExtractor.extract_intraday_features(hk, baselines, window_hours=12.0)
    n_hr = len(hk["heart_rate"]); n_hrv=len(hk["heart_rate_variability"]); n_steps=len(hk["step_count"])
    # yin/yang
    yyf = feats.get("yin_yang_features", {})
    yy = yy_engine.infer_state(
        hrv_features=yyf.get("hrv_features", feats.get("hrv",{})),
        hr_features=yyf.get("hr_features", feats.get("heart_rate",{})),
        activity_features=yyf.get("activity_features", feats.get("activity",{})),
        baselines=baselines,
        previous_state=prev_yy,
    )
    # wuxing
    wxf = FeatureExtractor.normalize_for_wuxing(feats, baselines)
    wx_raw = infer_states(features=wxf, yin_score=yy["yin_score"], yang_score=yy["yang_score"])
    wx = enforce_eligibility({e:dict(s) for e,s in wx_raw.items()}, yy["category"])
    data_ok = feats.get("heart_rate",{}).get("data_available") or feats.get("hrv",{}).get("data_available")
    quality = "real_inference" if (data_ok and n_hr >= min_hr_samples) else ("sparse_data" if (n_hr>0 or n_steps>0) else "no_data")
    return feats, yy, wx, {"n_hr":n_hr,"n_hrv":n_hrv,"n_steps":n_steps}, quality, wx_raw

# ---- Build timeline over full window ----
START = datetime(2026,3,18,tzinfo=PT).replace(hour=0,minute=0,second=0,microsecond=0)
END   = datetime(2026,7,2,tzinfo=PT).replace(hour=23,minute=59,second=59)

timeline = []
baselines = make_baseline()
# NOTE: cross-window smoothing (production's 0.3 EMA) is DISABLED here.
# It is designed for intraday 4h continuity; chaining it across multi-day watch
# gaps manufactures phantom drift on no-data days. Each worn day/half-day is
# classified independently (previous_state=None). Documented deviation.

day = START
while day <= END:
    lo = day.timestamp(); hi = (day+timedelta(days=1)).timestamp()
    hk = feats_for_window(lo, hi)
    feats, yy, wx, counts, quality, wx_raw = classify_window(hk, baselines, None)
    scores = {e: wx[e]["score"] for e in ELEMENTS}
    raw_scores = {e: wx_raw[e]["score"] for e in ELEMENTS}
    any_active = any(wx[e]["active"] for e in ELEMENTS)
    has_bio = quality in ("real_inference","sparse_data")
    dom_elem = (max(scores, key=scores.get)) if has_bio else None
    dom_pattern = PATTERN_NAME[dom_elem] if dom_elem else None
    # half-days (AM 00-12, PM 12-24 local)
    halfdays = {}
    for label, (h0,h1) in {"AM":(0,12),"PM":(12,24)}.items():
        hl = (day+timedelta(hours=h0)).timestamp(); hh = (day+timedelta(hours=h1)).timestamp()
        hkH = feats_for_window(hl, hh)
        _, yyH, wxH, cntH, qualH, _wxrawH = classify_window(hkH, baselines, None, min_hr_samples=2)
        scoresH = {e: wxH[e]["score"] for e in ELEMENTS}
        anyH = any(wxH[e]["active"] for e in ELEMENTS)
        hasH = qualH in ("real_inference","sparse_data")
        halfdays[label] = {
            "dominant_pattern": (PATTERN_NAME[max(scoresH,key=scoresH.get)] if hasH else None),
            "any_active": anyH if hasH else None,
            "balanced_flag": (not anyH) if hasH else None,
            "scores": scoresH if hasH else None,
            "yin": yyH["yin_score"], "yang": yyH["yang_score"], "quadrant": yyH["category"],
            "counts": cntH, "source_quality": qualH,
        }
    # update rolling baseline only from worn days (skip empty windows)
    if has_bio:
        update_baseline(baselines, feats)
    timeline.append({
        "date": day.strftime("%Y-%m-%d"),
        "dominant_pattern": dom_pattern,
        "dominant_element": dom_elem,
        "any_active": any_active if has_bio else None,
        "balanced_flag": (not any_active) if has_bio else None,   # "balanced" = worn day with NO active pattern (all <50)
        "pattern_scores": {PATTERN_NAME[e]: scores[e] for e in ELEMENTS} if has_bio else None,
        "pattern_scores_raw_pre_gate": {PATTERN_NAME[e]: raw_scores[e] for e in ELEMENTS} if has_bio else None,
        "dominant_pattern_raw_pre_gate": (PATTERN_NAME[max(raw_scores,key=raw_scores.get)] if has_bio and max(raw_scores.values())>0 else None),
        "element_scores": scores if has_bio else None,
        "active_patterns": [PATTERN_NAME[e] for e in ELEMENTS if wx[e]["active"]] if has_bio else [],
        "yin_score": yy["yin_score"] if has_bio else None,
        "yang_score": yy["yang_score"] if has_bio else None,
        "quadrant": yy["category"] if has_bio else None,
        "hr_mean": round(feats["heart_rate"]["mean_hr"],1) if feats["heart_rate"]["data_available"] else None,
        "hrv_mean": round(feats["hrv"]["mean_hrv"],1) if feats["hrv"]["data_available"] else None,
        "steps": feats["activity"].get("total_steps"),
        "counts": counts,
        "source_quality": quality,
        "halfdays": halfdays,
    })
    day += timedelta(days=1)

out = _os.environ.get("RECONSTRUCT_OUT", _os.path.join(FIXTURES, "data", "reunified", "pattern_timeline_v2.json"))
json.dump({"generated_at": datetime.now(timezone.utc).isoformat(),
           "method":"local read-only exec of daobrew_backend algorithmic path; rolling EMA baselines; Pacific day boundaries",
           "pattern_map": PATTERN_NAME,
           "n_days": len(timeline),
           "timeline": timeline}, open(out,"w"), indent=1)

# ---- Summary ----
from collections import Counter
real = [d for d in timeline if d["source_quality"]=="real_inference"]
sparse=[d for d in timeline if d["source_quality"]=="sparse_data"]
nodata=[d for d in timeline if d["source_quality"]=="no_data"]
print("n_days", len(timeline), "| real", len(real), "sparse", len(sparse), "no_data", len(nodata))
print("dominant pattern dist (all):", dict(Counter(d["dominant_pattern"] for d in timeline)))
print("dominant pattern dist (real only):", dict(Counter(d["dominant_pattern"] for d in real)))
print("balanced days (no active pattern):", sum(1 for d in timeline if d["balanced_flag"]), "of", len(timeline))
print("balanced days (real only):", sum(1 for d in real if d["balanced_flag"]), "of", len(real))
print("quadrant dist (real):", dict(Counter(d["quadrant"] for d in real)))
last_real = max((d["date"] for d in real), default=None)
print("last real_inference day:", last_real)
print("dominant RAW pre-gate (real only):", dict(Counter(d["dominant_pattern_raw_pre_gate"] for d in real)))
print("wrote", out)
