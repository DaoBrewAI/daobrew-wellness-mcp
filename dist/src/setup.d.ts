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
export default function run(): void;
