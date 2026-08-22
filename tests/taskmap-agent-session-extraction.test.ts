import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER,
  TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER,
  renderTaskMapAgentSessionMentionPrompt,
  taskMapAgentSessionExtractionBody,
} from "../src/engine/taskmap/agent-session-extraction.js";
import type {
  TaskMapAgentSessionProposalClusterV2,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import {
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);

function cluster(
  assistantOutcomeSummary: string | null,
): TaskMapAgentSessionProposalClusterV2 {
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

describe("Task Map agent-session extraction input contract", () => {
  it("renders a digest-bound prompt with explicit session trust delimiters", () => {
    const template = "Return strict JSON only.";
    const body = "Implement the bounded local refresh path.\n\nThe tests passed.";

    const rendered = renderTaskMapAgentSessionMentionPrompt(template, body);

    assert.equal(rendered.promptTemplateDigest, taskMapContractDigest(template));
    assert.equal(rendered.inputDigest, taskMapContractDigest(body));
    assert.equal(rendered.promptDigest, taskMapContractDigest(rendered.promptText));
    assert.equal(
      rendered.promptText,
      template
        + TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER
        + body
        + TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER,
    );
    assert.match(rendered.promptText, /BEGIN_UNTRUSTED_AGENT_SESSION_V1/);
    assert.match(rendered.promptText, /END_UNTRUSTED_AGENT_SESSION_V1/);
  });

  it("builds the representative directive and outcome body with a null fallback", () => {
    assert.equal(
      taskMapAgentSessionExtractionBody(cluster("The tests passed.")),
      "Implement the bounded local refresh path.\n\nThe tests passed.",
    );
    assert.equal(
      taskMapAgentSessionExtractionBody(cluster(null)),
      "Implement the bounded local refresh path.\n\nNo agent outcome was recorded.",
    );
  });

  it("ships a session prompt that fixes the trust, taxonomy, actor, span, and JSON rules", async () => {
    const promptPath = path.resolve(
      process.cwd(),
      "prompts/agent-session-extraction-v1.md",
    );
    const prompt = await readFile(promptPath, "utf8");

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
