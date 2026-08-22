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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const tools_js_1 = require("../src/tools.js");
(0, node_test_1.describe)("production MCP tool router", () => {
    (0, node_test_1.it)("keeps simulation out of the production tool surface", () => {
        const source = (0, node_fs_1.readFileSync)(node_path_1.default.join(process.cwd(), "src", "tools.ts"), "utf8");
        assert.match(source, /isMock: boolean/);
        assert.doesNotMatch(JSON.stringify(tools_js_1.toolDefinitions), /mock|simulat|showcase/i);
    });
    (0, node_test_1.it)("fails closed when an authenticated provider client is absent", async () => {
        await assert.rejects(() => (0, tools_js_1.handleToolCall)("daobrew_check", { force_refresh: true }, false, undefined, false, undefined), /not initialized|sign in to DaoBrew/i);
    });
});
