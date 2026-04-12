# 🍵 @daobrew/wellness-mcp

**Your coding agent just learned to read your body.**

Reads your biometrics (Apple Watch, Oura Ring), detects stress patterns, and plays therapeutic breathing music with binaural beats — all without leaving your editor.

No popups. No app switching. Just music that fades in when you need it. 🎧

---

## ⚡ Quick Start

```bash
npm install -g @daobrew/wellness-mcp
npx daobrew-wellness-setup
```

Two questions. 30 seconds. Done.

Works with **Claude Code**, **Cursor**, **Windsurf**, and any MCP-compatible agent.

---

## 🧘 What It Does

```
You're coding.   →   Agent detects stress.   →   Music fades in.   →   You keep coding.
                      (real biometric data)       (binaural beats       (stress goes down)
                                                   + breath pacing)
```

- 📊 **Detects stress** from real biometrics — HRV, heart rate, sleep, activity
- 🌿 **Maps to 5 stress patterns** — Wood/Tension, Fire/Overdrive, Earth/Stagnation, Metal/Constriction, Water/Depletion
- 🎵 **Plays genre-matched music** with 4Hz theta binaural beats and breath-paced volume swells
- 🔇 **Zero interruption** — ambient mode works silently in the background

---

## 🎮 Usage

### On-demand — ask anytime
```
/stress     →   "You're in Pushing It mode — Fire · Heart Qi restlessness (score 72)"
/breathe    →   Lo-fi jazz fades in through your headphones 🎧
/stop       →   Music stops, session result logged
```

### Ambient — hands-free stress relief
Enable once: *"enable ambient mode"*

From then on, your agent monitors stress at natural breakpoints. When it detects a spike + you have headphones in, therapeutic music fades in silently. You keep coding. Your HRV recovers. One line at the end:

> ♪ Session ended. HRV 28ms → 41ms (+46%), HR 82 → 71bpm.

Say *"disable wellness"* anytime to turn it off.

---

## 📱 Data Sources

| Source | What You Get | How to Connect |
|--------|-------------|----------------|
| ⌚ **Apple Watch** | HRV, HR, steps, sleep, respiratory | Install [DaoBrew Health Sync](https://testflight.apple.com/join/6XTNFvv5) on iPhone |
| 💍 **Oura Ring** | HRV, HR, sleep, readiness, temp | Say *"connect oura"* in your agent |
| 🚶 **None** | Step count only (demo mode) | Works out of the box |

---

## 🎵 The Five Sounds

Each stress pattern gets its own sound, breathing rate, and vibe:

| Pattern | When You Feel... | Sound | What It Does |
|---------|-----------------|-------|-------------|
| 🌲 Wood | Tense, tight, clenching | Flowing ambient | Releases tension, restores flow |
| 🔥 Fire | Wired, restless, can't focus | Warm lo-fi jazz | Cools the mind, settles racing thoughts |
| ⛰️ Earth | Sluggish, foggy, unmotivated | Gentle acoustic | Grounds and centers, wakes you up gently |
| ⚔️ Metal | Shallow breathing, constricted | Nature soundscape | Opens the chest, deepens your breath |
| 🌊 Water | Drained, depleted, running on empty | Deep ambient drone | Deep rest, replenishes your reserves |

Every track layers a **4Hz theta binaural beat** (requires headphones) plus **breath-paced volume modulation** — the music rises and falls to gently guide your breathing.

> 💡 On your first session, the agent tells you: *"Breathe in as the music rises, out as it fades."* After that, your body remembers — no voice prompts, just music.

---

## 🛠 9 Tools

| Tool | What It Does |
|------|-------------|
| `daobrew_get_wellness_state` | Yin/Yang balance + Five Element stress scores |
| `daobrew_get_element_detail` | Evidence breakdown for a specific pattern |
| `daobrew_start_breathing_session` | Start session with audio/text |
| `daobrew_get_session_result` | Post-session HRV changes |
| `daobrew_get_session_history` | Recent sessions and trends |
| `daobrew_stop_session` | Stop current session |
| `daobrew_status` | Server mode, headphones, preferences |
| `daobrew_set_monitoring` | Configure ambient, volume, cooldown |
| `daobrew_connect_source` | Connect Apple Watch or Oura Ring |

---

## 🔒 Privacy

- Agent only sees **wellness scores** — never raw health records
- Health tokens stored locally at `~/.daobrew/`
- Speaker blocklist prevents accidental playback without headphones
- Ambient mode requires explicit opt-in

---

## 🏗 Architecture

```
  ⌚ Apple Watch ──→ iPhone SDK ──→ DaoBrew Cloud ──→ TCM Scoring Engine
  💍 Oura Ring ────→ OAuth API ──↗        ↓
                                    MCP Server (local)
                                         ↓
                                   Your Coding Agent
                                         ↓
                                  afplay / mpv 🎧
                              (binaural + breath modulation)
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
npm test          # 74 tests
npm run setup     # interactive setup
```

---

## 📜 License

MIT

---

*Built with 🍵 by [DaoBrew](https://daobrew.com).*
*Take a breath. Your code can wait.*


Sat Apr 11 18:30:28 PDT 2026
