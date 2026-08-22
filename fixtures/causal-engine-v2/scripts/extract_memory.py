import json, os, glob, datetime, re, sys

OUT="/private/tmp/claude-501/-Users-yz-DaobrewAI/2d925a5f-bef4-42da-80c9-6740aa7fa645/scratchpad/data/memory_lines.jsonl"
lines_out=[]

def add(ts, source, text, ref):
    text=text.strip()
    if not text or len(text)<15: return
    if text.startswith("<") and ("system-reminder" in text[:60] or "command-name" in text[:60]): return
    lines_out.append({"ts":ts,"source":source,"text":text[:2000],"ref":ref})

# --- Claude project sessions ---
proj_root=os.path.expanduser("~/.claude/projects")
for d in os.listdir(proj_root):
    pd=os.path.join(proj_root,d)
    if not os.path.isdir(pd): continue
    for f in glob.glob(os.path.join(pd,"*.jsonl")):
        try:
            with open(f) as fh:
                for line in fh:
                    try: obj=json.loads(line)
                    except: continue
                    if obj.get("type")!="user": continue
                    msg=obj.get("message",{})
                    if msg.get("role")!="user": continue
                    content=msg.get("content")
                    txt=""
                    if isinstance(content,str): txt=content
                    elif isinstance(content,list):
                        parts=[c.get("text","") for c in content if isinstance(c,dict) and c.get("type")=="text"]
                        txt="\n".join(parts)
                    if not txt: continue
                    # skip tool results / meta
                    if txt.startswith("[Request interrupted") or txt.startswith("Caveat:"): continue
                    ts=obj.get("timestamp")
                    if not ts: continue
                    try:
                        t=datetime.datetime.fromisoformat(ts.replace("Z","+00:00")).timestamp()
                    except: continue
                    add(t, f"claude:{d}", txt, os.path.basename(f))
        except Exception as e:
            pass

# --- Codex sessions (rollout jsonl) ---
codex_dirs=[os.path.expanduser("~/.codex/sessions"), os.path.expanduser("~/.codex/archived_sessions")]
for cd in codex_dirs:
    for f in glob.glob(os.path.join(cd,"**","*.jsonl"),recursive=True):
        try:
            with open(f) as fh:
                for line in fh:
                    try: obj=json.loads(line)
                    except: continue
                    # codex rollout format: {"timestamp":...,"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":...}]}}
                    p=obj.get("payload",{})
                    if not isinstance(p,dict): continue
                    if p.get("type")=="message" and p.get("role")=="user":
                        parts=[]
                        for c in p.get("content",[]):
                            if isinstance(c,dict) and c.get("type") in ("input_text","text"):
                                parts.append(c.get("text",""))
                        txt="\n".join(parts)
                        if not txt: continue
                        if txt.startswith("<") or txt.startswith("=="): continue
                        ts=obj.get("timestamp")
                        try:
                            t=datetime.datetime.fromisoformat(ts.replace("Z","+00:00")).timestamp()
                        except: continue
                        add(t, "codex", txt, os.path.relpath(f, cd))
        except: pass

# --- Codex memories dir ---
md=os.path.expanduser("~/.codex/memories")
for f in glob.glob(os.path.join(md,"**","*"),recursive=True):
    if os.path.isfile(f):
        try:
            st=os.stat(f)
            txt=open(f,errors="ignore").read()
            if txt.strip():
                add(st.st_mtime,"codex_memory",txt[:3000],os.path.basename(f))
        except: pass

# --- Claude auto-memory ---
am=os.path.expanduser("~/.claude/projects/-Users-yz-DaobrewAI/memory")
for f in glob.glob(os.path.join(am,"*.md")):
    try:
        st=os.stat(f)
        add(st.st_mtime,"claude_memory",open(f,errors="ignore").read()[:3000],os.path.basename(f))
    except: pass

lines_out.sort(key=lambda x:x["ts"])
with open(OUT,"w") as fh:
    for l in lines_out:
        fh.write(json.dumps(l,ensure_ascii=False)+"\n")
print("total lines:",len(lines_out))
if lines_out:
    print("range:",datetime.datetime.fromtimestamp(lines_out[0]["ts"]).date(),"->",datetime.datetime.fromtimestamp(lines_out[-1]["ts"]).date())
import collections
print(collections.Counter(l["source"].split(":")[0] for l in lines_out))
