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
const calendar_extraction_js_1 = require("../src/engine/taskmap/calendar-extraction.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
function event(index, overrides = {}) {
    const startAt = new Date(Date.parse("2026-08-07T08:00:00.000Z") + index * 3_600_000).toISOString();
    return {
        provider: "local_calendar",
        eventIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-event-${index}`),
        crossProviderIdentityDigest: null,
        revisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(`calendar-revision-${index}`),
        title: `Calendar item ${index}`,
        startAt,
        endAt: new Date(Date.parse(startAt) + 1_800_000).toISOString(),
        ...overrides,
    };
}
(0, node_test_1.describe)("Task Map calendar extraction input contract", () => {
    (0, node_test_1.it)("sorts deterministically and chunks at exactly 24 events", () => {
        const source = Array.from({ length: 25 }, (_, index) => event(index));
        const shuffled = [...source].reverse();
        const forward = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(source);
        const reverse = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(shuffled);
        assert.deepEqual(reverse, forward);
        assert.equal(calendar_extraction_js_1.TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS, 24);
        assert.deepEqual(forward.map((segment) => segment.eventIdentityDigests.length), [24, 1]);
        assert.equal(forward[0]?.segmentIndex, 0);
        assert.equal(forward[1]?.segmentIndex, 1);
        assert.equal(forward[0]?.inputDigest, (0, source_contracts_js_1.taskMapContractDigest)(forward[0].body));
        assert.match(forward[0].body, /^- Calendar item 0 \(2026-08-07T08:00:00\.000Z to 2026-08-07T08:30:00\.000Z\)\n/);
    });
    (0, node_test_1.it)("re-digests only the segment containing a revised event", () => {
        const source = Array.from({ length: 25 }, (_, index) => event(index));
        const before = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(source);
        const revised = source.map((row, index) => index === 4
            ? event(index, {
                title: "Revised calendar item 4",
                revisionDigest: (0, source_contracts_js_1.taskMapContractDigest)("calendar-revision-4-updated"),
            })
            : row);
        const after = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(revised);
        assert.notEqual(after[0]?.inputDigest, before[0]?.inputDigest);
        assert.equal(after[1]?.inputDigest, before[1]?.inputDigest);
        assert.deepEqual(after[1]?.eventIdentityDigests, before[1]?.eventIdentityDigests);
    });
    (0, node_test_1.it)("renders a digest-bound prompt with explicit calendar trust delimiters", () => {
        const template = "Return strict JSON only.";
        const body = "- Review launch checklist (2026-08-07T08:00:00.000Z to 2026-08-07T08:30:00.000Z)\n";
        const rendered = (0, calendar_extraction_js_1.renderTaskMapCalendarMentionPrompt)(template, body);
        assert.equal(rendered.promptTemplateDigest, (0, source_contracts_js_1.taskMapContractDigest)(template));
        assert.equal(rendered.inputDigest, (0, source_contracts_js_1.taskMapContractDigest)(body));
        assert.equal(rendered.promptDigest, (0, source_contracts_js_1.taskMapContractDigest)(rendered.promptText));
        assert.equal(rendered.promptText, template
            + calendar_extraction_js_1.TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER
            + body
            + calendar_extraction_js_1.TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER);
    });
    (0, node_test_1.it)("ships a calendar prompt with the shared strict mention schema", async () => {
        const prompt = await (0, promises_1.readFile)(node_path_1.default.resolve(process.cwd(), "prompts/calendar-extraction-v1.md"), "utf8");
        assert.match(prompt, /calendar entries/i);
        assert.match(prompt, /titles.*times only/is);
        assert.match(prompt, /untrusted data/i);
        assert.match(prompt, /never.*instructions/i);
        assert.match(prompt, /JSON only/i);
        assert.match(prompt, /request.*commitment.*decision.*other/s);
        assert.match(prompt, /most.*other/i);
        assert.match(prompt, /verbatim/i);
        assert.match(prompt, /exactly.*five fields/is);
        assert.match(prompt, /byte-for-byte/i);
        assert.match(prompt, /do not correct/i);
        assert.match(prompt, /\*\*/);
    });
});
