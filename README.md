# 🍵 @daobrew/wellness-mcp

**Your coding agent just learned to read your body.**

Reads your biometrics (Apple Watch via DaoBrew Health Sync), detects stress patterns, plays therapeutic breathing music with binaural beats, and streams a live dashboard PNG into your chat — all without leaving your editor.

No popups. No app switching. Just music that fades in when you need it. 🎧

---

## ⚡ Quick Start

```bash
npx -y --package @daobrew/wellness-mcp daobrew-wellness-setup
```

Two questions. 30 seconds. Done.

Works with **Claude Code**, **Cursor**, **Windsurf**, and any MCP-compatible agent.

---

## 🧘 What It Does

```
You're coding.   →   Agent detects stress.   →   Music fades in + dashboard appears.   →   You keep coding.
                      (real biometric data)       (binaural + breath pacing,                 (stress goes down)
                                                   live HR streamed to chat)
```

- 📊 **Detects stress** from real biometrics — HRV, heart rate, sleep, activity
- 🌿 **Maps to 5 stress patterns** — Tension, Overdrive, Stagnation, Constriction, Depletion
- 🎵 **Plays genre-matched music** with 4Hz theta binaural beats and breath-paced volume swells
- 🖼  **Live dashboard PNG** auto-streamed every 2s — HR sparkline, breath bars, session progress
- 🔇 **Zero interruption** — ambient mode works silently in the background

---

## 🎮 Usage

### On-demand — ask anytime
```
/stress     →   "Top pattern: 🔥 Overdrive (score 72), HR 88. Want a session?"
/breathe    →   Lo-fi jazz fades in + dashboard appears in chat 🎧
/stop       →   Music stops, summary PNG returned
```

### Ambient — hands-free stress relief
Enable once: *"enable ambient mode"*

From then on, your agent monitors stress at natural breakpoints. When it detects a spike + you have headphones in, therapeutic music fades in silently. You keep coding. Your HRV recovers.

Say *"disable wellness"* anytime to turn it off.

---

## 📱 Data Sources

| Source | What You Get | How to Connect |
|--------|-------------|----------------|
| ⌚ **Apple Watch** | HRV, HR, steps, sleep, respiratory + live 1Hz HR during sessions | Install [DaoBrew Health Sync](https://testflight.apple.com/join/6XTNFvv5) on iPhone |

(Oura Ring + Google Fit are not currently supported by this MCP connection flow.)

---

## 🎵 The Five Sounds

Each stress pattern gets its own sound, breathing rate, and vibe:

| Pattern | When You Feel... | Sound | What It Does |
|---------|-----------------|-------|-------------|
| 🌲 Tension | Tense, tight, clenching | Flowing ambient | Releases tension, restores flow |
| 🔥 Overdrive | Wired, restless, can't focus | Warm lo-fi jazz | Cools the mind, settles racing thoughts |
| ⛰️ Stagnation | Sluggish, foggy, unmotivated | Gentle acoustic | Grounds and centers, wakes you up gently |
| ⚔️ Constriction | Shallow breathing, constricted | Nature soundscape | Opens the chest, deepens your breath |
| 🌊 Depletion | Drained, depleted, running on empty | Deep ambient drone | Deep rest, replenishes your reserves |

Every track layers a **4Hz theta binaural beat** (requires headphones) plus **breath-paced volume modulation** — the music rises and falls to gently guide your breathing.

> 💡 On your first session, the agent tells you: *"Breathe in as the music rises, out as it fades."* After that, your body remembers — no voice prompts, just music.

---

## 🛠 10 Tools

| Tool | What It Does |
|------|-------------|
| `daobrew_check` | Current stress pattern + live dashboard PNG (auto-poll every 2s during a session) |
| `daobrew_breathe` | Start a session for a stress pattern (`tension` / `overdrive` / `stagnation` / `constriction` / `depletion`) |
| `daobrew_stop` | Stop the current session, return final HRV delta + summary PNG |
| `daobrew_history` | Recent sessions and trends |
| `daobrew_status` | Server mode, headphones, preferences, active session |
| `daobrew_settings` | Configure ambient, volume, cooldown, voiceover |
| `daobrew_connect_watch` | Pair your Apple Watch via the Health Sync TestFlight app |
| `daobrew_detonate` | Fetch the armed root cause from your causal-chain graph as a task package |
| `daobrew_schedule_block` | Put a prep block on macOS Calendar.app |
| `daobrew_detonate_done` | Close the loop: record the artifact, ghost node becomes real |

---

## 💥 Detonator — from stress pattern to finished task

Sentinel (the DaoBrew macOS app) attributes your recurring stress spikes to the
**thing on your calendar you keep not finishing**. Detonating hands that thing to
your own coding agent as a task package — DaoBrew is brain + scheduling + brief +
routing; **your agent writes the artifact, never DaoBrew**.

```
read → attribute → detonate → verify
```

In a paired installation, `/detonator` reads the currently armed owner-local
action package. If no current package is available, the tool reports that state
without generating substitute evidence.

Graph DB lives at `~/Library/Application Support/DaoBrew/sentinel-graph.db`
(override with `DAOBREW_GRAPH_DB`). Shared schema with the Sentinel app.

---

## 🔒 Privacy

- Agent only sees **wellness scores** — never raw health records
- Health tokens stored locally at `~/.daobrew/`
- Speaker blocklist prevents accidental playback without headphones
- Ambient mode requires explicit opt-in

---

## 🏗 Architecture

```
  ⌚ Apple Watch ──→ iPhone Health Sync ──→ DaoBrew Cloud ──→ TCM Scoring Engine
                            │                       ↓
                            │              MCP Server (local)
                            │                       ↓
                            │             Your Coding Agent
                            │                       ↓
                            │              afplay 🎧 + dashboard PNG
                            │              (binaural + breath modulation)
                            ▼
                  POST /session/live-hr ──→ Backend cache ──→ GET /session/live-hr
                                                                       │
                                                              daobrew_check (every 2s)
```

---

## ⚙️ Configuration

Talk to your agent:
- *"set volume to 0.5"*
- *"change cooldown to 15 minutes"*
- *"trust headphones"* (skip detection)
- *"disable wellness"*

Or edit `~/.daobrew/prefs.json`.

---

## 🧑‍💻 Development

```bash
git clone <repo>
cd daobrew-wellness-mcp
npm install && npm run build
npm test          # 69 tests
npm run setup     # interactive setup
```

---

## 📜 License

MIT

---

*Built with 🍵 by [DaoBrew](https://daobrew.com).*
*Take a breath. Your code can wait.*
