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
const client_js_1 = require("../src/client.js");
(0, node_test_1.describe)("DaoBrewClient", () => {
    (0, node_test_1.it)("constructor sets defaults", () => {
        const client = new client_js_1.DaoBrewClient({ apiKey: "dbk_test123" });
        assert.ok(client);
    });
    (0, node_test_1.it)("constructor accepts custom baseUrl and timeout", () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:8000/api/v1",
            timeoutMs: 5000,
        });
        assert.ok(client);
    });
    (0, node_test_1.it)("getWellnessState rejects on network error", async () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:1", // Nothing listening
            timeoutMs: 1000,
        });
        await assert.rejects(() => client.getWellnessState(), (err) => {
            assert.ok(err.message.length > 0);
            return true;
        });
    });
    (0, node_test_1.it)("getElementDetail rejects on network error", async () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:1",
            timeoutMs: 1000,
        });
        await assert.rejects(() => client.getElementDetail("wood"));
    });
    (0, node_test_1.it)("startSession rejects on network error", async () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:1",
            timeoutMs: 1000,
        });
        await assert.rejects(() => client.startSession("fire", "text"));
    });
    (0, node_test_1.it)("getSessionResult rejects on network error", async () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:1",
            timeoutMs: 1000,
        });
        await assert.rejects(() => client.getSessionResult("sess_test"));
    });
    (0, node_test_1.it)("getSessionHistory rejects on network error", async () => {
        const client = new client_js_1.DaoBrewClient({
            apiKey: "dbk_test",
            baseUrl: "http://localhost:1",
            timeoutMs: 1000,
        });
        await assert.rejects(() => client.getSessionHistory(7));
    });
});
