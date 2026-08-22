"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testOwnerScopeDigest = testOwnerScopeDigest;
exports.confirmedTestOwner = confirmedTestOwner;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const identity_js_1 = require("../../src/identity.js");
const owner_scope_js_1 = require("../../src/engine/taskmap/owner-scope.js");
const CANONICAL_UUID = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/u;
const fixtureRoot = node_path_1.default.join(process.cwd(), ".test-tmp", `confirmed-owner-${process.pid}`);
const owners = new Map();
function canonicalTestUserId(label) {
    if (CANONICAL_UUID.test(label))
        return label;
    const hex = (0, node_crypto_1.createHash)("sha256").update(label).digest("hex").toUpperCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function testOwnerScopeDigest(label) {
    return (0, owner_scope_js_1.taskMapOwnerScopeDigest)(canonicalTestUserId(label));
}
function confirmedTestOwner(label) {
    const cached = owners.get(label);
    if (cached !== undefined)
        return cached;
    const labelDigest = (0, node_crypto_1.createHash)("sha256").update(label).digest("hex");
    const homeDirectory = node_path_1.default.join(fixtureRoot, labelDigest);
    const configDirectory = node_path_1.default.join(homeDirectory, ".daobrew");
    (0, node_fs_1.mkdirSync)(configDirectory, { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(configDirectory, "config.json"), JSON.stringify({
        user_id: canonicalTestUserId(label),
        device_credential: `dbd_test_enrollment_${labelDigest}`,
        device_credential_confirmed: true,
        api_url: "https://confirmed-owner.test.invalid/api/v1",
    }), { mode: 0o600 });
    const plan = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(homeDirectory);
    if (!plan.ok)
        throw new Error(plan.reason);
    owners.set(label, plan.owner);
    return plan.owner;
}
process.once("exit", () => {
    (0, node_fs_1.rmSync)(fixtureRoot, { recursive: true, force: true });
});
