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
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const local_config_js_1 = require("../src/engine/local-config.js");
(0, node_test_1.describe)("local config merge writes", () => {
    (0, node_test_1.it)("preserves unrelated fields while using the persistent secure config lock", () => {
        const directory = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-local-config-"));
        const configFile = (0, node_path_1.join)(directory, "config.json");
        try {
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
                license_key: "existing-license",
                memory_project_paths: ["/tmp/project"],
            }));
            const merged = (0, local_config_js_1.mergeLocalConfig)({
                granola_api_token: "new-token",
                removed_value: undefined,
            }, configFile);
            assert.equal(merged.license_key, "existing-license");
            assert.deepEqual(merged.memory_project_paths, ["/tmp/project"]);
            assert.equal(merged.granola_api_token, "new-token");
            assert.equal(Object.prototype.hasOwnProperty.call(merged, "removed_value"), false);
            assert.ok((0, node_fs_1.existsSync)((0, node_path_1.join)(directory, "config.lock")));
            assert.equal((0, node_fs_1.existsSync)(`${configFile}.lock`), false);
            assert.equal((0, node_fs_1.statSync)(configFile).mode & 0o777, 0o600);
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.deepEqual(persisted, merged);
        }
        finally {
            (0, node_fs_1.rmSync)(directory, { recursive: true, force: true });
        }
    });
});
