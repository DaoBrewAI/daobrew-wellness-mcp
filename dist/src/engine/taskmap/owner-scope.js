"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_OWNER_SCOPE_DOMAIN = void 0;
exports.taskMapOwnerScopeDigest = taskMapOwnerScopeDigest;
exports.createTaskMapOwnerScope = createTaskMapOwnerScope;
exports.assertTaskMapOwnerScope = assertTaskMapOwnerScope;
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
const user_id_js_1 = require("../../user-id.js");
exports.TASKMAP_OWNER_SCOPE_DOMAIN = "taskmap-owner-scope.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
function taskMapOwnerScopeDigest(userId) {
    const canonical = (0, user_id_js_1.canonicalUserId)(userId);
    if (canonical === null || userId !== canonical) {
        throw new Error("Task Map owner identity must be a canonical uppercase UUID");
    }
    return (0, node_crypto_1.createHash)("sha256")
        .update(`${exports.TASKMAP_OWNER_SCOPE_DOMAIN}\0${canonical}`, "utf8")
        .digest("hex");
}
function createTaskMapOwnerScope(userId, homeDirectory) {
    if (typeof homeDirectory !== "string"
        || !node_path_1.default.isAbsolute(homeDirectory)
        || node_path_1.default.normalize(homeDirectory) !== homeDirectory
        || CONTROL_CHARACTER.test(homeDirectory)) {
        throw new Error("Task Map home directory must be normalized and absolute");
    }
    const ownerScopeDigest = taskMapOwnerScopeDigest(userId);
    const ownerRoot = node_path_1.default.join(homeDirectory, "Library", "Application Support", "DaoBrew", "owners", ownerScopeDigest);
    return Object.freeze({
        userId,
        ownerScopeDigest,
        homeDirectory,
        ownerRoot,
        runtimeRoot: node_path_1.default.join(ownerRoot, "taskmap-refresh"),
        taskMapRoot: node_path_1.default.join(ownerRoot, "taskmap"),
        sourceRoot: node_path_1.default.join(ownerRoot, "sources"),
    });
}
function assertTaskMapOwnerScope(value) {
    if (value === null || typeof value !== "object") {
        throw new Error("Task Map owner scope is unavailable");
    }
    const scope = value;
    if (typeof scope.userId !== "string"
        || typeof scope.ownerScopeDigest !== "string"
        || !SHA256.test(scope.ownerScopeDigest)
        || scope.ownerScopeDigest !== taskMapOwnerScopeDigest(scope.userId)) {
        throw new Error("Task Map owner scope binding is invalid");
    }
    const expected = createTaskMapOwnerScope(scope.userId, String(scope.homeDirectory));
    for (const key of [
        "homeDirectory",
        "ownerRoot",
        "runtimeRoot",
        "taskMapRoot",
        "sourceRoot",
    ]) {
        if (scope[key] !== expected[key]) {
            throw new Error("Task Map owner scope paths are invalid");
        }
    }
}
