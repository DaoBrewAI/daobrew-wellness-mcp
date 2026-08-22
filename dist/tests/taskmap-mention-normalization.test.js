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
const mention_normalization_js_1 = require("../src/engine/taskmap/mention-normalization.js");
(0, node_test_1.describe)("Task Map mention text normalization", () => {
    (0, node_test_1.it)("normalizes case, surrounding whitespace, and terminal punctuation", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)(" Ship  the DMG! "), "ship the dmg");
    });
    (0, node_test_1.it)("preserves CJK while removing terminal CJK punctuation", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)("完成迁移。"), "完成迁移");
    });
    (0, node_test_1.it)("preserves interior punctuation", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)("v0.1.14 tag"), "v0.1.14 tag");
    });
    (0, node_test_1.it)("maps empty input to empty output", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)(""), "");
    });
    (0, node_test_1.it)("NFC-normalizes and collapses internal Unicode whitespace", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)(" CAFE\u0301\u2003SHIP "), "café ship");
    });
    (0, node_test_1.it)("removes repeated terminal punctuation and intervening whitespace", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)("Ship it! \u3000？；  "), "ship it");
    });
    (0, node_test_1.it)("does not leave separator whitespace before terminal punctuation", () => {
        assert.equal((0, mention_normalization_js_1.normalizeMentionText)("Ship it \u3000! ?  "), "ship it");
    });
});
