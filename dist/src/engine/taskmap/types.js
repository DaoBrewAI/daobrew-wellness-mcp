"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_OWNER_TRUTH_SET_VERSION = exports.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION = exports.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION = exports.TASKMAP_TRUTH_LABEL_POLICY_VERSION = exports.TASKMAP_TRUTH_SET_VERSION = exports.TASKMAP_TRUTH_SET_DRAFT_VERSION = exports.TASKMAP_BODY_CONTEXT_CONTRACT_VERSION = exports.TASKMAP_PROJECTION_PARITY_VERSION = exports.TASKMAP_PROJECTION_TARGET_VERSION = exports.TASKMAP_PROJECTION_DIFF_VERSION = exports.TASKMAP_REPLAY_MANIFEST_VERSION = exports.TASKMAP_GATE_DECISION_VERSION = exports.TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION = exports.TASKMAP_SOURCE_SNAPSHOT_VERSION = exports.TASKMAP_CANONICAL_MEETING_VERSION = exports.TASKMAP_CONNECTOR_CHECKPOINT_VERSION = exports.TASKMAP_DISCOVERY_POINTER_VERSION = exports.TASKMAP_SOURCE_ENVELOPE_VERSION = exports.TASKMAP_ALGORITHM_POLICY_VERSION = exports.TASKMAP_CONTRACT_VERSION = void 0;
/**
 * Task Map is a read-only index over source-owned work. These types are kept
 * separate from GraphDelta: causal evidence and operational work do not share
 * identity or edge semantics.
 */
exports.TASKMAP_CONTRACT_VERSION = "taskmap.v1";
exports.TASKMAP_ALGORITHM_POLICY_VERSION = "taskmap-policy.2";
exports.TASKMAP_SOURCE_ENVELOPE_VERSION = "taskmap-source-envelope.v1";
exports.TASKMAP_DISCOVERY_POINTER_VERSION = "taskmap-discovery-pointer.v1";
exports.TASKMAP_CONNECTOR_CHECKPOINT_VERSION = "taskmap-connector-checkpoint.v1";
exports.TASKMAP_CANONICAL_MEETING_VERSION = "taskmap-canonical-meeting.v1";
exports.TASKMAP_SOURCE_SNAPSHOT_VERSION = "taskmap-source-snapshot.v1";
exports.TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION = "taskmap-semantic-proposal-reference.v1";
exports.TASKMAP_GATE_DECISION_VERSION = "taskmap-gate-decision.v1";
exports.TASKMAP_REPLAY_MANIFEST_VERSION = "taskmap-replay-manifest.v1";
exports.TASKMAP_PROJECTION_DIFF_VERSION = "taskmap-projection-diff.v1";
exports.TASKMAP_PROJECTION_TARGET_VERSION = "taskmap-projection-target.v1";
exports.TASKMAP_PROJECTION_PARITY_VERSION = "taskmap-projection-parity.v1";
exports.TASKMAP_BODY_CONTEXT_CONTRACT_VERSION = "taskmap-body-context.v1";
/**
 * P9.3 reviewed truth labels are an evaluation contract, not another source
 * envelope or projection state. T0-T4 are chronological truth splits. They are
 * distinct from the research A0-A4 capability arms and the E0-E4 harness arms.
 */
exports.TASKMAP_TRUTH_SET_DRAFT_VERSION = "taskmap-truth-set-draft.v1";
exports.TASKMAP_TRUTH_SET_VERSION = "taskmap-truth-set.v1";
exports.TASKMAP_TRUTH_LABEL_POLICY_VERSION = "taskmap-truth-label-policy.4";
exports.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION = "taskmap-truth-time-splits.1";
exports.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION = "taskmap-truth-review-batch-policy.1";
exports.TASKMAP_OWNER_TRUTH_SET_VERSION = "taskmap-owner-truth-set.v2";
