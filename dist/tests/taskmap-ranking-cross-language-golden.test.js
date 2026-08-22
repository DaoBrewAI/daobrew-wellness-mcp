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
const task_ranking_publication_js_1 = require("../src/engine/taskmap/task-ranking-publication.js");
(0, node_test_1.describe)("Task Map cross-language ranking golden", () => {
    (0, node_test_1.it)("contains only Node-validator-accepted engine ranking bytes", () => {
        const fixturePath = node_path_1.default.resolve(process.cwd(), "../DaobrewSentinelMac/Tests/SentinelMacTests/Fixtures/TaskMapTaskRanking/node-ranking-golden.json");
        const golden = JSON.parse((0, node_fs_1.readFileSync)(fixturePath, "utf8"));
        const projection = JSON.parse(Buffer.from(golden.projectionBase64, "base64").toString("utf8"));
        const ranking = (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(JSON.parse(Buffer.from(golden.consumerAuthorityRankingBase64, "base64").toString("utf8")), projection, golden.ownerScopeDigest);
        assert.deepEqual(ranking.rankedAcceptedOpen.map(({ taskId }) => taskId), golden.consumerAuthorityTaskIDs);
        assert.deepEqual(ranking.rankedAcceptedOpen.map(({ scoreBasisPoints }) => scoreBasisPoints), golden.consumerAuthorityScores);
        assert.equal(Buffer.from(golden.consumerAuthorityRankingBase64, "base64")
            .equals(Buffer.from(golden.rankingBase64, "base64")), true, "the Swift authority vector must be the actual Node engine publication");
    });
});
