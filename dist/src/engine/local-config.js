"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localConfigPath = localConfigPath;
exports.readLocalConfig = readLocalConfig;
exports.mergeLocalConfig = mergeLocalConfig;
exports.adoptCanonicalUserId = adoptCanonicalUserId;
exports.resolveGeminiApiKey = resolveGeminiApiKey;
exports.resolveRemoteLlmConsent = resolveRemoteLlmConsent;
exports.resolveGranolaToken = resolveGranolaToken;
/**
 * Shared reader for the local DaoBrew config file (~/.daobrew/config.json,
 * overridable via DAOBREW_CONFIG_FILE). Mirrors the private readConfig() in
 * run.ts exactly: silent {} on a missing or malformed file — local config is
 * always optional and must never crash a run.
 *
 * Key resolution is env-first: explicit environment variables beat the config
 * file, and both resolvers return null (never throw) when nothing is set.
 * Empty-string env vars are treated as unset — the || chains are intentional;
 * do not "fix" them to ??.
 *
 * Engine and offline callers use this permissive reader. Authenticated client
 * paths use enrollment.ts instead so device credentials remain bound to the
 * API URL that issued them.
 *
 * LocalFileConfig is a PARTIAL view — the file may contain other keys written
 * by SentinelMac (memory_project_paths) or the engine (license_key); writers
 * must merge, never truncate.
 */
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const enrollment_js_1 = require("../enrollment.js");
const user_id_js_1 = require("../user-id.js");
function localConfigPath() {
    return process.env.DAOBREW_CONFIG_FILE || (0, node_path_1.join)((0, node_os_1.homedir)(), ".daobrew", "config.json");
}
function readLocalConfig(configFile = localConfigPath()) {
    if (!(0, node_fs_1.existsSync)(configFile))
        return {};
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf-8"));
    }
    catch {
        return {};
    }
}
function validAdoptedUserId(userId) {
    return (0, user_id_js_1.canonicalUserId)(userId);
}
function mergeLocalConfig(updates, configFile = localConfigPath()) {
    return (0, enrollment_js_1.mutateSecureClientConfig)(configFile, (current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined)
                delete next[key];
            else
                next[key] = value;
        }
        return next;
    });
}
function adoptCanonicalUserId(userId, configFile = localConfigPath()) {
    const validUserId = validAdoptedUserId(userId);
    if (!validUserId)
        return { adopted: false, reason: "invalid anchor user_id" };
    const config = readLocalConfig(configFile);
    if (config.user_id === validUserId) {
        return { adopted: false, userId: validUserId, reason: "already current" };
    }
    mergeLocalConfig({ user_id: validUserId }, configFile);
    return { adopted: true, userId: validUserId };
}
/** GEMINI_API_KEY || GOOGLE_API_KEY || config.gemini_api_key || null */
function resolveGeminiApiKey() {
    return (process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        readLocalConfig().gemini_api_key ||
        null);
}
/** Resolve only the two durable user choices; malformed values fail closed. */
function resolveRemoteLlmConsent(config = readLocalConfig()) {
    return config.remote_llm_consent === "granted"
        || config.remote_llm_consent === "declined"
        ? config.remote_llm_consent
        : "undecided";
}
/** GRANOLA_API_TOKEN || config.granola_api_token || null */
function resolveGranolaToken() {
    return (process.env.GRANOLA_API_TOKEN ||
        readLocalConfig().granola_api_token ||
        null);
}
