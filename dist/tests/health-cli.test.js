"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const sync_cli_js_1 = require("../src/health/sync-cli.js");
const CONFIG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const ENV_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
(0, node_test_1.describe)("health sync CLI", () => {
    (0, node_test_1.it)("parses --backfill-days", () => {
        assert.deepStrictEqual((0, sync_cli_js_1.parseHealthCliArgs)(["--backfill-days", "30"]), { backfillDays: 30 });
        assert.deepStrictEqual((0, sync_cli_js_1.parseHealthCliArgs)([]), {});
    });
    (0, node_test_1.it)("rejects a non-positive or missing --backfill-days value", () => {
        assert.throws(() => (0, sync_cli_js_1.parseHealthCliArgs)(["--backfill-days", "0"]));
        assert.throws(() => (0, sync_cli_js_1.parseHealthCliArgs)(["--backfill-days"]));
    });
});
(0, node_test_1.describe)("health sync CLI authenticated enrollment", () => {
    const credential = "dbd_0123456789abcdefghijklmnopqrstuv";
    (0, node_test_1.it)("syncs with a complete bearer-only device enrollment", () => {
        const plan = (0, sync_cli_js_1.healthCliPlan)({
            api_url: "https://api.example.test/api/v1",
            device_credential: credential,
        });
        assert.strictEqual(plan.action, "sync");
        if (plan.action === "sync") {
            assert.strictEqual(plan.deviceCredential, credential);
            assert.strictEqual(plan.apiUrl, "https://api.example.test/api/v1");
            assert.strictEqual("userId" in plan, false);
            assert.strictEqual("deviceId" in plan, false);
        }
    });
    (0, node_test_1.it)("never accepts a legacy api_key or UUID as normal device auth", () => {
        const plan = (0, sync_cli_js_1.healthCliPlan)({
            api_url: "https://api.example.test/api/v1",
            api_key: "dbk_legacy",
            user_id: "11111111-1111-4111-8111-111111111111",
            device_id: "22222222-2222-4222-8222-222222222222",
        });
        assert.strictEqual(plan.action, "skip");
        if (plan.action === "skip") {
            assert.match(plan.reason, /sign in|support/i);
            assert.doesNotMatch(plan.reason, /grant|paste/i);
        }
    });
    (0, node_test_1.it)("fails closed on a malformed device credential or missing API URL", () => {
        assert.strictEqual((0, sync_cli_js_1.healthCliPlan)({ api_url: "https://api.example.test", device_credential: "dbk_wrong" }).action, "skip");
        assert.strictEqual((0, sync_cli_js_1.healthCliPlan)({ device_credential: credential }).action, "skip");
    });
});
