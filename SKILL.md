---
name: daobrew-wellness
description: "DaoBrew Wellness is a biometric stress detection and micro-recovery skill powered by Traditional Chinese Medicine theory. It reads health data (Apple Health, Health Connect, or DaoBrew Cuff) and identifies five stress patterns: Wood/Tension, Fire/Overdrive, Earth/Stagnation, Metal/Constriction, Water/Depletion. Use this skill whenever: the user has been coding for 30+ minutes without a break, the user mentions feeling stressed/tired/burned out/unfocused, the user asks about their health or energy state, you notice a long unbroken work session, the user asks for a break or recovery suggestion, OR at regular intervals during extended work sessions (every 30 minutes recommended). This skill should be checked proactively — don't wait for the user to ask. Developers who install this skill want their agent to watch out for them."
---

# DaoBrew Wellness — Agent Skill for Biometric Stress Detection & Recovery

## What This Skill Does

DaoBrew reads the user's real-time biometric data and returns a structured wellness assessment based on two systems:

1. **Yin/Yang Balance** — Two independent 0-100 scores measuring Recovery Reservoir (Yin, parasympathetic) and Vitality Engine (Yang, sympathetic activity). Both can be high or low simultaneously — they are NOT opposites.

2. **Five Element Patterns** (Wu Xing) — Five organ-system detectors mapped to TCM, any combination can co-occur:

| Element | Organ | What It Detects | Key Signal |
|---------|-------|----------------|------------|
| **🌲 Wood** | Liver 肝 | Qi stagnation, fight-or-flight stuck ON | HRV below baseline + erratic HR |
| **🔥 Fire** | Heart 心 | Heart Fire rising, restlessness | Elevated resting HR at night |
| **⛰️ Earth** | Spleen 脾 | Spleen Qi sluggish, low energy | Low step count + low active energy |
| **⚔️ Metal** | Lung 肺 | Lung Qi faltering, shallow breathing | Abnormal respiratory rate |
| **🌊 Water** | Kidney 肾 | Kidney Essence low, deep depletion | HRV declining over 2+ weeks |

## Two Modes

### On-Demand Mode (default)
User-initiated. Triggered by `/breathe`, `/stress`, or explicit user request. Uses `force_refresh: true` for fresh data.

### Ambient Mode (proactive)
Agent-initiated. Requires explicit user opt-in via `daobrew_set_monitoring({ ambient_optin: true })`. Use cached data (no `force_refresh`). Present results in one brief line. Never interrupt mid-task — only at natural breakpoints. Ambient sessions use separate cooldown from on-demand.

**Block list** — Do NOT trigger ambient checks:
- While the user is actively debugging
- Mid-sentence in a conversation
- During urgent/time-sensitive tasks the user flagged
- During git operations (rebase, merge, conflict resolution)
- If the user said "stop checking" or "I don't want wellness updates"

## Available Tools (9 tools)

### `daobrew_get_wellness_state`
Returns the user's current wellness snapshot.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `force_refresh` | boolean | No | Bypass 30-min cache. Use `true` for on-demand, `false`/omit for ambient. |

**Returns:** Yin/Yang scores, quadrant, element scores, top signal, recommendation, `cache_age_seconds`, optional `active_session`.

**Quadrant meanings:**
- `peak` (Yin ≥ 50, Yang ≥ 50) → "In Flow"
- `pushing_it` (Yin < 50, Yang ≥ 50) → "Pushing It"
- `recharging` (Yin ≥ 50, Yang < 50) → "Recharging"
- `burnout` (Yin < 50, Yang < 50) → "Running on Empty"

### `daobrew_get_element_detail`
Returns detailed evidence for a specific stress pattern.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | string | Yes | `wood`, `fire`, `earth`, `metal`, `water` |

### `daobrew_start_breathing_session`
Starts a guided resonance breathing session matched to the user's stress pattern.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | string | Yes | Stress pattern to address |
| `tier` | string | No | `text` (terminal), `audio` (system audio), `full` (browser PWA). Default: `audio` |
| `mode` | string | No | `ambient` (agent-initiated) or `ondemand` (user-requested). Default: `ondemand` |
| `force` | boolean | No | Bypass cooldown timer for acute stress spikes. Default: `false` |

**Guard sequence** (checked in order):
1. `disabled` → rejects with `status: "disabled"`
2. `mode=ambient` without `ambient_optin` → rejects with `status: "requires_optin"`
3. Session already running → rejects with `status: "session_active"`
4. Cooldown active (unless `force=true`) → rejects with `status: "cooldown"`
5. No headphones detected (audio/full tier, unless `headphones_trusted`) → rejects with `status: "no_headphones"`

If audio playback fails, automatically falls back to text tier with explanation.

### `daobrew_get_session_result`
Retrieves the outcome of a completed breathing session including HRV changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | From `start_breathing_session` |

### `daobrew_get_session_history`
Returns recent session history and trends.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | integer | No | Lookback window. Default: 7 |

### `daobrew_stop_session`
Stops the current breathing session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | No | Stops current if omitted |

### `daobrew_status`
Returns server mode, connected data sources, headphone status, preferences, active session. Use for first-run onboarding.

**Parameters:** none

### `daobrew_set_monitoring`
Persists user preferences to `~/.daobrew/prefs.json`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ambient_optin` | boolean | No | Enable/disable ambient mode |
| `disabled` | boolean | No | Disable all wellness checks |
| `preferred_volume` | number | No | Audio volume 0.0-1.0 |
| `cooldown_minutes` | integer | No | Minutes between sessions |
| `headphones_trusted` | boolean | No | Skip headphone detection |
| `voiceover` | boolean | No | Enable/disable intro voiceover |

### `daobrew_connect_source`
Connect a wearable data source for real biometric data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | `oura`, `google_fit`, `apple_watch` |

- **Oura/Google Fit**: Opens OAuth flow in browser, waits for callback
- **Apple Watch**: Returns TestFlight install link for DaoBrew Health Sync iPhone app

## Prompts (3)

| Prompt | Description |
|--------|-------------|
| `/breathe` | Check wellness state and start a breathing session for top stress pattern |
| `/stress` | Check current stress levels and biometric wellness state |
| `/stop` | Stop the current breathing session |

## How to Present Wellness Information

Keep it brief and natural. Do NOT dump raw JSON. Translate data into conversational TCM language.

Use element emojis consistently: 🌲 Wood, 🔥 Fire, ⛰️ Earth, ⚔️ Metal, 🌊 Water.

**Good — proactive (ambient), mild concern:**
> Quick Qi check — you've been in "Pushing It" for a while. Yin Running Low (35), Yang Moving (72). 🌲 Wood Qi activated. Want a 5-min breathing reset?

**Good — proactive (ambient), no concern:**
> Quick Qi check — In Flow. All clear. 🍵

**Good — on-demand, user asked:**
> Right now your Yin (recovery) is at 35 — Running Low. Yang (activity) is 72 — Moving. That puts you in "Pushing It" territory.
>
> 🌲 Wood · Liver is activated (score 68) — low HRV, Liver Qi stagnation. Deep breathing would help. Want to try it?

**Good — session starting:**
> 🔥 Playing Fire session — warm lo-fi jazz, 5 min. Breathe in as the music rises, out as it fades. 🎧

**Good — session ending:**
> ♪ Session done — HRV 28ms → 41ms (+46%), HR 82 → 71bpm. 🌲 Wood Qi rebalancing, score 68 → 42.

**Bad — data dump:**
> Your daobrew_get_wellness_state returned yin=35, yang=72, quadrant=pushing_it...

## Safety & Privacy

- **Never hallucinate biometrics** — only report what the API returns
- **Never share health data** in outputs visible to others
- **Frame as wellness observations**, never medical advice ("biometrics suggest" not "you have")
- **Scored output only** — no raw health data in agent context
- **Disable immediately** when user says "stop checking": call `daobrew_set_monitoring({ disabled: true })`

## Data Sources

| Source | Connection Method | Data |
|--------|------------------|------|
| **Oura Ring** | OAuth via `daobrew_connect_source({ source: "oura" })` | HRV, HR, sleep, readiness |
| **Google Fit** | OAuth via `daobrew_connect_source({ source: "google_fit" })` | HR, activity, sleep |
| **Apple Watch** | TestFlight iPhone app via `daobrew_connect_source({ source: "apple_watch" })` | HRV, HR, steps, respiratory, sleep |

## Data Tiers

| Tier | Hardware | What Works | Limitations |
|------|----------|-----------|-------------|
| **Tier 1** | Phone only | Yang score, Earth pattern, basic screen/movement | Yin stays neutral, reduced Wood/Fire/Water accuracy |
| **Tier 2** | + Wearable | Full Yin/Yang, all five patterns, session HRV | — |
| **Tier 3** | + DaoBrew Cuff | All Tier 2 + thermal/haptic, continuous HRV | — |

The `data_tier` field tells you the user's tier. Don't reference HRV data for Tier 1 users.

## Troubleshooting

- **No data**: Health permissions not granted or companion app not running
- **Stale data** (`cache_age_seconds` very high): Use `force_refresh: true`
- **All elements at 0**: System needs 3-7 days to establish baselines — skip proactive checks
- **Mock mode**: Results are simulated. Summary prefixed with `[Mock]`. Connect a wearable for real data.
