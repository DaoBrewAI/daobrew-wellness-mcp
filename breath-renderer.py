#!/usr/bin/env python3
"""
DaoBrew Breath Renderer v4 — readable single-line output.

Format: ● Overdrive · INHALE [████████████····] 74 bpm · cycle 3 · 01:03/05:00

Animates one fixed line using \\r. Polls backend every 2s for fresh
HR and breath params. No newlines until session ends.

Usage: python3 ~/.daobrew/breath-renderer.py
"""
import sys, time, os, json, signal, urllib.request, urllib.error

PARAMS_FILE = os.path.expanduser("~/.daobrew/session.json")
BAR_WIDTH = 16
POLL_INTERVAL = 2.0

ELEMENT_STYLES = {
    "wood":  {"emoji": "●", "fill": "▓", "label": "Tension"},
    "fire":  {"emoji": "●", "fill": "█", "label": "Overdrive"},
    "earth": {"emoji": "●", "fill": "▒", "label": "Stagnation"},
    "metal": {"emoji": "●", "fill": "░", "label": "Constriction"},
    "water": {"emoji": "●", "fill": "▓", "label": "Depletion"},
}

PATTERN_DEFAULTS = {
    "wood":  {"bpm": 6.0, "ratio": 0.38},
    "fire":  {"bpm": 5.0, "ratio": 0.42},
    "earth": {"bpm": 6.0, "ratio": 0.40},
    "metal": {"bpm": 5.0, "ratio": 0.45},
    "water": {"bpm": 4.0, "ratio": 0.35},
}


def load_session_config():
    try:
        with open(PARAMS_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def check_audio_alive(pid):
    if pid is None:
        return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def fetch_breath_state(api_url, api_key):
    url = f"{api_url}/session/breath-state"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode())
            if body.get("success") and body.get("data", {}).get("active"):
                return body["data"]
    except (urllib.error.URLError, json.JSONDecodeError, OSError):
        pass
    return None


def render_phase(phase, phase_duration, fill_char, empty_char, label, cycle_num, hr_str, session_start, duration):
    """Animate one phase on a single line using \\r. Returns False if session should stop."""
    phase_name = "INHALE" if phase == "INHALE" else "EXHALE"
    phase_start = time.time()

    while True:
        now = time.time()
        phase_elapsed = now - phase_start
        session_elapsed = now - session_start

        if phase_elapsed >= phase_duration:
            break
        if session_elapsed >= duration:
            return False

        pct = phase_elapsed / phase_duration
        if phase == "INHALE":
            filled = int(pct * BAR_WIDTH)
        else:
            filled = BAR_WIDTH - int(pct * BAR_WIDTH)
        bar = fill_char * filled + empty_char * (BAR_WIDTH - filled)

        m = int(session_elapsed) // 60
        s = int(session_elapsed) % 60
        tm = duration // 60
        ts = duration % 60

        line = f"● {label} · {phase_name} [{bar}] {hr_str} · cycle {cycle_num} · {m:02d}:{s:02d}/{tm:02d}:{ts:02d}"
        sys.stdout.write(f"\r\033[K{line}")
        sys.stdout.flush()
        time.sleep(0.1)

    return True


def render():
    config = load_session_config()
    if not config:
        print("No active session found. Start one with daobrew_breathe.")
        return

    element = config.get("element", "wood").lower()
    duration = config.get("duration_seconds", 300)
    audio_pid = config.get("audio_pid")
    api_url = config.get("api_url", "")
    api_key = config.get("api_key", "")

    defaults = PATTERN_DEFAULTS.get(element, PATTERN_DEFAULTS["wood"])
    cycle_sec = 60.0 / defaults["bpm"]
    inhale_ratio = defaults["ratio"]
    current_hr = None
    prev_hr_mean = None
    cycle_num = 1

    style = ELEMENT_STYLES.get(element, ELEMENT_STYLES["wood"])
    label = style["label"]
    fill_char = style["fill"]
    empty_char = "·"

    session_start = time.time()
    last_poll = 0
    start_hr = None

    def on_sigint(sig, frame):
        sys.stdout.write("\r\033[K\n")
        sys.stdout.flush()
        elapsed = time.time() - session_start
        print(f"● Stopped after {int(elapsed)}s.")
        sys.exit(0)
    signal.signal(signal.SIGINT, on_sigint)

    while True:
        session_elapsed = time.time() - session_start
        if session_elapsed >= duration:
            break
        if not check_audio_alive(audio_pid):
            break

        now = time.time()
        if api_url and api_key and (now - last_poll) >= POLL_INTERVAL:
            state = fetch_breath_state(api_url, api_key)
            last_poll = now
            if state:
                if not state.get("active", True):
                    break
                params = state.get("current_params", {})
                bpm = params.get("bpm", defaults["bpm"])
                cycle_sec = 60.0 / bpm if bpm > 0 else cycle_sec
                inhale_ratio = params.get("ratio", inhale_ratio)
                current_hr = state.get("current_hr")
                prev_hr_mean = state.get("prev_cycle_hr_mean")
                if state.get("cycle_num"):
                    cycle_num = state["cycle_num"]
                if start_hr is None and current_hr is not None:
                    start_hr = current_hr

        if current_hr is not None:
            hr_str = f"{int(current_hr)} bpm"
        else:
            hr_str = "-- bpm"

        inhale_dur = cycle_sec * inhale_ratio
        exhale_dur = cycle_sec * (1 - inhale_ratio)

        if not render_phase("INHALE", inhale_dur, fill_char, empty_char,
                            label, cycle_num, hr_str, session_start, duration):
            break

        if api_url and api_key:
            state = fetch_breath_state(api_url, api_key)
            last_poll = time.time()
            if state:
                if not state.get("active", True):
                    break
                params = state.get("current_params", {})
                bpm = params.get("bpm", defaults["bpm"])
                cycle_sec = 60.0 / bpm if bpm > 0 else cycle_sec
                inhale_ratio = params.get("ratio", inhale_ratio)
                current_hr = state.get("current_hr")
                prev_hr_mean = state.get("prev_cycle_hr_mean")
                if current_hr is not None:
                    hr_str = f"{int(current_hr)} bpm"
                exhale_dur = cycle_sec * (1 - inhale_ratio)

        if not render_phase("EXHALE", exhale_dur, fill_char, empty_char,
                            label, cycle_num, hr_str, session_start, duration):
            break

        cycle_num += 1

    total_elapsed = time.time() - session_start
    mins = int(total_elapsed) // 60
    secs = int(total_elapsed) % 60
    hr_summary = ""
    if start_hr is not None and current_hr is not None:
        hr_summary = f" HR {int(start_hr)} → {int(current_hr)} bpm."
    print(f"\n● Done — {mins}m {secs}s, {cycle_num - 1} cycles.{hr_summary}")


if __name__ == "__main__":
    render()
