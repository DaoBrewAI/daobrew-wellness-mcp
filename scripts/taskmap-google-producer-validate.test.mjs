import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskMapMeetingProducerSnapshot,
  taskMapMeetingProducerOwnerScopeDigest,
} from "../dist/src/engine/taskmap/meeting-producer-freshness.js";
import {
  buildTaskMapGoogleCalendarProviderSnapshot,
  taskMapCalendarOwnerScopeDigest,
} from "../dist/src/engine/taskmap/calendar-producer-freshness.js";
import {
  validateTaskMapGoogleProducerSnapshotValues,
} from "./taskmap-google-producer-validate.mjs";

const OWNER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OTHER_OWNER = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
const PRODUCED_AT = "2026-07-31T20:00:00.000Z";
const ASSESSED_AT = "2026-07-31T20:01:00.000Z";

function validValues(owner = OWNER, producedAt = PRODUCED_AT) {
  return {
    meetingSnapshot: buildTaskMapMeetingProducerSnapshot({
      ownerScopeDigest: taskMapMeetingProducerOwnerScopeDigest(owner),
      producedAt,
      meetings: [],
    }),
    calendarSnapshot: buildTaskMapGoogleCalendarProviderSnapshot({
      ownerScopeDigest: taskMapCalendarOwnerScopeDigest(owner),
      producedAt,
      events: [],
    }),
  };
}

describe("strict Task Map Google producer validation", () => {
  it("accepts only strict current snapshots bound to the explicit owner", () => {
    assert.doesNotThrow(() => {
      validateTaskMapGoogleProducerSnapshotValues({
        ...validValues(),
        ownerUserId: OWNER,
        assessedAt: ASSESSED_AT,
      });
    });
  });

  it("rejects minimal, wrong-owner, wrong-digest, stale, and malformed nested snapshots", () => {
    assert.throws(() => validateTaskMapGoogleProducerSnapshotValues({
      meetingSnapshot: {
        contractVersion: "taskmap-meeting-producer-snapshot.v1",
        producerVersion: "taskmap-meeting-producer.1",
        meetings: [],
      },
      calendarSnapshot: {
        contractVersion: "taskmap-google-calendar-provider-snapshot.v1",
        producerVersion: "taskmap-google-calendar-api.1",
        events: [],
      },
      ownerUserId: OWNER,
      assessedAt: ASSESSED_AT,
    }));

    assert.throws(() => validateTaskMapGoogleProducerSnapshotValues({
      ...validValues(OTHER_OWNER),
      ownerUserId: OWNER,
      assessedAt: ASSESSED_AT,
    }), /owner/i);

    const wrongDigest = validValues();
    wrongDigest.calendarSnapshot = {
      ...wrongDigest.calendarSnapshot,
      snapshotDigest: "0".repeat(64),
    };
    assert.throws(() => validateTaskMapGoogleProducerSnapshotValues({
      ...wrongDigest,
      ownerUserId: OWNER,
      assessedAt: ASSESSED_AT,
    }), /digest/i);

    assert.throws(() => validateTaskMapGoogleProducerSnapshotValues({
      ...validValues(OWNER, "2026-07-31T15:00:00.000Z"),
      ownerUserId: OWNER,
      assessedAt: ASSESSED_AT,
    }), /current/i);

    const malformedNested = validValues();
    malformedNested.meetingSnapshot = {
      ...malformedNested.meetingSnapshot,
      meetings: [{}],
    };
    assert.throws(() => validateTaskMapGoogleProducerSnapshotValues({
      ...malformedNested,
      ownerUserId: OWNER,
      assessedAt: ASSESSED_AT,
    }));
  });
});
