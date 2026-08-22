#!/usr/bin/env node
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
export declare const MCP_SERVER_NAME = "daobrew-wellness";
export declare const MCP_RUNTIME_COMMAND = "npx";
export declare const MCP_RUNTIME_ARGS: readonly ["-y", "@daobrew/wellness-mcp"];
export declare const WELLNESS_SKILL_PACKAGE_PATH = "SKILL.md";
export declare const DETONATOR_SKILL_PACKAGE_PATH: string;
export interface SkillInstallResult {
    source: string;
    destination: string;
}
export declare function applyMcpRuntimeRegistration(mcpConfig: any): any;
export declare function applyLicensePlaceholder(config: Record<string, any>): {
    [x: string]: any;
};
export declare function buildSetupConfig(existingConfig: Record<string, any>, updates: Record<string, any>): {
    [x: string]: any;
};
/**
 * Legacy package-layout probe kept for package tests and explicit development
 * tooling. Normal setup never persists this path; releases use engine/current.
 */
export declare function resolveEngineDistPath(baseDir?: string): string | null;
export declare function resolvePackagedFile(relativePath: string, baseDir?: string): string | null;
export declare function installPackagedSkill(relativeSourcePath: string, destinationDir: string, baseDir?: string): SkillInstallResult | null;
export default function run(): void;
