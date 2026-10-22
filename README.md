# 🍵 @daobrew/wellness-mcp

**Your coding agent just learned to read your body.**

An MCP server that brings your Apple Watch data (via DaoBrew Health Sync) into Claude Code, Cursor or Windsurf. It maps what it observes in your own data to five body-signal patterns, plays breath-paced music with binaural beats, and streams a live dashboard PNG into your chat — all without leaving your editor.

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
You're coding.   →   Agent spots a pattern   →   Music fades in + dashboard appears.   →   You keep coding.
                      in your own data.           (binaural + breath pacing,                 (no app switch)
                      (your Apple Watch)           live HR streamed to chat)
```

- 📊 **Reads your own biometrics** — HRV, heart rate, sleep, activity — as facts observed in your data
- 🌿 **Maps them to 5 patterns** — Tension, Overdrive, Stagnation, Constriction, Depletion
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

*The score and HR above are illustrative, not real user data.*

### Ambient — hands-free breathing breaks
Enable once: *"enable ambient mode"*

From then on, your agent checks your own data at natural breakpoints. When it sees one of the five patterns and you have headphones in, breath-paced music fades in quietly. You keep coding.

Say *"disable wellness"* anytime to turn it off.

---

## 📱 Data Sources

| Source | What You Get | How to Connect |
|--------|-------------|----------------|
| ⌚ **Apple Watch** | HRV, HR, steps, sleep, respiratory + live 1Hz HR during sessions | Install [DaoBrew Health Sync](https://testflight.apple.com/join/6XTNFvv5) on iPhone |

(Oura Ring + Google Fit are not currently supported by this MCP connection flow.)

---

## 🎵 The Five Sounds

Each pattern gets its own sound, breathing pace, and vibe:

| Pattern | When You Feel... | Sound | Good For |
|---------|-----------------|-------|----------|
| 🌲 Tension | Tense, tight, clenching | Flowing ambient | Coming back to steady work after a hard push |
| 🔥 Overdrive | Wired, restless, can't focus | Warm lo-fi jazz | Slowing down when you're switching tasks too fast |
| ⛰️ Stagnation | Sluggish, foggy, unmotivated | Gentle acoustic | Getting moving on the next task |
| ⚔️ Constriction | Shallow breathing, constricted | Nature soundscape | A breathing reset between tasks |
| 🌊 Depletion | Drained, depleted, running on empty | Deep ambient drone | A slow wind-down at the end of a heavy day |

Every track layers a **4Hz theta binaural beat** (requires headphones) plus **breath-paced volume modulation** — the music rises and falls to gently guide your breathing.

> 💡 On your first session, the agent tells you: *"Breathe in as the music rises, out as it fades."* After that, no voice prompts — just music.

---

## 🛠 10 Tools

| Tool | What It Does |
|------|-------------|
| `daobrew_check` | Current pattern from your own data + live dashboard PNG (auto-poll every 2s during a session) |
| `daobrew_breathe` | Start a breathing session for a pattern (`tension` / `overdrive` / `stagnation` / `constriction` / `depletion`) |
| `daobrew_stop` | Stop the current session, return final HRV delta + summary PNG |
| `daobrew_history` | Recent sessions and trends |
| `daobrew_status` | Server mode, headphones, preferences, active session |
| `daobrew_settings` | Configure ambient, volume, cooldown, voiceover |
| `daobrew_connect_watch` | Pair your Apple Watch via the Health Sync TestFlight app |
| `daobrew_detonate` | Fetch the armed root cause from your causal-chain graph as a task package |
| `daobrew_schedule_block` | Put a prep block on macOS Calendar.app |
| `daobrew_detonate_done` | Close the loop: record the artifact, ghost node becomes real |

---

## 💥 Detonator — from body signal to finished task

Sentinel (the DaoBrew macOS app) finds the work your body keeps reacting to:
the **thing on your calendar you keep not finishing**. Detonating hands that thing to
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
- Speaker blocklist stops accidental playback without headphones
- Ambient mode requires explicit opt-in

---

## 🏗 Architecture

```
  ⌚ Apple Watch ──→ iPhone Health Sync ──→ DaoBrew Cloud ──→ Pattern Scoring Engine
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
