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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const agent_session_extraction_js_1 = require("../src/engine/taskmap/agent-session-extraction.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
function cluster(assistantOutcomeSummary) {
    return {
        clusterId: "tmaproposal_aaaaaaaaaaaaaaaa",
        clusterIdentityDigest: DIGEST_A,
        proposalClusterDigest: DIGEST_A,
        workstreamIdentityDigest: DIGEST_B,
        routingKind: "repository",
        providerNeutralRoutingDigest: DIGEST_C,
        directiveSemanticDigest: DIGEST_D,
        recordKind: "review_only_agent_proposal",
        proposalDisposition: "candidate_or_context_only",
        authority: "none",
        acceptedMembershipAuthority: false,
        lifecycleAuthority: false,
        completionAuthority: false,
        verificationAuthority: false,
        userDirectiveSummary: "Implement the bounded local refresh path.",
        assistantOutcomeSummary,
        occurredAt: "2026-08-07T20:00:00.000Z",
        observedAt: "2026-08-07T20:01:00.000Z",
        supports: [],
    };
}
(0, node_test_1.describe)("Task Map agent-session extraction input contract", () => {
    (0, node_test_1.it)("renders a digest-bound prompt with explicit session trust delimiters", () => {
        const template = "Return strict JSON only.";
        const body = "Implement the bounded local refresh path.\n\nThe tests passed.";
        const rendered = (0, agent_session_extraction_js_1.renderTaskMapAgentSessionMentionPrompt)(template, body);
        assert.equal(rendered.promptTemplateDigest, (0, source_contracts_js_1.taskMapContractDigest)(template));
        assert.equal(rendered.inputDigest, (0, source_contracts_js_1.taskMapContractDigest)(body));
        assert.equal(rendered.promptDigest, (0, source_contracts_js_1.taskMapContractDigest)(rendered.promptText));
        assert.equal(rendered.promptText, template
            + agent_session_extraction_js_1.TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER
            + body
            + agent_session_extraction_js_1.TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER);
        assert.match(rendered.promptText, /BEGIN_UNTRUSTED_AGENT_SESSION_V1/);
        assert.match(rendered.promptText, /END_UNTRUSTED_AGENT_SESSION_V1/);
    });
    (0, node_test_1.it)("builds the representative directive and outcome body with a null fallback", () => {
        assert.equal((0, agent_session_extraction_js_1.taskMapAgentSessionExtractionBody)(cluster("The tests passed.")), "Implement the bounded local refresh path.\n\nThe tests passed.");
        assert.equal((0, agent_session_extraction_js_1.taskMapAgentSessionExtractionBody)(cluster(null)), "Implement the bounded local refresh path.\n\nNo agent outcome was recorded.");
    });
    (0, node_test_1.it)("ships a session prompt that fixes the trust, taxonomy, actor, span, and JSON rules", async () => {
        const promptPath = node_path_1.default.resolve(process.cwd(), "prompts/agent-session-extraction-v1.md");
        const prompt = await (0, promises_1.readFile)(promptPath, "utf8");
        assert.match(prompt, /exactly ONE local coding-agent session/i);
        assert.match(prompt, /user directive.*agent.*outcome summary/is);
        assert.match(prompt, /untrusted data/i);
        assert.match(prompt, /never.*instructions/i);
        assert.match(prompt, /JSON only/i);
        assert.match(prompt, /request.*commitment.*decision.*other/s);
        assert.match(prompt, /self.*human user/is);
        assert.match(prompt, /other.*unknown/s);
        assert.match(prompt, /verbatim/i);
        assert.match(prompt, /strict/i);
        assert.match(prompt, /exactly.*five fields/is);
        assert.match(prompt, /byte-for-byte/i);
        assert.match(prompt, /do not correct/i);
        assert.match(prompt, /\*\*/);
    });
});
