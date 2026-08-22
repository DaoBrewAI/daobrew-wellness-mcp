import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  TASKMAP_CALENDAR_MAX_AGE_MS,
  TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN,
  TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
  TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
  TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN,
  buildTaskMapGoogleCalendarProviderSnapshot,
  buildTaskMapLocalCalendarExport,
  loadTaskMapCalendarProducerResult,
  taskMapCalendarFieldDigest,
  taskMapCalendarOwnerScopeDigest,
  taskMapGoogleCalendarProviderSnapshotCanonicalJson,
  taskMapGoogleCalendarProviderSnapshotPath,
  taskMapLocalCalendarExportCanonicalJson,
  type TaskMapCalendarEventV1,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const PRODUCED_AT = "2026-07-30T12:00:00.000Z";
const CURRENT_AT = "2026-07-30T15:59:59.999Z";
const OWNER_USER_ID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OTHER_OWNER_USER_ID = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
const OWNER = taskMapCalendarOwnerScopeDigest(OWNER_USER_ID);
const OTHER_OWNER = taskMapCalendarOwnerScopeDigest(OTHER_OWNER_USER_ID);

function digest(value: string): string {
  return taskMapContractDigest({
    domain: "taskmap-calendar-test.1",
    value,
  });
}

function event(
  name: string,
  startAt = "2026-07-30T13:00:00.000Z",
  crossProviderIdentityDigest: string | null = null,
): TaskMapCalendarEventV1 {
  const eventIdentityDigest = digest(`event:${name}`);
  const title = `Synthetic ${name}`;
  const endAt = new Date(
    Date.parse(startAt) + 30 * 60 * 1_000,
  ).toISOString();
  return {
    eventIdentityDigest,
    crossProviderIdentityDigest,
    revisionDigest: taskMapCalendarFieldDigest(
      TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
      [eventIdentityDigest, title, startAt, endAt],
    ),
    title,
    startAt,
    endAt,
  };
}

function write0600(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  writeFileSync(filePath, taskMapContractCanonicalJson(value), { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function writeRaw0600(filePath: string, value: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  writeFileSync(filePath, value, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function paths(root: string): {
  localExportPath: string;
  googleSnapshotPath: string;
} {
  return {
    localExportPath: path.join(root, "calendar-export.json"),
    googleSnapshotPath: path.join(root, "google-calendar.json"),
  };
}

describe("Task Map Calendar producer freshness", () => {
  it("rejects noncanonical and duplicate-key local and Google artifacts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-canonical-"));
    try {
      const files = paths(root);
      const local = buildTaskMapLocalCalendarExport({
        ownerScopeDigest: OWNER,
        producedAt: PRODUCED_AT,
        events: [event("local-canonical")],
      });
      const google = buildTaskMapGoogleCalendarProviderSnapshot({
        ownerScopeDigest: OWNER,
        producedAt: PRODUCED_AT,
        events: [event("google-canonical")],
      });

      for (const [provider, filePath, artifact] of [
        ["local_calendar", files.localExportPath, local],
        ["google_calendar", files.googleSnapshotPath, google],
      ] as const) {
        const canonical = provider === "local_calendar"
          ? taskMapLocalCalendarExportCanonicalJson(local)
          : taskMapGoogleCalendarProviderSnapshotCanonicalJson(google);
        const variants = [
          `${canonical}\n`,
          JSON.stringify(artifact),
          canonical.replace(
            "{",
            `{"contractVersion":"${artifact.contractVersion}",`,
          ),
        ];
        for (const bytes of variants) {
          writeRaw0600(filePath, bytes);
          const result = await loadTaskMapCalendarProducerResult({
            ...files,
            assessedAt: CURRENT_AT,
            expectedOwnerScopeDigest: OWNER,
          });
          assert.equal(
            result.providers.find((row) => row.provider === provider)?.freshness,
            "malformed",
          );
        }

        rmSync(filePath);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("freezes the cross-language length-framed digest vectors", () => {
    const eventIdentityDigest = taskMapCalendarFieldDigest(
      TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN,
      [
        "primary",
        "provider-id-1",
        "2026-07-30T20:00:00.000Z",
      ],
    );
    assert.equal(
      eventIdentityDigest,
      "8bfc5a853ef0d5512b0e363e9dd1feeaa0a2f7cee1dcde14d8c34fb09c429a13",
    );
    assert.equal(
      taskMapCalendarFieldDigest(
        TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN,
        ["shared-ical-1", "2026-07-30T20:00:00.000Z"],
      ),
      "74f3e063bb81394c35cfbce313657661ea7f13be84823d2ac88749309eacc6fc",
    );
    assert.equal(
      taskMapCalendarFieldDigest(
        TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
        [
          eventIdentityDigest,
          "Review the launch checklist",
          "2026-07-30T20:00:00.000Z",
          "2026-07-30T20:30:00.000Z",
        ],
      ),
      "2e5d6347085b3add80b4778d94e9d4d26e66699b18bef4482e66fee53760a3f2",
    );
  });

  it("builds exact four-hour local and Google snapshots, including empty current reads", () => {
    const local = buildTaskMapLocalCalendarExport({
      ownerScopeDigest: OWNER,
      producedAt: PRODUCED_AT,
      events: [],
    });
    assert.equal(local.ownerScopeDigest, OWNER);
    assert.equal(
      Date.parse(local.validThrough) - Date.parse(local.producedAt),
      TASKMAP_CALENDAR_MAX_AGE_MS,
    );
    assert.deepEqual(local.events, []);

    const google = buildTaskMapGoogleCalendarProviderSnapshot({
      ownerScopeDigest: OWNER,
      producedAt: PRODUCED_AT,
      events: [event("google")],
    });
    assert.equal(
      Date.parse(google.validThrough) - Date.parse(google.producedAt),
      TASKMAP_CALENDAR_MAX_AGE_MS,
    );
    assert.equal(google.events.length, 1);
    assert.equal(google.privacy.boundedTitlesStored, true);
    assert.equal(google.privacy.rawProviderIdsStored, false);
  });

  it("rejects a coordinated title change that preserves a stale revision digest", () => {
    const original = event("launch-review");
    assert.throws(
      () =>
        buildTaskMapGoogleCalendarProviderSnapshot({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [{
            ...original,
            title: "Changed launch review",
          }],
        }),
      /revisionDigest does not match its event fields/,
    );
  });

  it("reports both providers missing without treating markers as current", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-missing-"));
    try {
      const result = await loadTaskMapCalendarProducerResult({
        ...paths(root),
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(
        result.contractVersion,
        TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
      );
      assert.equal(result.availability, "unavailable");
      assert.deepEqual(
        result.providers.map((provider) => provider.freshness),
        ["missing", "missing"],
      );
      assert.deepEqual(result.events, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a fresh local/iCloud read usable when Google is unconfigured", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-local-"));
    try {
      const files = paths(root);
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("icloud")],
        }),
      );
      const result = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(result.availability, "available");
      assert.deepEqual(
        result.providers.map((provider) => [
          provider.provider,
          provider.freshness,
        ]),
        [
          ["local_calendar", "current"],
          ["google_calendar", "missing"],
        ],
      );
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].provider, "local_calendar");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers direct Google on an exact cross-provider identity and retains unmatched local events", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-dedupe-"));
    try {
      const files = paths(root);
      const cross = digest("same-google-occurrence");
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [
            event("eventkit-google-copy", undefined, cross),
            event("icloud-only"),
          ],
        }),
      );
      write0600(
        files.googleSnapshotPath,
        buildTaskMapGoogleCalendarProviderSnapshot({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("direct-google", undefined, cross)],
        }),
      );
      const result = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(result.availability, "available");
      assert.equal(result.events.length, 2);
      assert.equal(
        result.events.find(
          (row) => row.crossProviderIdentityDigest === cross,
        )?.provider,
        "google_calendar",
      );
      assert.equal(
        result.events.some(
          (row) =>
            row.eventIdentityDigest === digest("event:icloud-only")
            && row.provider === "local_calendar",
        ),
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses a half-open four-hour window and excludes stale provider events", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-age-"));
    try {
      const files = paths(root);
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("local")],
        }),
      );
      write0600(
        files.googleSnapshotPath,
        buildTaskMapGoogleCalendarProviderSnapshot({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("google")],
        }),
      );
      const boundary = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: "2026-07-30T16:00:00.000Z",
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(boundary.availability, "unavailable");
      assert.deepEqual(
        boundary.providers.map((provider) => provider.freshness),
        ["boundary_due", "boundary_due"],
      );
      assert.deepEqual(boundary.events, []);

      const stale = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: "2026-07-30T16:00:00.001Z",
        expectedOwnerScopeDigest: OWNER,
      });
      assert.deepEqual(
        stale.providers.map((provider) => provider.freshness),
        ["stale", "stale"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails Google closed on owner/digest mismatch while preserving a valid local provider", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-owner-"));
    try {
      const files = paths(root);
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [],
        }),
      );
      const google = buildTaskMapGoogleCalendarProviderSnapshot({
        ownerScopeDigest: OTHER_OWNER,
        producedAt: PRODUCED_AT,
        events: [event("google")],
      });
      write0600(files.googleSnapshotPath, google);
      const result = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(result.availability, "available");
      assert.deepEqual(
        result.providers.map((provider) => provider.freshness),
        ["current", "malformed"],
      );
      assert.deepEqual(result.events, []);

      write0600(files.googleSnapshotPath, {
        ...buildTaskMapGoogleCalendarProviderSnapshot({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("google")],
        }),
        snapshotDigest: digest("forged"),
      });
      const forged = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(forged.providers[1].freshness, "malformed");

      rmSync(files.googleSnapshotPath, { force: true });
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OTHER_OWNER,
          producedAt: PRODUCED_AT,
          events: [event("wrong-owner-local")],
        }),
      );
      const wrongLocalOwner = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(wrongLocalOwner.availability, "unavailable");
      assert.deepEqual(
        wrongLocalOwner.providers.map((provider) => provider.freshness),
        ["malformed", "missing"],
      );
      assert.deepEqual(wrongLocalOwner.events, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects over-capacity and non-owner-only provider files", async () => {
    const tooMany = Array.from(
      { length: 257 },
      (_, index) =>
        event(
          `event-${index}`,
          new Date(
            Date.parse("2026-07-30T13:00:00.000Z") + index * 60_000,
          ).toISOString(),
        ),
    );
    assert.throws(
      () =>
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: tooMany,
        }),
      /event limit/,
    );

    const root = mkdtempSync(path.join(tmpdir(), "taskmap-calendar-mode-"));
    try {
      const files = paths(root);
      write0600(
        files.localExportPath,
        buildTaskMapLocalCalendarExport({
          ownerScopeDigest: OWNER,
          producedAt: PRODUCED_AT,
          events: [event("local")],
        }),
      );
      chmodSync(files.localExportPath, 0o644);
      const result = await loadTaskMapCalendarProducerResult({
        ...files,
        assessedAt: CURRENT_AT,
        expectedOwnerScopeDigest: OWNER,
      });
      assert.equal(result.providers[0].freshness, "malformed");
      assert.equal(result.availability, "unavailable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects private or executable-looking calendar titles", () => {
    const base = event("private");
    for (const title of [
      "Email owner@example.com",
      "Use token=secret-value",
      "Open https://example.com/private",
      "Read /Users/synthetic/private.txt",
    ]) {
      assert.throws(
        () =>
          buildTaskMapLocalCalendarExport({
            ownerScopeDigest: OWNER,
            producedAt: PRODUCED_AT,
            events: [{ ...base, title }],
          }),
        /bounded title privacy policy/,
      );
    }
  });

  it("derives the fixed Google artifact path without accepting relative homes", () => {
    assert.equal(
      taskMapGoogleCalendarProviderSnapshotPath("/tmp/synthetic-home"),
      "/tmp/synthetic-home/.daobrew/taskmap/calendar-google-provider-snapshot.v1.json",
    );
    assert.throws(
      () => taskMapGoogleCalendarProviderSnapshotPath("relative-home"),
      /normalized and absolute/,
    );
  });
});
