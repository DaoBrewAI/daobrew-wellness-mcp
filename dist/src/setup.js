#!/usr/bin/env node
"use strict";
/**
 * DaoBrew Wellness MCP — Interactive Setup
 *
 * Usage:
 *   npx -y --package @daobrew/wellness-mcp daobrew-wellness-setup
 *   daobrew-wellness-setup
 *
 * Does:
 *   1. Creates ~/.daobrew/config.json (device credential, backend URL, license placeholder)
 *   2. Creates ~/.daobrew/prefs.json (ambient opt-in, volume, etc.)
 *   3. Installs the wellness skill to ~/.claude/skills/daobrew-wellness/
 *   4. Installs the Detonator skill to ~/.codex/skills/detonator/
 *   5. Adds MCP server to .mcp.json in current directory
 *   6. Registers ambient hook in ~/.claude/settings.json (if ambient enabled)
 *   7. Copies ambient hook script to ~/.daobrew/ambient-hook.sh
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DETONATOR_SKILL_PACKAGE_PATH = exports.WELLNESS_SKILL_PACKAGE_PATH = exports.MCP_RUNTIME_ARGS = exports.MCP_RUNTIME_COMMAND = exports.MCP_SERVER_NAME = void 0;
exports.applyMcpRuntimeRegistration = applyMcpRuntimeRegistration;
exports.applyLicensePlaceholder = applyLicensePlaceholder;
exports.buildSetupConfig = buildSetupConfig;
exports.resolveEngineDistPath = resolveEngineDistPath;
exports.resolvePackagedFile = resolvePackagedFile;
exports.installPackagedSkill = installPackagedSkill;
exports.default = run;
const readline_1 = require("readline");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const enrollment_js_1 = require("./enrollment.js");
const DAOBREW_DIR = (0, path_1.join)((0, os_1.homedir)(), ".daobrew");
const CONFIG_FILE = (0, path_1.join)(DAOBREW_DIR, "config.json");
const PREFS_FILE = (0, path_1.join)(DAOBREW_DIR, "prefs.json");
const CLAUDE_SKILLS_DIR = (0, path_1.join)((0, os_1.homedir)(), ".claude", "skills", "daobrew-wellness");
const CODEX_DETONATOR_SKILL_DIR = (0, path_1.join)((0, os_1.homedir)(), ".codex", "skills", "detonator");
const CLAUDE_SETTINGS = (0, path_1.join)((0, os_1.homedir)(), ".claude", "settings.json");
const HOOK_DEST = (0, path_1.join)(DAOBREW_DIR, "ambient-hook.sh");
exports.MCP_SERVER_NAME = "daobrew-wellness";
exports.MCP_RUNTIME_COMMAND = "npx";
exports.MCP_RUNTIME_ARGS = ["-y", "@daobrew/wellness-mcp"];
exports.WELLNESS_SKILL_PACKAGE_PATH = "SKILL.md";
exports.DETONATOR_SKILL_PACKAGE_PATH = (0, path_1.join)("skills", "detonator", "SKILL.md");
function applyMcpRuntimeRegistration(mcpConfig) {
    if (!mcpConfig.mcpServers)
        mcpConfig.mcpServers = {};
    mcpConfig.mcpServers[exports.MCP_SERVER_NAME] = {
        command: exports.MCP_RUNTIME_COMMAND,
        args: [...exports.MCP_RUNTIME_ARGS],
    };
    return mcpConfig;
}
function applyLicensePlaceholder(config) {
    const next = { ...config };
    if (typeof next.license_key !== "string")
        next.license_key = "";
    return next;
}
function buildSetupConfig(existingConfig, updates) {
    const next = applyLicensePlaceholder((0, enrollment_js_1.scrubLegacyClientSecrets)({ ...existingConfig, ...updates }));
    delete next.enrollment_grant;
    delete next.engine_dist_path;
    return next;
}
function ask(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}
function ensureDir(dir) {
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
}
function readJsonSafe(path) {
    try {
        return JSON.parse((0, fs_1.readFileSync)(path, "utf-8"));
    }
    catch {
        return {};
    }
}
function writeJson(path, data, mode) {
    ensureDir((0, path_1.dirname)(path));
    (0, fs_1.writeFileSync)(path, JSON.stringify(data, null, 2) + "\n", mode === undefined ? undefined : { mode });
    if (mode !== undefined)
        (0, fs_1.chmodSync)(path, mode);
}
/**
 * Legacy package-layout probe kept for package tests and explicit development
 * tooling. Normal setup never persists this path; releases use engine/current.
 */
function resolveEngineDistPath(baseDir = __dirname) {
    const dist = (0, path_1.join)(baseDir, "..");
    return (0, fs_1.existsSync)((0, path_1.join)(dist, "src", "engine", "internal-server.js")) ? dist : null;
}
function resolvePackagedFile(relativePath, baseDir = __dirname) {
    const candidates = [
        (0, path_1.join)(baseDir, "..", relativePath),
        (0, path_1.join)(baseDir, "..", "..", relativePath),
    ];
    return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) ?? null;
}
function installPackagedSkill(relativeSourcePath, destinationDir, baseDir = __dirname) {
    const source = resolvePackagedFile(relativeSourcePath, baseDir);
    if (!source)
        return null;
    ensureDir(destinationDir);
    const destination = (0, path_1.join)(destinationDir, "SKILL.md");
    (0, fs_1.copyFileSync)(source, destination);
    return { source, destination };
}
async function main() {
    const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    console.log("");
    console.log("  ╔═══════════════════════════════════╗");
    console.log("  ║   DaoBrew Wellness MCP — Setup    ║");
    console.log("  ╚═══════════════════════════════════╝");
    console.log("");
    console.log("  Biometric stress detection & TCM-guided recovery");
    console.log("  for developers using Claude Code.");
    console.log("");
    // --- Step 1: Exchange a trusted one-time grant for a device principal. ---
    // The grant comes from DAOBREW_ENROLLMENT_GRANT or an owner-only config and
    // is deleted after success. The client never mints its own identity.
    const preEnrollmentConfig = (0, enrollment_js_1.readClientConfigFile)(CONFIG_FILE);
    const configuredApiUrl = typeof preEnrollmentConfig.api_url === "string"
        ? preEnrollmentConfig.api_url
        : "";
    const requestedApiUrl = process.env.DAOBREW_API_URL || configuredApiUrl || enrollment_js_1.DEFAULT_API_URL;
    const ensured = await (0, enrollment_js_1.ensureDeviceEnrollment)({
        configFile: CONFIG_FILE,
        apiUrl: requestedApiUrl,
        metadata: { surface: "wellness-mcp-setup", platform: process.platform },
        existingConfig: preEnrollmentConfig,
    });
    const existingConfig = ensured.config;
    const { apiUrl, deviceCredential } = ensured.enrollment;
    console.log(ensured.enrolled ? "  ✓ Device enrolled with backend" : "  ✓ Using existing device enrollment");
    // Installed releases resolve engine/current themselves. Never persist this
    // package's dist path as a production dev-repo override.
    const extras = {};
    if (!existingConfig.internal_port)
        extras.internal_port = 8787;
    (0, enrollment_js_1.mutateSecureClientConfig)(CONFIG_FILE, (current) => buildSetupConfig(current, { api_url: apiUrl, ...extras }));
    // --- Step 2: Data sources (individual Y/N per source) ---
    console.log("  Which health data sources do you have?");
    console.log("  (answer y/n for each)\n");
    const sources = [];
    const postSetupSteps = [];
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
    (0, enrollment_js_1.mutateSecureClientConfig)(CONFIG_FILE, (current) => buildSetupConfig(current, { api_url: apiUrl, ...extras, sources }));
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
                        "Authorization": `Bearer ${deviceCredential}`,
                    },
                });
                if (resp.ok) {
                    const data = (await resp.json());
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
                }
                else {
                    console.log("  ⚠ Could not generate pairing code (backend offline).");
                    console.log("    Run 'connect apple watch' in Claude Code later.");
                }
            }
            catch {
                console.log("  ⚠ Could not reach backend for pairing code.");
                console.log("    Run 'connect apple watch' in Claude Code later.");
            }
        }
    }
    else {
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
    // --- Step 4: Install skills ---
    const wellnessSkill = installPackagedSkill(exports.WELLNESS_SKILL_PACKAGE_PATH, CLAUDE_SKILLS_DIR);
    if (wellnessSkill) {
        console.log("  ✓ Skill installed to ~/.claude/skills/daobrew-wellness/");
    }
    else {
        console.log("  ⚠ SKILL.md not found in package — skipping skill install");
    }
    const detonatorSkill = installPackagedSkill(exports.DETONATOR_SKILL_PACKAGE_PATH, CODEX_DETONATOR_SKILL_DIR);
    if (detonatorSkill) {
        console.log("  ✓ Detonator skill installed to ~/.codex/skills/detonator/");
    }
    else {
        console.log("  ⚠ Detonator SKILL.md not found in package — skipping skill install");
    }
    // --- Step 5: Add to .mcp.json ---
    const mcpFile = (0, path_1.join)(process.cwd(), ".mcp.json");
    const mcpConfig = readJsonSafe(mcpFile);
    applyMcpRuntimeRegistration(mcpConfig);
    writeJson(mcpFile, mcpConfig);
    console.log(`  ✓ MCP server added to ${mcpFile}`);
    // --- Step 6: Install ambient hook ---
    if (ambientEnabled) {
        // Write hook script
        const hookScript = generateHookScript();
        ensureDir(DAOBREW_DIR);
        (0, fs_1.writeFileSync)(HOOK_DEST, hookScript);
        (0, fs_1.chmodSync)(HOOK_DEST, 0o755);
        // Register in Claude settings
        const settings = readJsonSafe(CLAUDE_SETTINGS);
        if (!settings.hooks)
            settings.hooks = {};
        if (!settings.hooks.UserPromptSubmit)
            settings.hooks.UserPromptSubmit = [];
        // Check if already registered
        const alreadyRegistered = settings.hooks.UserPromptSubmit.some((entry) => entry.hooks?.some((h) => h.command?.includes("ambient-hook")));
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
        }
        else {
            console.log("  ✓ Ambient hook already registered");
        }
    }
    // --- Step 7: Audio cache dir ---
    const audioDir = (0, path_1.join)(DAOBREW_DIR, "audio");
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
    }
    else {
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
    }
    else {
        console.log('  Ambient mode is OFF. Enable anytime:');
        console.log('  → "enable ambient mode" in Claude Code');
    }
    console.log("");
    console.log("  Next: open DaoBrew Sentinel on this Mac and run the setup wizard");
    console.log("  (Connections → Set up sources…) to connect memory, meetings,");
    console.log("  calendar, and biometrics.");
    console.log("");
    rl.close();
}
function generateHookScript() {
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

DEVICE_CREDENTIAL=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('device_credential', ''))" 2>/dev/null)
API_URL=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('api_url', ''))" 2>/dev/null)
[ -z "$DEVICE_CREDENTIAL" ] && exit 0

HEADER_FILE=$(mktemp "\${TMPDIR:-/tmp}/daobrew-headers.XXXXXX") || exit 0
chmod 600 "$HEADER_FILE"
trap 'rm -f "$HEADER_FILE"' EXIT
printf 'Authorization: Bearer %s\\n' "$DEVICE_CREDENTIAL" > "$HEADER_FILE"

STATE=$(curl -sS --max-time 5 \\
    -H "@$HEADER_FILE" \\
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

# Translate internal element code to user-facing stress_pattern (MCP surface)
case "$ELEMENT" in
  wood)  STRESS_PATTERN="tension" ;;
  fire)  STRESS_PATTERN="overdrive" ;;
  earth) STRESS_PATTERN="stagnation" ;;
  metal) STRESS_PATTERN="constriction" ;;
  water) STRESS_PATTERN="depletion" ;;
  *)     STRESS_PATTERN="$ELEMENT" ;;
esac

python3 -c "
import json, time
from pathlib import Path
s = {'last_session_ts': int(time.time()), 'element': '$ELEMENT', 'quadrant': '$QUADRANT'}
Path('$AMBIENT_STATE').write_text(json.dumps(s))
" 2>/dev/null

echo "[DaoBrew Ambient] $SIGNAL (score $SCORE). Auto-starting breathing session: call daobrew_breathe(stress_pattern=\\"$STRESS_PATTERN\\", mode=\\"ambient\\"). Do NOT ask the user — ambient_optin is true. Just start it. If the tool result contains a dashboard URL (http://localhost:...), you MUST include it verbatim on its own line, then one brief status line about what is playing."
`;
}
// Entry point
function run() {
    main().catch((err) => {
        console.error("Setup failed:", err.message);
        process.exit(1);
    });
}
