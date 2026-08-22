import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER,
  TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER,
  TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS,
  buildTaskMapCalendarExtractionSegments,
  renderTaskMapCalendarMentionPrompt,
} from "../src/engine/taskmap/calendar-extraction.js";
import type {
  TaskMapCalendarProducerEventV1,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import {
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

function event(
  index: number,
  overrides: Partial<TaskMapCalendarProducerEventV1> = {},
): TaskMapCalendarProducerEventV1 {
  const startAt = new Date(
    Date.parse("2026-08-07T08:00:00.000Z") + index * 3_600_000,
  ).toISOString();
  return {
    provider: "local_calendar",
    eventIdentityDigest: taskMapContractDigest(`calendar-event-${index}`),
    crossProviderIdentityDigest: null,
    revisionDigest: taskMapContractDigest(`calendar-revision-${index}`),
    title: `Calendar item ${index}`,
    startAt,
    endAt: new Date(Date.parse(startAt) + 1_800_000).toISOString(),
    ...overrides,
  };
}

describe("Task Map calendar extraction input contract", () => {
  it("sorts deterministically and chunks at exactly 24 events", () => {
    const source = Array.from({ length: 25 }, (_, index) => event(index));
    const shuffled = [...source].reverse();

    const forward = buildTaskMapCalendarExtractionSegments(source);
    const reverse = buildTaskMapCalendarExtractionSegments(shuffled);

    assert.deepEqual(reverse, forward);
    assert.equal(TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS, 24);
    assert.deepEqual(forward.map((segment) => segment.eventIdentityDigests.length), [24, 1]);
    assert.equal(forward[0]?.segmentIndex, 0);
    assert.equal(forward[1]?.segmentIndex, 1);
    assert.equal(forward[0]?.inputDigest, taskMapContractDigest(forward[0]!.body));
    assert.match(
      forward[0]!.body,
      /^- Calendar item 0 \(2026-08-07T08:00:00\.000Z to 2026-08-07T08:30:00\.000Z\)\n/,
    );
  });

  it("re-digests only the segment containing a revised event", () => {
    const source = Array.from({ length: 25 }, (_, index) => event(index));
    const before = buildTaskMapCalendarExtractionSegments(source);
    const revised = source.map((row, index) => index === 4
      ? event(index, {
        title: "Revised calendar item 4",
        revisionDigest: taskMapContractDigest("calendar-revision-4-updated"),
      })
      : row
    );
    const after = buildTaskMapCalendarExtractionSegments(revised);

    assert.notEqual(after[0]?.inputDigest, before[0]?.inputDigest);
    assert.equal(after[1]?.inputDigest, before[1]?.inputDigest);
    assert.deepEqual(
      after[1]?.eventIdentityDigests,
      before[1]?.eventIdentityDigests,
    );
  });

  it("renders a digest-bound prompt with explicit calendar trust delimiters", () => {
    const template = "Return strict JSON only.";
    const body = "- Review launch checklist (2026-08-07T08:00:00.000Z to 2026-08-07T08:30:00.000Z)\n";
    const rendered = renderTaskMapCalendarMentionPrompt(template, body);

    assert.equal(rendered.promptTemplateDigest, taskMapContractDigest(template));
    assert.equal(rendered.inputDigest, taskMapContractDigest(body));
    assert.equal(rendered.promptDigest, taskMapContractDigest(rendered.promptText));
    assert.equal(
      rendered.promptText,
      template
        + TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER
        + body
        + TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER,
    );
  });

  it("ships a calendar prompt with the shared strict mention schema", async () => {
    const prompt = await readFile(
      path.resolve(process.cwd(), "prompts/calendar-extraction-v1.md"),
      "utf8",
    );

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
