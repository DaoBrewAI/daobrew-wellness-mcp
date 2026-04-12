#!/usr/bin/env node
/**
 * DaoBrew Wellness MCP — Interactive Setup
 *
 * Usage:
 *   npx @daobrew/wellness-mcp setup
 *   daobrew-wellness-mcp setup
 *
 * Does:
 *   1. Creates ~/.daobrew/config.json (API key, backend URL)
 *   2. Creates ~/.daobrew/prefs.json (ambient opt-in, volume, etc.)
 *   3. Installs SKILL.md to ~/.claude/skills/daobrew-wellness/
 *   4. Adds MCP server to .mcp.json in current directory
 *   5. Registers ambient hook in ~/.claude/settings.json (if ambient enabled)
 *   6. Copies ambient hook script to ~/.daobrew/ambient-hook.sh
 */

import { createInterface } from "readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const DAOBREW_DIR = join(homedir(), ".daobrew");
const CONFIG_FILE = join(DAOBREW_DIR, "config.json");
const PREFS_FILE = join(DAOBREW_DIR, "prefs.json");
const CLAUDE_SKILLS_DIR = join(homedir(), ".claude", "skills", "daobrew-wellness");
const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const HOOK_DEST = join(DAOBREW_DIR, "ambient-hook.sh");

const DEFAULT_API_URL = "https://daobrew-backend.onrender.com/api/v1";

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJsonSafe(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function writeJson(path: string, data: any) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║   DaoBrew Wellness MCP — Setup    ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("");
  console.log("  Biometric stress detection & TCM-guided recovery");
  console.log("  for developers using Claude Code.");
  console.log("");

  // --- Step 1: Auto-provision API key (invisible to user) ---
  const existingConfig = readJsonSafe(CONFIG_FILE);
  const isNewKey = !existingConfig.api_key;
  const apiKey = existingConfig.api_key || "dbk_" + Math.random().toString(36).substring(2, 14);
  const apiUrl = existingConfig.api_url || DEFAULT_API_URL;
  writeJson(CONFIG_FILE, { api_key: apiKey, api_url: apiUrl });

  // Register key with backend (only on first run)
  if (isNewKey) {
    try {
      const resp = await fetch(`${apiUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (resp.ok) {
        console.log("  ✓ API key registered with backend");
      } else {
        console.log("  ⚠ Could not register API key (backend may be offline — will retry on next sync)");
      }
    } catch {
      console.log("  ⚠ Could not reach backend — API key saved locally, will register on first sync");
    }
  } else {
    console.log("  ✓ Using existing API key");
  }

  // --- Step 2: Data sources (individual Y/N per source) ---
  console.log("  Which health data sources do you have?");
  console.log("  (answer y/n for each)\n");

  const sources: string[] = [];
  const postSetupSteps: string[] = [];

  const appleWatch = await ask(rl, "  Apple Watch (via iPhone app — HRV, HR, steps, sleep)? [y/N] ");
  if (appleWatch.toLowerCase() === "y") {
    sources.push("apple_watch");
    postSetupSteps.push("apple_watch");
  }

  const oura = await ask(rl, "  Oura Ring (OAuth — HRV, HR, sleep, readiness)?              [y/N] ");
  if (oura.toLowerCase() === "y") {
    sources.push("oura");
    postSetupSteps.push("oura");
  }

  writeJson(CONFIG_FILE, { api_key: apiKey, api_url: apiUrl, sources });

  if (sources.length > 0) {
    console.log(`  ✓ Selected: ${sources.join(", ")}`);

    // Apple Watch: generate pairing code immediately
    if (sources.includes("apple_watch")) {
      console.log("");
      console.log("  📱 Generating pairing code for Apple Watch...");
      try {
        const resp = await fetch(`${apiUrl}/pair/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const code = data.data?.code ?? data.code;
          if (code) {
            console.log("");
            console.log(`  ┌───────────────────────────────────┐`);
            console.log(`  │   Pairing Code:  ${code.toString().padEnd(16)}  │`);
            console.log(`  └───────────────────────────────────┘`);
            console.log("");
            console.log("  Steps:");
            console.log("  1. Install DaoBrew Health Sync on your iPhone:");
            console.log("     https://testflight.apple.com/join/6XTNFvv5");
            console.log("  2. Open the app → Pair with Claude Code");
            console.log(`  3. Enter code: ${code}`);
            console.log("  4. Grant HealthKit permissions when prompted");
            console.log("  5. Health data syncs automatically within 1-2 min");
            console.log("");
          }
        } else {
          console.log("  ⚠ Could not generate pairing code (backend offline).");
          console.log("    Run 'connect apple watch' in Claude Code later.");
        }
      } catch {
        console.log("  ⚠ Could not reach backend for pairing code.");
        console.log("    Run 'connect apple watch' in Claude Code later.");
      }
    }
  } else {
    console.log("  ✓ Demo mode — no health data sources");
  }

  // --- Step 3: Ambient Mode ---
  console.log("");
  console.log("  Ambient mode auto-plays breathing music when stress is");
  console.log("  detected. Requires headphones. Triggers naturally during");
  console.log("  your Claude Code sessions — no popups or timers.");
  console.log("");
  const ambientInput = await ask(rl, "  Enable ambient mode? [y/N] ");
  const ambientEnabled = ambientInput.toLowerCase() === "y";

  const existingPrefs = readJsonSafe(PREFS_FILE);
  const prefs = {
    ambient_optin: ambientEnabled,
    ambient_optin_date: ambientEnabled ? new Date().toISOString() : null,
    preferred_volume: existingPrefs.preferred_volume ?? 0.3,
    cooldown_minutes: existingPrefs.cooldown_minutes ?? 30,
    disabled: false,
    headphones_trusted: false,
    session_count: existingPrefs.session_count ?? 0,
    voiceover: existingPrefs.voiceover ?? true,
  };
  writeJson(PREFS_FILE, prefs);
  console.log(`  ✓ Preferences saved (ambient: ${ambientEnabled ? "ON" : "OFF"})`);

  // --- Step 4: Install SKILL.md ---
  const skillSource = join(__dirname, "..", "SKILL.md");
  const skillSourceAlt = join(__dirname, "..", "..", "SKILL.md");
  const actualSkillSource = existsSync(skillSource) ? skillSource : existsSync(skillSourceAlt) ? skillSourceAlt : null;

  if (actualSkillSource) {
    ensureDir(CLAUDE_SKILLS_DIR);
    copyFileSync(actualSkillSource, join(CLAUDE_SKILLS_DIR, "SKILL.md"));
    console.log("  ✓ Skill installed to ~/.claude/skills/daobrew-wellness/");
  } else {
    console.log("  ⚠ SKILL.md not found in package — skipping skill install");
  }

  // --- Step 4: Add to .mcp.json ---
  const mcpFile = join(process.cwd(), ".mcp.json");
  const mcpConfig = readJsonSafe(mcpFile);
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  // Use the npm bin command name — works regardless of install location
  // The full path is fragile (breaks on other machines); the bin name is portable
  mcpConfig.mcpServers["daobrew-wellness"] = {
    command: "daobrew-wellness-mcp",
    args: [],
  };
  writeJson(mcpFile, mcpConfig);
  console.log(`  ✓ MCP server added to ${mcpFile}`);

  // --- Step 5: Install ambient hook ---
  if (ambientEnabled) {
    // Write hook script
    const hookScript = generateHookScript();
    ensureDir(DAOBREW_DIR);
    writeFileSync(HOOK_DEST, hookScript);
    chmodSync(HOOK_DEST, 0o755);

    // Register in Claude settings
    const settings = readJsonSafe(CLAUDE_SETTINGS);
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];

    // Check if already registered
    const alreadyRegistered = settings.hooks.UserPromptSubmit.some(
      (entry: any) => entry.hooks?.some((h: any) => h.command?.includes("ambient-hook"))
    );

    if (!alreadyRegistered) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [
          {
            type: "command",
            command: `bash ${HOOK_DEST}`,
            timeout: 10,
          },
        ],
      });
      writeJson(CLAUDE_SETTINGS, settings);
      console.log("  ✓ Ambient hook registered in Claude Code settings");
    } else {
      console.log("  ✓ Ambient hook already registered");
    }
  }

  // --- Step 6: Audio cache dir ---
  const audioDir = join(DAOBREW_DIR, "audio");
  ensureDir(audioDir);

  // --- Done ---
  console.log("");
  console.log("  ┌─────────────────────────────────────┐");
  console.log("  │          Setup complete!             │");
  console.log("  └─────────────────────────────────────┘");
  console.log("");

  // Show connection instructions for selected sources
  if (postSetupSteps.length > 0) {
    console.log("  Connect your health data:");
    console.log("");

    if (postSetupSteps.includes("apple_watch")) {
      console.log("  📱 Apple Watch / iPhone:");
      console.log("     Open this link on your iPhone to install DaoBrew Health Sync:");
      console.log("");
      console.log("     https://testflight.apple.com/join/6XTNFvv5");
      console.log("");
      console.log("     (TestFlight link — copy to your phone or airdrop it)");
      console.log("");
    }

    if (postSetupSteps.includes("oura")) {
      console.log('  💍 Oura Ring:');
      console.log('     In Claude Code, say: "connect oura"');
      console.log("     (Opens browser for OAuth — no phone needed)");
      console.log("");
    }
  } else {
    console.log("  Demo mode — no health data sources connected.");
    console.log("  You can connect sources later in Claude Code:");
    console.log('  → "connect apple watch" / "connect oura"');
    console.log("");
  }

  console.log("  Getting started:");
  console.log("  1. Open Claude Code (or start a new session)");
  console.log('  2. Say /stress to check your wellness state');
  console.log('  3. Say /breathe to start a breathing session');
  console.log("");

  if (ambientEnabled) {
    console.log("  🎵 Ambient mode is ON — stress relief auto-plays");
    console.log("  when headphones are connected and stress is detected.");
    console.log('  Say "disable wellness" anytime to turn it off.');
  } else {
    console.log('  Ambient mode is OFF. Enable anytime:');
    console.log('  → "enable ambient mode" in Claude Code');
  }
  console.log("");

  rl.close();
}


function generateHookScript(): string {
  return `#!/bin/bash
# DaoBrew Ambient Hook — auto-installed by setup
# Runs on every user message in Claude Code
# If stress detected + ambient opted in → tells agent to auto-start session

PREFS="$HOME/.daobrew/prefs.json"
CONFIG="$HOME/.daobrew/config.json"
AMBIENT_STATE="$HOME/.daobrew/ambient-state.json"
COOLDOWN_SECONDS=1800

[ ! -f "$PREFS" ] && exit 0
[ ! -f "$CONFIG" ] && exit 0

eval "$(python3 -c "
import json, sys
try:
    p = json.load(open('$PREFS'))
    print(f'AMBIENT={p.get(\\"ambient_optin\\", False)}')
    print(f'DISABLED={p.get(\\"disabled\\", False)}')
except: sys.exit(1)
" 2>/dev/null)" || exit 0

[ "$AMBIENT" != "True" ] && exit 0
[ "$DISABLED" = "True" ] && exit 0

if [ -f "$AMBIENT_STATE" ]; then
    LAST_TS=$(python3 -c "import json; print(int(json.load(open('$AMBIENT_STATE')).get('last_session_ts', 0)))" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    [ $(( NOW - LAST_TS )) -lt $COOLDOWN_SECONDS ] && exit 0
fi

API_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('api_key', ''))" 2>/dev/null)
API_URL=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('api_url', ''))" 2>/dev/null)
[ -z "$API_KEY" ] && exit 0

STATE=$(curl -sS --max-time 5 \\
    -H "Authorization: Bearer $API_KEY" \\
    -H "X-Device-ID: ambient" \\
    "$API_URL/state/current?format=mcp" 2>/dev/null)
[ -z "$STATE" ] && exit 0

RESULT=$(echo "$STATE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin).get('data', {})
    active = d.get('active_elements', [])
    if not active: sys.exit(0)
    top = active[0]
    score = d.get('element_scores', {}).get(top, 0)
    quadrant = d.get('quadrant_label', '')
    signal = d.get('top_signal', '')
    print(f'{top}|{score}|{quadrant}|{signal}')
except: sys.exit(0)
" 2>/dev/null)

[ -z "$RESULT" ] && exit 0

ELEMENT=$(echo "$RESULT" | cut -d'|' -f1)
SCORE=$(echo "$RESULT" | cut -d'|' -f2)
QUADRANT=$(echo "$RESULT" | cut -d'|' -f3)
SIGNAL=$(echo "$RESULT" | cut -d'|' -f4)

python3 -c "
import json, time
from pathlib import Path
s = {'last_session_ts': int(time.time()), 'element': '$ELEMENT', 'quadrant': '$QUADRANT'}
Path('$AMBIENT_STATE').write_text(json.dumps(s))
" 2>/dev/null

echo "[DaoBrew Ambient] $SIGNAL (score $SCORE). Auto-starting breathing session: call daobrew_start_breathing_session(element=\\"$ELEMENT\\", mode=\\"ambient\\", tier=\\"audio\\"). Do NOT ask the user — ambient_optin is true. Just start it and say one brief line about what you are playing."
`;
}

// Entry point
export default function run() {
  main().catch((err) => {
    console.error("Setup failed:", err.message);
    process.exit(1);
  });
}
