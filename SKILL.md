---
name: daobrew-wellness
description: "DaoBrew Wellness is a biometric stress detection and micro-recovery skill powered by Traditional Chinese Medicine theory. It reads health data (Apple Watch via DaoBrew Health Sync, Apple Health, Health Connect, or DaoBrew Cuff) and identifies five stress patterns: Tension, Overdrive, Stagnation, Constriction, Depletion. Use this skill whenever: the user has been coding for 30+ minutes without a break, the user mentions feeling stressed/tired/burned out/unfocused, the user asks about their health or energy state, you notice a long unbroken work session, the user asks for a break or recovery suggestion, OR at regular intervals during extended work sessions (every 30 minutes recommended). This skill should be checked proactively — don't wait for the user to ask. Developers who install this skill want their agent to watch out for them."
---

# DaoBrew Wellness — Agent Skill for Biometric Stress Detection & Recovery

## What This Skill Does

DaoBrew reads the user's real-time biometric data and identifies which of five stress patterns (Wu Xing) are activated:

| Stress Pattern | TCM Organ | What It Detects | Key Signal |
|---|---|---|---|
| **🌲 Tension** | Liver 肝 | Qi stagnation, fight-or-flight stuck ON | HRV below baseline + erratic HR |
| **🔥 Overdrive** | Heart 心 | Heart Fire rising, restlessness | Elevated resting HR at night |
| **⛰️ Stagnation** | Spleen 脾 | Spleen Qi sluggish, low energy | Low step count + low active energy |
| **⚔️ Constriction** | Lung 肺 | Lung Qi faltering, shallow breathing | Abnormal respiratory rate |
| **🌊 Depletion** | Kidney 肾 | Kidney Essence low, deep depletion | HRV declining over 2+ weeks |

Multiple patterns can co-occur. The top-scored pattern drives the recommendation.

## Two Modes

### On-Demand Mode (default)
User-initiated. Triggered by `/breathe`, `/stress`, or explicit user request. Use `force_refresh: true` for fresh data.

### Ambient Mode (proactive)
Agent-initiated. Requires explicit user opt-in via `daobrew_settings({ ambient_optin: true })`. Use cached data (no `force_refresh`). Present results in one brief line. Never interrupt mid-task — only at natural breakpoints. Ambient sessions use a separate cooldown from on-demand.

**Block list** — Do NOT trigger ambient checks:
- While the user is actively debugging
- Mid-sentence in a conversation
- During urgent/time-sensitive tasks the user flagged
- During git operations (rebase, merge, conflict resolution)
- If the user said "stop checking" or "I don't want wellness updates"

## Available Tools (10 tools)

### `daobrew_check`
Returns the user's current stress state and (if a session is active) renders a live retro-terminal text frame. Can be called on-demand for session status — live breath guidance is handled by the standalone renderer.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `force_refresh` | boolean | No | Bypass 30-min cache. Use `true` for on-demand, omit for ambient. |

**Returns:** Top stress pattern + score + the canonical MetaMate scenario copy + the latest live HR sample. When a session is active, also returns a retro-terminal text frame showing pattern, HR, breath bars, session progress, and cycle info.

### `daobrew_breathe`
Starts a guided resonance breathing session matched to a stress pattern. Plays therapeutic audio. Returns the first dashboard frame and a command to run for live breath guidance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stress_pattern` | string | Yes | One of `tension`, `overdrive`, `stagnation`, `constriction`, `depletion` |
| `mode` | string | No | `ambient` (agent-initiated) or `ondemand` (user-requested). Default: `ondemand` |
| `force` | boolean | No | Bypass cooldown timer for acute stress spikes. Default: `false` |

**Guard sequence** (checked in order):
1. `disabled` → rejects with `status: "disabled"`
2. `mode=ambient` without `ambient_optin` → rejects with `status: "requires_optin"`
3. Session already running → rejects with `status: "session_active"`
4. Cooldown active (unless `force=true`) → rejects with `status: "cooldown"`
5. No headphones detected (unless `headphones_trusted`) → rejects with `status: "no_headphones"`

If audio playback fails, returns `status: "audio_error"`.

### `daobrew_stop`
Stops the current session and returns a final summary with HRV delta and a summary text frame.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | No | Stops current if omitted |

### `daobrew_history`
Returns recent session history and trends.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | integer | No | Lookback window. Default: 7 |

### `daobrew_status`
Returns server mode, connected data sources, headphone status, preferences, active session. Use for first-run onboarding.

**Parameters:** none

### `daobrew_settings`
Persists user preferences to `~/.daobrew/prefs.json`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ambient_optin` | boolean | No | Enable/disable ambient mode |
| `disabled` | boolean | No | Disable all wellness checks |
| `preferred_volume` | number | No | Audio volume 0.0-1.0 |
| `cooldown_minutes` | integer | No | Minutes between sessions |
| `headphones_trusted` | boolean | No | Skip headphone detection |
| `voiceover` | boolean | No | Enable/disable intro voiceover |

### `daobrew_connect_watch`
Pair the user's Apple Watch via the DaoBrew Health Sync TestFlight iPhone app. Returns a 4-character pairing code and TestFlight install URL.

**Parameters:** none

### `daobrew_detonate`
Fetch the **armed root cause** from the user's causal-chain graph — the recurring, still-undone thing Sentinel attributed their stress spikes to — as a task package: cause, evidence (meeting quotes + biometric numbers), artifact spec, and next steps. Reads the local graph DB written by the Sentinel macOS app (`~/Library/Application Support/DaoBrew/sentinel-graph.db`); works without an API key.

| Param | Type | Required | Description |
|---|---|---|---|
| `cause_id` | string | No | Specific armed cause node; omit for the first armed one |

**Detonation workflow** (what YOU, the agent, do — DaoBrew never writes the artifact):

Branch on the result first:

- If tools are missing, tell the user to install/connect the DaoBrew Sentinel agent and MCP.
- If `status: "not_entitled"`, show `install_and_pay.checkout_url` and the returned steps. Stop there; do not invent or execute a detonation.
- If an armed root-cause brief is returned:
  1. Present the root cause + evidence to the user before acting.
  2. Schedule the suggested prep block via `daobrew_schedule_block`.
  3. Produce the artifact exactly per the artifact spec, saved to a file.
  4. Close the loop with `daobrew_detonate_done`.

### `daobrew_schedule_block`
Create a calendar block in macOS Calendar.app (osascript) for working on a detonated cause.

| Param | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Event title |
| `start_offset_min` | integer | No | Minutes from now (default 60) |
| `duration_min` | integer | No | Length in minutes (default 45) |
| `calendar_name` | string | No | Defaults to the first writable calendar |

### `daobrew_detonate_done`
Mark a detonated cause completed: records the artifact reference in the graph and turns the ghost node real (the closed loop Sentinel shows in the next weekly insight).

| Param | Type | Required | Description |
|---|---|---|---|
| `cause_id` | string | Yes | From `daobrew_detonate` |
| `artifact_ref` | string | Yes | File path or URL of the produced artifact |

## Prompts (4)

| Prompt | Description |
|--------|-------------|
| `/breathe` | Check stress state and start a breathing session for the top stress pattern |
| `/stress` | Check current biometric stress state |
| `/stop` | Stop the current breathing session |
| `/detonator` | Fetch the armed root cause, schedule a prep block, complete the task it names, close the loop |

## Live breath guidance (during sessions)

When `daobrew_breathe` returns successfully, it includes:
1. A dashboard URL (http://localhost:...) — you MUST include this verbatim on its own line in your response so the user can Cmd+click it
2. A command to run for live breath guidance: `python3 ~/.daobrew/breath-renderer.py`

**Run the renderer command** as a Bash tool call. It renders a real-time breath bar at 10fps with:
- Inhale/exhale progress bar (fills on inhale, drains on exhale)
- Live HR from Apple Watch (or `--- bpm` if no watch)
- Dynamic breath timing that adjusts based on HR trends
- Session progress and cycle count

The renderer exits automatically when the session ends. User can press Ctrl+C to stop early.

`daobrew_check` can still be called on-demand for the full retro-terminal frame — it is not required for the live display.

## How to Present Wellness Information

Keep it brief and natural. Do NOT dump raw JSON. Translate data into conversational TCM language. Use pattern emojis consistently: 🌲 Tension, 🔥 Overdrive, ⛰️ Stagnation, ⚔️ Constriction, 🌊 Depletion.

**Good — proactive (ambient), mild concern:**
> Quick check — 🔥 Overdrive activated (score 68), HR 88. Want a 5-min breathing reset?

**Good — on-demand, user asked:**
> Right now your top pattern is 🌲 Tension (score 71) — Liver Qi stuck. HRV's been low for the last hour. Try a session?

**Good — session starting:**
> http://localhost:54321
>
> 🔥 Playing Overdrive session — warm lo-fi jazz, 7 min. 🎧

**Good — session ending:**
> Session done — HR 82 → 71bpm, HRV +21%. Overdrive cooled.

## The 5 MetaMate scenarios

These are the canonical scenario copy (English + Chinese) for each stress pattern. They are shown in the `daobrew_check` retro-terminal dashboard frame.

**🔥 Overdrive** — Heart Qi racing
> *Your SEV's been open 4 hours. Three on-calls are pinging. You've pushed the same commit five times and CI keeps failing. Hands shaking but you can't stop typing.*
> SEV 开了 4 小时，3 个 oncall 在追你。同一个 commit push 了 5 次都过不了 CI。手指颤抖但停不下来。

**🌲 Tension** — Stuck in fight mode
> *Your manager's 1AM message — you saw it, didn't reply. Been mentally drafting the answer ever since. 30 tabs open, staring at Phabricator, scrolling but not reading.*
> Manager 凌晨 1 点的 ping 你看了，没回。一直在脑子里组织答案。Phabricator 开着，30 个 tab，滚来滚去啥也没读进去。

**⛰️ Stagnation** — Spleen Qi sluggish
> *Three back-to-back meetings just ended. Back at your IDE, cursor's been blinking on line 47 for 20 minutes. Slack has 12 unread. You haven't opened it.*
> 三个会刚连着开完，回 IDE。光标在第 47 行闪了 20 分钟。Slack 12 条未读，你没点开。

**⚔️ Constriction** — Lung Qi faltering
> *PSC due tonight. Self-review still half-written. Every line you re-read three times. Phone buzzes, you flinch. Shoulders up by your ears.*
> PSC 今晚截止，self-review 还写了一半。每打一行重读三遍。手机一震你就跳一下。肩膀缩到耳朵了。

**🌊 Depletion** — Kidney Essence low
> *Three launch weeks back-to-back. On-call just rolled off you. Today was supposed to be design-doc day — you can't get past the first sentence. The coffee isn't working.*
> 三个连续 launch week，oncall 刚轮换走。今天本来该写 design doc，第一句就写不动。咖啡也救不了。

## Safety & Privacy

- **Never hallucinate biometrics** — only report what the API returns
- **Never share health data** in outputs visible to others
- **Frame as wellness observations**, never medical advice ("biometrics suggest" not "you have")
- **Scored output only** — no raw health data in agent context
- **Disable immediately** when user says "stop checking": call `daobrew_settings({ disabled: true })`

## Data Sources

| Source | Connection Method | Data |
|--------|------------------|------|
| **Apple Watch** | TestFlight iPhone app via `daobrew_connect_watch` | HRV, HR, steps, respiratory, sleep, live 1Hz HR during sessions |

(Oura Ring and Google Fit are not currently supported by `daobrew_connect_watch`; the initial connection flow is Apple Watch only.)

## Troubleshooting

- **No live HR**: `daobrew_check` returns `live_hr.stale: true` → Watch is offline or iPhone Health Sync isn't running. Tell the user; the dashboard will show "—" for HR.
- **No data**: Health permissions not granted or companion app not running
- **Stale data** (`cache_age_seconds` very high): Use `force_refresh: true`
- **All patterns at 0**: System needs 3-7 days to establish baselines — skip proactive checks
- **No data**: Connect Apple Watch and complete authorization; the production tools do not synthesize wellness results.
